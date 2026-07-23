"""단숨 FunctionGemma 함수 호출 미세조정용 한국어 합성 데이터셋을 생성한다."""

import hashlib
import json
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "data" / "functiongemma"
TOOLS = json.loads((OUTPUT / "tools.json").read_text(encoding="utf-8"))
SYSTEM = "You are a model that can do function calling with the following functions"
rows = {}


def add(text, tool, arguments):
    text = " ".join(text.split())
    if not text or text in rows:
        return
    rows[text] = {
        "messages": [
            {"role": "developer", "content": SYSTEM},
            {"role": "user", "content": text},
            {"role": "assistant", "tool_calls": [{"type": "function", "function": {"name": tool, "arguments": arguments}}]},
        ],
        "tools": TOOLS,
        "expected_tool": tool,
    }


def query_examples(items, templates, tool):
    for item in items:
        for template in templates:
            text = template.format(q=item)
            add(text, tool, {"query": text})


number_queries = []
for value in ("1", "2", "3.5", "10", "25", "100", "0.5", "1.2", "삼", "십", "백"):
    for unit in ("thousand", "million", "billion", "trillion", "사우전드", "밀리언", "빌리언", "트릴리언"):
        number_queries.extend((f"{value} {unit}", f"{value}{unit}"))
for value in ("1만", "10만", "350만", "1억", "12억", "2조", "2조 3천억", "십억", "삼백만"):
    number_queries.append(value)
query_examples(number_queries, ("{q}", "{q} 변환", "{q}은 얼마야", "{q} 한국식으로", "{q} 숫자 단위 바꿔줘"), "convert_number")

currency_queries = []
for amount in ("1", "10", "50", "100", "250", "1,000", "만원", "십만원", "백만원", "원빌리언"):
    currency_queries.extend((
        f"{amount}달러", f"{amount} 달러를 원화로", f"USD {amount} KRW로",
        f"{amount}원을 달러로", f"{amount} 원화 달러 환산", f"KRW {amount} USD로",
    ))
query_examples(currency_queries, ("{q}", "{q} 바꿔줘", "{q} 얼마야", "{q} 계산해줘"), "convert_currency")

unit_pairs = (
    ("센치", "미터"), ("센티미터", "인치"), ("미터", "인치"), ("미터", "피트"),
    ("인치", "센티미터"), ("피트", "미터"), ("킬로미터", "마일"), ("마일", "킬로미터"),
    ("평", "제곱미터"), ("제곱미터", "평"), ("킬로그램", "파운드"), ("파운드", "킬로그램"),
    ("그램", "온스"), ("온스", "그램"), ("섭씨", "화씨"), ("화씨", "섭씨"),
)
unit_queries = []
for amount in ("1", "2.5", "10", "34", "50", "70", "100", "150", "천", "삼십사"):
    for source, target in unit_pairs:
        unit_queries.extend((f"{amount}{source}", f"{amount}{source}를 {target}로", f"{amount} {source} {target} 변환"))
query_examples(unit_queries, ("{q}", "{q} 해줘", "{q} 얼마야", "{q} 바꿔줘"), "convert_unit")

plain_values = ("1", "10", "34", "50", "100", "1000", "1,000", "2.5", "일", "십", "백", "천", "삼십사")
for value in plain_values:
    for template in ("{v}", "{v} 변환", "{v} 바꿔줘", "{v}은 얼마야"):
        add(template.format(v=value), "request_clarification", {
            "question": "어떤 단위로 변환할까요? 예: 100원, 100달러, 100cm", "missing": "conversion_type",
        })
for text in ("환율", "환율 계산", "달러로 바꿔줘", "원화로 환산", "몇 달러야", "몇 원이야"):
    add(text, "request_clarification", {"question": "환산할 금액과 통화를 알려주세요.", "missing": "value"})
for text in ("1미터를", "10센치를", "34평을", "100달러를", "만원을"):
    add(text, "request_clarification", {"question": "어떤 단위로 바꿀까요?", "missing": "target_unit"})
for target in ("달러", "원화", "인치", "센티", "미터", "평", "제곱미터", "파운드", "킬로", "화씨", "섭씨"):
    for template in ("{u}로", "{u}로 바꿔줘", "{u} 환산", "{u}면 얼마야", "{u} 변환해줘"):
        add(template.format(u=target), "request_clarification", {
            "question": "변환할 숫자와 원래 단위를 알려주세요.", "missing": "value",
        })
for source in ("달러", "원", "센치", "미터", "인치", "평", "제곱미터", "킬로", "파운드", "섭씨", "화씨"):
    for template in ("100{u}를", "{u} 변환", "{u} 바꿔줘", "{u}는 얼마야"):
        add(template.format(u=source), "request_clarification", {
            "question": "어떤 단위로 바꿀까요?", "missing": "target_unit",
        })
unsupported_topics = (
    "날씨", "번역", "노래 추천", "주식 추천", "오늘 뉴스", "메일 작성", "사진 생성", "맛집 추천",
    "여행 일정", "코딩 질문", "건강 상담", "운세", "영화 추천", "게임 공략", "레시피", "일정 관리",
    "이름 짓기", "문서 요약", "검색", "잡담",
)
for topic in unsupported_topics:
    for template in ("{q}", "{q} 해줘", "{q} 알려줘", "{q} 부탁해", "{q} 가능해?"):
        add(template.format(q=topic), "unsupported_request", {"message": "숫자, 환율 또는 생활 단위 변환을 입력해 주세요."})


def split_name(text):
    bucket = int(hashlib.sha256(text.encode("utf-8")).hexdigest()[:8], 16) % 10
    return "test" if bucket == 0 else ("validation" if bucket == 1 else "train")


OUTPUT.mkdir(parents=True, exist_ok=True)
splits = {name: [] for name in ("train", "validation", "test")}
for text, row in sorted(rows.items()):
    splits[split_name(text)].append(row)
for name, items in splits.items():
    with (OUTPUT / f"{name}.jsonl").open("w", encoding="utf-8") as handle:
        for item in items:
            handle.write(json.dumps(item, ensure_ascii=False) + "\n")

counts = Counter(row["expected_tool"] for row in rows.values())
manifest = {"total": len(rows), "splits": {key: len(value) for key, value in splits.items()}, "tools": dict(sorted(counts.items()))}
(OUTPUT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps(manifest, ensure_ascii=False, indent=2))
