"""Gemini failures map to honest, per-request errors; only key failures touch status."""
import asyncio
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.core.installation import InstallationError
from app.services import generation_provider as gp


class FakeResponse:
    def __init__(self, status_code=200, body=None):
        self.status_code = status_code
        self.is_success = status_code < 400
        self._body = body or {}

    def json(self):
        return self._body


class FakeClient:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls = 0

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False

    async def post(self, *args, **kwargs):
        self.calls += 1
        return self._responses.pop(0)


@pytest.fixture(autouse=True)
def quiet_provider(monkeypatch):
    monkeypatch.setattr(gp, "require_provider_key", lambda provider, db=None: "test-gemini-key")
    recorded = []
    monkeypatch.setattr(gp, "record_result", lambda provider, key, status: recorded.append(status))
    monkeypatch.setattr(gp.asyncio, "sleep", AsyncMock())
    return recorded


def run_with(monkeypatch, responses):
    client = FakeClient(responses)
    monkeypatch.setattr(gp.httpx, "AsyncClient", lambda **kwargs: client)
    return client, asyncio.new_event_loop().run_until_complete(gp.generate_gemini_text("test-prompt"))


def run_error(monkeypatch, responses):
    client = FakeClient(responses)
    monkeypatch.setattr(gp.httpx, "AsyncClient", lambda **kwargs: client)
    with pytest.raises(InstallationError) as excinfo:
        asyncio.new_event_loop().run_until_complete(gp.generate_gemini_text("test-prompt"))
    return client, excinfo.value


def gemini_ok(text="test-analysis"):
    return FakeResponse(200, {"candidates": [{"content": {"parts": [{"text": text}]}, "finishReason": "STOP"}]})


def test_success_returns_text_and_marks_connected(monkeypatch, quiet_provider):
    client, value = run_with(monkeypatch, [gemini_ok()])
    assert value == "test-analysis"
    assert quiet_provider == ["connected"]


def test_safety_block_is_per_creative_and_keeps_connection_healthy(monkeypatch, quiet_provider):
    blocked = FakeResponse(200, {"promptFeedback": {"blockReason": "SAFETY"}, "candidates": []})
    client, error = run_error(monkeypatch, [blocked])
    assert error.code == "generation_blocked"
    assert "no settings change" in error.message.lower()
    assert quiet_provider == ["connected"]


def test_rate_limit_retries_then_reports_without_settings_prompt(monkeypatch, quiet_provider):
    client, error = run_error(monkeypatch, [FakeResponse(429), FakeResponse(429)])
    assert client.calls == 2
    assert error.details["status"] == "rate_limited"
    assert "settings" not in error.message.lower() or "no settings change" in error.message.lower()
    assert quiet_provider == []


def test_rate_limit_then_success_recovers(monkeypatch, quiet_provider):
    client, value = run_with(monkeypatch, [FakeResponse(429), gemini_ok()])
    assert client.calls == 2
    assert value == "test-analysis"
    assert quiet_provider == ["connected"]


def test_bad_request_surfaces_provider_reason_not_settings(monkeypatch, quiet_provider):
    bad = FakeResponse(400, {"error": {"message": "Image exceeds the maximum allowed size."}})
    client, error = run_error(monkeypatch, [bad])
    assert error.details["status"] == "request_rejected"
    assert "Image exceeds the maximum allowed size." in error.message
    assert "Settings" not in error.message
    assert quiet_provider == []


def test_invalid_key_still_points_at_settings(monkeypatch, quiet_provider):
    client, error = run_error(monkeypatch, [FakeResponse(401)])
    assert error.details["status"] == "invalid"
    assert "Settings" in error.message
    assert quiet_provider == ["invalid"]
