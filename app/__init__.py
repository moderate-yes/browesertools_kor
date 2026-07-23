import os

from flask import Flask


def create_app(test_config=None):
    app = Flask(__name__)
    app.config.from_mapping(
        JSON_AS_ASCII=False,
        MAX_CONTENT_LENGTH=1 * 1024 * 1024,
        SITE_URL=os.environ.get("SITE_URL", ""),
        GOOGLE_SITE_VERIFICATION=os.environ.get("GOOGLE_SITE_VERIFICATION", ""),
        NAVER_SITE_VERIFICATION=os.environ.get("NAVER_SITE_VERIFICATION", ""),
    )

    if test_config:
        app.config.update(test_config)

    from .routes import bp

    app.register_blueprint(bp)
    return app
