"""Private theme library. Shared skins contain colors only, never executable CSS/JS."""

import json
import re
from datetime import datetime, timezone
from typing import Literal
from urllib.parse import urlsplit
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy.orm import Session

from app.api.v1.campaign_settings import SettingsRoute
from app.core.deps import get_current_active_user
from app.database import get_db
from app.models import User, UserTheme
from app.schemas.platform import Pagination, PlatformError

router = APIRouter(
    route_class=SettingsRoute,
    responses={
        code: {"model": PlatformError} for code in (401, 403, 404, 409, 422, 502)
    },
)
MAX_THEME_BYTES = 32768
MAX_THEMES = 100
COLOR = r"^#[0-9a-fA-F]{6}$"


def luminance(color):
    channels = [int(color[index : index + 2], 16) / 255 for index in (1, 3, 5)]
    values = [
        v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in channels
    ]
    return sum(v * w for v, w in zip(values, (0.2126, 0.7152, 0.0722)))


def contrast(a, b):
    values = sorted([luminance(a), luminance(b)])
    return (values[1] + 0.05) / (values[0] + 0.05)


class Palette(BaseModel):
    model_config = ConfigDict(extra="forbid")
    canvas: str = Field(pattern=COLOR)
    panel: str = Field(pattern=COLOR)
    text: str = Field(pattern=COLOR)
    muted: str = Field(pattern=COLOR)
    accent: str = Field(pattern=COLOR)
    accentText: str = Field(pattern=COLOR)
    accentInk: str = Field(pattern=COLOR)
    border: str = Field(pattern=COLOR)

    @model_validator(mode="after")
    def readable(self):
        for foreground, background in [
            ("text", "canvas"),
            ("text", "panel"),
            ("muted", "canvas"),
            ("muted", "panel"),
            ("accentText", "accent"),
            ("accentInk", "panel"),
        ]:
            if contrast(getattr(self, foreground), getattr(self, background)) < 4.5:
                raise ValueError(
                    f"{foreground} and {background} need a contrast ratio of at least 4.5:1"
                )
        return self


class ThemeDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    version: Literal[1]
    name: str = Field(min_length=1, max_length=80, strict=True)
    light: Palette
    dark: Palette


class ThemeRecord(ThemeDocument):
    id: UUID
    githubUrl: str | None
    updatedAt: datetime


class ThemeResult(BaseModel):
    data: ThemeRecord


class ThemeList(BaseModel):
    data: list[ThemeRecord]
    pagination: Pagination


class GitHubImport(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    url: str = Field(max_length=1000, strict=True)

    @model_validator(mode="after")
    def github_only(self):
        parsed = urlsplit(self.url)
        if (
            parsed.scheme != "https"
            or parsed.netloc not in {"github.com", "raw.githubusercontent.com"}
            or parsed.query
            or parsed.fragment
        ):
            raise ValueError(
                "Use a public github.com file link or raw.githubusercontent.com URL without query parameters"
            )
        parts = parsed.path.strip("/").split("/")
        if parsed.netloc == "github.com":
            if len(parts) < 5 or parts[2] != "blob":
                raise ValueError("Use the GitHub link to a JSON file")
            parts = parts[:2] + parts[3:]
        if (
            len(parts) < 4
            or any(
                not re.fullmatch(r"[A-Za-z0-9_.-]+", part) or part in {".", ".."}
                for part in parts
            )
            or not parts[-1].endswith(".json")
        ):
            raise ValueError("Use a public GitHub JSON file URL")
        self.url = "https://raw.githubusercontent.com/" + "/".join(parts)
        return self


def payload(row):
    return {
        "id": row.id,
        **row.document,
        "githubUrl": row.github_url,
        "updatedAt": row.updated_at.astimezone(timezone.utc).isoformat(),
    }


def owned(db, user, theme_id):
    row = (
        db.query(UserTheme)
        .filter(UserTheme.id == str(theme_id), UserTheme.user_id == user.id)
        .first()
    )
    if row is None:
        raise HTTPException(404, "Theme not found")
    return row


def save_new(db, user, document, github_url=None):
    db.query(User).filter(User.id == user.id).with_for_update().one()
    if db.query(UserTheme).filter(UserTheme.user_id == user.id).count() >= MAX_THEMES:
        raise HTTPException(
            409, "Your theme library is full. Delete an unused theme first."
        )
    row = UserTheme(
        user_id=user.id, document=document.model_dump(), github_url=github_url
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return {"data": payload(row)}


async def fetch_theme(url):
    try:
        async with httpx.AsyncClient(
            timeout=15, follow_redirects=False, trust_env=False
        ) as client:
            async with client.stream(
                "GET", url, headers={"Accept": "application/json"}
            ) as response:
                if response.status_code != 200:
                    raise HTTPException(
                        502, "GitHub could not provide that public theme file"
                    )
                data = bytearray()
                async for chunk in response.aiter_bytes():
                    data.extend(chunk)
                    if len(data) > MAX_THEME_BYTES:
                        raise HTTPException(422, "Theme files must be 32 KB or smaller")
        return ThemeDocument.model_validate_json(bytes(data))
    except httpx.HTTPError:
        raise HTTPException(502, "Could not reach GitHub. Try again later.") from None
    except ValueError:
        raise HTTPException(
            422, "The GitHub file is not a valid, readable workspace color theme"
        ) from None


@router.get("", response_model=ThemeList)
def list_themes(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    query = db.query(UserTheme).filter(UserTheme.user_id == user.id)
    total = query.count()
    rows = (
        query.order_by(UserTheme.updated_at.desc(), UserTheme.id)
        .offset(offset)
        .limit(limit)
        .all()
    )
    return {
        "data": [payload(row) for row in rows],
        "pagination": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "hasMore": offset + len(rows) < total,
        },
    }


@router.post("", status_code=201, response_model=ThemeResult)
def create_theme(
    body: ThemeDocument,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    return save_new(db, user, body)


@router.post("/import-github", status_code=201, response_model=ThemeResult)
async def import_github(
    body: GitHubImport,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    document = await fetch_theme(body.url)
    return save_new(db, user, document, body.url)


@router.put("/{theme_id}", response_model=ThemeResult)
def update_theme(
    theme_id: UUID,
    body: ThemeDocument,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    row = owned(db, user, theme_id)
    row.document = body.model_dump()
    db.commit()
    db.refresh(row)
    return {"data": payload(row)}


@router.post("/{theme_id}/refresh-github", response_model=ThemeResult)
async def refresh_github(
    theme_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    row = owned(db, user, theme_id)
    if not row.github_url:
        raise HTTPException(409, "This theme is not connected to GitHub")
    url = GitHubImport(url=row.github_url).url
    document = await fetch_theme(url)
    row.document = document.model_dump()
    db.commit()
    db.refresh(row)
    return {"data": payload(row)}


@router.delete("/{theme_id}")
def delete_theme(
    theme_id: UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_active_user),
):
    row = owned(db, user, theme_id)
    db.delete(row)
    db.commit()
    return {"data": {"id": str(theme_id), "deleted": True}}
