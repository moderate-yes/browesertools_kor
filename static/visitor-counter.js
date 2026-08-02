(function () {
  "use strict";

  const STORAGE_KEY = "dansum-visitor-counted-date";
  const CALLBACK_PREFIX = "__dansumVisitorCounter";

  function todayInKorea(date = new Date()) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Seoul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(date);
  }

  function normalizeCounts(payload) {
    const today = Number(payload && payload.today);
    const total = Number(payload && payload.total);
    if (!payload || payload.ok !== true || !Number.isFinite(today) || !Number.isFinite(total)) {
      return null;
    }
    return {today: Math.max(0, Math.floor(today)), total: Math.max(0, Math.floor(total))};
  }

  function createFooter() {
    const footer = document.createElement("footer");
    footer.className = "visitor-counter";
    footer.setAttribute("aria-label", "방문자 수");
    footer.innerHTML = [
      '<span class="visitor-counter__brand">WOONHAE</span>',
      '<span>오늘 <strong data-visitor-today>—</strong></span>',
      '<span>전체 <strong data-visitor-total>—</strong></span>',
    ].join("");
    document.body.appendChild(footer);
    return footer;
  }

  function readCountedDate() {
    try {
      return window.localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      return null;
    }
  }

  function saveCountedDate(date) {
    try {
      window.localStorage.setItem(STORAGE_KEY, date);
    } catch (error) {
      // Private browsing may block storage. The displayed count still works.
    }
  }

  function requestCounts(endpoint, site, action, onResult) {
    const callbackName = `${CALLBACK_PREFIX}${Date.now()}${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    const timeout = window.setTimeout(cleanup, 8000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = function (payload) {
      cleanup();
      onResult(normalizeCounts(payload));
    };

    script.onerror = function () {
      cleanup();
      onResult(null);
    };
    script.referrerPolicy = "no-referrer";
    script.src = `${endpoint}?callback=${encodeURIComponent(callbackName)}`
      + `&site=${encodeURIComponent(site)}&action=${encodeURIComponent(action)}&t=${Date.now()}`;
    document.head.appendChild(script);
  }

  function start() {
    const footer = createFooter();
    const config = window.DANSUM_VISITOR_COUNTER || {};
    if (!/^https:\/\/script\.google\.com\/macros\/s\//.test(config.endpoint || "")) {
      footer.hidden = true;
      return;
    }

    const today = todayInKorea();
    const action = readCountedDate() === today ? "read" : "hit";
    requestCounts(config.endpoint, config.site || "korean.browsertools.kr", action, function (counts) {
      if (!counts) {
        footer.hidden = true;
        return;
      }
      footer.querySelector("[data-visitor-today]").textContent = counts.today.toLocaleString("ko-KR");
      footer.querySelector("[data-visitor-total]").textContent = counts.total.toLocaleString("ko-KR");
      if (action === "hit") {
        saveCountedDate(today);
      }
    });
  }

  window.DansumVisitorCounter = Object.freeze({todayInKorea, normalizeCounts});
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, {once: true});
  } else {
    start();
  }
})();
