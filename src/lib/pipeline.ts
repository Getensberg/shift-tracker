// Конвейер обработки: Telegram update -> журнал сообщений -> решение -> табель.
//
//   ingestUpdate()   быстро и идемпотентно сохраняет сообщение с фото (status=PENDING)
//   processMessage() решает, что с ним делать, и ставит отметку / отправляет на проверку
//
// Вебхук вызывает ingest синхронно (чтобы ничего не потерять), а process — после
// ответа Telegram (next/server after()). Если обработка упала — сообщение
// остаётся PENDING/ERROR и его подберёт retryPending().

import { Prisma, type Employee, type Group, type Message } from "@prisma/client";
import { prisma } from "./db";
import { createMark, syncCreated, type CreateMarkResult } from "./marks";
import { matchCaption, type Candidate } from "./matcher";
import { describeDelta, resolveShift } from "./shift";
import { dateOnly, formatDateRu, toDateStr } from "./time";
import {
  SIMULATED_PREFIX,
  displayName,
  extractPhotoFileId,
  messageLink,
  type TgUpdate,
} from "./telegram";

export type IngestResult = { messageIds: number[]; note: string };

export async function ingestUpdate(update: TgUpdate): Promise<IngestResult> {
  // Бота добавили в группу — регистрируем её (выключенной; админ включает в настройках).
  if (update.my_chat_member) {
    const { chat, new_chat_member } = update.my_chat_member;
    if (chat.type !== "group" && chat.type !== "supergroup") return { messageIds: [], note: "не группа" };
    const active = ["member", "administrator"].includes(new_chat_member.status);
    await prisma.group.upsert({
      where: { chatId: BigInt(chat.id) },
      create: { chatId: BigInt(chat.id), title: chat.title ?? String(chat.id), username: chat.username, active: false },
      update: { title: chat.title ?? undefined, username: chat.username ?? null },
    });
    await prisma.auditLog.create({
      data: {
        actor: "system",
        action: active ? "BOT_ADDED_TO_GROUP" : "BOT_REMOVED_FROM_GROUP",
        details: `${chat.title ?? chat.id} (${chat.id})`,
      },
    });
    return { messageIds: [], note: "обновлена группа" };
  }

  const msg = update.message ?? update.edited_message;
  const isEdit = Boolean(update.edited_message);
  if (!msg) return { messageIds: [], note: "нет сообщения" };
  if (msg.chat.type !== "group" && msg.chat.type !== "supergroup") return { messageIds: [], note: "не группа" };

  // Основной триггер — фото. Остальные сообщения не храним (их тысячи и они не нужны).
  const photoFileId = extractPhotoFileId(msg);
  if (!photoFileId) return { messageIds: [], note: "без фото — пропущено" };

  const chatId = BigInt(msg.chat.id);
  let group = await prisma.group.findUnique({ where: { chatId } });
  if (!group) {
    group = await prisma.group.upsert({
      where: { chatId },
      create: { chatId, title: msg.chat.title ?? String(msg.chat.id), username: msg.chat.username, active: false },
      update: {},
    });
  }

  const data = {
    groupId: group.id,
    fromUserId: msg.from ? BigInt(msg.from.id) : null,
    fromName: displayName(msg.from),
    fromUsername: msg.from?.username ?? null,
    caption: msg.caption?.trim() || null,
    photoFileId,
    mediaGroupId: msg.media_group_id ?? null,
    sentAt: new Date(msg.date * 1000),
    // у симулированных сообщений нет реального первоисточника в Telegram
    link: photoFileId.startsWith(SIMULATED_PREFIX)
      ? null
      : messageLink({ id: msg.chat.id, username: msg.chat.username ?? group.username }, msg.message_id),
    simulated: photoFileId.startsWith(SIMULATED_PREFIX),
    raw: update as unknown as Prisma.InputJsonValue,
  };

  const existing = await prisma.message.findUnique({
    where: { chatId_tgMessageId: { chatId, tgMessageId: msg.message_id } },
  });

  if (existing && !isEdit) {
    // Telegram мог прислать тот же update повторно — второй записи и второй отметки не будет.
    return { messageIds: [], note: `повтор сообщения #${existing.id} — пропущено` };
  }

  if (existing && isEdit) {
    return handleEdit(existing, data.caption, msg.edit_date ? new Date(msg.edit_date * 1000) : new Date(), data.raw);
  }

  try {
    const created = await prisma.message.create({ data: { ...data, chatId, tgMessageId: msg.message_id } });
    return { messageIds: [created.id], note: "сохранено" };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return { messageIds: [], note: "параллельный повтор — пропущено" };
    }
    throw e;
  }
}

