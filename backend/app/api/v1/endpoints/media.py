"""媒体上传：MIME 白名单 + 真类型校验 + 随机文件名 + 落盘媒体卷。

安全要点（曾出现过「恶意 SVG 造成同源存储型 XSS」）：
1. **不信任 Content-Type**：位图一律用 Pillow 真实解码并比对解码出的格式，
   仅比对文件头会被「PNG 头 + 脚本内容」的 polyglot 文件绕过。
2. **SVG 默认禁用**：SVG 是 XML，可内嵌脚本。确需开启时强制 XML 净化，
   剔除 script / foreignObject / 事件属性 / 外部引用，并做二次断言。
3. **随机文件名**：杜绝路径穿越与覆盖。
4. **响应侧加固**：由 Nginx 为 /media/ 下发 `nosniff` 与沙箱 CSP（见 nginx/default.conf）。

元数据完整性（2026-09-11 修复）：
   width / height 列早已存在却从未被写入，恒为 0 —— 前端无法输出尺寸属性，
   图片加载不预留占位空间，直接产生 CLS（布局偏移）。现在于解码时顺手采集
   （`Image.open` 已经打开过一次，取 `img.size` 零额外成本）。
   content_hash 用于同图不重复落盘；物理文件的生命周期由删除端的引用计数守卫负责。
"""
from __future__ import annotations

import hashlib
import io
import re
import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    HTTPException,
    Query,
    UploadFile,
    status,
)
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin
from app.core.config import settings
from app.db.session import get_db
from app.models.media import Media
from app.schemas import MediaUpdate, ok, paginate

router = APIRouter(prefix="/media", tags=["media"])

ALLOWED_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/avif": ".avif",
    "image/svg+xml": ".svg",
}

# Pillow 解码出的格式 → 期望的扩展名，用于识别「声明类型 ≠ 真实类型」
_PIL_FORMAT_TO_EXT = {
    "JPEG": ".jpg",
    "PNG": ".png",
    "GIF": ".gif",
    "WEBP": ".webp",
    "AVIF": ".avif",
}

# 文件头兜底校验（Pillow 不可用或 AVIF 无解码器时使用）
_MAGIC_PREFIX = {
    ".png": b"\x89PNG\r\n\x1a\n",
    ".jpg": b"\xff\xd8\xff",
    ".gif": (b"GIF87a", b"GIF89a"),
    ".webp": b"RIFF",
    ".avif": b"ftyp",
}

# ---- SVG 净化白名单 -------------------------------------------------------
_SVG_ALLOWED_TAGS = {
    "svg", "g", "defs", "symbol", "title", "desc", "metadata",
    "path", "circle", "ellipse", "rect", "line", "polyline", "polygon",
    "text", "tspan", "textpath", "marker",
    "lineargradient", "radialgradient", "stop",
    "clippath", "mask", "pattern", "style", "switch", "view",
}
_SVG_FORBIDDEN_TAGS = {
    "script", "foreignobject", "iframe", "embed", "object", "audio", "video",
    "animate", "animatemotion", "animatetransform", "set", "handler",
    "listener", "image",  # <image> 可带外部 href，按需禁止
}
# 危险属性：事件处理器、外部/脚本协议引用
_SVG_DANGEROUS_ATTR = re.compile(r"^on", re.I)
_SVG_URL_VALUE = re.compile(r"url\s*\(|javascript:|data:\s*(?:text|image/svg)", re.I)
MAX_BYTES = settings.MAX_UPLOAD_MB * 1024 * 1024


def _verify_magic(data: bytes, ext: str) -> None:
    """文件头兜底校验（Pillow 不可用时的退化方案）。"""
    expect = _MAGIC_PREFIX.get(ext)
    if expect is None:
        return
    if ext == ".gif":
        if not any(data.startswith(sig) for sig in expect):  # type: ignore[union-attr]
            raise HTTPException(status_code=400, detail="文件内容与类型不符")
        return
    if ext == ".webp":
        if not data.startswith(b"RIFF") or data[8:12] != b"WEBP":
            raise HTTPException(status_code=400, detail="文件内容与类型不符")
        return
    if ext == ".avif":
        if data[4:8] != b"ftyp":
            raise HTTPException(status_code=400, detail="文件内容与类型不符")
        return
    if not data.startswith(expect):  # type: ignore[arg-type]
        raise HTTPException(status_code=400, detail="文件内容与类型不符")


