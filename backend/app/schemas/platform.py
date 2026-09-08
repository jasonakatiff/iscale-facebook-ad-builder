"""Shared list and error contracts for user-facing platform tools."""

from typing import Any
from pydantic import BaseModel


class Pagination(BaseModel):
    total: int
    limit: int
    offset: int
    hasMore: bool


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Any = None


class PlatformError(BaseModel):
    error: ErrorDetail
