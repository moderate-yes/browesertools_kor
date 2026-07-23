"""150개 한국어 변환 예제로 경량 문자 분류기 3종을 비교하고 최적 모델을 내보낸다."""

import csv
import json
import math
import random
import time
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_PATH = ROOT / "data" / "conversion_examples.csv"
MODEL_PATH = ROOT / "app" / "static" / "conversion-classifier.json"
REPORT_JSON = ROOT / "reports" / "model_comparison.json"
REPORT_MD = ROOT / "reports" / "model_comparison.md"


EXAMPLES = {
    "length": [
        "1센치", "1센치를 미터로", "1미터를 인치로", "70인치를 센티미터로", "십 센티를 인치로",
        "3미터는 몇 피트야", "5피트를 미터로 바꿔줘", "10km를 마일로", "2마일은 몇 킬로미터", "백 센치를 미터로",
        "30cm inch 변환", "키 180센티를 피트로", "1인치", "일 인치 센치로", "2.5미터를 cm로",
        "거리 12킬로미터 마일 환산", "6피트 2인치를 센치로", "500밀리미터를 미터로", "1m는 몇 cm", "3야드를 미터로",
        "1000미터를 킬로미터로", "0.5마일 km", "27인치 모니터 센치", "신장 5피트 7인치 cm", "길이 250mm를 inch로",
    ],
    "area": [
        "34평", "34평을 제곱미터로", "84제곱미터를 평으로", "전용면적 59㎡ 몇 평", "백 평은 몇 제곱미터",
        "1평", "삼십 평을 평방미터로", "120m2 평수", "아파트 102제곱미터 평 환산", "오십 제곱미터는 몇 평",
        "대지 200평 ㎡", "면적 330제곱미터 평으로", "18평형 실면적", "1제곱미터를 평으로", "75평을 m2로",
        "사무실 40평 제곱미터", "250㎡ 평 계산", "열두 평은 몇 제곱미터야", "면적이 66m2면 몇 평", "1000제곱미터 평수",
    ],
    "weight": [
        "150파운드", "150파운드를 킬로그램으로", "70킬로를 파운드로", "1kg은 몇 lb", "십 파운드 kg",
        "500그램을 온스로", "8온스는 몇 그램", "몸무게 80키로 파운드", "2.5kg lb 변환", "100lb를 kg으로",
        "일 킬로그램", "삼십 온스를 그램으로", "250g은 몇 oz", "5파운드 3온스 kg", "무게 12kg 파운드 환산",
        "1톤을 킬로그램으로", "천 그램 kg", "45킬로는 몇 파운드야", "16온스 파운드", "0.5파운드를 그램으로",
    ],
    "temperature": [
        "섭씨 30도", "섭씨 30도를 화씨로", "화씨 86도를 섭씨로", "100°F는 몇 도", "영하 10도 화씨",
        "체온 37도 화씨 환산", "화씨 32", "0도를 화씨로", "섭씨 백 도", "212화씨 섭씨",
        "오늘 25°C면 화씨 몇 도", "오븐 350F를 섭씨로", "화씨 칠십도", "섭씨 영도", "온도 68°F celsius",
        "-40도 화씨 변환", "15 c를 f로", "95 fahrenheit 섭씨", "기온 삼십오도 화씨", "냉장고 4도 fahrenheit",
    ],
    "currency": [
        "100달러", "100달러를 한화로", "1달러 원화", "50유로를 원으로", "만 엔은 몇 원",
        "200파운드를 달러로", "30달러를 엔화로", "1000원을 달러로", "십만 원을 유로로", "25유로 usd",
        "$100 환율", "USD 75를 KRW로", "JPY 5000 원화 환산", "EUR 20 달러로", "한국 돈 3만원 엔화",
        "백 달러면 얼마야", "45불 원으로", "1200엔을 한화로", "9.99달러", "300유로",
        "250위안을 원화로", "1000대만달러 한화", "50홍콩달러를 원으로", "1파운드 환율", "달러 27.5 원화 계산",
    ],
    "english_number": [
        "1 billion", "원 빌리언", "3.5 million", "2 trillion", "십 밀리언",
        "500 thousand", "투 빌리언", "1.2bn", "삼 트릴리언", "7 million을 한국식으로",
        "one billion 숫자 변환", "4.5밀리언", "백 사우전드", "0.5 trillion", "25m 숫자 단위",
        "9 billion은 몇 억", "일 빌리언", "12 thousand", "6tn 한국 숫자로", "350 million 달러 규모",
    ],
    "korean_amount": [
        "125000000원", "일억 오천만원", "3500000 금액 표기", "금 삼천만원", "12,500,000원정",
        "백만원을 한글로", "250000원 문서용 표기", "오억 삼천만 원", "0원 한글 금액", "99999999원정",
        "계약금 3천5백만원 표기", "1200000000원을 한글로", "십이만 삼천원", "금액 780000원", "일조 원정",
        "45,000원 한글", "삼억오백만 원 숫자로", "100000000 문서 금액", "칠천이백원", "2005000원 금액 읽기",
    ],
}


