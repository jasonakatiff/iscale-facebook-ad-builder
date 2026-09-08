"""Local installation QA; only the external AI responses are simulated."""
import base64
import json
import os
from pathlib import Path
import sys
from urllib.parse import urlparse

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

url = urlparse(os.environ.get("DATABASE_URL", ""))
if url.hostname not in {"localhost", "127.0.0.1"} or not url.path.startswith("/test_"):
    raise RuntimeError("The installation QA server requires an explicit local test_ database.")
if os.environ.get("TEST_INSTALLATION_PROVIDERS") != "1":
    raise RuntimeError("Explicit TEST_INSTALLATION_PROVIDERS=1 is required for simulated provider QA.")

os.environ.setdefault("OAUTH_TOKEN_ENCRYPTION_KEY", base64.urlsafe_b64encode(b"test-installation-key-never-live").decode())

from startup import bootstrap_database
bootstrap_database()

from app.main import app
from app.api.v1 import copy_generation, generated_ads, uploads
from app.services import provider_settings
from app.services.generation_provider import record_result
from app.core.installation import InstallationError
from app.core.rate_limit import limiter
import uvicorn

limiter.enabled = False


async def fake_copy(prompt, db=None, image_part=None):
    key = provider_settings.require_provider_key("gemini", db)
    if not key.startswith("test-"):
        raise InstallationError("test_key_required", "Use test- prefixed keys in the local simulated test.")
    record_result("gemini", key, "connected")
    return json.dumps({"variations": [{"headline": "test-Your next great product",
                                       "body": "A clear message for your first creative.", "cta": "Learn more"}]})


class FakeFal:
    def __init__(self, key):
        if not key.startswith("test-"):
            raise InstallationError("test_key_required", "Use test- prefixed keys in the local simulated test.")

    async def submit(self, *args, **kwargs):
        return self

    async def get(self):
        return {"images": [{"url": "https://test-provider.invalid/test-image.png"}]}


async def fake_image(image_url, prefix="generated"):
    # A tiny valid fixture; this does not represent the quality of AI output.
    content = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1sAAAAASUVORK5CYII=")
    from uuid import uuid4
    return await uploads.upload_to_local(content, f"test-generated-{uuid4()}.png")


async def fake_check(provider, key):
    if "invalid" in key:
        return "invalid", "Simulated invalid key. Replace it with a different test- key."
    return "connected", "Simulated connection verified for local QA. No provider was contacted."


copy_generation.generate_gemini_text = fake_copy
generated_ads.fal_client.AsyncClient = FakeFal
generated_ads.download_and_save_image = fake_image
provider_settings.check_provider_key = fake_check
print("SIMULATED AI PROVIDERS: real authentication, PostgreSQL, settings, uploads and application flows.", flush=True)
uvicorn.run(app, host="127.0.0.1", port=int(os.environ["PORT"]))
