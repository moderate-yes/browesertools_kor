# 단숨 — 한국인을 위한 Flask 유틸리티

한국식 숫자·금액 표현과 일상적인 문서 정리를 한 화면에서 처리하는 반응형 웹앱입니다. 회원가입이나 데이터베이스 없이 동작하며, 입력 내용은 요청을 처리하는 동안에만 사용하고 저장하지 않습니다.

## 제공 기능

1. **영어식·한국식 숫자 단위 변환** — `1 billion` → `10억`, `2조 3천억` → `2.3 trillion`
2. **원화·달러 환산** — 최신 영업일 기준환율로 `USD → KRW`, `KRW → USD` 양방향 계산
3. **생활 단위 변환** — `1센치`, `일 인치`, `삼십사 평`처럼 숫자와 단위를 함께 입력
4. **할인·마진 계산** — 실결제액, 플랫폼 수수료, 예상 순이익, 마진율 계산
5. **글자 수 세기** — 공백 포함·제외 글자, 단어, 줄, UTF-8 바이트 계산
6. **명단 정리** — 줄바꿈·쉼표·세미콜론 구분, 공백과 대소문자 차이를 무시한 중복 제거
7. **AI 자동 변환** — 한국어 예시로 학습한 초소형 분류기가 의도를 찾고, 단위·숫자·금액·환율 변환을 자동 선택
8. **INFO** — 개인정보 처리, 환율 기준과 브라우저 내 AI 처리 방식 안내

도구 메뉴는 웹 화면에서 하단에 4개씩 두 줄로 고정되며, 모바일에서는 상단 가로 스크롤 탭으로 표시됩니다.

## 브라우저 AI

150개 한국어 예시를 고정된 120개 학습·30개 검증 세트로 나누고, 문자 2~5-gram 기반의 다항 나이브 베이즈, TF-IDF 중심점, 선형 퍼셉트론을 비교했습니다. 같은 최고 정확도를 기록한 모델 중 더 작은 **TF-IDF 중심점(약 146KB)**을 채택했습니다. 별도 AI 모델 다운로드, WebGPU, TensorFlow.js가 필요 없고 모바일에서도 브라우저가 작은 JSON 분류기를 한 번만 받아 캐시합니다. 분류는 브라우저에서, 검증된 수치 계산은 Flask에서 수행합니다.

환율 페이지와 AI 자동 변환에서 Frankfurter API의 최신 영업일 중앙은행 기준환율을 사용하며 최대 한 시간 동안 서버 메모리에 캐시합니다. 외부 연결이 잠시 끊기면 화면에 기준일을 명시하고 2026-07-17 ECB 참고 환율로 계산합니다. 은행 수수료와 실시간 시장 가격은 반영하지 않으므로 결제·투자 판단용이 아닙니다.

### FunctionGemma 미세조정 준비

`data/functiongemma`에는 숫자·환율·생활 단위 변환, 추가 질문, 지원 밖 요청을 포함한 FunctionGemma 함수 호출 데이터가 있습니다. 다음 명령으로 같은 데이터를 재생성합니다.

```bash
python scripts/build_functiongemma_dataset.py
```

실제 학습은 CUDA GPU가 있는 Linux 또는 Google Colab 환경에서 실행해야 합니다. 먼저 Hugging Face에서 `google/functiongemma-270m-it`의 Gemma 라이선스에 동의하고 쓰기 권한 토큰을 비밀 환경변수 `HF_TOKEN`으로 설정합니다.

```bash
pip install -r requirements-training.txt
huggingface-cli login --token "$HF_TOKEN"
python scripts/train_functiongemma.py --hub-repo 사용자명/dansum-functiongemma-270m
```

학습이 끝난 모델은 ONNX q4로 변환해 브라우저에서 사용합니다. 모델 파일은 브라우저 Cache API에 저장되므로 첫 다운로드 이후에는 다시 받지 않습니다. 다만 캐시와 메모리는 다르므로 재접속 시 ONNX 그래프 초기화는 필요합니다. 이를 줄이기 위한 운영 구성은 다음과 같습니다.