def normalize(text):
    return "".join(str(text).lower().split())


def ngrams(text, low=2, high=5):
    text = f"^{normalize(text)}$"
    return [text[i:i + size] for size in range(low, high + 1) for i in range(len(text) - size + 1)]


def write_dataset(rows):
    DATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with DATA_PATH.open("w", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["id", "text", "label"])
        writer.writeheader()
        writer.writerows(rows)


def split_rows(rows):
    grouped = defaultdict(list)
    for row in rows:
        grouped[row["label"]].append(row)
    train, test = [], []
    for label in sorted(grouped):
        for index, row in enumerate(grouped[label]):
            (test if index % 5 == 0 else train).append(row)
    return train, test


def vocabulary(train):
    document_frequency = Counter()
    for row in train:
        document_frequency.update(set(ngrams(row["text"])))
    terms = sorted(document_frequency, key=lambda term: (-document_frequency[term], term))[:3000]
    vocab = {term: index for index, term in enumerate(terms)}
    idf = [math.log((1 + len(train)) / (1 + document_frequency[term])) + 1 for term in terms]
    return vocab, idf


def count_features(text, vocab):
    counts = Counter(ngrams(text))
    return {vocab[term]: count for term, count in counts.items() if term in vocab}


def tfidf_features(text, vocab, idf):
    values = {index: count * idf[index] for index, count in count_features(text, vocab).items()}
    norm = math.sqrt(sum(value * value for value in values.values())) or 1
    return {index: value / norm for index, value in values.items()}


def dot(weights, features):
    return sum(weights[index] * value for index, value in features.items())


def train_nb(train, classes, vocab, idf):
    by_class = Counter(row["label"] for row in train)
    feature_counts = {label: [1.0] * len(vocab) for label in classes}
    totals = {label: float(len(vocab)) for label in classes}
    for row in train:
        for index, count in count_features(row["text"], vocab).items():
            feature_counts[row["label"]][index] += count
            totals[row["label"]] += count
    weights = [[math.log(value / totals[label]) for value in feature_counts[label]] for label in classes]
    bias = [math.log(by_class[label] / len(train)) for label in classes]
    return {"name": "다항 나이브 베이즈", "feature_mode": "count", "weights": weights, "bias": bias}


def train_centroid(train, classes, vocab, idf):
    sums = {label: [0.0] * len(vocab) for label in classes}
    counts = Counter()
    for row in train:
        counts[row["label"]] += 1
        for index, value in tfidf_features(row["text"], vocab, idf).items():
            sums[row["label"]][index] += value
    weights = []
    for label in classes:
        centroid = [value / counts[label] for value in sums[label]]
        norm = math.sqrt(sum(value * value for value in centroid)) or 1
        weights.append([value / norm for value in centroid])
    return {"name": "TF-IDF 중심점", "feature_mode": "tfidf", "weights": weights, "bias": [0.0] * len(classes)}


def train_perceptron(train, classes, vocab, idf):
    weights = [[0.0] * len(vocab) for _ in classes]
    bias = [0.0] * len(classes)
    class_index = {label: index for index, label in enumerate(classes)}
    samples = [(tfidf_features(row["text"], vocab, idf), class_index[row["label"]]) for row in train]
    rng = random.Random(20260719)
    for epoch in range(60):
        rng.shuffle(samples)
        rate = 0.35 / (1 + epoch * 0.04)
        for features, truth in samples:
            scores = [dot(weights[index], features) + bias[index] for index in range(len(classes))]
            predicted = max(range(len(classes)), key=lambda index: scores[index])
            if predicted != truth:
                for feature, value in features.items():
                    weights[truth][feature] += rate * value
                    weights[predicted][feature] -= rate * value
                bias[truth] += rate
                bias[predicted] -= rate
    return {"name": "선형 퍼셉트론", "feature_mode": "tfidf", "weights": weights, "bias": bias}


