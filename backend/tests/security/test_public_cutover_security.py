"""Public cutover transport and exception-response boundaries."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient

from app.delivery.api import DeliveryRoute
from app.delivery.budget import RequestDeferred


def test_request_deferral_does_not_expose_exception_text():
    app = FastAPI()
    router = APIRouter(route_class=DeliveryRoute)

    @router.get("/test-deferred")
    def deferred():
        error = RequestDeferred(datetime.now(timezone.utc) + timedelta(minutes=1))
        error.args = ("test-private-provider-token /srv/private.py",)
        raise error

    app.include_router(router)
    with TestClient(app) as client:
        response = client.get("/test-deferred")
    assert response.status_code == 429
    assert response.json()["error"]["code"] == "REQUEST_BUDGET_BUSY"
    assert int(response.headers["Retry-After"]) > 0
    assert "test-private" not in response.text
    assert "/srv/" not in response.text