async function handleEdit(existing: Message, caption: string | null, editedAt: Date, raw: Prisma.InputJsonValue): Promise<IngestResult> {
  if ((existing.caption ?? null) === caption) return { messageIds: [], note: "правка без изменения подписи" };

  await prisma.auditLog.create({
    data: {
      actor: "system",
      action: "MESSAGE_EDITED",
      messageId: existing.id,
      details: `Подпись изменена: «${existing.caption ?? ""}» → «${caption ?? ""}»`,
    },
  });

  // По сообщению ещё нет отметки — просто обрабатываем заново.
  const marksCount = await prisma.shiftMark.count({ where: { messageId: existing.id } });
  if (marksCount === 0) {
    await prisma.message.update({
      where: { id: existing.id },
      data: { caption, editedAt, raw, status: "PENDING", reason: null },
    });
    return { messageIds: [existing.id], note: "подпись изменена — повторная обработка" };
  }

  // Отметка уже стоит. Если по новой подписи тот же сотрудник — ничего не меняем,
  // иначе отправляем оператору (автоматически снимать 1 опасно).
  const updated = await prisma.message.update({
    where: { id: existing.id },
    data: { caption, editedAt, raw },
    include: { marks: true },
  });
  const decision = await decide(updated);
  const before = new Set(updated.marks.map((m) => m.employeeId));
  const after = decision.kind === "ACCEPT" ? decision.employees.map((e) => e.id) : decision.suggestedIds;
  const same = after.length > 0 && after.length === before.size && after.every((id) => before.has(id));
  if (!same) {
    await prisma.message.update({
      where: { id: existing.id },
      data: {
        status: "REVIEW",
        reason: `Подпись изменена после постановки отметки (было: «${existing.caption ?? "—"}»). Проверьте, верна ли отметка.`,
        suggestedIds: after,
      },
    });
    return { messageIds: [], note: "подпись изменена после отметки — на проверку" };
  }
  return { messageIds: [], note: "подпись изменена, сотрудник тот же" };
}

// ---------------------------------------------------------------------------
// Принятие решения
// ---------------------------------------------------------------------------

type EmployeeLite = { id: number; name: string };

export type Decision =
  | {
      kind: "ACCEPT";
      employees: EmployeeLite[];
      shiftDate: string;
      deltaMin: number;
      reason: string;
    }
  | {
      kind: "REVIEW" | "REJECTED" | "IGNORED";
      reason: string;
      suggestedIds: number[];
      shiftDate?: string;
    };

type MessageWithGroup = Message & {
  group: (Group & { employees: { employee: Employee }[] }) | null;
};

const fullName = (e: { lastName: string; firstName?: string | null }) =>
  e.firstName ? `${e.lastName} ${e.firstName}` : e.lastName;

const toCandidate = (e: Employee): Candidate => ({
  id: e.id,
  lastName: e.lastName,
  firstName: e.firstName,
  aliases: e.aliases,
  personnelNumber: e.personnelNumber,
});

async function loadMessage(id: number): Promise<MessageWithGroup | null> {
  return prisma.message.findUnique({
    where: { id },
    include: { group: { include: { employees: { include: { employee: true } } } } },
  });
}