def _verify_image_content(data: bytes, ext: str) -> tuple[int, int]:
    """位图真校验：Pillow 解码 + 解码格式比对，返回 (width, height)。

    只比对文件头会被 polyglot（合法头 + 恶意载荷）绕过，
    因此这里要求整个文件能被完整解码，且解码出的格式与声明一致。

    尺寸顺手取自同一个 Image 对象：`img.size` 在 `Image.open` 阶段就由插件解析好了，
    不需要重复解码。拿不到时返回 (0, 0)（例如 AVIF 缺少解码器）。
    """
    try:
        from PIL import Image  # 延迟导入：未安装时退化为文件头校验
    except ImportError:  # pragma: no cover
        _verify_magic(data, ext)
        return (0, 0)

    try:
        with Image.open(io.BytesIO(data)) as img:
            # 先取 size 再 verify —— verify() 之后对象即不可再使用
            width, height = img.size
            img.verify()
            real_format = (img.format or "").upper()
    except Exception:
        raise HTTPException(
            status_code=400, detail="文件内容与声明类型不符，或文件已损坏"
        )

    # AVIF 需 Pillow ≥ 11.3 或额外解码器；识别不出时退回文件头校验，避免误杀
    if ext == ".avif" and real_format == "":
        _verify_magic(data, ext)
        return (int(width), int(height))

    expected_ext = _PIL_FORMAT_TO_EXT.get(real_format)
    if expected_ext and expected_ext != ext:
        raise HTTPException(
            status_code=400,
            detail=f"文件真实类型为 {real_format}，与声明的 {ext.lstrip('.')} 不一致",
        )
    # Pillow 能解但不在映射表内（如 BMP/ICO 伪装成白名单类型）同样拒绝
    if expected_ext is None and real_format not in ("", "AVIF"):
        raise HTTPException(
            status_code=400, detail=f"不支持的图片格式：{real_format}"
        )
    return (int(width), int(height))


def _sanitize_svg(data: bytes) -> bytes:
    """SVG 净化：剔除脚本、事件属性与外部引用，返回安全的 SVG 字节。"""
    try:
        import defusedxml.ElementTree as DET  # type: ignore[import-not-found]
        from xml.etree import ElementTree as ET
    except ImportError:  # pragma: no cover
        raise HTTPException(
            status_code=500, detail="SVG 净化组件缺失，请联系管理员安装 defusedxml"
        )

    if len(data) > 512 * 1024:
        raise HTTPException(status_code=400, detail="SVG 文件过大")

    try:
        root = DET.fromstring(data)
    except Exception:
        raise HTTPException(status_code=400, detail="SVG 解析失败，文件可能已损坏")

    def local(tag: str) -> str:
        return tag.split("}")[-1].lower()

    # 1) 移除黑名单元素（script / foreignObject / 外部资源等）与非白名单元素。
    #    保留其余合法图形，让「带一段恶意代码的正常图标」也能安全入库。
    parent_map = {child: parent for parent in root.iter() for child in parent}
    for el in list(root.iter()):
        tag = local(el.tag)
        if not isinstance(el.tag, str):  # 注释 / PI 节点
            continue
        if tag in _SVG_ALLOWED_TAGS:
            continue
        parent = parent_map.get(el)
        if parent is None:
            # 根元素本身就不合法，没有净化价值，直接拒绝
            raise HTTPException(
                status_code=400, detail=f"SVG 根元素不被允许：<{tag}>"
            )
        parent.remove(el)

    # 2) 清洗属性：事件处理器、外部/脚本协议引用
    for el in root.iter():
        for attr in list(el.attrib):
            name = attr.split("}")[-1].lower()
            value = el.attrib.get(attr, "")
            if _SVG_DANGEROUS_ATTR.match(name):
                del el.attrib[attr]
                continue
            if name in {"href", "xlink:href", "src", "from", "to", "values"}:
                # 仅允许同文档内的 #id 引用
                if not value.strip().startswith("#"):
                    del el.attrib[attr]
                    continue
            if _SVG_URL_VALUE.search(value):
                del el.attrib[attr]

    # 序列化前注册默认命名空间，避免输出 ns0:circle 这类带前缀的标签
    for prefix, uri in (
        ("", "http://www.w3.org/2000/svg"),
        ("xlink", "http://www.w3.org/1999/xlink"),
    ):
        try:
            ET.register_namespace(prefix, uri)
        except ValueError:
            pass

    safe = ET.tostring(root, encoding="utf-8")

    # 3) 二次断言：净化结果不得残留任何可执行特征
    text = safe.decode("utf-8", errors="ignore").lower()
    for danger in ("<script", "javascript:", "onload", "onerror", "foreignobject", "<iframe"):
        if danger in text:
            raise HTTPException(status_code=400, detail="SVG 含不安全内容，已被拒绝")
    return safe


