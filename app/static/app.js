const formatters = {
  "english-number": r => `<span>${escapeHtml(r.direction)}</span><strong>${escapeHtml(r.primary)}</strong><small>${escapeHtml(r.secondary)}</small>`,
  margin: r => `<div class="result-grid"><div><span>실결제액</span><strong>${escapeHtml(r.revenue)}</strong></div><div><span>수수료</span><strong>${escapeHtml(r.fee)}</strong></div><div><span>예상 순이익</span><strong>${escapeHtml(r.profit)}</strong></div><div><span>실질 마진율</span><strong>${escapeHtml(r.margin_rate)}</strong></div><div><span>할인율</span><strong>${escapeHtml(r.discount_rate)}</strong></div></div>`,
  unit: r => `<span>변환 결과</span><strong>${escapeHtml(r.result)}</strong>`,
  "clean-list": r => `<span>${r.before}개 중 ${r.removed}개 중복 제거 · ${r.after}개 남음</span>${resultWithCopy(r.cleaned)}`
  ,"character-count": r => `<div class="result-grid count-grid"><div><span>공백 포함</span><strong>${r.with_spaces.toLocaleString()}자</strong></div><div><span>공백 제외</span><strong>${r.without_spaces.toLocaleString()}자</strong></div><div><span>단어</span><strong>${r.words.toLocaleString()}개</strong></div><div><span>줄</span><strong>${r.lines.toLocaleString()}줄</strong></div><div><span>UTF-8</span><strong>${r.bytes.toLocaleString()} bytes</strong></div></div>`,
  currency: r => r.mode === "both"
    ? `<span>통화 단위가 없어 두 방향을 모두 계산했습니다.</span><div class="result-grid"><div><span>${escapeHtml(r.amount)}달러 → 원화</span><strong>${escapeHtml(r.usd_to_krw.display)}</strong></div><div><span>${escapeHtml(r.amount)}원 → 달러</span><strong>${escapeHtml(r.krw_to_usd.display)}</strong></div></div><small>${escapeHtml(r.usd_to_krw.date)} 기준</small>`
    : `<span>${escapeHtml(r.source)} → ${escapeHtml(r.target)} · ${escapeHtml(r.date)} 기준</span><strong>${escapeHtml(r.display)}</strong><small>${escapeHtml(r.rate)}</small>`
};

function escapeHtml(value) {
  const div = document.createElement("div");
  div.textContent = String(value);
  return div.innerHTML;
}

function resultWithCopy(value) {
  return `<button type="button" class="copy-button" data-copy="${encodeURIComponent(value)}">복사</button><strong>${escapeHtml(value)}</strong>`;
}

document.querySelectorAll("form[data-tool]").forEach(form => {
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const tool = form.dataset.tool;
    const output = form.nextElementSibling;
    const button = form.querySelector('button[type="submit"]');
    const data = Object.fromEntries(new FormData(form).entries());
    output.hidden = false;
    output.classList.remove("error");
    output.textContent = "처리하고 있습니다…";
    button.disabled = true;
    try {
      const response = await fetch(`/api/${tool}`, {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(data)});
      const payload = await response.json();
      if (!response.ok || !payload.ok) throw new Error(payload.error || "요청을 처리하지 못했습니다.");
      output.innerHTML = formatters[tool](payload.result);
    } catch (error) {
      output.classList.add("error");
      output.textContent = error.message || "네트워크 연결을 확인해 주세요.";
    } finally {
      button.disabled = false;
    }
  });
});

document.querySelectorAll("[data-example]").forEach(button => {
  button.addEventListener("click", () => {
    const form = button.closest("form");
    if (button.dataset.direction && form.elements.direction) form.elements.direction.value = button.dataset.direction;
    const input = form.querySelector("input[name='value'], input[name='amount'], input[name='text'], textarea");
    input.value = button.dataset.example;
    input.focus();
  });
});

document.querySelectorAll("form[data-live-count]").forEach(form => {
  const textarea = form.querySelector("textarea");
  let timer;
  textarea.addEventListener("input", () => {
    clearTimeout(timer);
    timer = setTimeout(() => form.requestSubmit(), 120);
  });
});

document.addEventListener("click", async event => {
  const button = event.target.closest("[data-copy]");
  if (!button) return;
  try {
    await navigator.clipboard.writeText(decodeURIComponent(button.dataset.copy));
    button.textContent = "복사됨";
    setTimeout(() => { button.textContent = "복사"; }, 1200);
  } catch (_) { button.textContent = "복사 실패"; }
});