export async function decide(input: Message): Promise<Decision> {
  const msg = (await loadMessage(input.id))!;
  const group = msg.group;

  if (!group || !group.active) {
    return { kind: "IGNORED", reason: "Группа не подключена к учёту (включите её в настройках)", suggestedIds: [] };
  }

  // Альбом: основание — первое фото; остальные фото без подписи не обрабатываем.
  if (msg.mediaGroupId && !msg.caption) {
    const first = await prisma.message.findFirst({
      where: { chatId: msg.chatId, mediaGroupId: msg.mediaGroupId, tgMessageId: { lt: msg.tgMessageId } },
    });
    if (first) return { kind: "IGNORED", reason: `Дополнительное фото из альбома (основание — сообщение #${first.id})`, suggestedIds: [] };
  }

  const shift = resolveShift(msg.sentAt, group);

  // --- кто на фото ---
  const groupStaff = group.employees.map((g) => g.employee).filter((e) => e.active);
  const allActive = groupStaff.length ? null : await prisma.employee.findMany({ where: { active: true } });
  const scope = groupStaff.length ? groupStaff : allActive!;
  const m = matchCaption(msg.caption, scope.map(toCandidate));

  const review = (reason: string, suggestedIds: number[] = []): Decision => ({
    kind: "REVIEW",
    reason,
    suggestedIds,
    shiftDate: shift.shiftDate,
  });

  let employees: EmployeeLite[] = [];
  let how = "";

  if (m.ambiguous.length) {
    const a = m.ambiguous[0];
    return review(
      `Неоднозначная подпись: «${a.token}» подходит нескольким сотрудникам (${a.candidates.map(fullName).join(", ")})`,
      [...m.matched.map((c) => c.id), ...a.candidates.map((c) => c.id)],
    );
  }

  // Сотрудник, к которому привязан аккаунт отправителя (если привязан).
  const sender = msg.fromUserId
    ? await prisma.employee.findFirst({ where: { tgUserId: msg.fromUserId, active: true } })
    : null;
  const senderLabel = sender
    ? `${fullName(sender)}${msg.fromUsername ? ` (@${msg.fromUsername})` : ""}`
    : null;
  let note = "";

  if (m.matched.length) {
    // Подпись важнее аккаунта: фото заступающего коллеги часто отправляет другой человек.
    employees = m.matched.map((c) => ({ id: c.id, name: fullName(c) }));
    how = m.fuzzy ? "по подписи (с учётом опечатки/окончания)" : "по подписи";
    if (sender && !m.matched.some((c) => c.id === sender.id)) {
      if (group.senderMismatch === "REVIEW") {
        return review(
          `Подпись «${employees.map((e) => e.name).join(", ")}», а отправил другой сотрудник — ${senderLabel}`,
          employees.map((e) => e.id),
        );
      }
      note = `; отправил другой сотрудник — ${senderLabel}`;
    }
  } else if (msg.caption) {
    // Подпись есть, но по справочнику группы не распознана — автоматически 1 не ставим (п. 6 ТЗ).
    if (groupStaff.length) {
      const everyone = await prisma.employee.findMany({ where: { active: true } });
      const wide = matchCaption(msg.caption, everyone.map(toCandidate));
      if (wide.matched.length) {
        return review(
          `Сотрудник ${wide.matched.map(fullName).join(", ")} найден в справочнике, но не закреплён за этой группой`,
          wide.matched.map((c) => c.id),
        );
      }
    }
    if (sender) {
      return review(
        `Подпись «${msg.caption}» не распознана; отправитель привязан к ${senderLabel}. Проверьте, кто на фото`,
        [sender.id],
      );
    }
    return review(`По подписи «${msg.caption}» сотрудник не определён`);
  } else if (sender) {
    // Подписи нет — определяем по привязанному аккаунту.
    if (groupStaff.length && !groupStaff.some((e) => e.id === sender.id)) {
      return review(`Аккаунт Telegram привязан к сотруднику ${fullName(sender)}, но он не закреплён за этой группой`, [sender.id]);
    }
    employees = [{ id: sender.id, name: fullName(sender) }];
    how = "по аккаунту Telegram (без подписи)";
  } else {
    return review("Фото без подписи, аккаунт Telegram не привязан к сотруднику");
  }

  const ids = employees.map((e) => e.id);

  if (employees.length > 1 && group.multiEmployee === "REVIEW") {
    return review(`В подписи несколько сотрудников: ${employees.map((e) => e.name).join(", ")}`, ids);
  }

  if (!shift.inWindow) {
    const reason = `Фото ${describeDelta(shift.deltaMin)} (смена ${group.shiftStart}); допустимо: за ${group.windowBeforeMin} мин до и ${group.windowAfterMin} мин после`;
    if (group.outOfWindow === "REJECT") return { kind: "REJECTED", reason, suggestedIds: ids, shiftDate: shift.shiftDate };
    return review(reason, ids);
  }

  if (!group.autoAccept) {
    return review(`Для группы включено ручное подтверждение. Распознано ${how}: ${employees.map((e) => e.name).join(", ")}`, ids);
  }

  return {
    kind: "ACCEPT",
    employees,
    shiftDate: shift.shiftDate,
    deltaMin: shift.deltaMin,
    reason: `Распознано ${how}; фото ${describeDelta(shift.deltaMin)}${note}`,
  };
}

