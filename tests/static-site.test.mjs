import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";

const context = {
  window: {},
  console,
  TextEncoder,
  AbortSignal,
  fetch: async () => ({
    ok: true,
    async json() {
      return {rate: 1350.25, date: "2026-07-25"};
    },
  }),
};
vm.createContext(context);
vm.runInContext(fs.readFileSync("static/tools.js", "utf8"), context);
const tools = context.window.DansumTools;

test("영문·한국식 숫자 단위를 양방향 변환한다", async () => {
  const english = await tools.runTool("english-number", {value: "1 billion"});
  assert.equal(english.primary, "10억");
  assert.equal(english.secondary, "1,000,000,000");

  const korean = await tools.runTool("english-number", {value: "10억"});
  assert.equal(korean.primary, "1 billion");
});

test("한글 숫자가 포함된 마진을 계산한다", async () => {
  const result = await tools.runTool("margin", {
    price: "십만원",
    cost: "사만오천원",
    discount: "만원",
    fee_rate: "10",
    shipping: "삼천원",
  });
  assert.equal(result.revenue, "90,000원");
  assert.equal(result.fee, "9,000원");
  assert.equal(result.profit, "33,000원");
});

test("생활 단위를 자연어로 변환한다", async () => {
  assert.equal((await tools.runTool("unit", {value: "1인치"})).result, "2.54 cm");
  assert.equal((await tools.runTool("unit", {value: "34평"})).result, "112.3967 ㎡");
  assert.equal((await tools.runTool("unit", {value: "섭씨 34도"})).result, "93.2 °F");
});

test("목록 정리와 글자 수 계산을 브라우저에서 처리한다", async () => {
  const cleaned = await tools.runTool("clean-list", {text: "김하나\n이둘\n김 하나"});
  assert.deepEqual({...cleaned}, {cleaned: "김하나\n이둘", before: 3, after: 2, removed: 1});

  const counted = await tools.runTool("character-count", {text: "한글 test\n둘"});
  assert.equal(counted.lines, 2);
  assert.equal(counted.words, 3);
  assert.equal(counted.bytes, new TextEncoder().encode("한글 test\n둘").length);
});

test("환율 조회를 브라우저 fetch로 처리한다", async () => {
  const result = await tools.runTool("currency", {amount: "100달러"});
  assert.equal(result.display, "135,025원");
  assert.equal(result.source, "USD");
  assert.equal(result.target, "KRW");
});

test("AI 모델 준비 전에도 내장 분류기로 자동 변환한다", async () => {
  const unit = await tools.runTool("auto-convert", {text: "1센치를 미터로"});
  const number = await tools.runTool("auto-convert", {text: "1 billion"});
  const currency = await tools.runTool("auto-convert", {text: "100달러"});
  assert.equal(unit.kind, "생활 단위");
  assert.equal(number.kind, "숫자 단위");
  assert.equal(currency.kind, "통화 환산");
});

