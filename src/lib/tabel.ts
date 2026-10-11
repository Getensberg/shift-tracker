import { prisma } from "./db";
import { addDays, dateOnly, daysInMonth, toDateStr } from "./time";
import { sheetRowName } from "./sheets";

export function parseMonth(month?: string | null) {
  const now = new Date();
  const fallback = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const m = month && /^\d{4}-\d{2}$/.test(month) ? month : fallback;
  const [year, mon] = m.split("-").map(Number);
  return { month: m, year, mon, days: daysInMonth(year, mon) };
}

export function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return d.toISOString().slice(0, 7);
}

/** Табель за месяц: строки сотрудников × дни, как в исходной таблице. */
export async function loadTabel(monthParam?: string | null) {
  const { month, year, mon, days } = parseMonth(monthParam);
  const from = dateOnly(`${month}-01`);
  const to = dateOnly(addDays(`${month}-${String(days).padStart(2, "0")}`, 1));

  const marks = await prisma.shiftMark.findMany({
    where: { shiftDate: { gte: from, lt: to } },
    include: { message: { include: { group: true } } },
  });
  const withMarks = new Set(marks.map((m) => m.employeeId));
  const employees = (
    await prisma.employee.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] })
  ).filter((e) => e.active || withMarks.has(e.id));

  const rows = employees.map((e) => {
    const cells: Record<number, (typeof marks)[number]> = {};
    for (const mk of marks) if (mk.employeeId === e.id) cells[Number(toDateStr(mk.shiftDate).slice(8))] = mk;
    return { employee: e, name: sheetRowName(e), cells, total: Object.keys(cells).length };
  });
  const dayTotals = Array.from({ length: days }, (_, i) => rows.filter((r) => r.cells[i + 1]).length);

  return { month, year, mon, days, rows, dayTotals, marks, total: marks.length };
}
