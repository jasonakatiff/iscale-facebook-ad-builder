"""Public delivery documentation contracts without a database or provider call."""

import io
import json
import re
from types import SimpleNamespace
from zipfile import ZipFile

from fastapi.testclient import TestClient

from app.api.v1.help import DOCS
from app.delivery.api import job_json
from app.delivery.docs import DeliveryError, DeliveryJobResult
from app.delivery.schemas import DeliveryConfig, LaunchRequest
from app.main import app


def test_delivery_operations_have_typed_success_and_error_responses():
    schema = app.openapi()
    operations = [
        operation
        for path, methods in schema["paths"].items()
        if path.startswith("/api/v1/delivery/")
        for operation in methods.values()
    ]
    assert len(operations) == 14
    for operation in operations:
        assert operation["description"]
        assert operation["security"] == [{"BreadWinnerBearer": []}]
        responses = operation["responses"]
        success = responses.get("202", responses.get("200"))
        assert success["content"]["application/json"]["schema"]["$ref"]
        for status in ["401", "403", "422", "429"]:
            assert responses[status]["content"]["application/json"]["schema"] == {
                "$ref": "#/components/schemas/DeliveryError"
            }
    legacy = schema["paths"]["/api/v1/facebook/ads"]["post"]["responses"]
    assert legacy["202"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "/DeliveryJobResult"
    )
    assert legacy["409"]["content"]["application/json"]["schema"]["$ref"].endswith(
        "/LegacyDeliveryConflict"
    )


def test_documented_job_matches_the_runtime_serializer_and_schema():
    guide = (DOCS / "delivery-api.md").read_text()
    example = json.loads(re.search(r"```json\n(.*?)\n```", guide, re.S)[1])
    job = SimpleNamespace(**example)
    assert job_json(job) == example
    assert set(DeliveryJobResult.model_fields) == set(example)
    DeliveryJobResult.model_validate(example)
    launch = json.loads(re.search(r"--data '([^']+)'", guide)[1])
    assert LaunchRequest.model_validate(launch).status == "PAUSED"


def test_public_guide_covers_every_delivery_operation():
    guide = (DOCS / "delivery-api.md").read_text()
    for path, methods in app.openapi()["paths"].items():
        if path.startswith("/api/v1/delivery/"):
            for method in methods:
                entry = f"`{method.upper()} {path.removeprefix('/api/v1/delivery')}`"
                assert entry in guide


def test_public_catalog_and_download_include_guides_and_current_openapi():
    # No context manager: public documentation does not need startup workers.
    client = TestClient(app)
    catalog = client.get("/api/v1/help/docs")
    assert catalog.status_code == 200
    slugs = {item["slug"] for item in catalog.json()["data"]}
    assert {"posting-queue", "delivery-api"} <= slugs
    for slug in ["posting-queue", "delivery-api"]:
        guide = client.get(f"/api/v1/help/docs/{slug}")
        assert guide.status_code == 200
        assert guide.text == (DOCS / f"{slug}.md").read_text()
    bundle = client.get("/api/v1/help/download")
    assert bundle.status_code == 200
    with ZipFile(io.BytesIO(bundle.content)) as archive:
        for slug in ["posting-queue", "delivery-api"]:
            assert (
                archive.read(f"{slug}.md").decode() == (DOCS / f"{slug}.md").read_text()
            )
        assert json.loads(archive.read("openapi.json")) == app.openapi()
        assert (
            "/api/v1/delivery/jobs/{job_id}/retry"
            in archive.read("endpoint-index.md").decode()
        )


def test_delivery_auth_error_matches_documented_envelope():
    response = TestClient(app).get("/api/v1/delivery/jobs")
    assert response.status_code == 401
    error = DeliveryError.model_validate(response.json()).error
    assert error.code == "REQUEST_FAILED"
    assert error.details is None


def test_documented_settings_cover_current_defaults():
    guide = (DOCS / "delivery-api.md").read_text()
    for key, value in DeliveryConfig().model_dump().items():
        default = str(value).lower() if isinstance(value, bool) else str(value)
        assert f"| `{key}` | {default} |" in guide
