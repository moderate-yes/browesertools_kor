import json
import re
import time
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


class InputError(ValueError):
    """사용자 입력이 올바르지 않을 때 발생하는 예외."""


ENGLISH_SCALES = {
    "thousand": Decimal("1000"),
    "k": Decimal("1000"),
    "million": Decimal("1000000"),
    "m": Decimal("1000000"),
    "billion": Decimal("1000000000"),
    "bn": Decimal("1000000000"),
    "trillion": Decimal("1000000000000"),
    "tn": Decimal("1000000000000"),
}

KOREAN_LARGE_UNITS = [(10**16, "경"), (10**12, "조"), (10**8, "억"), (10**4, "만")]
KOREAN_SMALL_UNITS = ["", "십", "백", "천"]
KOREAN_DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"]
FORMAL_DIGITS = ["", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구"]
FORMAL_SMALL_UNITS = ["", "십", "백", "천"]

KOREAN_NUMBER_DIGITS = {"영": 0, "공": 0, "일": 1, "이": 2, "삼": 3, "사": 4, "오": 5, "육": 6, "칠": 7, "팔": 8, "구": 9}
KOREAN_SMALL_SCALES = {"십": 10, "백": 100, "천": 1000}
KOREAN_BIG_SCALES = {"만": 10**4, "억": 10**8, "조": 10**12, "경": 10**16}


def parse_korean_number(value):
    """일억 오천만, 삼십사, 1억 2천처럼 섞인 숫자 표현을 Decimal로 변환."""
    text = re.sub(r"[\s,]", "", str(value).strip())
    text = re.sub(r"^(?:금)", "", text)
    text = re.sub(r"(?:원정|원)$", "", text)
    if not text:
        raise InputError("숫자를 입력해 주세요.")

    if "점" in text:
        integer_text, fraction_text = text.split("점", 1)
        if not fraction_text or any(char not in KOREAN_NUMBER_DIGITS for char in fraction_text):
            raise InputError("소수점 아래는 영, 일, 이처럼 한 자리씩 입력해 주세요.")
        fraction = "".join(str(KOREAN_NUMBER_DIGITS[char]) for char in fraction_text)
    else:
        integer_text, fraction = text, ""

    tokens = re.findall(r"\d+(?:\.\d+)?|[영공일이삼사오육칠팔구십백천만억조경]", integer_text)
    if "".join(tokens) != integer_text:
        raise InputError("숫자 표현을 이해하지 못했습니다.")

    total = Decimal(0)
    group = Decimal(0)
    current = Decimal(0)
    for token in tokens:
        if token[0].isdigit():
            current = Decimal(token)
        elif token in KOREAN_NUMBER_DIGITS:
            current = Decimal(KOREAN_NUMBER_DIGITS[token])
        elif token in KOREAN_SMALL_SCALES:
            group += (current or 1) * KOREAN_SMALL_SCALES[token]
            current = Decimal(0)
        else:
            group += current
            total += (group or 1) * KOREAN_BIG_SCALES[token]
            group = Decimal(0)
            current = Decimal(0)
    result = total + group + current
    if fraction:
        result += Decimal(f"0.{fraction}")
    return result


def _decimal(value, label="값"):
    try:
        result = Decimal(str(value).replace(",", "").strip())
    except (InvalidOperation, AttributeError, TypeError):
        try:
            result = parse_korean_number(value)
        except (InputError, TypeError):
            raise InputError(f"{label}에 올바른 숫자를 입력해 주세요.")
    if not result.is_finite():
        raise InputError(f"{label}에 유한한 숫자를 입력해 주세요.")
    return result


def format_number(value, max_places=4):
    value = Decimal(value)
    if value == value.to_integral_value():
        return f"{int(value):,}"
    text = f"{value:,.{max_places}f}".rstrip("0").rstrip(".")
    return text


def english_number_to_korean(text):
    if not isinstance(text, str) or not text.strip():
        raise InputError("변환할 영문 숫자를 입력해 주세요.")
    cleaned = text.lower().strip()
    cleaned = re.sub(r"[$₩€£]", "", cleaned)
    cleaned = re.sub(r"\b(?:usd|krw|dollars?|won)\b", "", cleaned).strip()
    korean_scales = {
        "사우전드": Decimal("1000"), "밀리언": Decimal("1000000"),
        "빌리언": Decimal("1000000000"), "트릴리언": Decimal("1000000000000"),
    }
    spoken_digits = {
        "제로": "0", "원": "1", "완": "1", "투": "2", "쓰리": "3", "포": "4",
        "파이브": "5", "식스": "6", "세븐": "7", "에잇": "8", "나인": "9",
    }
    scale = Decimal(1)
    number_text = cleaned
    matched_unit = None
    all_scales = {**ENGLISH_SCALES, **korean_scales}
    for unit_name in sorted(all_scales, key=len, reverse=True):
        unit_match = re.fullmatch(rf"(.+?)\s*{re.escape(unit_name)}", cleaned)
        if unit_match:
            number_text = unit_match.group(1).strip()
            scale = all_scales[unit_name]
            matched_unit = unit_name
            break

    if matched_unit is None and re.search(r"[a-z가-힣]", cleaned):
        raise InputError("예: 1 billion, 원 빌리언, 3.5 million처럼 입력해 주세요.")
    normalized_spoken = re.sub(r"\s+", "", number_text)
    if normalized_spoken in spoken_digits:
        number_text = spoken_digits[normalized_spoken]
    number = _decimal(number_text, "숫자")
    value = number * scale
    if abs(value) >= Decimal(10**20):
        raise InputError("절댓값 1해 미만의 숫자만 변환할 수 있습니다.")
    return {"number": format_number(value), "korean": compact_korean(value)}


def korean_number_to_english(text):
    if not isinstance(text, str) or not text.strip():
        raise InputError("변환할 한국식 숫자를 입력해 주세요.")
    value = _decimal(text, "숫자")
    if abs(value) >= Decimal(10**20):
        raise InputError("절댓값 1해 미만의 숫자만 변환할 수 있습니다.")
    absolute = abs(value)
    scales = [
        (Decimal("1000000000000"), "trillion"),
        (Decimal("1000000000"), "billion"),
        (Decimal("1000000"), "million"),
        (Decimal("1000"), "thousand"),
    ]
    scale, label = next(((size, name) for size, name in scales if absolute >= size), (Decimal(1), ""))
    english = format_number(value / scale, 6)
    if label:
        english = f"{english} {label}"
    return {"number": format_number(value), "english": english}


def convert_number_units(data):
    value = data.get("value")
    direction = data.get("direction", "auto")
    if direction == "auto":
        text = str(value or "").strip().lower()
        english_pattern = r"(?:\b(?:thousand|million|billion|trillion|bn|tn|k|m)\b|사우전드|밀리언|빌리언|트릴리언)"
        korean_pattern = r"[십백천만억조경]"
        if re.search(english_pattern, text):
            direction = "english_to_korean"
        elif re.search(korean_pattern, text):
            direction = "korean_to_english"
        elif re.fullmatch(r"[-+]?\d[\d,]*(?:\.\d+)?", text):
            number = _decimal(text, "숫자")
            korean = compact_korean(number)
            english = korean_number_to_english(text)["english"]
            return {
                "number": format_number(number), "korean": korean, "english": english,
                "direction": "한국식 · 영어식", "primary": korean, "secondary": english,
            }
        else:
            raise InputError("예: 1 billion, 1빌리언, 10억처럼 입력해 주세요.")
    if direction == "english_to_korean":
        result = english_number_to_korean(value)
        return {**result, "direction": "영어식 → 한국식", "primary": result["korean"], "secondary": result["number"]}
    if direction == "korean_to_english":
        result = korean_number_to_english(value)
        return {**result, "direction": "한국식 → 영어식", "primary": result["english"], "secondary": result["number"]}
    raise InputError("지원하지 않는 숫자 변환 방향입니다.")


def compact_korean(value):
    value = Decimal(value)
    sign = "-" if value < 0 else ""
    value = abs(value)
    integer = int(value)
    fraction = value - integer
    if integer == 0:
        result = "0"
    else:
        parts = []
        remainder = integer
        for size, label in KOREAN_LARGE_UNITS:
            amount, remainder = divmod(remainder, size)
            if amount:
                parts.append(f"{amount:,}{label}")
        if remainder:
            parts.append(f"{remainder:,}")
        result = " ".join(parts)
    if fraction:
        result += f".{str(fraction).split('.')[1].rstrip('0')}"
    return sign + result


def _read_group(number, digits=KOREAN_DIGITS, units=KOREAN_SMALL_UNITS):
    result = []
    for position in range(3, -1, -1):
        divisor = 10**position
        digit = number // divisor % 10
        if digit:
            result.append(digits[digit] + units[position])
    return "".join(result)


def number_to_korean_amount(raw):
    number = _decimal(raw, "금액")
    if number < 0:
        raise InputError("금액은 0 이상으로 입력해 주세요.")
    if number >= Decimal(10**20):
        raise InputError("1해 미만의 금액만 변환할 수 있습니다.")
    rounded = number.quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    integer = int(rounded)
    if integer == 0:
        reading = "영"
    else:
        reading_parts = []
        for index, large_unit in reversed(list(enumerate(["", "만", "억", "조", "경"]))):
            group = integer // (10000**index) % 10000
            if group:
                reading_parts.append(_read_group(group) + large_unit)
        reading = " ".join(reading_parts)
    return {
        "number": f"{integer:,}원",
        "korean": f"{reading} 원",
        "formal": f"금 {reading} 원정",
    }


def calculate_margin(data):
    price = _decimal(data.get("price", ""), "판매가")
    cost = _decimal(data.get("cost", ""), "원가")
    discount = _decimal(data.get("discount", 0), "할인액")
    shipping = _decimal(data.get("shipping", 0), "배송비")
    fee_rate = _decimal(data.get("fee_rate", 0), "수수료율")
    for label, value in [("판매가", price), ("원가", cost), ("할인액", discount), ("배송비", shipping), ("수수료율", fee_rate)]:
        if value < 0:
            raise InputError(f"{label}은(는) 0 이상이어야 합니다.")
    if price == 0:
        raise InputError("판매가는 0보다 커야 합니다.")
    if fee_rate > 100:
        raise InputError("수수료율은 100% 이하여야 합니다.")
    revenue = price - discount
    if revenue < 0:
        raise InputError("할인액은 판매가보다 클 수 없습니다.")
    fee = revenue * fee_rate / 100
    profit = revenue - cost - shipping - fee
    margin = profit / revenue * 100 if revenue else Decimal(0)
    discount_rate = discount / price * 100
    return {
        "revenue": format_number(revenue, 0) + "원",
        "fee": format_number(fee, 0) + "원",
        "profit": format_number(profit, 0) + "원",
        "margin_rate": format_number(margin, 2) + "%",
        "discount_rate": format_number(discount_rate, 2) + "%",
    }


CONVERSIONS = {
    "pyeong_to_sqm": (Decimal("3.305785"), "㎡"),
    "sqm_to_pyeong": (Decimal("1") / Decimal("3.305785"), "평"),
    "inch_to_cm": (Decimal("2.54"), "cm"),
    "cm_to_inch": (Decimal("1") / Decimal("2.54"), "inch"),
    "lb_to_kg": (Decimal("0.45359237"), "kg"),
    "kg_to_lb": (Decimal("1") / Decimal("0.45359237"), "lb"),
    "mile_to_km": (Decimal("1.609344"), "km"),
    "km_to_mile": (Decimal("1") / Decimal("1.609344"), "mile"),
}


UNIT_DEFINITIONS = {
    "length": {
        "millimeter": (Decimal("0.001"), "mm", ("밀리미터", "밀리", "mm")),
        "centimeter": (Decimal("0.01"), "cm", ("센티미터", "센치", "센티", "cm")),
        "meter": (Decimal("1"), "m", ("미터", "m")),
        "kilometer": (Decimal("1000"), "km", ("킬로미터", "키로미터", "km")),
        "inch": (Decimal("0.0254"), "inch", ("인치", "inch", "in")),
        "foot": (Decimal("0.3048"), "ft", ("피트", "foot", "feet", "ft")),
        "yard": (Decimal("0.9144"), "yd", ("야드", "yard", "yd")),
        "mile": (Decimal("1609.344"), "mile", ("마일", "mile", "mi")),
    },
    "area": {
        "sqm": (Decimal("1"), "㎡", ("제곱미터", "평방미터", "m²", "m2", "㎡")),
        "pyeong": (Decimal("3.305785"), "평", ("평",)),
    },
    "weight": {
        "gram": (Decimal("0.001"), "g", ("그램", "g")),
        "kilogram": (Decimal("1"), "kg", ("킬로그램", "키로그램", "킬로", "키로", "kg")),
        "pound": (Decimal("0.45359237"), "lb", ("파운드", "pound", "lb")),
        "ounce": (Decimal("0.028349523125"), "oz", ("온스", "ounce", "oz")),
        "ton": (Decimal("1000"), "t", ("톤", "ton", "t")),
    },
}


DEFAULT_TARGETS = {
    "millimeter": "centimeter", "centimeter": "inch", "meter": "foot", "kilometer": "mile",
    "inch": "centimeter", "foot": "meter", "yard": "meter", "mile": "kilometer",
    "sqm": "pyeong", "pyeong": "sqm",
    "gram": "ounce", "kilogram": "pound", "pound": "kilogram", "ounce": "gram", "ton": "kilogram",
}


CURRENCY_ALIASES = {
    "USD": ("미국달러", "달러", "불", "usd", "$"),
    "KRW": ("대한민국원", "한국돈", "한화", "원화", "krw", "원", "₩"),
    "JPY": ("일본엔", "엔화", "jpy", "엔", "¥"),
    "EUR": ("유로화", "eur", "유로", "€"),
    "GBP": ("영국파운드", "파운드화", "gbp", "파운드", "£"),
    "CNY": ("중국위안", "위안화", "cny", "위안"),
    "TWD": ("대만달러", "twd"),
    "HKD": ("홍콩달러", "hkd"),
}


_RATE_CACHE = {}
_RATE_CACHE_SECONDS = 60 * 60
ECB_FALLBACK_DATE = "2026-07-17 (오프라인 참고 환율)"
ECB_EUR_RATES = {
    "EUR": Decimal("1"),
    "USD": Decimal("1.1435"),
    "JPY": Decimal("185.65"),
    "GBP": Decimal("0.85098"),
    "CNY": Decimal("7.7501"),
    "HKD": Decimal("8.9653"),
    "KRW": Decimal("1698.46"),
}


NATURAL_UNIT_CONVERSIONS = [
    (("제곱미터", "평방미터", "㎡"), "sqm_to_pyeong"),
    (("센티미터", "센치", "cm"), "cm_to_inch"),
    (("킬로미터", "키로미터", "km"), "km_to_mile"),
    (("킬로그램", "키로그램", "킬로", "키로", "kg"), "kg_to_lb"),
    (("파운드", "lb"), "lb_to_kg"),
    (("인치", "inch"), "inch_to_cm"),
    (("마일", "mile"), "mile_to_km"),
    (("섭씨", "°c", "c"), "c_to_f"),
    (("화씨", "°f", "f"), "f_to_c"),
    (("평",), "pyeong_to_sqm"),
]


def _natural_unit_input(raw):
    if not isinstance(raw, str) or not raw.strip():
        raise InputError("예: 1센치, 일 인치, 34평처럼 입력해 주세요.")
    cleaned = raw.lower().strip()
    for aliases, conversion in NATURAL_UNIT_CONVERSIONS:
        for alias in aliases:
            match = re.fullmatch(rf"(.+?)\s*{re.escape(alias)}", cleaned)
            if match:
                return _decimal(match.group(1), "변환 값"), conversion
    raise InputError("단위를 찾지 못했습니다. 예: 1센치, 일 인치, 34평")


def _alias_occurrences(text, definitions):
    occurrences = []
    for dimension, units in definitions.items():
        for canonical, (_, _, aliases) in units.items():
            for alias in sorted(aliases, key=len, reverse=True):
                if alias.isascii() and alias.isalpha():
                    pattern = rf"(?<![a-z]){re.escape(alias)}(?![a-z])"
                else:
                    pattern = re.escape(alias)
                for match in re.finditer(pattern, text):
                    occurrences.append((match.start(), match.end(), dimension, canonical, alias))
    occurrences.sort(key=lambda item: (item[0], -(item[1] - item[0])))
    filtered = []
    for item in occurrences:
        if filtered and item[0] < filtered[-1][1]:
            continue
        filtered.append(item)
    return filtered


def _number_before(text, position):
    prefix = text[:position]
    candidates = re.findall(r"[-+]?\d[\d,]*(?:\.\d+)?|[영공일이삼사오육칠팔구십백천만억조경]+", prefix)
    if not candidates:
        raise InputError("변환할 숫자를 찾지 못했습니다.")
    return _decimal(candidates[-1], "변환 값")


def _convert_natural_pair(raw):
    if not isinstance(raw, str) or not raw.strip():
        raise InputError("변환할 숫자와 단위를 입력해 주세요.")
    text = re.sub(r"\s+", "", raw.lower())
    occurrences = _alias_occurrences(text, UNIT_DEFINITIONS)
    if not occurrences:
        raise InputError("지원하는 단위를 찾지 못했습니다.")
    source = occurrences[0]
    same_dimension = [item for item in occurrences[1:] if item[2] == source[2]]
    target_name = same_dimension[0][3] if same_dimension else DEFAULT_TARGETS.get(source[3])
    if not target_name:
        raise InputError("변환할 목표 단위를 함께 입력해 주세요.")
    value = _number_before(text, source[0])
    units = UNIT_DEFINITIONS[source[2]]
    source_factor = units[source[3]][0]
    target_factor, target_label, _ = units[target_name]
    result = value * source_factor / target_factor
    return {"result": f"{format_number(result, 4)} {target_label}", "source": source[3], "target": target_name}


def convert_unit(raw, conversion=None):
    if conversion:
        value = _decimal(raw, "변환 값")
    else:
        text = str(raw).lower()
        if re.search(r"(?:섭씨|화씨|°c|°f|celsius|fahrenheit)", text):
            temperature_units = list(re.finditer(r"섭씨|화씨|°c|°f|celsius|fahrenheit", text))
            first = temperature_units[0]
            token = first.group(0)
            source_is_f = token in ("화씨", "°f", "fahrenheit")
            value_candidates = re.findall(r"[-+]?\d+(?:\.\d+)?|[영공일이삼사오육칠팔구십백천만억조경]+", text)
            if not value_candidates:
                raise InputError("변환할 온도를 찾지 못했습니다.")
            value = _decimal(value_candidates[0], "온도")
            if len(temperature_units) >= 2:
                target_is_f = temperature_units[1].group(0) in ("화씨", "°f", "fahrenheit")
                conversion = "c_to_f" if target_is_f else "f_to_c"
            elif first.start() > text.find(value_candidates[0]) and re.search(r"(?:로|으로)\s*$", text):
                conversion = "c_to_f" if source_is_f else "f_to_c"
            else:
                conversion = "f_to_c" if source_is_f else "c_to_f"
        else:
            return _convert_natural_pair(raw)
    if conversion == "c_to_f":
        result, unit = value * Decimal(9) / Decimal(5) + 32, "°F"
    elif conversion == "f_to_c":
        result, unit = (value - 32) * Decimal(5) / Decimal(9), "°C"
    elif conversion in CONVERSIONS:
        factor, unit = CONVERSIONS[conversion]
        result = value * factor
    else:
        raise InputError("지원하지 않는 변환 방식입니다.")
    return {"result": f"{format_number(result, 4)} {unit}"}


def _currency_occurrences(text):
    occurrences = []
    for code, aliases in CURRENCY_ALIASES.items():
        for alias in sorted(aliases, key=len, reverse=True):
            for match in re.finditer(re.escape(alias), text):
                if code == "KRW" and alias == "원" and re.match(r"\s*(?:빌리언|밀리언|트릴리언|사우전드)", text[match.end():]):
                    continue
                occurrences.append((match.start(), match.end(), code, alias))
    occurrences.sort(key=lambda item: (item[0], -(item[1] - item[0])))
    filtered = []
    for item in occurrences:
        if filtered and item[0] < filtered[-1][1]:
            continue
        filtered.append(item)
    return filtered


def _currency_value(text, source):
    before = text[:source[0]]
    after = text[source[1]:]
    amount_text = before.strip()
    if not amount_text and source[3] in ("$", "₩", "¥", "€", "£"):
        amount_text = after.strip()
    if amount_text:
        try:
            return _flexible_currency_amount(amount_text)
        except InputError:
            pass
    candidates = re.findall(r"[-+]?\d[\d,]*(?:\.\d+)?|[영공일이삼사오육칠팔구십백천만억조경]+", before)
    if not candidates and source[3] in ("$", "₩", "¥", "€", "£"):
        candidates = re.findall(r"[-+]?\d[\d,]*(?:\.\d+)?|[영공일이삼사오육칠팔구십백천만억조경]+", after)
    if not candidates:
        raise InputError("환산할 금액을 찾지 못했습니다.")
    return _decimal(candidates[-1], "금액")


def _flexible_currency_amount(raw):
    """숫자, 한글 수사, 영문식 단위의 한글 음역을 모두 금액으로 해석."""
    text = str(raw or "").strip()
    if not text:
        raise InputError("환산할 금액을 입력해 주세요.")
    try:
        return _decimal(text, "금액")
    except InputError:
        try:
            parsed = english_number_to_korean(text)
            return Decimal(parsed["number"].replace(",", ""))
        except (InputError, InvalidOperation):
            raise InputError("예: 100달러, 원빌리언 달러, 백만원처럼 입력해 주세요.")


def _currency_form_input(raw, selected_direction):
    """환율 페이지 입력의 통화 표기를 제거하고 명시된 통화가 있으면 방향을 추론."""
    if not isinstance(raw, str) or not raw.strip():
        raise InputError("환산할 금액을 입력해 주세요.")
    text = raw.lower().strip()
    dollar_pattern = r"(?:미국\s*달러|달러|usd|\$|불)"
    won_pattern = r"(?:대한민국\s*원|한국돈|한화|원화|krw|₩)"
    if re.search(dollar_pattern, text, re.I):
        direction = "USD_KRW"
        text = re.sub(dollar_pattern, "", text, flags=re.I)
    elif re.search(won_pattern, text, re.I) or re.search(r"원\s*$", text):
        direction = "KRW_USD"
        text = re.sub(won_pattern, "", text, flags=re.I)
        text = re.sub(r"원\s*$", "", text)
    else:
        direction = selected_direction
    return _flexible_currency_amount(text), direction


def _latest_rate(source, target):
    if source == target:
        return Decimal(1), "동일 통화"
    key = (source, target)
    cached = _RATE_CACHE.get(key)
    if cached and time.monotonic() - cached[0] < _RATE_CACHE_SECONDS:
        return cached[1], cached[2]
    url = f"https://api.frankfurter.dev/v2/rate/{source}/{target}"
    try:
        with urlopen(url, timeout=4) as response:
            payload = json.load(response)
        rate = Decimal(str(payload["rate"]))
        date = payload.get("date", "최근 기준일")
    except (HTTPError, URLError, TimeoutError, KeyError, ValueError, InvalidOperation):
        if source not in ECB_EUR_RATES or target not in ECB_EUR_RATES:
            raise InputError("최신 환율을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.")
        rate = ECB_EUR_RATES[target] / ECB_EUR_RATES[source]
        date = ECB_FALLBACK_DATE
    _RATE_CACHE[key] = (time.monotonic(), rate, date)
    return rate, date


def convert_currency_pair(raw, source, target):
    if source not in CURRENCY_ALIASES or target not in CURRENCY_ALIASES or source == target:
        raise InputError("지원하지 않는 통화 변환 방향입니다.")
    amount = _decimal(raw, "금액")
    if amount < 0:
        raise InputError("금액은 0 이상으로 입력해 주세요.")
    if amount >= Decimal(10**18):
        raise InputError("금액이 너무 큽니다.")
    rate, date = _latest_rate(source, target)
    converted = amount * rate
    places = 0 if target in ("KRW", "JPY") else 2
    formatted = format_number(converted, places)
    display = f"{formatted}원" if target == "KRW" else (f"${formatted}" if target == "USD" else f"{formatted} {target}")
    return {
        "result": f"{formatted} {target}", "display": display,
        "rate": f"1 {source} = {format_number(rate, 6)} {target}",
        "date": date, "source": source, "target": target,
    }


def calculate_currency(data):
    pairs = {"USD_KRW": ("USD", "KRW"), "KRW_USD": ("KRW", "USD")}
    direction = data.get("direction", "auto")
    if direction not in (*pairs, "auto"):
        raise InputError("달러 또는 원화 변환 방향을 선택해 주세요.")
    amount, direction = _currency_form_input(data.get("amount"), direction)
    if direction == "auto":
        return {
            "mode": "both", "amount": format_number(amount),
            "usd_to_krw": convert_currency_pair(amount, "USD", "KRW"),
            "krw_to_usd": convert_currency_pair(amount, "KRW", "USD"),
        }
    return convert_currency_pair(amount, *pairs[direction])


def convert_currency(raw):
    if not isinstance(raw, str) or not raw.strip():
        raise InputError("환산할 금액과 통화를 입력해 주세요.")
    text = re.sub(r"\s+", "", raw.lower())
    occurrences = _currency_occurrences(text)
    if not occurrences:
        raise InputError("지원하는 통화를 찾지 못했습니다.")
    source = occurrences[0]
    target = occurrences[1][2] if len(occurrences) > 1 else ("KRW" if source[2] != "KRW" else "USD")
    amount = _currency_value(text, source)
    return convert_currency_pair(amount, source[2], target)


def clean_list(text):
    if not isinstance(text, str) or not text.strip():
        raise InputError("정리할 명단을 입력해 주세요.")
    if len(text) > 50000:
        raise InputError("명단은 50,000자 이하로 입력해 주세요.")
    entries = [item.strip() for item in re.split(r"[\n,;]+", text) if item.strip()]
    seen = set()
    unique = []
    for entry in entries:
        normalized = re.sub(r"\s+", "", entry).casefold()
        if normalized not in seen:
            seen.add(normalized)
            unique.append(entry)
    return {"cleaned": "\n".join(unique), "before": len(entries), "after": len(unique), "removed": len(entries) - len(unique)}


def count_text(text):
    if not isinstance(text, str):
        raise InputError("글자 수를 셀 내용을 입력해 주세요.")
    if len(text) > 100000:
        raise InputError("텍스트는 100,000자 이하로 입력해 주세요.")
    return {
        "with_spaces": len(text),
        "without_spaces": len(re.sub(r"\s", "", text)),
        "words": len(re.findall(r"\S+", text)),
        "lines": 0 if not text else text.count("\n") + 1,
        "bytes": len(text.encode("utf-8")),
    }


def automatic_conversion(text, hint=None):
    if not isinstance(text, str) or not text.strip():
        raise InputError("변환할 내용을 입력해 주세요.")
    if len(text.strip()) >= 30:
        raise InputError("30자 미만으로 입력해 주세요.")
    value = text.strip()

    if re.fullmatch(r"[-+]?\d[\d,]*(?:\.\d+)?|[영공일이삼사오육칠팔구십백천만억조경]+", value):
        return {
            "kind": "추가 정보 필요",
            "primary": "어떤 단위로 변환할까요?",
            "secondary": f"예: {value}원, {value}달러, {value}cm",
            "clarification": True,
        }

    def english_result():
        result = english_number_to_korean(value)
        return {"kind": "숫자 단위", "primary": result["korean"], "secondary": result["number"]}

    def unit_result():
        result = convert_unit(value)
        return {"kind": "생활 단위", "primary": result["result"], "secondary": value}

    def amount_result():
        result = number_to_korean_amount(value)
        return {"kind": "한글 금액", "primary": result["number"], "secondary": result["formal"]}

    def currency_result():
        result = convert_currency(value)
        return {
            "kind": "통화 환산",
            "primary": result["result"],
            "secondary": f"{result['rate']} · {result['date']} 기준",
        }

    hinted = {"english-number": english_result, "unit": unit_result, "korean-amount": amount_result, "currency": currency_result}
    if hint in hinted:
        return hinted[hint]()

    if re.search(r"(?:billion|million|trillion|thousand|빌리언|밀리언|트릴리언|사우전드|\bbn\b|\btn\b)", value, re.I):
        return english_result()
    if re.search(r"(?:달러|한화|원화|엔화|유로|위안|usd|krw|jpy|eur|[$€¥₩])", value, re.I):
        return currency_result()
    if any(re.search(rf"{re.escape(alias)}\s*$", value.lower()) for aliases, _ in NATURAL_UNIT_CONVERSIONS for alias in aliases):
        return unit_result()
    if value.endswith(("원", "원정")) or re.search(r"[만억조경]", value):
        return amount_result()

    errors = []
    for converter in (english_result, unit_result, amount_result):
        try:
            return converter()
        except InputError as exc:
            errors.append(str(exc))
    raise InputError("변환 의도를 찾지 못했습니다. 숫자와 단위를 조금 더 구체적으로 입력해 주세요.")
