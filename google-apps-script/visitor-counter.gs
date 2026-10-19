/**
 * @OnlyCurrentDoc
 */

const COUNTER_SHEET_NAME = "방문자수";
const PAGEVIEW_SHEET_NAME = "페이지조회";
const ALLOWED_SITES = ["browsertools.kr", "browserfiletools.net", "crystalon.kr"];
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
    if (!ALLOWED_SITES.includes(String(parameters.site || ""))) throw new Error("invalid site");
    if (parameters.pageview === "1") {
      response = recordPageview({
        event_id: parameters.event_id,
        site: parameters.site,
        country: parameters.country,
        path: parameters.path,
        referrer: parameters.referrer,
      });
    } else {
      response = getPageviewCounts(parameters.site);
    }
  } catch (error) {
    response = {ok: false};
  }

  return ContentService.createTextOutput(callback + "(" + JSON.stringify(response) + ");")
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function doPost(event) {
  try {
    if (!event || !event.postData || event.postData.contents.length > 2048) return json_({ok: false});
    const input = JSON.parse(event.postData.contents);
    if (input.action === "pageview") return json_(recordPageview(input));
    if (input.action === "export") return json_(exportPageviews(input));
  } catch (error) {
    return json_({ok: false});
  }
  return json_({ok: false});
}

function json_(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function recordPageview(input) {
  const eventId = String(input.event_id || "");
  const site = String(input.site || "");
  const country = String(input.country || "UNKNOWN");
  const path = String(input.path || "");
  const referrer = String(input.referrer || "Direct / unknown");
  if (!/^[0-9a-f-]{36}$/i.test(eventId) || !ALLOWED_SITES.includes(site)
      || !/^(?:EST-[A-Z]{2}|UNKNOWN)$/.test(country)
      || !/^\/(?!\/)[^?#\r\n\x00-\x1f]{0,299}$/.test(path)) return {ok: false};
  if (referrer !== "Direct / unknown" && !/^[A-Za-z0-9.-]{1,253}$/.test(referrer)) return {ok: false};
  const lock = LockService.getScriptLock();
  lock.waitLock(5000);
  try {
    const sheet = getPageviewSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow > 1 && sheet.getRange(2, 1, lastRow - 1, 1)
        .createTextFinder(eventId).matchEntireCell(true).findNext()) {
      return getPageviewCounts(site);
    }
    sheet.appendRow([eventId, new Date(), site, country, path, referrer]);
    SpreadsheetApp.flush();
    return getPageviewCounts(site);
  } finally {
    lock.releaseLock();
  }
}

function getPageviewCounts(site) {
  const sheet = getPageviewSheet();
  const lastRow = sheet.getLastRow();
  const todayKey = Utilities.formatDate(new Date(), SEOUL_TIME_ZONE, "yyyy-MM-dd");
  if (lastRow < 2) return {ok: true, today: 0, total: 0, date: todayKey};
  const values = sheet.getRange(2, 2, lastRow - 1, 2).getValues();
  let today = 0;
  let total = 0;
  for (const row of values) {
    const rowSite = String(row[1] || "");
    if (rowSite !== site) continue;
    total += 1;
    if (row[0] instanceof Date
        && Utilities.formatDate(row[0], SEOUL_TIME_ZONE, "yyyy-MM-dd") === todayKey) today += 1;
  }
  return {ok: true, today: today, total: total, date: todayKey};
}

function exportPageviews(input) {
  const props = PropertiesService.getScriptProperties();
  const expected = props.getProperty("LOCAL_SYNC_TOKEN") || "";
  const supplied = String(input.token || "");
  if (expected.length < 32 || supplied.length !== expected.length || !constantTimeEquals(supplied, expected)) {
    return {ok: false};
  }
  const after = Math.max(0, Math.floor(Number(input.after) || 0));
  const sheet = getPageviewSheet();
  const lastRow = sheet.getLastRow();
  const firstRow = Math.max(2, after + 1);
  if (firstRow > lastRow) return {ok: true, records: [], has_more: false};
  const count = Math.min(1000, lastRow - firstRow + 1);
  const values = sheet.getRange(firstRow, 1, count, 6).getValues();
  const records = values.map((row, index) => ({
    row_id: firstRow + index,
    timestamp: row[1] instanceof Date ? row[1].toISOString() : new Date(row[1]).toISOString(),
    date: row[1] instanceof Date ? Utilities.formatDate(row[1], SEOUL_TIME_ZONE, "yyyy-MM-dd") : "",
    site: String(row[2] || ""),
    country: String(row[3] || "UNKNOWN"),
    path: String(row[4] || ""),
    referrer: String(row[5] || "Direct / unknown"),
  }));
  return {ok: true, records, has_more: firstRow + count - 1 < lastRow};
}

function constantTimeEquals(left, right) {
  let mismatch = 0;
  for (let index = 0; index < left.length; index++) mismatch |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return mismatch === 0;
}

function getPageviewSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(PAGEVIEW_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(PAGEVIEW_SHEET_NAME);
  if (sheet.getRange("A1").getValue() !== "Event ID") {
    sheet.getRange("A1:F1").setValues([["Event ID", "수신 시각", "Site", "Country estimate", "Path", "Referrer domain"]]);
    sheet.setFrozenRows(1);
  }
  return sheet;
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

  if (!sheet) sheet = spreadsheet.insertSheet(COUNTER_SHEET_NAME);
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
  if (parts) return parts[1] + "-" + parts[2].padStart(2, "0") + "-" + parts[3].padStart(2, "0");
  return text;
}

function isSafeCallback(callback) {
  return /^[A-Za-z_$][0-9A-Za-z_$]{0,80}$/.test(callback);
}
