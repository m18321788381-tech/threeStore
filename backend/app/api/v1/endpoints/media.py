"""媒体上传：白名单校验 + 随机文件名 + 落盘媒体卷。"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import (
    APIRouter,
    Depends,
    File,
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
from app.schemas import ok, paginate

router = APIRouter(prefix="/media", tags=["media"])

ALLOWED_MIME = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
}
MAX_BYTES = settings.MAX_UPLOAD_MB * 1024 * 1024


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
            "mime_type": m.mime_type,
            "size": m.size,
            "created_at": m.created_at,
        }
        for m in rows
    ]
    return ok(paginate(items, total, page, page_size))


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload(
    file: UploadFile = File(...),
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

    data = await file.read()
    if len(data) > MAX_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"文件超过 {settings.MAX_UPLOAD_MB}MB 上限",
        )
    if not data:
        raise HTTPException(status_code=400, detail="空文件")

    # 2) 魔数二次校验（防伪造 Content-Type）
    if ext == ".png" and not data.startswith(b"\x89PNG"):
        raise HTTPException(status_code=400, detail="文件内容与类型不符")
    if ext == ".jpg" and not data.startswith(b"\xff\xd8\xff"):
        raise HTTPException(status_code=400, detail="文件内容与类型不符")
    if ext == ".gif" and data[:6] not in (b"GIF87a", b"GIF89a"):
        raise HTTPException(status_code=400, detail="文件内容与类型不符")

    # 3) 随机文件名，避免路径穿越与覆盖
    root = Path(settings.MEDIA_ROOT)
    root.mkdir(parents=True, exist_ok=True)
    filename = f"{uuid.uuid4().hex}{ext}"
    (root / filename).write_bytes(data)

    media = Media(
        filename=filename,
        url=f"{settings.MEDIA_URL.rstrip('/')}/{filename}",
        mime_type=file.content_type or "",
        size=len(data),
        uploader_id=admin.id,
    )
    session.add(media)
    await session.commit()

    return ok(
        {
            "id": str(media.id),
            "url": media.url,
            "filename": filename,
            "size": media.size,
        },
        message="上传成功",
    )


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

    path = Path(settings.MEDIA_ROOT) / media.filename
    if path.exists() and path.is_file():
        path.unlink()
    await session.delete(media)
    await session.commit()
    return ok({"id": media_id}, message="已删除")


__all__ = ["router"]
