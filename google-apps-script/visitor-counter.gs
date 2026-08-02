/**
 * @OnlyCurrentDoc
 */

const COUNTER_SHEET_NAME = "방문자수";
const ALLOWED_SITE = "korean.browsertools.kr";
const SEOUL_TIME_ZONE = "Asia/Seoul";

function doGet(event) {
  const parameters = event && event.parameter ? event.parameter : {};
  const callback = String(parameters.callback || "");

  if (!isSafeCallback(callback)) {
    return ContentService.createTextOutput("/* invalid callback */")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }

  let response;
  try {
    if (parameters.site !== ALLOWED_SITE) {
      throw new Error("invalid site");
    }
    response = updateCounter(parameters.action === "hit");
  } catch (error) {
    response = {ok: false};
  }

  return ContentService.createTextOutput(`${callback}(${JSON.stringify(response)});`)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function updateCounter(shouldIncrement) {
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);

  try {
    const sheet = getCounterSheet();
    const today = Utilities.formatDate(new Date(), SEOUL_TIME_ZONE, "yyyy-MM-dd");
    const values = sheet.getRange("A2:C2").getValues()[0];
    const storedDate = toDateKey(values[0], sheet.getRange("A2").getDisplayValue());
    let todayCount = storedDate === today ? toCount(values[1]) : 0;
    let totalCount = toCount(values[2]);

    if (shouldIncrement) {
      todayCount += 1;
      totalCount += 1;
    }

    sheet.getRange("A2").setNumberFormat("@").setValue(today);
    sheet.getRange("B2:C2").setValues([[todayCount, totalCount]]);
    SpreadsheetApp.flush();
    return {ok: true, date: today, today: todayCount, total: totalCount};
  } finally {
    lock.releaseLock();
  }
}

function getCounterSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(COUNTER_SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(COUNTER_SHEET_NAME);
  }

  if (sheet.getRange("A1").getValue() !== "날짜") {
    sheet.getRange("A1:C1").setValues([["날짜", "오늘", "전체"]]);
    sheet.setFrozenRows(1);
  }

  return sheet;
}

function toCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : 0;
}

function toDateKey(value, displayValue) {
  if (Object.prototype.toString.call(value) === "[object Date]" && !Number.isNaN(value.getTime())) {
    return Utilities.formatDate(value, SEOUL_TIME_ZONE, "yyyy-MM-dd");
  }
  const text = String(displayValue || value || "").trim();
  const parts = text.match(/^(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (parts) {
    return `${parts[1]}-${parts[2].padStart(2, "0")}-${parts[3].padStart(2, "0")}`;
  }
  return text;
}

function isSafeCallback(callback) {
  return /^[A-Za-z_$][0-9A-Za-z_$]{0,80}$/.test(callback);
}
