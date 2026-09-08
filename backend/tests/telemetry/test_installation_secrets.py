"""Settings-managed credentials must stay out of dependency diagnostics."""
import json
from types import SimpleNamespace

import httpx
import pytest

from app.core.installation import InstallationError
from app.api.v1 import generated_ads
from app.database import engine
from app.services import generation_provider, provider_settings
from app.telemetry.instrumentation import install_instrumentation
from app.telemetry.runtime import collector, trace_context


@pytest.mark.anyio
@pytest.mark.parametrize("operation", ["verify", "generate", "image"])
async def test_provider_exception_redacts_application_key(monkeypatch, operation):
    key = "test-application-only-credential-84ae82"
    records = []
    install_instrumentation(engine)
    monkeypatch.setattr(collector, "enqueue", records.append)
    monkeypatch.setattr(generation_provider, "require_provider_key", lambda *args: key)
    monkeypatch.setattr(generation_provider, "record_result", lambda *args: None)
    monkeypatch.setattr(generated_ads, "require_provider_key", lambda *args: key)

    class TestFalClient:
        def __init__(self, key):
            self.key = key

        async def submit(self, *args, **kwargs):
            async with httpx.AsyncClient() as client:
                await client.post("https://fal.test/generate", headers={"x-goog-api-key": self.key})

    monkeypatch.setattr(generated_ads, "fal_client", SimpleNamespace(AsyncClient=TestFalClient))

    async def fail_transport(self, request):
        assert request.headers["x-goog-api-key"] == key
        raise httpx.ConnectError(f"Connection rejected {key}", request=request)

    monkeypatch.setattr(httpx.AsyncHTTPTransport, "handle_async_request", fail_transport)
    token = trace_context.set({"trace_id": "test-install-provider-failure"})
    try:
        if operation == "verify":
            status, message = await provider_settings.check_provider_key("gemini", key)
            assert status == "temporarily_unavailable"
            assert key not in message
        elif operation == "generate":
            with pytest.raises(InstallationError) as failure:
                await generation_provider.generate_gemini_text("test-brief")
            assert key not in str(failure.value)
        else:
            with pytest.raises(InstallationError) as failure:
                await generated_ads.generate_image(
                    generated_ads.ImageGenerationRequest(imageSizes=[{"width": 100, "height": 100}]),
                    current_user=None, db=None,
                )
            assert key not in str(failure.value)
    finally:
        trace_context.reset(token)

    dependencies = [r for r in records if r["kind"] == "dependency"]
    assert dependencies and dependencies[0]["level"] == "error"
    assert dependencies[0]["attributes"]["exception_type"] == "ConnectError"
    assert key not in json.dumps(records, default=str)
