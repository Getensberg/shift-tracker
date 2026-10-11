// Зеркалирование табеля в Google Sheets через Apps Script Web App
// (код скрипта — google-apps-script/Code.gs).
// Источник правды — БД. При сбое отметка получает sheetStatus=ERROR и
// досылается позже (кнопка в настройках / cron).

import { prisma } from "./db";
import { toDateStr } from "./time";

export function isSheetsConfigured() {
  return Boolean(process.env.SHEETS_WEBHOOK_URL);
}

export function sheetRowName(e: { lastName: string; firstName?: string | null; middleName?: string | null }) {
  const initials = [e.firstName, e.middleName].filter(Boolean).map((s) => `${s![0]}.`).join("");
  return initials ? `${e.lastName} ${initials}` : e.lastName;
}

type SheetPayload = {
  action: "set" | "clear" | "ping";
  month?: string; // "2025-09" — имя листа
  day?: number;
  name?: string;
  note?: string;
};

export async function callSheets(payload: SheetPayload): Promise<{ ok: boolean; error?: string }> {
  const url = process.env.SHEETS_WEBHOOK_URL;
  if (!url) return { ok: false, error: "SHEETS_WEBHOOK_URL не задан" };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try {
    // Apps Script отвечает 302 на googleusercontent.com — fetch проходит редирект сам.
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "text/plain;charset=utf-8" },
      body: JSON.stringify({ ...payload, secret: process.env.SHEETS_SECRET ?? "" }),
      redirect: "follow",
      signal: controller.signal,
      cache: "no-store",
    });
    const text = await res.text();
    let json: { ok?: boolean; error?: string } = {};
    try {
      json = JSON.parse(text);
    } catch {
      return { ok: false, error: `Неожиданный ответ (${res.status}): ${text.slice(0, 200)}` };
    }
    return json.ok ? { ok: true } : { ok: false, error: json.error ?? "unknown" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    clearTimeout(timer);
  }
}

/** Поставить "1" в Google-таблице по отметке. */
export async function syncMarkToSheet(markId: number) {
  const mark = await prisma.shiftMark.findUnique({
    where: { id: markId },
    include: { employee: true, message: true },
  });
  if (!mark) return;
  if (!isSheetsConfigured()) {
    await prisma.shiftMark.update({ where: { id: markId }, data: { sheetStatus: "DISABLED", sheetError: null } });
    return;
  }
  const date = toDateStr(mark.shiftDate);
  const note = [
    mark.source === "AUTO" ? "Авто" : `Вручную (${mark.createdBy})`,
    mark.message?.caption ? `Подпись: ${mark.message.caption}` : null,
    mark.message?.link ?? null,
    mark.comment,
  ]
    .filter(Boolean)
    .join("\n");
  const r = await callSheets({
    action: "set",
    month: date.slice(0, 7),
    day: Number(date.slice(8, 10)),
    name: sheetRowName(mark.employee),
    note,
  });
  await prisma.shiftMark.update({
    where: { id: markId },
    data: r.ok ? { sheetStatus: "OK", sheetError: null } : { sheetStatus: "ERROR", sheetError: r.error },
  });
}

/** Очистить ячейку (отметка снята оператором). */
export async function clearSheetCell(employee: { lastName: string; firstName?: string | null; middleName?: string | null }, date: string) {
  if (!isSheetsConfigured()) return { ok: true };
  return callSheets({ action: "clear", month: date.slice(0, 7), day: Number(date.slice(8, 10)), name: sheetRowName(employee) });
}
