(function () {
  "use strict";
  const CALLBACK_PREFIX = "__sharedPageviewCounter";

  function createFooter() {
    let footer = document.querySelector(".visitor-counter");
    if (footer) return footer;
    footer = document.createElement("footer");
    footer.className = "visitor-counter";
    footer.setAttribute("aria-label", "페이지 조회 수");
    footer.innerHTML = '<span class="visitor-counter__brand">woonhae</span>'
      + '<span class="visitor-counter__counts">'
      + '<span>오늘 페이지 조회 <strong data-visitor-today>—</strong></span>'
      + '<span>누적 페이지 조회 <strong data-visitor-total>—</strong></span>'
      + '</span>';
    document.body.appendChild(footer);
    return footer;
  }

  function start() {
    const footer = createFooter();
    const config = window.DANSUM_VISITOR_COUNTER || {};
    if (!/^https:\/\/script\.google\.com\/macros\/s\/.+\/exec$/.test(config.endpoint || "")) return;
    const callback = `${CALLBACK_PREFIX}${Date.now()}${Math.random().toString(36).slice(2)}`;
    const script = document.createElement("script");
    let finished = false;
    const cleanup = () => { if (finished) return; finished = true; clearTimeout(timeout); delete window[callback]; script.remove(); };
    const timeout = setTimeout(cleanup, 10000);
    window[callback] = payload => {
      cleanup();
      if (!payload || payload.ok !== true) return;
      const today = Number(payload.today), total = Number(payload.total);
      if (!Number.isFinite(today) || !Number.isFinite(total)) return;
      footer.querySelector("[data-visitor-today]").textContent = today.toLocaleString("ko-KR");
      footer.querySelector("[data-visitor-total]").textContent = total.toLocaleString("ko-KR");
    };
    script.onerror = cleanup;
    script.referrerPolicy = "no-referrer";
    const countryRegion = (() => { try { return new Intl.Locale(navigator.language || "").region || ""; } catch (_) { return ""; } })();
    const country = /^[A-Z]{2}$/.test(countryRegion) ? `EST-${countryRegion}` : "UNKNOWN";
    const referrer = (() => { try { return document.referrer ? new URL(document.referrer).hostname : ""; } catch (_) { return ""; } })();
    const random = new Uint8Array(16);
    crypto.getRandomValues(random);
    random[6] = (random[6] & 0x0f) | 0x40; random[8] = (random[8] & 0x3f) | 0x80;
    const eventId = [...random].map((v, i) => ([4, 6, 8, 10].includes(i) ? "-" : "") + v.toString(16).padStart(2, "0")).join("");
    const params = new URLSearchParams({callback, site: config.site || location.hostname, pageview: "1",
      event_id: eventId, country, path: location.pathname.slice(0, 300), referrer, t: String(Date.now())});
    script.src = `${config.endpoint}?${params}`;
    document.head.appendChild(script);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, {once: true});
  else start();
})();
