// Демо-данные и симулятор Telegram. Позволяют проверить весь путь
// без реальной группы: формируется настоящий Telegram Update и прогоняется
// через тот же ingestUpdate/processMessage, что и вебхук.

import { prisma } from "./db";
import { ingestUpdate, processMessage } from "./pipeline";
import { SIMULATED_PREFIX, type TgUpdate } from "./telegram";
import { addDays, parseHHMM, toDateStr, zonedToUtc } from "./time";

export const DEMO_DAY_CHAT = -1001000000001;
export const DEMO_NIGHT_CHAT = -1001000000002;
export const DEMO_UNKNOWN_CHAT = -1009999999999;

export const DEMO_EMPLOYEES = [
  { lastName: "Мехоношин", firstName: "Алексей", personnelNumber: "1001", tgUserId: 700001n, tgUsername: "mekhonoshin" },
  { lastName: "Голицин", personnelNumber: "1002", tgUserId: 700002n },
  { lastName: "Чистов", firstName: "Андрей", personnelNumber: "1003" },
  { lastName: "Васильев", personnelNumber: "1004" },
  { lastName: "Македонский", personnelNumber: "1005", aliases: ["Саша-М"] },
  { lastName: "Сидоренко", personnelNumber: "1006" },
  { lastName: "Петров", personnelNumber: "1007" },
  { lastName: "Иванов", personnelNumber: "1008" },
];

export async function seedDemo() {
  for (const e of DEMO_EMPLOYEES) {
    const exists = await prisma.employee.findFirst({ where: { lastName: e.lastName } });
    if (!exists) await prisma.employee.create({ data: { aliases: [], ...e } });
  }
  const byName = Object.fromEntries((await prisma.employee.findMany()).map((e) => [e.lastName, e.id]));

  const day = await prisma.group.upsert({
    where: { chatId: BigInt(DEMO_DAY_CHAT) },
    update: {},
    create: {
      chatId: BigInt(DEMO_DAY_CHAT),
      title: "БЦ «Северный» — пост 1 (демо)",
      objectName: "БЦ «Северный», пост 1",
      shiftStart: "08:00",
      windowBeforeMin: 60,
      windowAfterMin: 90,
    },
  });
  const night = await prisma.group.upsert({
    where: { chatId: BigInt(DEMO_NIGHT_CHAT) },
    update: {},
    create: {
      chatId: BigInt(DEMO_NIGHT_CHAT),
      title: "Склад «Южный» — ночь (демо)",
      objectName: "Склад «Южный»",
      shiftStart: "23:00",
      windowBeforeMin: 60,
      windowAfterMin: 90,
    },
  });

  const bind = async (groupId: number, names: string[]) => {
    for (const n of names) {
      if (!byName[n]) continue;
      await prisma.groupEmployee.upsert({
        where: { groupId_employeeId: { groupId, employeeId: byName[n] } },
        update: {},
        create: { groupId, employeeId: byName[n] },
      });
    }
  };
  await bind(day.id, ["Мехоношин", "Голицин", "Чистов", "Васильев", "Македонский", "Петров", "Иванов"]);
  await bind(night.id, ["Сидоренко", "Иванов"]);
}

// ---------------------------------------------------------------------------

export type SimInput = {
  chatId: number;
  chatTitle?: string;
  fromId: number;
  fromName: string;
  fromUsername?: string;
  caption?: string;
  sentAt: Date;
  withPhoto: boolean;
  messageId?: number;
  mediaGroupId?: string;
  edit?: boolean;
};

let seq = 0;
export function nextMessageId() {
  // уникально между запусками: секунды + счётчик
  seq = (seq + 1) % 1000;
  return (Math.floor(Date.now() / 1000) % 1_000_000) * 1000 + seq;
}

export function buildUpdate(i: SimInput): TgUpdate {
  const messageId = i.messageId ?? nextMessageId();
  const date = Math.floor(i.sentAt.getTime() / 1000);
  const message = {
    message_id: messageId,
    date,
    ...(i.edit ? { edit_date: Math.floor(Date.now() / 1000) } : {}),
    chat: { id: i.chatId, type: "supergroup" as const, title: i.chatTitle ?? `Группа ${i.chatId}` },
    from: { id: i.fromId, is_bot: false, first_name: i.fromName, username: i.fromUsername },
    ...(i.caption ? { caption: i.caption } : {}),
    ...(i.withPhoto
      ? {
          photo: [
            { file_id: `${SIMULATED_PREFIX}${messageId}_s`, file_unique_id: `u${messageId}s`, width: 90, height: 120 },
            { file_id: `${SIMULATED_PREFIX}${messageId}`, file_unique_id: `u${messageId}`, width: 960, height: 1280 },
          ],
        }
      : { text: i.caption ?? "текст" }),
    ...(i.mediaGroupId ? { media_group_id: i.mediaGroupId } : {}),
  };
  return {
    update_id: messageId,
    ...(i.edit ? { edited_message: message } : { message }),
  };
}