@router.get("")
async def list_media(
    page: int = Query(1, ge=1),
    page_size: int = Query(24, ge=1, le=100),
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    total = (await session.execute(select(func.count(Media.id)))).scalar_one()
    rows = (
        await session.execute(
            select(Media)
            .order_by(Media.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
    ).scalars().all()
    items = [
        {
            "id": str(m.id),
            "filename": m.filename,
            "url": m.url,
            "alt": m.alt or "",
            "mime_type": m.mime_type,
            "size": m.size,
            "width": m.width or 0,
            "height": m.height or 0,
            "created_at": m.created_at,
        }
        for m in rows
    ]
    return ok(paginate(items, total, page, page_size))


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload(
    file: UploadFile = File(...),
    alt: str = Form("", max_length=255, description="图片替代文本（可选）"),
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    # 1) MIME 白名单
    ext = ALLOWED_MIME.get((file.content_type or "").lower())
    if ext is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"仅支持图片：{', '.join(ALLOWED_MIME)}",
        )

    # SVG 默认禁用：它是 XML，可直接承载脚本
    if ext == ".svg" and not settings.ALLOW_SVG_UPLOAD:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="SVG 上传已禁用（存在存储型 XSS 风险）；"
            "确需使用请设置 ALLOW_SVG_UPLOAD=true，系统将强制净化",
        )

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"文件超过 {settings.MAX_UPLOAD_MB}MB 上限",
        )
    if not data:
        raise HTTPException(status_code=400, detail="空文件")

    # 2) 内容真校验：SVG 走 XML 净化，其余位图走 Pillow 解码 + 格式比对并取尺寸
    width = height = 0
    if ext == ".svg":
        data = _sanitize_svg(data)
        # SVG 的显示尺寸由 viewBox 与 CSS 共同决定，没有唯一的像素尺寸，
        # 因此不采集（前端对 SVG 不做 CLS 占位，由容器样式兜底）。
    else:
        width, height = _verify_image_content(data, ext)

    root = Path(settings.MEDIA_ROOT)
    root.mkdir(parents=True, exist_ok=True)

    # 3) 同图不重复落盘：命中已有记录则复用其物理文件，但仍建**独立记录**。
    #    独立记录才能各自归属、各自删除；共享文件的安全性由 delete_media 的
    #    引用计数守卫保证（最后一条引用消失时才 unlink）。
    digest = hashlib.sha256(data).hexdigest()
    reused = (
        await session.execute(
            select(Media)
            .where(Media.content_hash == digest, Media.content_hash != "")
            .limit(1)
        )
    ).scalar_one_or_none()

    if reused is not None and (root / reused.filename).is_file():
        filename = reused.filename
        url = reused.url
        deduped = True
    else:
        # 随机文件名，避免路径穿越与覆盖
        filename = f"{uuid.uuid4().hex}{ext}"
        (root / filename).write_bytes(data)
        url = f"{settings.MEDIA_URL.rstrip('/')}/{filename}"
        deduped = False

    media = Media(
        filename=filename,
        url=url,
        alt=alt.strip()[:255],
        mime_type=file.content_type or "",
        size=len(data),
        width=width,
        height=height,
        content_hash=digest,
        uploader_id=admin.id,
    )
    session.add(media)
    await session.commit()

    return ok(
        {
            "id": str(media.id),
            "url": media.url,
            "filename": filename,
            "alt": media.alt,
            "size": media.size,
            "width": media.width,
            "height": media.height,
            "deduped": deduped,
        },
        message="已存在相同图片，复用已有文件" if deduped else "上传成功",
    )


@router.patch("/{media_id}")
async def update_media(
    media_id: str,
    payload: MediaUpdate,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    """更新媒体元数据（当前仅 alt）。

    alt 之所以要存在媒体记录上：同一张图可能被多篇文章引用，
    在媒体库里维护一次，编辑器插入图片时即可作为默认替代文本回填，
    不必每次手写 —— 这是媒体 alt 的真实读取路径。
    """
    try:
        media = await session.get(Media, uuid.UUID(media_id))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=400, detail="非法 ID")
    if media is None:
        raise HTTPException(status_code=404, detail="文件不存在")

    if payload.alt is not None:
        media.alt = payload.alt.strip()[:255]
    await session.commit()
    return ok({"id": media_id, "alt": media.alt}, message="已更新")


@router.delete("/{media_id}")
async def delete_media(
    media_id: str,
    session: AsyncSession = Depends(get_db),
    admin=Depends(get_current_admin),
):
    try:
        media = await session.get(Media, uuid.UUID(media_id))
    except (ValueError, AttributeError, TypeError):
        raise HTTPException(status_code=400, detail="非法 ID")
    if media is None:
        raise HTTPException(status_code=404, detail="文件不存在")

    # 引用计数守卫：相同图片只落盘一次，因此同一物理文件可能被多条记录共用。
    # 删掉其中一条就把文件 unlink 掉，会连带弄坏其余仍在使用该文件的记录，
    # 只有确认没有其他记录引用时才真正删除物理文件。
    others = (
        await session.execute(
            select(func.count(Media.id)).where(
                Media.filename == media.filename, Media.id != media.id
            )
        )
    ).scalar_one()
    if (others or 0) == 0:
        path = Path(settings.MEDIA_ROOT) / media.filename
        if path.exists() and path.is_file():
            path.unlink()

    await session.delete(media)
    await session.commit()
    return ok({"id": media_id}, message="已删除")


__all__ = ["router"]