// ---------------------------------------------------------------------------
// Применение решения
// ---------------------------------------------------------------------------

export async function processMessage(id: number, opts: { force?: boolean } = {}) {
  const msg = await prisma.message.findUnique({ where: { id } });
  if (!msg) return null;
  if (!opts.force && !["PENDING", "ERROR"].includes(msg.status)) return msg.status;

  try {
    const decision = await decide(msg);

    if (decision.kind !== "ACCEPT") {
      await prisma.message.update({
        where: { id },
        data: {
          status: decision.kind,
          reason: decision.reason,
          suggestedIds: decision.suggestedIds,
          suggestedDate: decision.shiftDate ? dateOnly(decision.shiftDate) : null,
          processedAt: new Date(),
          attempts: { increment: 1 },
        },
      });
      return decision.kind;
    }

    const group = await prisma.group.findUnique({ where: { id: msg.groupId! } });
    const results: CreateMarkResult[] = [];
    for (const e of decision.employees) {
      results.push(
        await createMark({
          employeeId: e.id,
          shiftDate: decision.shiftDate,
          source: "AUTO",
          messageId: msg.id,
          objectName: group?.objectName,
          lateMinutes: decision.deltaMin > 0 ? decision.deltaMin : null,
          actor: "system",
          details: decision.reason,
        }),
      );
    }

    const dups = decision.employees.filter((_, i) => !results[i].created);
    const status = dups.length === decision.employees.length ? "DUPLICATE" : "ACCEPTED";
    const dupNames = decision.employees.flatMap((e, i) => {
      const r = results[i];
      if (r.created) return [];
      return [`${e.name}${r.existing.messageId ? ` (по сообщению #${r.existing.messageId})` : " (вручную)"}`];
    });
    const dupText = dups.length
      ? `Уже отмечен(ы) за ${formatDateRu(decision.shiftDate)}: ${dupNames.join(", ")} — повторная отметка не создана`
      : null;

    await prisma.message.update({
      where: { id },
      data: {
        status,
        reason: status === "DUPLICATE" ? dupText : [decision.reason, dupText].filter(Boolean).join(". "),
        suggestedIds: decision.employees.map((e) => e.id),
        suggestedDate: dateOnly(decision.shiftDate),
        processedAt: new Date(),
        attempts: { increment: 1 },
      },
    });

    await syncCreated(results);
    return status;
  } catch (e) {
    const err = e instanceof Error ? e.message : String(e);
    console.error(`processMessage #${id} failed`, e);
    await prisma.message.update({
      where: { id },
      data: { status: "ERROR", reason: `Ошибка обработки: ${err.slice(0, 500)}`, attempts: { increment: 1 } },
    });
    return "ERROR";
  }
}

// ---------------------------------------------------------------------------
// Ручная проверка
// ---------------------------------------------------------------------------

export async function approveReview(messageId: number, employeeIds: number[], shiftDate: string, actor: string, comment?: string) {
  const msg = await prisma.message.findUnique({ where: { id: messageId }, include: { group: true } });
  if (!msg) throw new Error("Сообщение не найдено");
  if (!employeeIds.length) throw new Error("Выберите сотрудника");

  const results: CreateMarkResult[] = [];
  for (const employeeId of employeeIds) {
    results.push(
      await createMark({
        employeeId,
        shiftDate,
        source: "MANUAL",
        messageId,
        objectName: msg.group?.objectName,
        comment: comment || null,
        actor,
        details: `Подтверждено оператором${comment ? `: ${comment}` : ""}`,
      }),
    );
  }
  const created = results.filter((r) => r.created).length;
  await prisma.message.update({
    where: { id: messageId },
    data: {
      status: created ? "ACCEPTED" : "DUPLICATE",
      reason: created
        ? `Подтверждено оператором${comment ? `: ${comment}` : ""}${created < results.length ? " (часть сотрудников уже была отмечена)" : ""}`
        : "Оператор подтвердил, но отметка за эту дату уже стояла",
      processedAt: new Date(),
    },
  });
  await prisma.auditLog.create({
    data: { actor, action: "REVIEW_APPROVED", messageId, shiftDate: dateOnly(shiftDate), details: comment || null },
  });
  await syncCreated(results);
  return results;
}

export async function rejectReview(messageId: number, actor: string, comment?: string) {
  await prisma.message.update({
    where: { id: messageId },
    data: { status: "REJECTED", reason: `Отклонено оператором${comment ? `: ${comment}` : ""}`, processedAt: new Date() },
  });
  await prisma.auditLog.create({ data: { actor, action: "REVIEW_REJECTED", messageId, details: comment || null } });
}

/** Обработать заново (например, после правки справочника сотрудников). */
export async function reprocess(messageId: number, actor: string) {
  const msg = await prisma.message.findUnique({ where: { id: messageId }, include: { marks: true } });
  if (!msg) return null;
  if (msg.marks.length) throw new Error("По сообщению уже стоит отметка — снимите её в табеле, если нужно");
  await prisma.message.update({ where: { id: messageId }, data: { status: "PENDING", reason: null } });
  await prisma.auditLog.create({ data: { actor, action: "REPROCESS", messageId } });
  return processMessage(messageId);
}

/** Добор зависших сообщений и несинхронизированных отметок (cron / кнопка). */
export async function retryPending(limit = 100) {
  const stale = new Date(Date.now() - 60_000);
  const msgs = await prisma.message.findMany({
    where: {
      OR: [
        { status: "PENDING", createdAt: { lt: stale } },
        { status: "ERROR", attempts: { lt: 5 } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  for (const m of msgs) await processMessage(m.id);

  const { syncMarkToSheet, isSheetsConfigured } = await import("./sheets");
  let synced = 0;
  if (isSheetsConfigured()) {
    const marks = await prisma.shiftMark.findMany({
      where: { sheetStatus: { in: ["PENDING", "ERROR", "DISABLED"] } },
      take: limit,
      select: { id: true },
    });
    for (const mk of marks) {
      await syncMarkToSheet(mk.id);
      synced++;
    }
  }
  return { messages: msgs.length, marks: synced };
}

export { toDateStr };