export async function simulate(i: SimInput) {
  const update = buildUpdate(i);
  const r = await ingestUpdate(update);
  const statuses: string[] = [];
  for (const id of r.messageIds) statuses.push(String(await processMessage(id)));
  const msgId = (update.message ?? update.edited_message)!.message_id;
  return { ...r, statuses, tgMessageId: msgId };
}

// ---------------------------------------------------------------------------

export type ScenarioRow = {
  title: string;
  description: string;
  expected: string;
  actual: string;
  ok: boolean;
  messageDbId?: number;
  note?: string;
};

/**
 * Набор нестандартных ситуаций из ТЗ (п. 9) на одну дату смены.
 * Время — по Москве, дневной пост: смена 08:00 (окно −60/+90),
 * ночной пост: смена 23:00.
 */
export async function runScenarios(date: string, resetFirst = true): Promise<ScenarioRow[]> {
  if (resetFirst) await resetSimulated();
  await seedDemo();

  const tz = "Europe/Moscow";
  const at = (d: string, hhmm: string) => {
    const [y, m, dd] = d.split("-").map(Number);
    const { hour, minute } = parseHHMM(hhmm);
    return zonedToUtc(y, m, dd, hour, minute, tz);
  };
  const DAY = { chatId: DEMO_DAY_CHAT, chatTitle: "БЦ «Северный» — пост 1 (демо)" };
  const NIGHT = { chatId: DEMO_NIGHT_CHAT, chatTitle: "Склад «Южный» — ночь (демо)" };

  const rows: ScenarioRow[] = [];
  const findMsg = (chatId: number, tgMessageId: number) =>
    prisma.message.findUnique({ where: { chatId_tgMessageId: { chatId: BigInt(chatId), tgMessageId } } });

  const step = async (
    title: string,
    description: string,
    expected: string,
    input: SimInput,
    extraCheck?: (msgDbId?: number) => Promise<string | null>,
  ) => {
    const r = await simulate(input);
    const actual = r.statuses[0] ?? "SKIPPED";
    const m = await findMsg(input.chatId, r.tgMessageId);
    let ok = actual === expected;
    let note = r.statuses.length ? m?.reason ?? undefined : r.note;
    if (ok && extraCheck) {
      const err = await extraCheck(m?.id);
      if (err) {
        ok = false;
        note = err;
      }
    }
    rows.push({ title, description, expected, actual, ok, messageDbId: m?.id, note });
    return r;
  };

  // 1
  const first = await step("Обычная отметка", "«Мехоношин», 07:50 — за 10 минут до смены", "ACCEPTED", {
    ...DAY, fromId: 700001, fromName: "Алексей", caption: "Мехоношин", sentAt: at(date, "07:50"), withPhoto: true,
  });
  // 2
  await step("Telegram повторно прислал то же сообщение", "Тот же message_id ещё раз (ретрай вебхука)", "SKIPPED", {
    ...DAY, fromId: 700001, fromName: "Алексей", caption: "Мехоношин", sentAt: at(date, "07:50"), withPhoto: true,
    messageId: first.tgMessageId,
  });
  // 3
  await step("Сотрудник отправил ещё одно фото", "«Мехоношин» снова в 08:20", "DUPLICATE", {
    ...DAY, fromId: 700001, fromName: "Алексей", caption: "Мехоношин", sentAt: at(date, "08:20"), withPhoto: true,
  });
  // 4
  await step("Подпись с инициалами", "«Чистов А.В. на посту»", "ACCEPTED", {
    ...DAY, fromId: 700010, fromName: "Андрей", caption: "Чистов А.В. на посту", sentAt: at(date, "07:55"), withPhoto: true,
  });
  // 5
  await step("Опечатка в фамилии", "«Васильв» вместо «Васильев»", "ACCEPTED", {
    ...DAY, fromId: 700011, fromName: "Вася", caption: "Васильв", sentAt: at(date, "08:05"), withPhoto: true,
  });
  // 6
  await step("Фото без подписи, аккаунт привязан", "Аккаунт Telegram привязан к Голицину", "ACCEPTED", {
    ...DAY, fromId: 700002, fromName: "Голицин", sentAt: at(date, "07:45"), withPhoto: true,
  });
  // 7
  await step("Фото без подписи, аккаунт не привязан", "Нельзя понять, кто на фото", "REVIEW", {
    ...DAY, fromId: 700099, fromName: "Неизвестный", sentAt: at(date, "07:58"), withPhoto: true,
  });
  // 8
  const vague = await step("Подпись без фамилии", "«Заступил на смену»", "REVIEW", {
    ...DAY, fromId: 700012, fromName: "Ваня", caption: "Заступил на смену", sentAt: at(date, "08:02"), withPhoto: true,
  });
  // 9
  await step("Подпись отредактирована", "Шаг 8 исправлен на «Иванов, заступил на смену» → повторная обработка", "ACCEPTED", {
    ...DAY, fromId: 700012, fromName: "Ваня", caption: "Иванов, заступил на смену", sentAt: at(date, "08:02"), withPhoto: true,
    messageId: vague.tgMessageId, edit: true,
  });
  // 10
  await step("Несколько сотрудников в подписи", "«Петров, Македонский»", "REVIEW", {
    ...DAY, fromId: 700013, fromName: "Петя", caption: "Петров, Македонский", sentAt: at(date, "07:59"), withPhoto: true,
  });
  // 11
  await step("Фото слишком рано", "«Македонский» в 05:30 при смене с 08:00", "REVIEW", {
    ...DAY, fromId: 700014, fromName: "Саша", caption: "Македонский", sentAt: at(date, "05:30"), withPhoto: true,
  });
  // 12
  await step(
    "Ночная смена, фото после полуночи",
    "Смена с 23:00, «Сидоренко» в 00:20 следующих суток → дата смены = " + date,
    "ACCEPTED",
    { ...NIGHT, fromId: 700015, fromName: "Сидоренко", caption: "Сидоренко", sentAt: at(addDays(date, 1), "00:20"), withPhoto: true },
    async (id) => {
      const mark = await prisma.shiftMark.findFirst({ where: { messageId: id } });
      if (!mark) return "отметка не найдена";
      const d = toDateStr(mark.shiftDate);
      return d === date ? null : `дата смены ${d}, ожидалась ${date}`;
    },
  );
  // 13
  const album = `alb${Date.now()}`;
  await step("Альбом: первое фото с подписью", "«Петров» + ещё одно фото в том же альбоме", "ACCEPTED", {
    ...DAY, fromId: 700016, fromName: "Петров", caption: "Петров", sentAt: at(date, "07:58"), withPhoto: true, mediaGroupId: album,
  });
  await step("Альбом: второе фото без подписи", "Не создаёт отдельную запись в табеле", "IGNORED", {
    ...DAY, fromId: 700016, fromName: "Петров", sentAt: at(date, "07:58"), withPhoto: true, mediaGroupId: album,
  });
  // 14
  await step("Сообщение без фото", "Обычный текст в чате", "SKIPPED", {
    ...DAY, fromId: 700017, fromName: "Болтун", caption: "Всем доброе утро!", sentAt: at(date, "08:00"), withPhoto: false,
  });
  // 15
  await step("Группа не подключена", "Фото из группы, которую админ ещё не включил", "IGNORED", {
    chatId: DEMO_UNKNOWN_CHAT, chatTitle: "Новая группа (не подключена)", fromId: 700018, fromName: "Кто-то",
    caption: "Иванов", sentAt: at(date, "08:00"), withPhoto: true,
  });

  return rows;
}

/** Удалить всё, что создал симулятор. Реальные данные не трогаются. */
export async function resetSimulated() {
  const sim = await prisma.message.findMany({ where: { simulated: true }, select: { id: true } });
  const ids = sim.map((m) => m.id);
  await prisma.$transaction([
    prisma.auditLog.deleteMany({ where: { messageId: { in: ids } } }),
    prisma.shiftMark.deleteMany({ where: { messageId: { in: ids } } }),
    prisma.message.deleteMany({ where: { id: { in: ids } } }),
    prisma.group.deleteMany({ where: { chatId: BigInt(DEMO_UNKNOWN_CHAT) } }),
  ]);
  return ids.length;
}
