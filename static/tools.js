(() => {
  "use strict";

  class InputError extends Error {}

  const ENGLISH_SCALES = {
    thousand: 1e3, k: 1e3,
    million: 1e6, m: 1e6,
    billion: 1e9, bn: 1e9,
    trillion: 1e12, tn: 1e12,
  };
  const KOREAN_LARGE_UNITS = [[1e16, "경"], [1e12, "조"], [1e8, "억"], [1e4, "만"]];
  const KOREAN_DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"];
  const KOREAN_SMALL_UNITS = ["", "십", "백", "천"];
  const KOREAN_NUMBER_DIGITS = {영: 0, 공: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 칠: 7, 팔: 8, 구: 9};
  const KOREAN_SMALL_SCALES = {십: 10, 백: 100, 천: 1000};
  const KOREAN_BIG_SCALES = {만: 1e4, 억: 1e8, 조: 1e12, 경: 1e16};

  function parseKoreanNumber(value) {
    let text = String(value ?? "").trim().replace(/[\s,]/g, "").replace(/^금/, "").replace(/(?:원정|원)$/, "");
    if (!text) throw new InputError("숫자를 입력해 주세요.");

    let fraction = "";
    if (text.includes("점")) {
      const pieces = text.split("점");
      if (pieces.length !== 2 || !pieces[1] || [...pieces[1]].some(char => !(char in KOREAN_NUMBER_DIGITS))) {
        throw new InputError("소수점 아래는 영, 일, 이처럼 한 자리씩 입력해 주세요.");
      }
      [text] = pieces;
      fraction = [...pieces[1]].map(char => KOREAN_NUMBER_DIGITS[char]).join("");
    }

    const tokens = text.match(/\d+(?:\.\d+)?|[영공일이삼사오육칠팔구십백천만억조경]/g) || [];
    if (tokens.join("") !== text) throw new InputError("숫자 표현을 이해하지 못했습니다.");

    let total = 0;
    let group = 0;
    let current = 0;
    for (const token of tokens) {
      if (/^\d/.test(token)) current = Number(token);
      else if (token in KOREAN_NUMBER_DIGITS) current = KOREAN_NUMBER_DIGITS[token];
      else if (token in KOREAN_SMALL_SCALES) {
        group += (current || 1) * KOREAN_SMALL_SCALES[token];
        current = 0;
      } else {
        group += current;
        total += (group || 1) * KOREAN_BIG_SCALES[token];
        group = 0;
        current = 0;
      }
    }
    const result = total + group + current + (fraction ? Number(`0.${fraction}`) : 0);
    if (!Number.isFinite(result)) throw new InputError("숫자 표현을 이해하지 못했습니다.");
    return result;
  }

  function decimal(value, label = "값") {
    const normalized = String(value ?? "").replace(/,/g, "").trim();
    let result = normalized && /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)
      ? Number(normalized)
      : NaN;
    if (!Number.isFinite(result)) {
      try {
        result = parseKoreanNumber(value);
      } catch (_) {
        throw new InputError(`${label}에 올바른 숫자를 입력해 주세요.`);
      }
    }
    if (!Number.isFinite(result)) throw new InputError(`${label}에 유한한 숫자를 입력해 주세요.`);
    return result;
  }

  function rounded(value, places = 0) {
    const factor = 10 ** places;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  function formatNumber(value, maxPlaces = 4) {
    const number = Number(value);
    const normalized = Math.abs(number) < 1e-12 ? 0 : rounded(number, maxPlaces);
    return normalized.toLocaleString("en-US", {
      maximumFractionDigits: maxPlaces,
      useGrouping: true,
    });
  }

  function compactKorean(value) {
    const sign = value < 0 ? "-" : "";
    const absolute = Math.abs(value);
    const integer = Math.trunc(absolute);
    const fraction = absolute - integer;
    const parts = [];
    let remainder = integer;
    for (const [size, label] of KOREAN_LARGE_UNITS) {
      const amount = Math.floor(remainder / size);
      remainder %= size;
      if (amount) parts.push(`${formatNumber(amount, 0)}${label}`);
    }
    if (remainder) parts.push(formatNumber(remainder, 0));
    let result = parts.join(" ") || "0";
    if (fraction) result += String(rounded(fraction, 10)).slice(1);
    return sign + result;
  }

  function englishNumberToKorean(text) {
    if (typeof text !== "string" || !text.trim()) throw new InputError("변환할 영문 숫자를 입력해 주세요.");
    let cleaned = text.toLowerCase().trim()
      .replace(/[$₩€£]/g, "")
      .replace(/\b(?:usd|krw|dollars?|won)\b/g, "")
      .trim();
    const koreanScales = {사우전드: 1e3, 밀리언: 1e6, 빌리언: 1e9, 트릴리언: 1e12};
    const spokenDigits = {제로: "0", 원: "1", 완: "1", 투: "2", 쓰리: "3", 포: "4", 파이브: "5", 식스: "6", 세븐: "7", 에잇: "8", 나인: "9"};
    const allScales = {...ENGLISH_SCALES, ...koreanScales};
    let scale = 1;
    let numberText = cleaned;
    let matched = false;
    for (const unit of Object.keys(allScales).sort((a, b) => b.length - a.length)) {
      const match = cleaned.match(new RegExp(`^(.+?)\\s*${unit}$`, "i"));
      if (match) {
        numberText = match[1].trim();
        scale = allScales[unit];
        matched = true;
        break;
      }
    }
    if (!matched && /[a-z가-힣]/i.test(cleaned)) {
      throw new InputError("예: 1 billion, 원 빌리언, 3.5 million처럼 입력해 주세요.");
    }
    const spoken = numberText.replace(/\s+/g, "");
    if (spoken in spokenDigits) numberText = spokenDigits[spoken];
    const value = decimal(numberText, "숫자") * scale;
    if (Math.abs(value) >= 1e20) throw new InputError("절댓값 1해 미만의 숫자만 변환할 수 있습니다.");
    return {number: formatNumber(value), korean: compactKorean(value)};
  }

  function koreanNumberToEnglish(text) {
    if (typeof text !== "string" || !text.trim()) throw new InputError("변환할 한국식 숫자를 입력해 주세요.");
    const value = decimal(text, "숫자");
    if (Math.abs(value) >= 1e20) throw new InputError("절댓값 1해 미만의 숫자만 변환할 수 있습니다.");
    const absolute = Math.abs(value);
    const scales = [[1e12, "trillion"], [1e9, "billion"], [1e6, "million"], [1e3, "thousand"]];
    const selected = scales.find(([size]) => absolute >= size) || [1, ""];
    const english = `${formatNumber(value / selected[0], 6)}${selected[1] ? ` ${selected[1]}` : ""}`;
    return {number: formatNumber(value), english};
  }

  function convertNumberUnits(data) {
    const value = data.value;
    let direction = data.direction || "auto";
    if (direction === "auto") {
      const text = String(value ?? "").trim().toLowerCase();
      if (/(?:\b(?:thousand|million|billion|trillion|bn|tn|k|m)\b|사우전드|밀리언|빌리언|트릴리언)/i.test(text)) {
        direction = "english_to_korean";
      } else if (/[십백천만억조경]/.test(text)) {
        direction = "korean_to_english";
      } else if (/^[-+]?\d[\d,]*(?:\.\d+)?$/.test(text)) {
        const number = decimal(text, "숫자");
        const korean = compactKorean(number);
        const english = koreanNumberToEnglish(text).english;
        return {number: formatNumber(number), korean, english, direction: "한국식 · 영어식", primary: korean, secondary: english};
      } else {
        throw new InputError("예: 1 billion, 1빌리언, 10억처럼 입력해 주세요.");
      }
    }
    if (direction === "english_to_korean") {
      const result = englishNumberToKorean(String(value ?? ""));
      return {...result, direction: "영어식 → 한국식", primary: result.korean, secondary: result.number};
    }
    if (direction === "korean_to_english") {
      const result = koreanNumberToEnglish(String(value ?? ""));
      return {...result, direction: "한국식 → 영어식", primary: result.english, secondary: result.number};
    }
    throw new InputError("지원하지 않는 숫자 변환 방향입니다.");
  }

  function readGroup(number) {
    let result = "";
    for (let position = 3; position >= 0; position -= 1) {
      const digit = Math.floor(number / (10 ** position)) % 10;
      if (digit) result += KOREAN_DIGITS[digit] + KOREAN_SMALL_UNITS[position];
    }
    return result;
  }

  function numberToKoreanAmount(raw) {
    const number = decimal(raw, "금액");
    if (number < 0) throw new InputError("금액은 0 이상으로 입력해 주세요.");
    if (number >= 1e20) throw new InputError("1해 미만의 금액만 변환할 수 있습니다.");
    const integer = Math.round(number);
    let reading = "영";
    if (integer) {
      const groups = ["", "만", "억", "조", "경"];
      const readingParts = [];
      for (let index = groups.length - 1; index >= 0; index -= 1) {
        const group = Math.floor(integer / (10000 ** index)) % 10000;
        if (group) readingParts.push(readGroup(group) + groups[index]);
      }
      reading = readingParts.join(" ");
    }
    return {number: `${formatNumber(integer, 0)}원`, korean: `${reading} 원`, formal: `금 ${reading} 원정`};
  }

  function calculateMargin(data) {
    const price = decimal(data.price, "판매가");
    const cost = decimal(data.cost, "원가");
    const discount = decimal(data.discount || 0, "할인액");
    const shipping = decimal(data.shipping || 0, "배송비");
    const feeRate = decimal(data.fee_rate || 0, "수수료율");
    for (const [label, value] of [["판매가", price], ["원가", cost], ["할인액", discount], ["배송비", shipping], ["수수료율", feeRate]]) {
      if (value < 0) throw new InputError(`${label}은(는) 0 이상이어야 합니다.`);
    }
    if (price === 0) throw new InputError("판매가는 0보다 커야 합니다.");
    if (feeRate > 100) throw new InputError("수수료율은 100% 이하여야 합니다.");
    const revenue = price - discount;
    if (revenue < 0) throw new InputError("할인액은 판매가보다 클 수 없습니다.");
    const fee = revenue * feeRate / 100;
    const profit = revenue - cost - shipping - fee;
    const margin = revenue ? profit / revenue * 100 : 0;
    return {
      revenue: `${formatNumber(revenue, 0)}원`,
      fee: `${formatNumber(fee, 0)}원`,
      profit: `${formatNumber(profit, 0)}원`,
      margin_rate: `${formatNumber(margin, 2)}%`,
      discount_rate: `${formatNumber(discount / price * 100, 2)}%`,
    };
  }

  const CONVERSIONS = {
    pyeong_to_sqm: [3.305785, "㎡"],
    sqm_to_pyeong: [1 / 3.305785, "평"],
    inch_to_cm: [2.54, "cm"],
    cm_to_inch: [1 / 2.54, "inch"],
    lb_to_kg: [0.45359237, "kg"],
    kg_to_lb: [1 / 0.45359237, "lb"],
    mile_to_km: [1.609344, "km"],
    km_to_mile: [1 / 1.609344, "mile"],
  };
  const UNIT_DEFINITIONS = {
    length: {
      millimeter: [0.001, "mm", ["밀리미터", "밀리", "mm"]],
      centimeter: [0.01, "cm", ["센티미터", "센치", "센티", "cm"]],
      meter: [1, "m", ["미터", "m"]],
      kilometer: [1000, "km", ["킬로미터", "키로미터", "km"]],
      inch: [0.0254, "inch", ["인치", "inch", "in"]],
      foot: [0.3048, "ft", ["피트", "foot", "feet", "ft"]],
      yard: [0.9144, "yd", ["야드", "yard", "yd"]],
      mile: [1609.344, "mile", ["마일", "mile", "mi"]],
    },
    area: {
      sqm: [1, "㎡", ["제곱미터", "평방미터", "m²", "m2", "㎡"]],
      pyeong: [3.305785, "평", ["평"]],
    },
    weight: {
      gram: [0.001, "g", ["그램", "g"]],
      kilogram: [1, "kg", ["킬로그램", "키로그램", "킬로", "키로", "kg"]],
      pound: [0.45359237, "lb", ["파운드", "pound", "lb"]],
      ounce: [0.028349523125, "oz", ["온스", "ounce", "oz"]],
      ton: [1000, "t", ["톤", "ton", "t"]],
    },
  };
  const DEFAULT_TARGETS = {
    millimeter: "centimeter", centimeter: "inch", meter: "foot", kilometer: "mile",
    inch: "centimeter", foot: "meter", yard: "meter", mile: "kilometer",
    sqm: "pyeong", pyeong: "sqm",
    gram: "ounce", kilogram: "pound", pound: "kilogram", ounce: "gram", ton: "kilogram",
  };

  function aliasOccurrences(text, definitions) {
    const occurrences = [];
    for (const [dimension, units] of Object.entries(definitions)) {
      for (const [canonical, [, , aliases]] of Object.entries(units)) {
        for (const alias of [...aliases].sort((a, b) => b.length - a.length)) {
          const asciiWord = /^[a-z]+$/i.test(alias);
          const pattern = asciiWord ? `(?<![a-z])${alias}(?![a-z])` : alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          for (const match of text.matchAll(new RegExp(pattern, "gi"))) {
            occurrences.push([match.index, match.index + match[0].length, dimension, canonical]);
          }
        }
      }
    }
    occurrences.sort((a, b) => a[0] - b[0] || (b[1] - b[0]) - (a[1] - a[0]));
    return occurrences.filter((item, index, array) => index === 0 || item[0] >= array[index - 1][1]);
  }

  function numberBefore(text, position) {
    const candidates = text.slice(0, position).match(/[-+]?\d[\d,]*(?:\.\d+)?|[영공일이삼사오육칠팔구십백천만억조경]+/g) || [];
    if (!candidates.length) throw new InputError("변환할 숫자를 찾지 못했습니다.");
    return decimal(candidates[candidates.length - 1], "변환 값");
  }

  function convertNaturalPair(raw) {
    if (typeof raw !== "string" || !raw.trim()) throw new InputError("변환할 숫자와 단위를 입력해 주세요.");
    const text = raw.toLowerCase().replace(/\s+/g, "");
    const occurrences = aliasOccurrences(text, UNIT_DEFINITIONS);
    if (!occurrences.length) throw new InputError("지원하는 단위를 찾지 못했습니다.");
    const source = occurrences[0];
    const sameDimension = occurrences.slice(1).filter(item => item[2] === source[2]);
    const targetName = sameDimension.length ? sameDimension[0][3] : DEFAULT_TARGETS[source[3]];
    if (!targetName) throw new InputError("변환할 목표 단위를 함께 입력해 주세요.");
    const value = numberBefore(text, source[0]);
    const units = UNIT_DEFINITIONS[source[2]];
    const result = value * units[source[3]][0] / units[targetName][0];
    return {result: `${formatNumber(result, 4)} ${units[targetName][1]}`, source: source[3], target: targetName};
  }

  function convertUnit(raw, conversion = null) {
    let value;
    if (conversion) {
      value = decimal(raw, "변환 값");
    } else {
      const text = String(raw ?? "").toLowerCase();
      if (/(?:섭씨|화씨|°c|°f|celsius|fahrenheit)/.test(text)) {
        const temperatureUnits = [...text.matchAll(/섭씨|화씨|°c|°f|celsius|fahrenheit/g)];
        const first = temperatureUnits[0];
        const sourceIsF = ["화씨", "°f", "fahrenheit"].includes(first[0]);
        const candidates = text.match(/[-+]?\d+(?:\.\d+)?|[영공일이삼사오육칠팔구십백천만억조경]+/g) || [];
        if (!candidates.length) throw new InputError("변환할 온도를 찾지 못했습니다.");
        value = decimal(candidates[0], "온도");
        if (temperatureUnits.length >= 2) {
          const targetIsF = ["화씨", "°f", "fahrenheit"].includes(temperatureUnits[1][0]);
          conversion = targetIsF ? "c_to_f" : "f_to_c";
        } else {
          conversion = sourceIsF ? "f_to_c" : "c_to_f";
        }
      } else {
        return convertNaturalPair(raw);
      }
    }
    if (conversion === "c_to_f") return {result: `${formatNumber(value * 9 / 5 + 32, 4)} °F`};
    if (conversion === "f_to_c") return {result: `${formatNumber((value - 32) * 5 / 9, 4)} °C`};
    if (conversion in CONVERSIONS) {
      const [factor, unit] = CONVERSIONS[conversion];
      return {result: `${formatNumber(value * factor, 4)} ${unit}`};
    }
    throw new InputError("지원하지 않는 변환 방식입니다.");
  }

  const CURRENCY_ALIASES = {
    USD: ["미국달러", "달러", "불", "usd", "$"],
    KRW: ["대한민국원", "한국돈", "한화", "원화", "krw", "원", "₩"],
    JPY: ["일본엔", "엔화", "jpy", "엔", "¥"],
    EUR: ["유로화", "eur", "유로", "€"],
    GBP: ["영국파운드", "파운드화", "gbp", "파운드", "£"],
    CNY: ["중국위안", "위안화", "cny", "위안"],
    TWD: ["대만달러", "twd"],
    HKD: ["홍콩달러", "hkd"],
  };
  const ECB_FALLBACK_DATE = "2026-07-17 (오프라인 참고 환율)";
  const ECB_EUR_RATES = {EUR: 1, USD: 1.1435, JPY: 185.65, GBP: 0.85098, CNY: 7.7501, HKD: 8.9653, KRW: 1698.46};
  const rateCache = new Map();

  function flexibleCurrencyAmount(raw) {
    const text = String(raw ?? "").trim();
    if (!text) throw new InputError("환산할 금액을 입력해 주세요.");
    try {
      return decimal(text, "금액");
    } catch (_) {
      try {
        return Number(englishNumberToKorean(text).number.replace(/,/g, ""));
      } catch (_) {
        throw new InputError("예: 100달러, 원빌리언 달러, 백만원처럼 입력해 주세요.");
      }
    }
  }

  function currencyFormInput(raw, selectedDirection) {
    if (typeof raw !== "string" || !raw.trim()) throw new InputError("환산할 금액을 입력해 주세요.");
    let text = raw.toLowerCase().trim();
    const dollarPattern = /(?:미국\s*달러|달러|usd|\$|불)/gi;
    const wonPattern = /(?:대한민국\s*원|한국돈|한화|원화|krw|₩)/gi;
    let direction = selectedDirection;
    if (dollarPattern.test(text)) {
      direction = "USD_KRW";
      text = text.replace(dollarPattern, "");
    } else if (wonPattern.test(text) || /원\s*$/.test(text)) {
      direction = "KRW_USD";
      text = text.replace(wonPattern, "").replace(/원\s*$/, "");
    }
    return [flexibleCurrencyAmount(text), direction];
  }

  function currencyOccurrences(text) {
    const occurrences = [];
    for (const [code, aliases] of Object.entries(CURRENCY_ALIASES)) {
      for (const alias of [...aliases].sort((a, b) => b.length - a.length)) {
        let start = 0;
        while ((start = text.indexOf(alias, start)) >= 0) {
          const end = start + alias.length;
          if (!(code === "KRW" && alias === "원" && /^\s*(?:빌리언|밀리언|트릴리언|사우전드)/.test(text.slice(end)))) {
            occurrences.push([start, end, code, alias]);
          }
          start = end;
        }
      }
    }
    occurrences.sort((a, b) => a[0] - b[0] || (b[1] - b[0]) - (a[1] - a[0]));
    return occurrences.filter((item, index, array) => index === 0 || item[0] >= array[index - 1][1]);
  }

  function currencyValue(text, source) {
    const before = text.slice(0, source[0]);
    const after = text.slice(source[1]);
    const symbol = ["$", "₩", "¥", "€", "£"].includes(source[3]);
    const amountText = (before.trim() || (symbol ? after.trim() : ""));
    if (amountText) {
      try { return flexibleCurrencyAmount(amountText); } catch (_) {}
    }
    const candidates = (symbol ? `${before} ${after}` : before).match(/[-+]?\d[\d,]*(?:\.\d+)?|[영공일이삼사오육칠팔구십백천만억조경]+/g) || [];
    if (!candidates.length) throw new InputError("환산할 금액을 찾지 못했습니다.");
    return decimal(candidates[candidates.length - 1], "금액");
  }

  async function latestRate(source, target) {
    if (source === target) return [1, "동일 통화"];
    const key = `${source}_${target}`;
    const cached = rateCache.get(key);
    if (cached && Date.now() - cached.savedAt < 3600000) return [cached.rate, cached.date];
    let rate;
    let date;
    try {
      const response = await fetch(`https://api.frankfurter.dev/v2/rate/${source}/${target}`, {signal: AbortSignal.timeout(5000)});
      if (!response.ok) throw new Error("rate");
      const payload = await response.json();
      rate = Number(payload.rate);
      date = payload.date || "최근 기준일";
      if (!Number.isFinite(rate)) throw new Error("rate");
    } catch (_) {
      if (!(source in ECB_EUR_RATES) || !(target in ECB_EUR_RATES)) {
        throw new InputError("최신 환율을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      }
      rate = ECB_EUR_RATES[target] / ECB_EUR_RATES[source];
      date = ECB_FALLBACK_DATE;
    }
    rateCache.set(key, {savedAt: Date.now(), rate, date});
    return [rate, date];
  }

  async function convertCurrencyPair(raw, source, target) {
    if (!(source in CURRENCY_ALIASES) || !(target in CURRENCY_ALIASES) || source === target) {
      throw new InputError("지원하지 않는 통화 변환 방향입니다.");
    }
    const amount = decimal(raw, "금액");
    if (amount < 0) throw new InputError("금액은 0 이상으로 입력해 주세요.");
    if (amount >= 1e18) throw new InputError("금액이 너무 큽니다.");
    const [rate, date] = await latestRate(source, target);
    const formatted = formatNumber(amount * rate, ["KRW", "JPY"].includes(target) ? 0 : 2);
    const display = target === "KRW" ? `${formatted}원` : target === "USD" ? `$${formatted}` : `${formatted} ${target}`;
    return {result: `${formatted} ${target}`, display, rate: `1 ${source} = ${formatNumber(rate, 6)} ${target}`, date, source, target};
  }

  async function calculateCurrency(data) {
    const pairs = {USD_KRW: ["USD", "KRW"], KRW_USD: ["KRW", "USD"]};
    let direction = data.direction || "auto";
    if (![...Object.keys(pairs), "auto"].includes(direction)) throw new InputError("달러 또는 원화 변환 방향을 선택해 주세요.");
    const parsed = currencyFormInput(data.amount, direction);
    const amount = parsed[0];
    direction = parsed[1];
    if (direction === "auto") {
      return {
        mode: "both",
        amount: formatNumber(amount),
        usd_to_krw: await convertCurrencyPair(amount, "USD", "KRW"),
        krw_to_usd: await convertCurrencyPair(amount, "KRW", "USD"),
      };
    }
    return convertCurrencyPair(amount, ...pairs[direction]);
  }

  async function convertCurrency(raw) {
    if (typeof raw !== "string" || !raw.trim()) throw new InputError("환산할 금액과 통화를 입력해 주세요.");
    const text = raw.toLowerCase().replace(/\s+/g, "");
    const occurrences = currencyOccurrences(text);
    if (!occurrences.length) throw new InputError("지원하는 통화를 찾지 못했습니다.");
    const source = occurrences[0];
    const target = occurrences.length > 1 ? occurrences[1][2] : (source[2] === "KRW" ? "USD" : "KRW");
    return convertCurrencyPair(currencyValue(text, source), source[2], target);
  }

  function cleanList(text) {
    if (typeof text !== "string" || !text.trim()) throw new InputError("정리할 명단을 입력해 주세요.");
    if (text.length > 50000) throw new InputError("명단은 50,000자 이하로 입력해 주세요.");
    const entries = text.split(/[\n,;]+/).map(item => item.trim()).filter(Boolean);
    const seen = new Set();
    const unique = [];
    for (const entry of entries) {
      const normalized = entry.replace(/\s+/g, "").toLocaleLowerCase();
      if (!seen.has(normalized)) {
        seen.add(normalized);
        unique.push(entry);
      }
    }
    return {cleaned: unique.join("\n"), before: entries.length, after: unique.length, removed: entries.length - unique.length};
  }

  function countText(text) {
    if (typeof text !== "string") throw new InputError("글자 수를 셀 내용을 입력해 주세요.");
    if (text.length > 100000) throw new InputError("텍스트는 100,000자 이하로 입력해 주세요.");
    return {
      with_spaces: [...text].length,
      without_spaces: [...text.replace(/\s/g, "")].length,
      words: (text.match(/\S+/g) || []).length,
      lines: text ? text.split("\n").length : 0,
      bytes: new TextEncoder().encode(text).length,
    };
  }

  async function automaticConversion(text, hint = null) {
    if (typeof text !== "string" || !text.trim()) throw new InputError("변환할 내용을 입력해 주세요.");
    if (text.trim().length >= 30) throw new InputError("30자 미만으로 입력해 주세요.");
    const value = text.trim();
    if (/^[-+]?\d[\d,]*(?:\.\d+)?$|^[영공일이삼사오육칠팔구십백천만억조경]+$/.test(value)) {
      return {kind: "추가 정보 필요", primary: "어떤 단위로 변환할까요?", secondary: `예: ${value}원, ${value}달러, ${value}cm`, clarification: true};
    }
    const englishResult = () => {
      const result = englishNumberToKorean(value);
      return {kind: "숫자 단위", primary: result.korean, secondary: result.number};
    };
    const unitResult = () => {
      const result = convertUnit(value);
      return {kind: "생활 단위", primary: result.result, secondary: value};
    };
    const amountResult = () => {
      const result = numberToKoreanAmount(value);
      return {kind: "한글 금액", primary: result.number, secondary: result.formal};
    };
    const currencyResult = async () => {
      const result = await convertCurrency(value);
      return {kind: "통화 환산", primary: result.result, secondary: `${result.rate} · ${result.date} 기준`};
    };
    const hinted = {"english-number": englishResult, unit: unitResult, "korean-amount": amountResult, currency: currencyResult};
    if (hint in hinted) return hinted[hint]();
    if (/(?:billion|million|trillion|thousand|빌리언|밀리언|트릴리언|사우전드|\bbn\b|\btn\b)/i.test(value)) return englishResult();
    if (/(?:달러|한화|원화|엔화|유로|위안|usd|krw|jpy|eur|[$€¥₩])/i.test(value)) return currencyResult();
    if (/[평㎡]|(?:cm|inch|인치|센치|미터|피트|킬로|파운드|온스|섭씨|화씨)\s*$/i.test(value)) return unitResult();
    if (value.endsWith("원") || value.endsWith("원정") || /[만억조경]/.test(value)) return amountResult();
    for (const converter of [englishResult, unitResult, amountResult]) {
      try { return converter(); } catch (_) {}
    }
    throw new InputError("변환 의도를 찾지 못했습니다. 숫자와 단위를 조금 더 구체적으로 입력해 주세요.");
  }

  const handlers = {
    "english-number": convertNumberUnits,
    margin: calculateMargin,
    unit: data => convertUnit(data.value, data.conversion),
    "clean-list": data => cleanList(data.text),
    "character-count": data => countText(data.text),
    currency: calculateCurrency,
    "auto-convert": data => automaticConversion(data.text, data.hint),
  };

  async function runTool(name, data) {
    if (!(name in handlers)) throw new InputError("존재하지 않는 도구입니다.");
    return handlers[name](data || {});
  }

  window.DansumTools = {
    InputError,
    runTool,
    parseKoreanNumber,
    convertNumberUnits,
    calculateMargin,
    convertUnit,
    calculateCurrency,
    cleanList,
    countText,
    automaticConversion,
    numberToKoreanAmount,
  };
})();
