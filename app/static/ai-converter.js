(() => {
  const form = document.querySelector("form[data-auto-convert]");
  if (!form) return;

  const output = form.nextElementSibling;
  const submitButton = form.querySelector(".submit-button");
  const status = document.querySelector("[data-model-status]");
  const statusLabel = status?.querySelector("strong");
  const statusDetail = status?.querySelector("small");
  const worker = new Worker("/static/functiongemma-worker.js?v=6", {type: "module"});
  let ready = false;
  let requestId = 0;
  const pending = new Map();

  const escape = value => {
    const node = document.createElement("div");
    node.textContent = String(value);
    return node.innerHTML;
  };

  function setStatus(label, detail = "", state = "loading") {
    if (!status) return;
    status.dataset.state = state;
    statusLabel.textContent = label;
    statusDetail.textContent = detail;
  }

  function showResult(result, timing) {
    output.hidden = false;
    output.classList.remove("error");
    const seconds = timing.totalMs >= 1000
      ? `${(timing.totalMs / 1000).toFixed(2)}초`
      : `${Math.round(timing.totalMs)}ms`;
    const detail = [result.secondary, `AI ${Math.round(timing.modelMs)}ms · 전체 ${seconds}`]
      .filter(Boolean).join(" · ");
    output.innerHTML = `<span>${escape(result.kind)} · FunctionGemma</span><strong>${escape(result.primary)}</strong><small>${escape(detail)}</small>`;
  }

  function showError(message) {
    output.hidden = false;
    output.classList.add("error");
    output.textContent = message;
  }

  async function requestConversion(text, hint) {
    const response = await fetch("/api/auto-convert", {
      method: "POST",
      headers: {"Content-Type": "application/json"},
      body: JSON.stringify({text, hint})
    });
    const payload = await response.json();
    if (!response.ok || !payload.ok) throw new Error(payload.error || "변환하지 못했습니다.");
    return payload.result;
  }

  function classify(text) {
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      pending.set(id, {resolve, reject});
      worker.postMessage({type: "classify", id, text});
    });
  }

  worker.addEventListener("message", event => {
    const message = event.data || {};
    if (message.type === "progress") {
      const percent = Number.isFinite(message.percent) ? ` ${Math.round(message.percent)}%` : "";
      setStatus("모델 준비 중", `${message.label || "파일 확인"}${percent}`);
      return;
    }
    if (message.type === "ready") {
      ready = true;
      submitButton.disabled = false;
      localStorage.setItem("dansum-functiongemma-cached", "1");
      const source = message.cached ? "브라우저 캐시" : "최초 다운로드";
      setStatus("AI 준비 완료", `${source} · ${message.backend} · ${Math.round(message.loadMs)}ms`, "ready");
      return;
    }
    if (message.type === "load-error") {
      setStatus("모델을 준비하지 못했습니다", message.error, "error");
      showError(message.error);
      return;
    }
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.type === "result") waiter.resolve(message);
    else waiter.reject(new Error(message.error || "AI가 입력을 해석하지 못했습니다."));
  });

  worker.addEventListener("error", () => {
    setStatus("모델을 준비하지 못했습니다", "브라우저 AI 실행 중 오류가 발생했습니다.", "error");
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity() || !ready) return;
    const input = form.elements.text.value.trim();
    if (input.length >= 30) {
      showError("30자 미만으로 입력해 주세요.");
      return;
    }
    submitButton.disabled = true;
    output.hidden = false;
    output.classList.remove("error");
    output.textContent = "FunctionGemma가 변환 의도를 찾고 있습니다…";
    const started = performance.now();
    try {
      const decision = await classify(input);
      if (decision.tool === "request_clarification") {
        showResult({
          kind: "추가 정보 필요",
          primary: "어떤 단위로 변환할까요?",
          secondary: `예: ${input}원, ${input}달러, ${input}cm`
        }, {modelMs: decision.modelMs, totalMs: performance.now() - started});
      } else if (decision.tool === "unsupported_request") {
        showResult({
          kind: "지원하지 않는 요청",
          primary: "숫자·통화·생활 단위 변환을 입력해 주세요.",
          secondary: "예: 1빌리언, 100달러, 1미터를 인치로"
        }, {modelMs: decision.modelMs, totalMs: performance.now() - started});
      } else {
        const hints = {
          convert_number: "english-number",
          convert_currency: "currency",
          convert_unit: "unit"
        };
        const result = await requestConversion(input, hints[decision.tool]);
        showResult(result, {modelMs: decision.modelMs, totalMs: performance.now() - started});
      }
    } catch (error) {
      showError(error.message || "변환하지 못했습니다.");
    } finally {
      submitButton.disabled = !ready;
    }
  });

  const cached = localStorage.getItem("dansum-functiongemma-cached") === "1";
  setStatus("모델 준비 중", cached ? "저장된 모델을 여는 중" : "최초 실행은 모델을 한 번 내려받습니다");
  worker.postMessage({type: "load", cached});
})();
