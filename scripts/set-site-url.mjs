import fs from "node:fs";
import path from "node:path";

const requested = process.argv[2];
if (!requested) {
  console.error("사용법: node scripts/set-site-url.mjs https://www.example.kr");
  process.exit(1);
}

let siteUrl;
try {
  const parsed = new URL(requested);
  if (!["http:", "https:"].includes(parsed.protocol)) throw new Error("protocol");
  siteUrl = parsed.origin;
} catch (_) {
  console.error("http:// 또는 https://로 시작하는 올바른 주소를 입력해 주세요.");
  process.exit(1);
}

const root = process.cwd();
const files = [
  "README.md",
  "index.html",
  "robots.txt",
  "sitemap.xml",
  path.join(".github", "workflows", "deploy-s3.yml"),
  path.join("google-apps-script", "visitor-counter.gs"),
  path.join("static", "visitor-counter-config.js"),
  path.join("static", "visitor-counter.js"),
  ...fs.readdirSync(path.join(root, "tools"), {withFileTypes: true})
    .filter(entry => entry.isDirectory())
    .map(entry => path.join("tools", entry.name, "index.html")),
];

for (const relative of files) {
  const file = path.join(root, relative);
  const content = fs.readFileSync(file, "utf8")
    .replaceAll("https://example.com", siteUrl);
  fs.writeFileSync(file, content, "utf8");
}

console.log(`${files.length}개 파일의 운영 주소를 ${siteUrl}(으)로 변경했습니다.`);
