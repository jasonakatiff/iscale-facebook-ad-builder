import asyncio
from pathlib import Path

import httpx
import pytest

from app.api.v1 import generated_ads, uploads
from app.core.config import settings
from app.core.installation import InstallationError


def test_uploaded_media_uses_persistent_directory_and_api_origin(tmp_path, monkeypatch):
    monkeypatch.setattr(uploads, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(settings, "PUBLIC_API_URL", "https://test-api.example.com")
    url = asyncio.run(uploads.upload_to_local(b"test-content", "test-file.png"))
    assert url == "https://test-api.example.com/uploads/test-file.png"
    assert (tmp_path / "test-file.png").read_bytes() == b"test-content"
    assert asyncio.run(uploads.upload_to_local(b"test-next", "test-next.png")).startswith(settings.PUBLIC_API_URL)
    assert (tmp_path / "test-file.png").read_bytes() == b"test-content"


def test_generated_image_is_saved_without_r2(tmp_path, monkeypatch):
    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(200, content=b"test-generated-image"))
    monkeypatch.setattr(generated_ads.httpx, "AsyncClient", lambda **kwargs: real_client(transport=transport))
    monkeypatch.setattr(settings, "R2_ACCOUNT_ID", "")
    monkeypatch.setattr(settings, "PUBLIC_API_URL", "https://test-api.example.com")
    monkeypatch.setattr(uploads, "UPLOAD_DIR", tmp_path)
    result = asyncio.run(generated_ads.download_and_save_image("https://test-provider.example.com/image.png"))
    assert result.startswith("https://test-api.example.com/uploads/generated_")
    assert (tmp_path / result.rsplit("/", 1)[1]).read_bytes() == b"test-generated-image"


def test_storage_failure_preserves_recovery_url_without_success(tmp_path, monkeypatch):
    real_client = httpx.AsyncClient
    transport = httpx.MockTransport(lambda request: httpx.Response(200, content=b"test-image"))
    monkeypatch.setattr(generated_ads.httpx, "AsyncClient", lambda **kwargs: real_client(transport=transport))
    monkeypatch.setattr(settings, "R2_ACCOUNT_ID", "")
    monkeypatch.setattr(uploads, "UPLOAD_DIR", tmp_path / "missing-directory")
    url = "https://test-provider.example.com/image.png"
    with pytest.raises(InstallationError) as result:
        asyncio.run(generated_ads.download_and_save_image(url))
    assert result.value.code == "media_save_failed"
    assert result.value.details == {"recovery_url": url}


def test_ready_is_not_just_process_liveness(client, monkeypatch):
    monkeypatch.setattr("app.services.installation_health.schema_ready", lambda db: False)
    assert client.get("/health").status_code == 200
    result = client.get("/health/ready")
    assert result.status_code == 503
    assert result.json() == {"status": "not_ready"}


def test_template_uses_local_image_bytes_and_rejects_untrusted_urls(tmp_path, monkeypatch):
    import base64
    from app.services.ad_remix_service import template_image_part
    monkeypatch.setattr(uploads, "UPLOAD_DIR", tmp_path)
    monkeypatch.setattr(settings, "PUBLIC_API_URL", "https://test-api.example.com")
    (tmp_path / "test-template.png").write_bytes(b"test-image-bytes")
    part = asyncio.run(template_image_part("https://test-api.example.com/uploads/test-template.png"))
    assert base64.b64decode(part["inline_data"]["data"]) == b"test-image-bytes"
    for url in ["https://127.0.0.1/private.png", "/uploads/../private.png", "https://untrusted.example.com/template.png"]:
        with pytest.raises(InstallationError):
            asyncio.run(template_image_part(url))


def test_status_write_failure_does_not_discard_paid_generation(monkeypatch):
    from sqlalchemy.exc import OperationalError
    from app.services import generation_provider
    def unavailable():
        raise OperationalError("test", {}, Exception("test-db-down"))
    monkeypatch.setattr(generation_provider, "SessionLocal", unavailable)
    generation_provider.record_result("fal", "test-key", "connected")
