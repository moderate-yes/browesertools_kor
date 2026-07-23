from flask import Blueprint, Response, abort, current_app, jsonify, redirect, render_template, request, url_for

from .tools import (
    InputError,
    calculate_currency,
    calculate_margin,
    clean_list,
    count_text,
    convert_number_units,
    convert_unit,
    automatic_conversion,
)

bp = Blueprint("main", __name__)

TOOLS = [
    {"slug": "english-number", "title": "영문 숫자 변환", "short": "1 billion을 10억으로", "description": "million, billion 같은 영문 단위를 익숙한 한국식 숫자로 바꿉니다.", "color": "yellow", "symbol": "B→억"},
    {"slug": "currency", "title": "원화 · 달러 환산", "short": "최신 기준환율로 양방향 계산", "description": "최신 영업일 기준환율로 원화와 미국 달러를 서로 환산합니다.", "color": "orange", "symbol": "$₩"},
    {"slug": "unit", "title": "생활 단위 변환", "short": "평, ㎡부터 해외 단위까지", "description": "평과 제곱미터, 길이, 무게, 거리, 온도를 빠르고 정확하게 변환합니다.", "color": "blue", "symbol": "↔"},
    {"slug": "margin", "title": "할인 · 마진 계산", "short": "팔수록 얼마가 남을까", "description": "할인, 원가, 수수료와 배송비를 반영한 실제 이익과 마진율을 계산합니다.", "color": "red", "symbol": "%"},
    {"slug": "character-count", "title": "글자 수 세기", "short": "글자와 바이트를 한눈에", "description": "공백 포함·제외 글자 수와 단어, 줄, 바이트를 계산합니다.", "color": "purple", "symbol": "Aa"},
    {"slug": "clean-list", "title": "명단 정리", "short": "중복은 빼고 깔끔하게", "description": "여러 형식으로 붙여 넣은 명단을 정돈하고 중복 항목을 제거합니다.", "color": "green", "symbol": "≡"},
    {"slug": "ai-converter", "title": "AI 자동 변환", "short": "말하듯 쓰면 알아서 변환", "description": "가벼운 브라우저 AI가 입력 의도를 파악해 알맞은 변환을 선택합니다.", "color": "pink", "symbol": "AI"},
    {"slug": "info", "title": "INFO", "short": "서비스 이용 안내", "description": "단숨의 처리 방식과 이용 정보를 확인합니다.", "color": "sand", "symbol": "i"},
]

SEO = {
    "english-number": {
        "title": "영문 숫자 변환기 | billion·억 단위 변환 — 단숨",
        "description": "million·billion 같은 영어 숫자 단위를 만·억·조로, 한국식 숫자 단위를 영어식으로 무료 변환합니다.",
    },
    "currency": {
        "title": "원화 달러 환율 계산기 | USD·KRW 환산 — 단숨",
        "description": "최신 영업일 기준환율로 미국 달러와 원화를 양방향 환산하는 무료 환율 계산기입니다.",
    },
    "unit": {
        "title": "생활 단위 변환기 | 평·㎡·cm·inch·kg — 단숨",
        "description": "평과 제곱미터, 센티미터와 인치, 무게·거리·온도 등 생활 단위를 한국어 입력으로 변환합니다.",
    },
    "margin": {
        "title": "할인 마진 계산기 | 수수료·순이익 계산 — 단숨",
        "description": "판매가, 원가, 할인, 수수료와 배송비를 반영해 실제 순이익과 마진율을 계산합니다.",
    },
    "character-count": {
        "title": "글자 수 세기 | 공백·단어·바이트 계산 — 단숨",
        "description": "공백 포함·제외 글자 수, 단어 수, 줄 수와 UTF-8 바이트를 브라우저에서 빠르게 계산합니다.",
    },
    "clean-list": {
        "title": "명단 정리 | 중복 제거·목록 정돈 — 단숨",
        "description": "줄바꿈·쉼표로 입력한 명단을 정리하고 공백과 대소문자 차이를 고려해 중복 항목을 제거합니다.",
    },
    "ai-converter": {
        "title": "AI 자동 변환 | 숫자·단위·환율 한 번에 — 단숨",
        "description": "1센치를 미터로, 100달러, 삼십사평처럼 입력하면 의도를 분류해 알맞은 변환을 실행합니다.",
    },
    "info": {
        "title": "단숨 서비스 안내 | 개인정보·환율·AI 처리 방식",
        "description": "단숨의 개인정보 처리, 환율 기준과 브라우저 AI 변환 방식을 확인할 수 있습니다.",
    },
}


