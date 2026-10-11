// Операции с табелем: постановка / снятие отметок. Каждое изменение пишется в AuditLog.

import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { clearSheetCell, syncMarkToSheet } from "./sheets";
import { dateOnly, formatDateRu, toDateStr } from "./time";

export type CreateMarkInput = {
  employeeId: number;
  shiftDate: string; // YYYY-MM-DD
  source: "AUTO" | "MANUAL";
  messageId?: number | null;
  objectName?: string | null;
  lateMinutes?: number | null;
  comment?: string | null;
  actor: string;
  details?: string;
};

export type CreateMarkResult =
  | { created: true; markId: number }
  | { created: false; existing: { id: number; messageId: number | null; source: string } };

function isUniqueViolation(e: unknown) {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

/**
 * Ставит 1. Защита от дублей — уникальный индекс (employeeId, shiftDate) в БД,
 * поэтому даже при параллельной обработке двух фото второй отметки не будет.
 */
export async function createMark(input: CreateMarkInput): Promise<CreateMarkResult> {
  const shiftDate = dateOnly(input.shiftDate);
  try {
    const [mark] = await prisma.$transaction([
      prisma.shiftMark.create({
        data: {
          employeeId: input.employeeId,
          shiftDate,
          source: input.source,
          messageId: input.messageId ?? null,
          objectName: input.objectName ?? null,
          lateMinutes: input.lateMinutes ?? null,
          comment: input.comment ?? null,
          createdBy: input.actor,
        },
      }),
      prisma.auditLog.create({
        data: {
          actor: input.actor,
          action: "MARK_CREATED",
          employeeId: input.employeeId,
          shiftDate,
          messageId: input.messageId ?? null,
          details: input.details ?? (input.source === "AUTO" ? "Автоматическая отметка" : "Ручная отметка"),
        },
      }),
    ]);
    return { created: true, markId: mark.id };
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
    const existing = await prisma.shiftMark.findUnique({
      where: { employeeId_shiftDate: { employeeId: input.employeeId, shiftDate } },
      select: { id: true, messageId: true, source: true },
    });
    if (!existing) throw e;
    await prisma.auditLog.create({
      data: {
        actor: input.actor,
        action: "DUPLICATE",
        employeeId: input.employeeId,
        shiftDate,
        messageId: input.messageId ?? null,
        details: `Отметка за ${formatDateRu(input.shiftDate)} уже есть (отметка #${existing.id}${
          existing.messageId ? `, сообщение #${existing.messageId}` : ""
        }) — вторая не создана`,
      },
    });
    return { created: false, existing };
  }
}

/** Снять отметку (ручная корректировка). */
export async function removeMark(markId: number, actor: string, comment?: string) {
  const mark = await prisma.shiftMark.findUnique({ where: { id: markId }, include: { employee: true } });
  if (!mark) return;
  const date = toDateStr(mark.shiftDate);
  await prisma.$transaction([
    prisma.shiftMark.delete({ where: { id: markId } }),
    prisma.auditLog.create({
      data: {
        actor,
        action: "MARK_REMOVED",
        employeeId: mark.employeeId,
        shiftDate: mark.shiftDate,
        messageId: mark.messageId,
        details: comment ? `Отметка снята: ${comment}` : "Отметка снята",
      },
    }),
  ]);
  if (mark.messageId) {
    const left = await prisma.shiftMark.count({ where: { messageId: mark.messageId } });
    if (left === 0) {
      await prisma.message.update({
        where: { id: mark.messageId },
        data: { status: "REJECTED", reason: `Отметка снята оператором${comment ? `: ${comment}` : ""}` },
      });
    }
  }
  await clearSheetCell(mark.employee, date);
}

/** Синхронизировать в Google Sheets только что созданные отметки. */
export async function syncCreated(results: CreateMarkResult[]) {
  for (const r of results) if (r.created) await syncMarkToSheet(r.markId);
}
