import { addDays, parseHHMM, ymd, zonedParts, zonedToUtc } from "./time";

export type ShiftRule = {
  timezone: string;
  shiftStart: string; // "ЧЧ:ММ"
  windowBeforeMin: number;
  windowAfterMin: number;
};

export type ShiftResolution = {
  /** Дата смены (дата её начала) — колонка табеля. */
  shiftDate: string;
  /** Момент начала смены, к которой отнесено фото. */
  shiftStartAt: Date;
  /** Минуты от начала смены: <0 — раньше, >0 — позже. */
  deltaMin: number;
  /** Попало ли фото в допустимое окно. */
  inWindow: boolean;
};

/**
 * Определяет, к какой смене относится фото.
 *
 * Берём ближайшее к моменту публикации начало смены (вчера / сегодня / завтра по
 * местному времени объекта). Дата смены = дата её НАЧАЛА, поэтому:
 *  - смена с 23:00, фото в 00:20 следующих суток -> дата смены = вчерашняя;
 *  - смена с 08:00, фото в 07:40 -> сегодняшняя.
 * Затем проверяем допустимое окно [начало - before; начало + after].
 */
export function resolveShift(sentAt: Date, rule: ShiftRule): ShiftResolution {
  const { hour, minute } = parseHHMM(rule.shiftStart);
  const local = zonedParts(sentAt, rule.timezone);
  const today = ymd(local.year, local.month, local.day);

  let best: { date: string; start: Date; diff: number } | null = null;
  for (const offset of [-1, 0, 1]) {
    const date = addDays(today, offset);
    const [y, m, d] = date.split("-").map(Number);
    const start = zonedToUtc(y, m, d, hour, minute, rule.timezone);
    const diff = sentAt.getTime() - start.getTime();
    if (!best || Math.abs(diff) < Math.abs(best.diff)) best = { date, start, diff };
  }

  const deltaMin = Math.round(best!.diff / 60000);
  return {
    shiftDate: best!.date,
    shiftStartAt: best!.start,
    deltaMin,
    inWindow: deltaMin >= -rule.windowBeforeMin && deltaMin <= rule.windowAfterMin,
  };
}

export function describeDelta(deltaMin: number): string {
  if (deltaMin === 0) return "точно к началу смены";
  const abs = Math.abs(deltaMin);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  const text = h ? `${h} ч ${m} мин` : `${m} мин`;
  return deltaMin < 0 ? `за ${text} до начала смены` : `через ${text} после начала смены`;
}
