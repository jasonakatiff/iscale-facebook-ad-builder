"""Public cutover transport and exception-response boundaries."""

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, FastAPI
from fastapi.testclient import TestClient
from unittest.mock import Mock
import pytest

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


@pytest.mark.parametrize("resource,expected", [("act_000123/insights", "act_123/insights"), ("00123/thumbnails", "123/thumbnails"), ("", "")])
def test_graph_request_constructs_paths_from_numeric_ids_and_known_edges(monkeypatch, resource, expected):
    from app.delivery.provider import DeliveryProvider
    from app.delivery.config import GRAPH_VERSION

    response = Mock(status_code=200, headers={})
    response.json.return_value = {"data": []}
    send = Mock(return_value=response)
    monkeypatch.setattr("app.delivery.provider.requests.get", send)
    provider = DeliveryProvider.__new__(DeliveryProvider)
    provider.access_token = "test-provider-token"
    provider.budget = None
    assert provider.read(resource) == {"data": []}
    assert send.call_args.args == (f"https://graph.facebook.com/{GRAPH_VERSION}/{expected}",)
    assert send.call_args.kwargs["allow_redirects"] is False
    assert "test-provider-token" not in send.call_args.args[0]
