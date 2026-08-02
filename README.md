# 단숨 — 정적 웹 도구

한국어 숫자, 환율, 생활 단위, 마진, 글자 수와 명단을 처리하는 정적 웹사이트입니다.
도구 기능은 HTML, CSS, JavaScript만으로 실행되며 S3와 CloudFront에 배포합니다. 하단의 방문자 수만 AWS Lambda와 DynamoDB를 사용하는 서버리스 방식으로 집계합니다.

## 구조

```text
index.html                       # 영문·한국식 숫자 변환
tools/
  currency/index.html            # 환율 계산
  unit/index.html                # 생활 단위 변환
  margin/index.html              # 마진 계산
  character-count/index.html     # 글자 수
  clean-list/index.html          # 명단 정리
  ai-converter/index.html        # FunctionGemma 자동 변환
  info/index.html                # 서비스 안내
static/
  style.css                      # 공통 디자인
  tools.js                       # 브라우저 계산 엔진
  app.js                         # 폼과 결과 UI
  ai-converter.js                # AI 화면 제어
  functiongemma-worker.js        # WebGPU 모델 워커
tests/
  static-site.test.mjs           # 정적 기능 테스트
aws/
  cloudfront-url-rewrite.js      # 폴더형 주소를 index.html로 연결
  visitor-counter/               # Lambda·DynamoDB 방문자 카운터
```

## 로컬 확인

파일을 직접 여는 대신 프로젝트 루트에서 정적 파일 서버를 실행합니다.

```bash
python -m http.server 8000
```

브라우저에서 `http://localhost:8000`을 엽니다.

## 운영 주소 설정

현재 운영 주소는 `https://korean.browsertools.kr`로 설정되어 있습니다.
주소를 바꿀 때는 다음 명령을 사용합니다.

```bash
node scripts/set-site-url.mjs https://새로운-도메인
```

## 테스트

Node.js 18 이상에서 실행합니다.

```bash
node --test tests/static-site.test.mjs
```

## S3·CloudFront 배포

1. 서울 리전에 비공개 `browsertools-korea` S3 버킷을 만듭니다.
2. 저장소의 `index.html`, `tools`, `static`, `robots.txt`, `sitemap.xml`을 버킷에 업로드합니다.
3. S3 버킷은 공개하지 않고 CloudFront Origin Access Control로 연결합니다.
4. CloudFront 기본 루트 객체를 `index.html`로 지정합니다.
5. `aws/cloudfront-url-rewrite.js`를 CloudFront Function으로 등록하고 Viewer request에 연결합니다.
6. ACM 인증서와 도메인을 CloudFront에 연결합니다.

FunctionGemma 모델은 사용자 브라우저에서 내려받아 WebGPU로 실행됩니다. 환율 조회는 브라우저에서 Frankfurter API를 호출하며, 네트워크 오류 시 포함된 오프라인 참고 환율을 사용합니다.

## GitHub 자동 배포

`.github/workflows/deploy-s3.yml`은 `main` 브랜치가 갱신될 때 S3에 정적 파일을 올리고 CloudFront 캐시를 갱신합니다. 장기 AWS 액세스 키 대신 GitHub OIDC 역할을 사용합니다.

배포 과정에서 `browsertools-korea-visitor-counter` CloudFormation 스택을 갱신하고, 생성된 Lambda Function URL을 `static/runtime-config.js`에 자동으로 기록합니다. 카운터는 한국 시간 기준 오늘 방문 수와 누적 방문 수를 저장하며 같은 브라우저 탭에서는 하루에 한 번만 증가합니다.

GitHub 저장소의 `production` 환경 또는 Actions 변수에 다음 값을 설정합니다.

- `AWS_ROLE_ARN`
- `AWS_REGION`
- `S3_BUCKET`
- `CLOUDFRONT_DISTRIBUTION_ID`
