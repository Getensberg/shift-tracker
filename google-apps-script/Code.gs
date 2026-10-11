/**
 * Табель смен — приёмник отметок для Google Sheets.
 *
 * Установка:
 *  1. Откройте Google-таблицу → Расширения → Apps Script, вставьте этот код.
 *  2. Настройки проекта (шестерёнка) → Свойства скрипта → добавьте
 *     SHEETS_SECRET = <та же строка, что в переменной SHEETS_SECRET приложения>.
 *  3. Развернуть → Новое развёртывание → тип «Веб-приложение»:
 *       Выполнять как: Я; Доступ: Все.
 *     Скопируйте URL вида https://script.google.com/macros/s/.../exec
 *     в переменную SHEETS_WEBHOOK_URL приложения.
 *  4. В приложении: Интеграции → «Проверить связь».
 *
 * Формат: один лист на месяц с именем "ГГГГ-ММ" (например "2025-09"), как в
 * исходном табеле: строка 2 — заголовок (Ф.И.О., 1..31, кол. смен), далее
 * сотрудники, внизу строка «ИТОГ:». Лист создаётся автоматически. Чтобы писать
 * в уже существующий табель — переименуйте его лист в "ГГГГ-ММ".
 *
 * Новые сотрудники добавляются строкой над «ИТОГ:». Ручные правки в таблице
 * не перетираются: скрипт меняет только ячейку конкретной отметки.
 */

var MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
var HEADER_ROW = 2;
var FIRST_DATA_ROW = 3;

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var secret = PropertiesService.getScriptProperties().getProperty('SHEETS_SECRET');
    if (!secret || body.secret !== secret) return json_({ ok: false, error: 'bad secret' });
    if (body.action === 'ping') return json_({ ok: true });
    if (!/^\d{4}-\d{2}$/.test(body.month) || !body.day || !body.name) return json_({ ok: false, error: 'bad payload' });

    var lock = LockService.getScriptLock(); // параллельные запросы не должны создать две строки одному сотруднику
    lock.waitLock(20000);
    try {
      var sheet = getMonthSheet_(body.month);
      var row = findOrCreateRow_(sheet, body.name, body.action === 'set');
      if (row < 0) return json_({ ok: true, note: 'row not found, nothing to clear' });
      var cell = sheet.getRange(row, 1 + Number(body.day));
      if (body.action === 'set') {
        cell.setValue(1).setHorizontalAlignment('center').setBackground('#d9f0e5');
        if (body.note) cell.setNote(body.note);
      } else if (body.action === 'clear') {
        cell.clearContent().clearNote().setBackground(null);
      }
      return json_({ ok: true });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function norm_(s) {
  return String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

function colLetter_(n) {
  var s = '';
  while (n > 0) {
    var r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

function getMonthSheet_(month) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(month);
  if (sh) return sh;

  sh = ss.insertSheet(month);
  var parts = month.split('-');
  var y = Number(parts[0]);
  var m = Number(parts[1]);
  var days = new Date(y, m, 0).getDate();

  sh.getRange(1, 1).setValue('Табель смен — ' + MONTHS[m - 1] + ' ' + y).setFontWeight('bold');
  var header = ['Ф.И.О.'];
  for (var d = 1; d <= days; d++) header.push(d);
  header.push('кол.\nсмен');
  sh.getRange(HEADER_ROW, 1, 1, header.length).setValues([header]).setFontWeight('bold').setHorizontalAlignment('center');
  sh.getRange(FIRST_DATA_ROW, 1).setValue('ИТОГ:').setFontWeight('bold');
  sh.setFrozenRows(HEADER_ROW);
  sh.setFrozenColumns(1);
  sh.setColumnWidth(1, 180);
  sh.setColumnWidths(2, days, 30);
  return sh;
}

function totalsRow_(sh) {
  var last = sh.getLastRow();
  if (last < FIRST_DATA_ROW) return -1;
  var vals = sh.getRange(FIRST_DATA_ROW, 1, last - FIRST_DATA_ROW + 1, 1).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (norm_(vals[i][0]).indexOf('итог') === 0) return FIRST_DATA_ROW + i;
  }
  return -1;
}

function lastHeaderCol_(sh) {
  var row = sh.getRange(HEADER_ROW, 1, 1, sh.getLastColumn()).getValues()[0];
  for (var c = row.length; c >= 1; c--) if (String(row[c - 1]).trim() !== '') return c;
  return row.length;
}

function findOrCreateRow_(sh, name, create) {
  var totals = totalsRow_(sh);
  var end = totals > 0 ? totals - 1 : sh.getLastRow();
  var target = norm_(name);
  var surname = target.split(' ')[0];

  if (end >= FIRST_DATA_ROW) {
    var vals = sh.getRange(FIRST_DATA_ROW, 1, end - FIRST_DATA_ROW + 1, 1).getValues();
    var bySurname = [];
    for (var i = 0; i < vals.length; i++) {
      var v = norm_(vals[i][0]);
      if (v === target) return FIRST_DATA_ROW + i;
      if (v.split(' ')[0] === surname) bySurname.push(FIRST_DATA_ROW + i);
    }
    // В табеле может быть только фамилия ("Иванов"), а приходит "Иванов И." — берём, если совпадение одно.
    if (bySurname.length === 1) return bySurname[0];
  }
  if (!create) return -1;

  var totalCol = lastHeaderCol_(sh);
  var row;
  if (totals > 0) {
    sh.insertRowBefore(totals);
    row = totals;
    totals = totals + 1;
  } else {
    row = sh.getLastRow() + 1;
  }
  sh.getRange(row, 1).setValue(name);
  sh.getRange(row, totalCol).setFormula('=SUM(B' + row + ':' + colLetter_(totalCol - 1) + row + ')');

  // Пересчитываем формулы итоговой строки, чтобы новая строка попала в сумму.
  if (totals > 0) {
    for (var c = 2; c <= totalCol; c++) {
      var L = colLetter_(c);
      sh.getRange(totals, c).setFormula('=SUM(' + L + FIRST_DATA_ROW + ':' + L + (totals - 1) + ')');
    }
  }
  return row;
}

/** Ручной тест из редактора Apps Script: Выполнить → testSet_. */
function testSet_() {
  var sheet = getMonthSheet_('2025-09');
  var row = findOrCreateRow_(sheet, 'Тестов', true);
  sheet.getRange(row, 1 + 19).setValue(1);
}
