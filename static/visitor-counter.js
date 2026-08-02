(() => {
  const endpoint = window.DANSUM_CONFIG?.visitorCounterUrl;
  const footer = document.createElement("footer");
  footer.className = "site-footer";

  const wordmark = document.createElement("a");
  wordmark.className = "wordmark";
  wordmark.href = "/";
  wordmark.append("DANSUM");
  const country = document.createElement("span");
  country.textContent = "KR";
  wordmark.append(country);

  const counter = document.createElement("p");
  counter.className = "visit-counter";
  counter.setAttribute("aria-live", "polite");

  const todayLabel = document.createElement("span");
  todayLabel.append("오늘 ");
  const todayValue = document.createElement("strong");
  todayValue.textContent = "—";
  todayLabel.append(todayValue);

  const totalLabel = document.createElement("span");
  totalLabel.append("전체 ");
  const totalValue = document.createElement("strong");
  totalValue.textContent = "—";
  totalLabel.append(totalValue);

  counter.append(todayLabel, totalLabel);

  const note = document.createElement("p");
  note.className = "footer-note";
  note.textContent = "FAST TOOLS · PRIVATE BY DEFAULT";
  footer.append(wordmark, counter, note);
  document.body.append(footer);

  if (!endpoint) {
    counter.setAttribute("aria-label", "방문자 집계 준비 중");
    return;
  }

  const koreaDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
  const storageKey = "dansum-visit-counted-date";
  let alreadyCounted = false;

  try {
    alreadyCounted = sessionStorage.getItem(storageKey) === koreaDate;
  } catch (_) {
    // The counter still works when storage is disabled; it may count this page view again.
  }

  fetch(endpoint, {
    method: alreadyCounted ? "GET" : "POST",
    headers: {"Content-Type": "text/plain;charset=UTF-8"},
    cache: "no-store",
  })
    .then(response => {
      if (!response.ok) throw new Error(`Visitor counter returned ${response.status}`);
      return response.json();
    })
    .then(data => {
      const today = Number(data.today);
      const total = Number(data.total);
      if (!Number.isFinite(today) || !Number.isFinite(total)) throw new Error("Invalid visitor counter response");
      todayValue.textContent = today.toLocaleString("ko-KR");
      totalValue.textContent = total.toLocaleString("ko-KR");
      if (!alreadyCounted) {
        try { sessionStorage.setItem(storageKey, koreaDate); } catch (_) {}
      }
    })
    .catch(() => {
      counter.setAttribute("aria-label", "방문자 수를 불러오지 못했습니다");
    });
})();
