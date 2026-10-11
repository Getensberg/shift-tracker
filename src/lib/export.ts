import ExcelJS from "exceljs";
import { loadTabel } from "./tabel";
import { MONTHS_RU, formatDateRu, formatLocal, toDateStr } from "./time";

const col = (n: number) => {
  let s = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
};

/** Выгрузка в формате исходного «Табеля» + лист «Основания» (приложение 1 ТЗ). */
export async function buildTabelXlsx(month: string): Promise<Buffer> {
  const t = await loadTabel(month);
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Табель");

  const lastDayCol = 1 + t.days;
  const totalCol = lastDayCol + 1;
  ws.getCell(1, 1).value = `Табель смен — ${MONTHS_RU[t.mon - 1]} ${t.year}`;
  ws.getCell(1, 1).font = { bold: true, size: 13 };

  const header = ws.getRow(2);
  header.getCell(1).value = "Ф.И.О.";
  for (let d = 1; d <= t.days; d++) header.getCell(1 + d).value = d;
  header.getCell(totalCol).value = "кол.\nсмен";
  header.font = { bold: true };
  header.alignment = { horizontal: "center", vertical: "middle", wrapText: true };

  t.rows.forEach((r, i) => {
    const row = ws.getRow(3 + i);
    row.getCell(1).value = r.name;
    for (let d = 1; d <= t.days; d++) {
      const mk = r.cells[d];
      if (!mk) continue;
      const cell = row.getCell(1 + d);
      cell.value = 1;
      cell.alignment = { horizontal: "center" };
      if (mk.message?.link) cell.note = `${mk.source === "AUTO" ? "Авто" : "Вручную"}: ${mk.message.link}`;
    }
    row.getCell(totalCol).value = { formula: `SUM(B${3 + i}:${col(lastDayCol)}${3 + i})` };
  });

  const totalRowIdx = 3 + t.rows.length;
  const totalRow = ws.getRow(totalRowIdx);
  totalRow.getCell(1).value = "ИТОГ:";
  for (let c = 2; c <= totalCol; c++) {
    totalRow.getCell(c).value = { formula: `SUM(${col(c)}3:${col(c)}${Math.max(3, totalRowIdx - 1)})` };
  }
  totalRow.font = { bold: true };

  ws.getColumn(1).width = 22;
  for (let c = 2; c <= lastDayCol; c++) ws.getColumn(c).width = 4;
  ws.getColumn(totalCol).width = 7;
  for (let r = 2; r <= totalRowIdx; r++) {
    for (let c = 1; c <= totalCol; c++) {
      ws.getCell(r, c).border = {
        top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" },
      };
    }
  }
  ws.views = [{ state: "frozen", xSplit: 1, ySplit: 2 }];

  // Основания: минимальный состав данных по каждой отметке (Приложение 1 ТЗ)
  const basis = wb.addWorksheet("Основания");
  basis.columns = [
    { header: "Сотрудник", key: "emp", width: 22 },
    { header: "Дата смены", key: "date", width: 12 },
    { header: "Объект", key: "obj", width: 26 },
    { header: "Источник", key: "src", width: 10 },
    { header: "Группа", key: "grp", width: 28 },
    { header: "ID сообщения", key: "mid", width: 14 },
    { header: "Время сообщения", key: "sent", width: 17 },
    { header: "Подпись", key: "cap", width: 30 },
    { header: "Ссылка", key: "link", width: 36 },
    { header: "Комментарий системы", key: "why", width: 50 },
  ];
  basis.getRow(1).font = { bold: true };
  const names = new Map(t.rows.map((r) => [r.employee.id, r.name]));
  for (const mk of [...t.marks].sort((a, b) => +a.shiftDate - +b.shiftDate)) {
    basis.addRow({
      emp: names.get(mk.employeeId),
      date: formatDateRu(toDateStr(mk.shiftDate)),
      obj: mk.objectName ?? "",
      src: mk.source === "AUTO" ? "авто" : "вручную",
      grp: mk.message?.group?.title ?? "",
      mid: mk.message ? mk.message.tgMessageId : "",
      sent: mk.message ? formatLocal(mk.message.sentAt, mk.message.group?.timezone) : "",
      cap: mk.message?.caption ?? "",
      link: mk.message?.link ?? "",
      why: mk.message?.reason ?? mk.comment ?? "",
    });
  }

  return Buffer.from(await wb.xlsx.writeBuffer());
}
