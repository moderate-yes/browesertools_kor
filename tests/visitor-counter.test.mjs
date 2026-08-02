import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import vm from "node:vm";

function loadCounter() {
  const body = {appendChild() {}};
  const context = {
    window: {
      DANSUM_VISITOR_COUNTER: {endpoint: ""},
      localStorage: {getItem() { return null; }, setItem() {}},
    },
    document: {
      readyState: "complete",
      body,
      createElement() {
        return {
          hidden: false,
          setAttribute() {},
          querySelector() { return {textContent: ""}; },
        };
      },
    },
    Intl,
    Date,
    Number,
    Math,
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("static/visitor-counter.js", "utf8"), context);
  return context.window.DansumVisitorCounter;
}

test("한국 시간 기준 날짜를 계산한다", () => {
  const counter = loadCounter();
  assert.equal(counter.todayInKorea(new Date("2026-08-02T15:30:00Z")), "2026-08-03");
});

test("Apps Script 응답의 방문자 수를 안전하게 정규화한다", () => {
  const counter = loadCounter();
  assert.deepEqual({...counter.normalizeCounts({ok: true, today: "12", total: 345.9})}, {today: 12, total: 345});
  assert.equal(counter.normalizeCounts({ok: false, today: 1, total: 2}), null);
  assert.equal(counter.normalizeCounts({ok: true, today: "bad", total: 2}), null);
});

test("Apps Script가 Google Sheet의 표시 날짜를 한국 날짜 키로 정규화한다", () => {
  const context = {
    ContentService: {},
    Date,
    LockService: {},
    Number,
    Object,
    SpreadsheetApp: {},
    String,
    Utilities: {
      formatDate() {
        return "2026-08-03";
      },
    },
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync("google-apps-script/visitor-counter.gs", "utf8"), context);
  assert.equal(context.toDateKey(new Date("2026-08-02T15:00:00Z"), ""), "2026-08-03");
  assert.equal(context.toDateKey("", "2026. 8. 3."), "2026-08-03");
  assert.equal(context.toDateKey("2026-08-03", ""), "2026-08-03");
});
