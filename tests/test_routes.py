import unittest

from app import create_app


class RouteTests(unittest.TestCase):
    def setUp(self):
        app = create_app({"TESTING": True})
        self.client = app.test_client()

    def test_index(self):
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn('data-tool="english-number"', response.get_data(as_text=True))
        self.assertNotIn('<footer class="site-footer">', response.get_data(as_text=True))

    def test_each_tool_has_its_own_page(self):
        slugs = ["currency", "unit", "margin", "character-count", "clean-list", "ai-converter", "info"]
        for slug in slugs:
            with self.subTest(slug=slug):
                response = self.client.get(f"/tools/{slug}")
                self.assertEqual(response.status_code, 200)
                if slug == "ai-converter":
                    marker = "data-auto-convert"
                elif slug == "info":
                    marker = 'class="info-panel"'
                else:
                    marker = f'data-tool="{slug}"'
                self.assertIn(marker, response.get_data(as_text=True))

    def test_english_number_duplicate_redirects_to_canonical_home(self):
        response = self.client.get("/tools/english-number")
        self.assertEqual(response.status_code, 301)
        self.assertEqual(response.headers["Location"], "/")

    def test_pages_have_unique_search_metadata_and_one_h1(self):
        pages = ["/", "/tools/currency", "/tools/unit", "/tools/margin", "/tools/character-count", "/tools/clean-list", "/tools/ai-converter", "/tools/info"]
        titles = set()
        descriptions = set()
        for path in pages:
            with self.subTest(path=path):
                html = self.client.get(path).get_data(as_text=True)
                self.assertEqual(html.count("<title>"), 1)
                self.assertEqual(html.count("<h1"), 1)
                self.assertIn('<meta name="robots" content="index,follow', html)
                self.assertIn('<link rel="canonical" href="http://localhost', html)
                self.assertIn('type="application/ld+json"', html)
                title = html.split("<title>", 1)[1].split("</title>", 1)[0]
                description = html.split('<meta name="description" content="', 1)[1].split('">', 1)[0]
                self.assertNotIn(title, titles)
                self.assertNotIn(description, descriptions)
                titles.add(title)
                descriptions.add(description)

    def test_robots_and_sitemap_are_search_engine_ready(self):
        robots = self.client.get("/robots.txt")
        self.assertEqual(robots.status_code, 200)
        self.assertTrue(robots.content_type.startswith("text/plain"))
        robots_text = robots.get_data(as_text=True)
        self.assertIn("User-agent: *\nAllow: /", robots_text)
        self.assertIn("Disallow: /api/", robots_text)
        self.assertIn("Sitemap: http://localhost/sitemap.xml", robots_text)

        sitemap = self.client.get("/sitemap.xml")
        self.assertEqual(sitemap.status_code, 200)
        self.assertTrue(sitemap.content_type.startswith("application/xml"))
        xml = sitemap.get_data(as_text=True)
        self.assertEqual(xml.count("<url>"), 8)
        self.assertIn("<loc>http://localhost/</loc>", xml)
        self.assertIn("<loc>http://localhost/tools/info</loc>", xml)
        self.assertNotIn("/tools/english-number", xml)

    def test_search_verification_meta_can_be_configured(self):
        app = create_app({
            "TESTING": True,
            "GOOGLE_SITE_VERIFICATION": "google-token",
            "NAVER_SITE_VERIFICATION": "naver-token",
        })
        html = app.test_client().get("/").get_data(as_text=True)
        self.assertIn('name="google-site-verification" content="google-token"', html)
        self.assertIn('name="naver-site-verification" content="naver-token"', html)

    def test_menu_order_has_no_numeric_prefixes(self):
        page = self.client.get("/").get_data(as_text=True)
        titles = ["영문 숫자 변환", "원화 · 달러 환산", "생활 단위 변환", "할인 · 마진 계산", "글자 수 세기", "명단 정리", "AI 자동 변환", "INFO"]
        positions = [page.index(title) for title in titles]
        self.assertEqual(positions, sorted(positions))
        self.assertNotIn(">01<", page)
        self.assertNotIn(">02<", page)

    def test_ai_converter_uses_local_functiongemma_worker(self):
        page = self.client.get("/tools/ai-converter").get_data(as_text=True)
        with self.client.get("/static/ai-converter.js") as response:
            converter = response.get_data(as_text=True)
        with self.client.get("/static/functiongemma-worker.js") as response:
            worker = response.get_data(as_text=True)

        self.assertIn('maxlength="30"', page)
        self.assertIn('class="submit-button" type="submit" disabled', page)
        self.assertIn("functiongemma-worker.js", converter)
        self.assertIn("new Worker", converter)
        self.assertIn("function classify(text)", converter)
        self.assertIn('janyty/browsertools-functiongemma-270m-ONNX', worker)
        self.assertIn('dtype: "q4"', worker)
        self.assertIn("buildPrompt", worker)
        self.assertIn("max_new_tokens: 6", worker)

    def test_ai_converter_describes_functiongemma_training_honestly(self):
        page = self.client.get("/tools/ai-converter").get_data(as_text=True)
        self.assertIn("3,305", page)
        self.assertIn("FunctionGemma 270M", page)
        self.assertIn("336", page)
        self.assertIn("ONNX q4", page)
        self.assertIn("최신 테스트 결과", page)
        self.assertIn("94 / 94", page)
        self.assertIn("26 / 26", page)
        self.assertIn("187 / 187", page)
        self.assertIn("16 / 16", page)
        self.assertIn("13 / 13", page)
        self.assertIn("2026.07.23", page)
        self.assertEqual(page.count("data-eval-example"), 30)
        self.assertIn("0.5 thousand 한국식으로", page)
        self.assertIn("원빌리언 달러를 원화로 바꿔줘", page)
        self.assertIn("request_clarification", page)
        self.assertIn("unsupported_request", page)
        self.assertNotIn("FINAL PIPELINE", page)
        self.assertNotIn("입력 한 줄이 결과가 되기까지", page)
        self.assertIn("100%여도 불안한 부분", page)
        self.assertIn("함수 선택만 평가", page)
        self.assertIn("브라우저용 q4 양자화", page)

    def test_unknown_tool_page_returns_404(self):
        self.assertEqual(self.client.get("/tools/not-a-tool").status_code, 404)
        self.assertEqual(self.client.get("/tools/korean-amount").status_code, 404)
        self.assertEqual(self.client.post("/api/korean-amount", json={"value": "1000"}).status_code, 404)
        self.assertEqual(self.client.get("/tools/mask").status_code, 404)
        self.assertEqual(self.client.post("/api/mask", json={"text": "010-1234-5678"}).status_code, 404)

    def test_api_success(self):
        response = self.client.post("/api/english-number", json={"value": "1 billion"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["result"]["korean"], "10억")

    def test_number_and_currency_pages_show_korean_examples(self):
        number_page = self.client.get("/").get_data(as_text=True)
        currency_page = self.client.get("/tools/currency").get_data(as_text=True)
        self.assertIn('data-example="1빌리언"', number_page)
        self.assertNotIn('id="number-direction"', number_page)
        self.assertIn('data-example="원빌리언 달러"', currency_page)
        self.assertNotIn('id="currency-direction"', currency_page)

    def test_auto_convert_api(self):
        response = self.client.post("/api/auto-convert", json={"text": "삼십사평"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.get_json()["result"]["primary"], "112.3967 ㎡")

    def test_api_validation_error(self):
        response = self.client.post("/api/unit", json={"value": "abc", "conversion": "pyeong_to_sqm"})
        self.assertEqual(response.status_code, 400)
        self.assertFalse(response.get_json()["ok"])

    def test_api_requires_json(self):
        response = self.client.post("/api/clean-list", data="김하나")
        self.assertEqual(response.status_code, 415)

    def test_unknown_tool(self):
        response = self.client.post("/api/nope", json={})
        self.assertEqual(response.status_code, 404)


if __name__ == "__main__":
    unittest.main()
