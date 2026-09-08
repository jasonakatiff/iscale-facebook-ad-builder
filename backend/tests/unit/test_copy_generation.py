"""Copy contracts exercise the actual request shape and provider boundary."""
import json
from unittest.mock import AsyncMock

import pytest

from app.core.installation import InstallationError

PAYLOAD = {"brand": {"name": "test-brand"}, "product": {"name": "test-product"},
           "profile": {"demographics": "test-audience"}, "campaignDetails": {}, "variationCount": 1}


@pytest.fixture(autouse=True)
def configured(monkeypatch):
    monkeypatch.setattr("app.api.v1.copy_generation.require_provider_key", lambda *args: "test-gemini-key")


@pytest.mark.parametrize("wrapper", ["{}", "```json\n{}\n```", "```\n{}\n```"])
def test_copy_parses_provider_response(client, auth_headers, monkeypatch, wrapper):
    expected = {"variations": [{"headline": "test-headline", "body": "test-body", "cta": "Learn more"}]}
    generate = AsyncMock(return_value=wrapper.format(json.dumps(expected)))
    monkeypatch.setattr("app.api.v1.copy_generation.generate_gemini_text", generate)
    response = client.post("/api/v1/copy-generation/generate", headers=auth_headers, json=PAYLOAD)
    assert response.status_code == 200, response.text
    assert response.json() == expected
    generate.assert_awaited_once()


def test_provider_error_is_redacted_and_actionable(client, auth_headers, monkeypatch):
    generate = AsyncMock(side_effect=InstallationError("provider_failed", "Replace this key in Settings.", 502))
    monkeypatch.setattr("app.api.v1.copy_generation.generate_gemini_text", generate)
    response = client.post("/api/v1/copy-generation/generate", headers=auth_headers, json=PAYLOAD)
    assert response.status_code == 502
    assert response.json()["error"]["code"] == "provider_failed"


def test_invalid_json_has_safe_error(client, auth_headers, monkeypatch):
    monkeypatch.setattr("app.api.v1.copy_generation.generate_gemini_text", AsyncMock(return_value="test-private-provider-response"))
    response = client.post("/api/v1/copy-generation/generate", headers=auth_headers, json=PAYLOAD)
    assert response.status_code == 502
    assert "test-private-provider-response" not in response.text


def test_invalid_count_is_rejected_before_generation(client, auth_headers, monkeypatch):
    generate = AsyncMock()
    monkeypatch.setattr("app.api.v1.copy_generation.generate_gemini_text", generate)
    response = client.post("/api/v1/copy-generation/generate", headers=auth_headers, json={**PAYLOAD, "variationCount": 0})
    assert response.status_code == 422
    generate.assert_not_awaited()