test("모든 정적 페이지와 필수 자산이 존재한다", () => {
  const pages = [
    "index.html",
    "tools/currency/index.html",
    "tools/unit/index.html",
    "tools/margin/index.html",
    "tools/character-count/index.html",
    "tools/clean-list/index.html",
    "tools/ai-converter/index.html",
    "tools/info/index.html",
  ];
  const titles = new Set();
  const descriptions = new Set();
  for (const page of pages) {
    const html = fs.readFileSync(page, "utf8");
    const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
    const description = html.match(/<meta name="description" content="([^"]+)">/)?.[1];
    const structuredData = html.match(/<script type="application\/ld\+json">([\s\S]+?)<\/script>/)?.[1];
    assert.match(html, /<html lang="ko">/);
    assert.match(html, /<meta name="google-adsense-account" content="ca-pub-3062467800658496">/);
    assert.equal((html.match(/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-3062467800658496/g) || []).length, 1);
    assert.match(html, /<script async src="https:\/\/pagead2\.googlesyndication\.com\/pagead\/js\/adsbygoogle\.js\?client=ca-pub-3062467800658496" crossorigin="anonymous"><\/script>/);
    assert.match(html, /\/static\/tools\.js/);
    assert.match(html, /\/static\/visitor-counter-config\.js/);
    assert.match(html, /\/static\/visitor-counter\.js/);
    assert.match(html, /https:\/\/browsertools\.kr/);
    assert.match(html, /<link rel="canonical" href="https:\/\/browsertools\.kr/);
    assert.match(html, /<link rel="icon" href="\/favicon\.ico" sizes="any">/);
    assert.match(html, /<link rel="icon" href="\/favicon-48x48\.png" type="image\/png" sizes="48x48">/);
    assert.match(html, /<link rel="icon" href="\/static\/favicon\.svg" type="image\/svg\+xml">/);
    assert.match(html, /<meta property="og:image" content="https:\/\/browsertools\.kr\/static\/og-woonhae\.svg">/);
    if (page === "tools/info/index.html") {
      assert.match(html, /mailto:khh901001@proton\.me/);
      assert.match(html, /\/static\/woonhae-character\.svg/);
      assert.doesNotMatch(html, /class="seo-guide"/);
    } else {
      assert.match(html, /"@type":"FAQPage"/);
      assert.match(html, /class="seo-guide"/);
    }
    assert.equal((html.match(/<h1\b/g) || []).length, 1);
    assert.ok(title && [...title].length <= 40);
    assert.ok(description && [...description].length <= 80);
    assert.equal(titles.has(title), false);
    assert.equal(descriptions.has(description), false);
    titles.add(title);
    descriptions.add(description);
    assert.doesNotThrow(() => JSON.parse(structuredData));
    assert.doesNotMatch(html, /\/api\//);
    assert.doesNotMatch(html, /https:\/\/example\.com/);
  }
  for (const asset of ["style.css", "tools.js", "app.js", "visitor-counter-config.js", "visitor-counter.js", "ai-converter.js", "functiongemma-worker.js", "favicon.svg", "og-woonhae.svg", "woonhae-character.svg"]) {
    assert.equal(fs.existsSync(path.join("static", asset)), true);
  }
  for (const asset of ["favicon.ico", "favicon-48x48.png"]) {
    assert.equal(fs.existsSync(asset), true);
  }
  const character = fs.readFileSync("static/woonhae-character.svg", "utf8");
  assert.match(character, /class="mouth"/);
  assert.match(character, /@keyframes mouth-expression/);
  assert.match(character, /prefers-reduced-motion:reduce/);
  assert.match(fs.readFileSync("robots.txt", "utf8"), /User-agent: Yeti[\s\S]*Allow: \//);
  assert.match(fs.readFileSync("sitemap.xml", "utf8"), /<lastmod>2026-09-03<\/lastmod>/);
  assert.match(fs.readFileSync("ads.txt", "utf8"), /^google\.com, pub-3062467800658496, DIRECT, f08c47fec0942fa0\s*$/);
  assert.equal(fs.existsSync("a75c6419caef4302bc7c045bc45b49ed.txt"), true);
  assert.equal(fs.existsSync("aws/cloudfront-url-rewrite.js"), true);
  assert.equal(fs.existsSync("google-apps-script/visitor-counter.gs"), true);
  assert.equal(fs.existsSync(".github/workflows/deploy-s3.yml"), true);
  const deployWorkflow = fs.readFileSync(".github/workflows/deploy-s3.yml", "utf8");
  assert.match(deployWorkflow, /aws s3 cp favicon\.ico/);
  assert.match(deployWorkflow, /aws s3 cp favicon-48x48\.png/);

  const aiConverter = fs.readFileSync("static/ai-converter.js", "utf8");
  const aiWorker = fs.readFileSync("static/functiongemma-worker.js", "utf8");
  assert.match(aiWorker, /dtype: "q4"/);
  assert.match(aiWorker, /max_new_tokens: 32/);
  assert.match(aiWorker, /<start_function_declaration>declaration:/);
  assert.match(aiWorker, /<start_of_turn>model\\n/);
  assert.doesNotMatch(aiWorker, /<start_function_call>call:`/);
  assert.doesNotMatch(aiWorker, /q4f16/);
  assert.match(aiWorker, /MODEL_ID = "browsertools-functiongemma-270m-v3"/);
  assert.match(aiWorker, /env\.localModelPath = "\/models\/"/);
  assert.match(aiWorker, /env\.allowRemoteModels = false/);
  assert.match(aiConverter, /submitButton\.disabled = false/);
  assert.match(aiConverter, /decision \? hints\[decision\.tool\] : null/);
  assert.match(aiConverter, /AI 분류 시간이 초과되었습니다/);
  assert.equal(fs.existsSync("scripts/rebuild_q4f16.py"), false);
  assert.match(deployWorkflow, /Prepare self-hosted FunctionGemma model/);
  assert.match(deployWorkflow, /model_q4\.onnx/);
  assert.doesNotMatch(deployWorkflow, /rebuild_q4f16/);

  const counterScript = fs.readFileSync("static/visitor-counter.js", "utf8");
  assert.match(counterScript, /visitor-counter__brand">woonhae</);
  assert.match(counterScript, />Today <strong data-visitor-today>/);
  assert.match(counterScript, />Total <strong data-visitor-total>/);
  assert.doesNotMatch(counterScript, /footer\.hidden = true/);
});

test("CloudFront가 폴더형 주소를 정적 HTML로 연결한다", () => {
  const cloudfront = {};
  vm.createContext(cloudfront);
  vm.runInContext(fs.readFileSync("aws/cloudfront-url-rewrite.js", "utf8"), cloudfront);
  assert.equal(cloudfront.handler({request: {uri: "/"}}).uri, "/index.html");
  assert.equal(cloudfront.handler({request: {uri: "/tools/currency/"}}).uri, "/tools/currency/index.html");
  assert.equal(cloudfront.handler({request: {uri: "/static/app.js"}}).uri, "/static/app.js");
});