- 모든 페이지에서 본문 로딩 후 Web Worker로 모델을 미리 준비합니다.
- WebGPU와 q4 모델을 우선하고, WebGPU가 없으면 WASM으로 전환합니다.
- 첫 추론 전에 1토큰 워밍업을 실행합니다.
- 출력은 짧은 함수 호출로 제한하고 실제 계산과 안내 문장은 기존 코드가 담당합니다.
- 모델 버전을 고정해 브라우저 캐시가 불필요하게 무효화되지 않도록 합니다.

모델 업로드 전에는 기존 초경량 분류기가 계속 사용됩니다. 공개 모델 저장소 ID가 정해진 뒤 브라우저 로더를 활성화해야 합니다.

### 모델 비교 재현

```bash
python scripts/build_classifier.py
```

이 명령은 `data/conversion_examples.csv`, `reports/model_comparison.json`, `reports/model_comparison.md`, 브라우저용 `app/static/conversion-classifier.json`을 다시 만듭니다.

## 실행 방법

Python 3.10 이상을 권장합니다.

### Windows PowerShell

```powershell
cd browsertool_korean
python -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
python run.py
```

### macOS / Linux

```bash
cd browsertool_korean
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
python run.py
```

브라우저에서 `http://127.0.0.1:5000`을 열면 됩니다.

## 검색엔진 설정

공개 서버에서는 대표 도메인을 반드시 지정하세요. 이 값은 canonical URL, `sitemap.xml`, `robots.txt`에 사용됩니다.

```powershell
$env:SITE_URL="https://example.com"
$env:GOOGLE_SITE_VERIFICATION="구글에서 발급한 값"
$env:NAVER_SITE_VERIFICATION="네이버에서 발급한 값"
python run.py
```

macOS/Linux에서는 같은 이름의 환경변수를 `export`로 설정하면 됩니다. 인증값을 아직 발급받지 않았다면 두 verification 변수는 비워 두어도 됩니다.

배포 후 다음 주소를 확인하고 각 검색도구에 사이트맵을 제출하세요.

- `https://example.com/robots.txt`
- `https://example.com/sitemap.xml`
- Google Search Console: 속성 등록, 소유권 확인, 사이트맵 제출
- 네이버 서치어드바이저: 사이트 등록, 소유확인, 사이트맵 제출 및 수집 요청

각 기능 페이지에는 고유한 title·description, canonical URL, Open Graph 태그, 하나의 H1과 JSON-LD 구조화 데이터가 서버 HTML에 포함됩니다. `/tools/english-number`는 중복 색인을 막기 위해 대표 메인 주소 `/`로 301 이동합니다.

## 테스트

프로젝트 폴더에서 다음 명령을 실행합니다.

```bash
python -m unittest discover -s tests -v
```

## 프로젝트 구조

```text
browsertool_korean/
├─ app/
│  ├─ __init__.py       # Flask 앱 팩토리
│  ├─ routes.py         # 화면 및 JSON API
│  ├─ tools.py          # 변환·계산·마스킹 핵심 로직
│  ├─ static/
│  │  ├─ app.js
│  │  ├─ ai-converter.js
│  │  ├─ conversion-classifier.json
│  │  ├─ favicon.svg
│  │  └─ style.css
│  └─ templates/
│     ├─ base.html
│     ├─ sitemap.xml
│     └─ tool.html
├─ tests/
│  ├─ test_classifier.py
│  ├─ test_routes.py
│  └─ test_tools.py
├─ data/conversion_examples.csv
├─ reports/model_comparison.md
├─ scripts/build_classifier.py
├─ requirements.txt
└─ run.py
```

## 입력 제한과 개인정보

- 명단 입력은 최대 50,000자입니다.
- 전체 요청 크기는 1MB로 제한됩니다.
- 앱에는 데이터베이스와 파일 저장 로직이 없습니다.
- 실제 공개 서비스에서는 Flask 개발 서버 대신 Gunicorn 또는 Waitress 같은 운영용 WSGI 서버와 HTTPS 사용을 권장합니다.

> 자동 마스킹은 보조 기능입니다. 결과를 외부에 공유하기 전 민감한 정보가 모두 가려졌는지 직접 확인하세요.
