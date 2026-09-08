"""安全回归测试：覆盖本次修复的几个致命/高危缺陷，防止回退。

这些用例刻意不依赖数据库与外部服务，可在 CI 中秒级执行：
- 默认凭据 / 默认密钥必须被拒绝（生产模式）
- 登录失败计数必须能真正触发锁定
- SVG 必须被净化或拒绝，polyglot 图片必须被识别
"""
from __future__ import annotations

import io
import os
from unittest.mock import patch

import pytest
from fastapi import HTTPException

from app.core import rate_limit
from app.core.config import Settings


# ---------------------------------------------------------------------------
# BUG-01 / BUG-02：生产环境默认凭据 fail-fast
# ---------------------------------------------------------------------------


def _prod_env(**overrides) -> dict[str, str]:
    base = {
        "APP_ENV": "production",
        "SECRET_KEY": "a" * 64,
        "JWT_SECRET": "b" * 64,
        "ADMIN_PASSWORD": "Str0ng!Passw0rd#2026",
        "SITE_URL": "https://example.com",
    }
    base.update(overrides)
    return base


def test_production_rejects_default_secrets():
    """生产模式下沿用默认密钥必须启动失败。"""
    with patch.dict(os.environ, _prod_env(SECRET_KEY="change-me-in-production"), clear=True):
        with pytest.raises(Exception) as exc:
            Settings()
    assert "SECRET_KEY" in str(exc.value)


def test_production_rejects_default_jwt_secret():
    with patch.dict(os.environ, _prod_env(JWT_SECRET="change-me-jwt"), clear=True):
        with pytest.raises(Exception) as exc:
            Settings()
    assert "JWT_SECRET" in str(exc.value)


def test_production_rejects_default_admin_password():
    with patch.dict(os.environ, _prod_env(ADMIN_PASSWORD="admin12345"), clear=True):
        with pytest.raises(Exception) as exc:
            Settings()
    assert "ADMIN_PASSWORD" in str(exc.value)


def test_production_rejects_short_secret():
    with patch.dict(os.environ, _prod_env(SECRET_KEY="short"), clear=True):
        with pytest.raises(Exception) as exc:
            Settings()
    assert "长度不足" in str(exc.value)


def test_production_rejects_localhost_site_url():
    """SITE_URL 为 localhost 会让 RSS/Sitemap 全部失效，必须拦截。"""
    with patch.dict(os.environ, _prod_env(SITE_URL="http://localhost"), clear=True):
        with pytest.raises(Exception) as exc:
            Settings()
    assert "SITE_URL" in str(exc.value)


def test_production_rejects_identical_secrets():
    with patch.dict(os.environ, _prod_env(SECRET_KEY="c" * 64, JWT_SECRET="c" * 64), clear=True):
        with pytest.raises(Exception) as exc:
            Settings()
    assert "不得使用同一取值" in str(exc.value)


def test_development_allows_defaults():
    """开发模式不应被 fail-fast 拦住，否则本地跑不起来。"""
    with patch.dict(os.environ, {"APP_ENV": "development"}, clear=True):
        settings = Settings()
    assert settings.APP_ENV == "development"


def test_valid_production_config_passes():
    with patch.dict(os.environ, _prod_env(), clear=True):
        settings = Settings()
    assert settings.SITE_URL == "https://example.com"


# ---------------------------------------------------------------------------
# BUG-03：登录失败计数必须真正生效（此前调用了限流却丢弃返回值）
# ---------------------------------------------------------------------------


@pytest.mark.asyncio
async def test_rate_limit_blocks_after_limit():
    rate_limit.reset("test:login:fail")
    for _ in range(3):
        assert await rate_limit.ahit("test:login:fail", 3, 60) is True
    assert await rate_limit.ahit("test:login:fail", 3, 60) is False


@pytest.mark.asyncio
async def test_rate_limit_remaining_reflects_usage():
    rate_limit.reset("test:remaining")
    assert await rate_limit.aremaining("test:remaining", 3, 60) == 3
    await rate_limit.ahit("test:remaining", 3, 60)
    assert await rate_limit.aremaining("test:remaining", 3, 60) == 2


@pytest.mark.asyncio
async def test_rate_limit_reset_clears_counter():
    rate_limit.reset("test:reset")
    for _ in range(3):
        await rate_limit.ahit("test:reset", 3, 60)
    assert await rate_limit.aremaining("test:reset", 3, 60) == 0
    await rate_limit.areset("test:reset")
    assert await rate_limit.aremaining("test:reset", 3, 60) == 3


# ---------------------------------------------------------------------------
# BUG-04 / BUG-05：上传内容校验
# ---------------------------------------------------------------------------


def test_svg_sanitizer_strips_script_and_events():
    from app.api.v1.endpoints.media import _sanitize_svg

    evil = (
        b'<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)">'
        b"<script>alert(document.cookie)</script>"
        b'<a href="https://evil.com">x</a>'
        b'<circle cx="10" cy="10" r="5" fill="red"/>'
        b"</svg>"
    )
    out = _sanitize_svg(evil).decode().lower()
    assert "<script" not in out
    assert "onload" not in out
    assert "evil.com" not in out
    assert "<circle" in out  # 合法图形应保留


def test_svg_sanitizer_rejects_illegal_root():
    from app.api.v1.endpoints.media import _sanitize_svg

    with pytest.raises(HTTPException):
        _sanitize_svg(b"<html><body>x</body></html>")


def test_polyglot_image_rejected():
    """PNG 文件头 + 脚本载荷：只比对文件头会被绕过，必须被真解码拦截。"""
    pytest.importorskip("PIL")
    from app.api.v1.endpoints.media import _verify_image_content

    payload = b"\x89PNG\r\n\x1a\n" + b"<svg><script>alert(1)</script></svg>"
    with pytest.raises(HTTPException):
        _verify_image_content(payload, ".png")


def test_mismatched_real_format_rejected():
    pytest.importorskip("PIL")
    from PIL import Image

    from app.api.v1.endpoints.media import _verify_image_content

    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (0, 255, 0)).save(buf, format="JPEG")
    with pytest.raises(HTTPException):
        _verify_image_content(buf.getvalue(), ".png")


def test_valid_png_accepted():
    pytest.importorskip("PIL")
    from PIL import Image

    from app.api.v1.endpoints.media import _verify_image_content

    buf = io.BytesIO()
    Image.new("RGB", (8, 8), (255, 0, 0)).save(buf, format="PNG")
    _verify_image_content(buf.getvalue(), ".png")  # 不抛错即通过
