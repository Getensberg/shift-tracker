import { describe, expect, it } from "vitest";
import { resolveShift } from "./shift";

const day = { timezone: "Europe/Moscow", shiftStart: "08:00", windowBeforeMin: 60, windowAfterMin: 90 };
const night = { ...day, shiftStart: "23:00" };
// Москва = UTC+3
const msk = (iso: string) => new Date(`${iso}+03:00`);

describe("resolveShift", () => {
  it("фото до начала смены — в окне, дата та же", () => {
    const r = resolveShift(msk("2025-09-19T07:50:00"), day);
    expect(r).toMatchObject({ shiftDate: "2025-09-19", deltaMin: -10, inWindow: true });
  });
  it("опоздание в пределах окна", () => {
    expect(resolveShift(msk("2025-09-19T09:20:00"), day)).toMatchObject({ deltaMin: 80, inWindow: true });
  });
  it("слишком рано и слишком поздно", () => {
    expect(resolveShift(msk("2025-09-19T05:30:00"), day).inWindow).toBe(false);
    expect(resolveShift(msk("2025-09-19T10:00:00"), day).inWindow).toBe(false);
  });
  it("ночная смена: фото после полуночи относится к вчерашней смене", () => {
    const r = resolveShift(msk("2025-09-20T00:20:00"), night);
    expect(r).toMatchObject({ shiftDate: "2025-09-19", deltaMin: 80, inWindow: true });
  });
  it("ночная смена: фото до полуночи — в дату смены", () => {
    expect(resolveShift(msk("2025-09-19T22:30:00"), night)).toMatchObject({ shiftDate: "2025-09-19", inWindow: true });
  });
  it("смена с 00:00: фото в 23:40 относится к следующим суткам", () => {
    const r = resolveShift(msk("2025-09-19T23:40:00"), { ...day, shiftStart: "00:00" });
    expect(r).toMatchObject({ shiftDate: "2025-09-20", deltaMin: -20, inWindow: true });
  });
  it("учитывает часовой пояс объекта", () => {
    // 07:50 по Екатеринбургу (UTC+5) = 05:50 МСК
    const r = resolveShift(new Date("2025-09-19T07:50:00+05:00"), { ...day, timezone: "Asia/Yekaterinburg" });
    expect(r).toMatchObject({ shiftDate: "2025-09-19", deltaMin: -10, inWindow: true });
  });
});