def _site_base():
    configured = current_app.config.get("SITE_URL", "").strip().rstrip("/")
    return configured or request.url_root.rstrip("/")


def _tool_path(tool):
    if tool["slug"] == "english-number":
        return url_for("main.index")
    return url_for("main.tool_page", slug=tool["slug"])


def _page_context(tool):
    base_url = _site_base()
    canonical_url = f"{base_url}{_tool_path(tool)}"
    seo = SEO[tool["slug"]]
    page_type = "WebPage" if tool["slug"] == "info" else "WebApplication"
    page_schema = {
        "@type": page_type,
        "@id": f"{canonical_url}#page",
        "url": canonical_url,
        "name": seo["title"],
        "description": seo["description"],
        "inLanguage": "ko-KR",
        "isPartOf": {"@id": f"{base_url}/#website"},
    }
    if page_type == "WebApplication":
        page_schema.update({
            "applicationCategory": "UtilitiesApplication",
            "operatingSystem": "Any",
            "offers": {"@type": "Offer", "price": "0", "priceCurrency": "KRW"},
        })
    schema = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebSite",
                "@id": f"{base_url}/#website",
                "url": f"{base_url}/",
                "name": "단숨",
                "alternateName": "DANSUM",
                "inLanguage": "ko-KR",
            },
            page_schema,
        ],
    }
    return {
        "tool": tool,
        "tools": TOOLS,
        "seo": seo,
        "canonical_url": canonical_url,
        "schema": schema,
    }


@bp.get("/")
def index():
    tool = TOOLS[0]
    return render_template("tool.html", **_page_context(tool))


@bp.get("/tools/<slug>")
def tool_page(slug):
    if slug == "english-number":
        return redirect(url_for("main.index"), code=301)
    tool = next((item for item in TOOLS if item["slug"] == slug), None)
    if tool is None:
        abort(404)
    return render_template("tool.html", **_page_context(tool))


@bp.get("/robots.txt")
def robots_txt():
    content = f"User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: {_site_base()}/sitemap.xml\n"
    return Response(content, mimetype="text/plain")


@bp.get("/sitemap.xml")
def sitemap_xml():
    base_url = _site_base()
    urls = [f"{base_url}/"] + [
        f"{base_url}{_tool_path(tool)}" for tool in TOOLS if tool["slug"] != "english-number"
    ]
    return Response(
        render_template("sitemap.xml", urls=urls),
        mimetype="application/xml",
    )


@bp.post("/api/<tool_name>")
def run_tool(tool_name):
    handlers = {
        "english-number": convert_number_units,
        "margin": calculate_margin,
        "unit": lambda data: convert_unit(data.get("value"), data.get("conversion")),
        "clean-list": lambda data: clean_list(data.get("text")),
        "character-count": lambda data: count_text(data.get("text")),
        "currency": calculate_currency,
        "auto-convert": lambda data: automatic_conversion(data.get("text"), data.get("hint")),
    }
    handler = handlers.get(tool_name)
    if not handler:
        return jsonify(ok=False, error="존재하지 않는 도구입니다."), 404
    if not request.is_json:
        return jsonify(ok=False, error="JSON 형식으로 요청해 주세요."), 415
    try:
        return jsonify(ok=True, result=handler(request.get_json(silent=True) or {}))
    except InputError as exc:
        return jsonify(ok=False, error=str(exc)), 400


@bp.app_errorhandler(413)
def too_large(_error):
    return jsonify(ok=False, error="요청 크기가 너무 큽니다."), 413


@bp.app_errorhandler(500)
def internal_error(_error):
    return jsonify(ok=False, error="처리 중 오류가 발생했습니다. 잠시 후 다시 시도해 주세요."), 500