def predict(model, text, classes, vocab, idf):
    features = count_features(text, vocab) if model["feature_mode"] == "count" else tfidf_features(text, vocab, idf)
    scores = [dot(model["weights"][index], features) + model["bias"][index] for index in range(len(classes))]
    return classes[max(range(len(classes)), key=lambda index: scores[index])]


def macro_f1(truth, predicted, classes):
    scores = []
    for label in classes:
        tp = sum(a == label and b == label for a, b in zip(truth, predicted))
        fp = sum(a != label and b == label for a, b in zip(truth, predicted))
        fn = sum(a == label and b != label for a, b in zip(truth, predicted))
        precision = tp / (tp + fp) if tp + fp else 0
        recall = tp / (tp + fn) if tp + fn else 0
        scores.append(2 * precision * recall / (precision + recall) if precision + recall else 0)
    return sum(scores) / len(scores)


def export_payload(model, classes, vocab, idf):
    terms = [None] * len(vocab)
    for term, index in vocab.items():
        terms[index] = term
    return {
        "version": 1,
        "model": model["name"],
        "feature_mode": model["feature_mode"],
        "ngram_range": [2, 5],
        "classes": classes,
        "vocabulary": terms,
        "idf": [round(value, 7) for value in idf],
        "weights": [[round(value, 7) for value in row] for row in model["weights"]],
        "bias": [round(value, 7) for value in model["bias"]],
    }


def main():
    rows = []
    identifier = 1
    for label, texts in EXAMPLES.items():
        for text in texts:
            rows.append({"id": identifier, "text": text, "label": label})
            identifier += 1
    assert len(rows) == 150, f"예시는 150개여야 합니다: {len(rows)}"
    write_dataset(rows)

    train, test = split_rows(rows)
    classes = sorted(EXAMPLES)
    vocab, idf = vocabulary(train)
    models = [
        train_nb(train, classes, vocab, idf),
        train_centroid(train, classes, vocab, idf),
        train_perceptron(train, classes, vocab, idf),
    ]
    truth = [row["label"] for row in test]
    results = []
    payloads = []
    for model in models:
        predicted = [predict(model, row["text"], classes, vocab, idf) for row in test]
        started = time.perf_counter()
        for _ in range(250):
            for row in test:
                predict(model, row["text"], classes, vocab, idf)
        latency_ms = (time.perf_counter() - started) * 1000 / (250 * len(test))
        payload = export_payload(model, classes, vocab, idf)
        encoded = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        payloads.append(payload)
        results.append({
            "model": model["name"],
            "accuracy": round(sum(a == b for a, b in zip(truth, predicted)) / len(test), 4),
            "macro_f1": round(macro_f1(truth, predicted, classes), 4),
            "average_latency_ms": round(latency_ms, 4),
            "serialized_size_kb": round(len(encoded) / 1024, 1),
            "correct": sum(a == b for a, b in zip(truth, predicted)),
            "test_count": len(test),
        })

    winner_index = max(range(len(results)), key=lambda index: (
        results[index]["macro_f1"], results[index]["accuracy"], -results[index]["serialized_size_kb"], -results[index]["average_latency_ms"]
    ))
    winner = results[winner_index]
    MODEL_PATH.write_text(json.dumps(payloads[winner_index], ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    report = {
        "dataset_count": len(rows),
        "train_count": len(train),
        "test_count": len(test),
        "split": "라벨별 5번째 예시를 검증용으로 분리한 고정 80:20 홀드아웃",
        "classes": classes,
        "vocabulary_size": len(vocab),
        "results": results,
        "winner": winner["model"],
    }
    REPORT_JSON.parent.mkdir(parents=True, exist_ok=True)
    REPORT_JSON.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    lines = [
        "# 초소형 변환 분류기 비교", "",
        f"- 전체 데이터: {len(rows)}개", f"- 학습: {len(train)}개 / 검증: {len(test)}개",
        f"- 특징: 한국어 문자 2~5-gram, 어휘 {len(vocab):,}개", "",
        "| 모델 | 정확도 | Macro F1 | 평균 추론 | JSON 크기 |", "|---|---:|---:|---:|---:|",
    ]
    for result in results:
        lines.append(f"| {result['model']} | {result['accuracy'] * 100:.1f}% | {result['macro_f1']:.4f} | {result['average_latency_ms']:.4f}ms | {result['serialized_size_kb']:.1f}KB |")
    lines.extend(["", f"선정 모델: **{winner['model']}**", "", "측정값은 이 PC의 Python 구현 기준이며 브라우저와 기기에 따라 달라질 수 있습니다."])
    REPORT_MD.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True, indent=2))


if __name__ == "__main__":
    main()
