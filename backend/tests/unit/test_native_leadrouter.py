"""Native LeadRouter behavior on isolated PostgreSQL; upstream calls are simulated."""

from uuid import uuid4

import pytest
import httpx
from app.core.security import create_access_token
from app.core.token_encryption import decrypt_token
from app.models import Brand, Product, User, LeadRouterConnection, LeadRouterDefault
from app.services import leadrouter_service as provider

CAMPAIGN_ID = "11111111-1111-4111-8111-111111111111"
SECOND_ID = "22222222-2222-4222-8222-222222222222"
PARTNER_ID = "33333333-3333-4333-8333-333333333333"
TEST_KEY = "lr_test_native_connection_key"


@pytest.fixture
def upstream(monkeypatch):
    state = {
        "status": 200,
        "calls": [],
        "rows": [
            {
                "id": CAMPAIGN_ID,
                "name": "test-Solar",
                "offerName": "test-Solar offer",
                "status": "active",
                "leadCount": 7,
                "postingKey": "pk_test_must_not_escape",
                "specToken": "test-private-spec",
                "email": "test-private@example.com",
            },
            {
                "id": SECOND_ID,
                "name": "test-Home",
                "offerName": "test-Home offer",
                "status": "active",
                "leadCount": 3,
            },
        ],
    }

    def transport(request):
        state["calls"].append(request)
        assert request.url.host == "theleadrouter.com"
        assert request.headers["authorization"] == f"Bearer {TEST_KEY}"
        if state["status"] != 200:
            return httpx.Response(
                state["status"],
                json={"secret": TEST_KEY},
                headers={"Location": "https://attacker.invalid/"},
            )
        if request.url.path == "/api/partner/me":
            return httpx.Response(
                200,
                json={
                    "data": {
                        "partnerId": PARTNER_ID,
                        "partnerName": "test-Partner",
                        "role": "partner",
                    }
                },
            )
        limit = int(request.url.params["limit"])
        offset = int(request.url.params["offset"])
        return httpx.Response(
            200,
            json={
                "data": state["rows"][offset : offset + limit],
                "pagination": {
                    "limit": limit,
                    "offset": offset,
                    "total": len(state["rows"]),
                    "hasMore": offset + limit < len(state["rows"]),
                },
            },
        )

    monkeypatch.setattr(
        provider,
        "make_client",
        lambda: httpx.Client(
            transport=httpx.MockTransport(transport), follow_redirects=False
        ),
    )
    return state


def connect(client, headers, account_type="partner"):
    result = client.put(
        "/api/v1/leadrouter/connection",
        headers=headers,
        json={"apiKey": TEST_KEY, "accountType": account_type},
    )
    assert result.status_code == 200, result.text
    return result.json()["data"]


@pytest.fixture
def catalog(db_session):
    brand = Brand(name="test-native-brand")
    db_session.add(brand)
    db_session.flush()
    product = Product(name="test-native-product", brand_id=brand.id)
    db_session.add(product)
    db_session.commit()
    yield brand, product
    db_session.delete(brand)
    db_session.commit()


def test_native_connection_is_available_without_a_plugin(client, auth_headers):
    response = client.get("/api/v1/leadrouter/connection", headers=auth_headers)
    assert response.status_code == 200
    assert response.json() == {"data": None}
    assert response.headers["cache-control"] == "no-store"


def test_native_contract_is_documented(client):
    paths = client.get("/api/v1/openapi.json").json()["paths"]
    assert "/api/v1/leadrouter/campaigns" in paths
    assert "/api/v1/leadrouter/defaults/{resource_type}/{resource_id}" in paths


@pytest.mark.parametrize("account_type", ["partner", "organization"])
def test_encrypted_connection_and_allowlisted_live_pages(
    client, auth_headers, db_session, upstream, account_type
):
    connected = connect(client, auth_headers, account_type)
    row = db_session.query(LeadRouterConnection).filter_by(id=connected["id"]).one()
    assert row.encrypted_api_key != TEST_KEY
    assert decrypt_token(row.encrypted_api_key) == TEST_KEY
    response = client.get(
        "/api/v1/leadrouter/campaigns?limit=1&offset=1", headers=auth_headers
    )
    assert response.status_code == 200, response.text
    assert response.json()["data"][0]["id"] == SECOND_ID
    assert response.json()["pagination"] == {
        "limit": 1,
        "offset": 1,
        "total": 2,
        "hasMore": False,
    }
    result = client.get("/api/v1/leadrouter/campaigns", headers=auth_headers)
    assert all(
        value not in result.text
        for value in [
            TEST_KEY,
            "pk_test_must_not_escape",
            "test-private-spec",
            "test-private@example.com",
        ]
    )
    assert (
        TEST_KEY
        not in client.get("/api/v1/leadrouter/connection", headers=auth_headers).text
    )
    expected_path = (
        "/api/partner/campaigns" if account_type == "partner" else "/api/v1/campaigns"
    )
    assert upstream["calls"][-1].url.path == expected_path
    assert (
        client.put(
            "/api/v1/leadrouter/connection",
            headers=auth_headers,
            json={"apiKey": TEST_KEY},
        ).status_code
        == 409
    )


def test_defaults_are_private_and_product_overrides_brand(
    client, auth_headers, db_session, upstream, catalog
):
    connected = connect(client, auth_headers)
    brand, product = catalog
    for kind, record, campaign in [
        ("brand", brand, CAMPAIGN_ID),
        ("product", product, SECOND_ID),
    ]:
        response = client.put(
            f"/api/v1/leadrouter/defaults/{kind}/{record.id}",
            headers=auth_headers,
            json={"campaignId": campaign, "connectionId": connected["id"]},
        )
        assert response.status_code == 200, response.text
    resolved = client.get(
        f"/api/v1/leadrouter/defaults/resolve?productId={product.id}",
        headers=auth_headers,
    ).json()["data"]
    assert (
        resolved["resourceType"] == "product"
        and resolved["campaign"]["id"] == SECOND_ID
    )
    other = User(
        email=f"test-native-{uuid4()}@example.com",
        hashed_password="unused",
        is_active=True,
    )
    db_session.add(other)
    db_session.commit()
    headers = {"Authorization": f'Bearer {create_access_token({"sub": other.id})}'}
    try:
        assert client.get("/api/v1/leadrouter/connection", headers=headers).json() == {
            "data": None
        }
        assert (
            client.get("/api/v1/leadrouter/defaults", headers=headers).json()["data"]
            == []
        )
        assert client.get(
            f"/api/v1/leadrouter/defaults/product/{product.id}", headers=headers
        ).json() == {"data": None}
        assert (
            client.get("/api/v1/leadrouter/campaigns", headers=headers).status_code
            == 409
        )
        client.delete(
            f"/api/v1/leadrouter/defaults/product/{product.id}", headers=headers
        )
        assert client.get(
            f"/api/v1/leadrouter/defaults/product/{product.id}", headers=auth_headers
        ).json()["data"]
    finally:
        db_session.delete(other)
        db_session.commit()
    client.delete(
        f"/api/v1/leadrouter/defaults/product/{product.id}", headers=auth_headers
    )
    assert (
        client.get(
            f"/api/v1/leadrouter/defaults/resolve?productId={product.id}",
            headers=auth_headers,
        ).json()["data"]["resourceType"]
        == "brand"
    )
    client.delete("/api/v1/leadrouter/connection", headers=auth_headers)
    assert (
        db_session.query(LeadRouterDefault)
        .filter_by(connection_id=connected["id"])
        .count()
        == 0
    )


def test_stale_connections_and_campaigns_cannot_be_saved(
    client, auth_headers, upstream, catalog
):
    connected = connect(client, auth_headers)
    brand, _ = catalog
    path = f"/api/v1/leadrouter/defaults/brand/{brand.id}"
    body = {"campaignId": CAMPAIGN_ID, "connectionId": connected["id"]}
    assert (
        client.put(
            path, headers=auth_headers, json={**body, "connectionId": str(uuid4())}
        ).status_code
        == 409
    )
    upstream["rows"][0]["status"] = "paused"
    assert client.put(path, headers=auth_headers, json=body).status_code == 422
    upstream["rows"] = []
    assert client.put(path, headers=auth_headers, json=body).status_code == 422
    assert client.get(path, headers=auth_headers).json()["data"] is None


@pytest.mark.parametrize(
    "status, expected", [(401, 422), (403, 422), (429, 503), (500, 502), (302, 502)]
)
def test_provider_failures_do_not_leak_or_save_keys(
    client, auth_headers, db_session, upstream, status, expected
):
    upstream["status"] = status
    response = client.put(
        "/api/v1/leadrouter/connection", headers=auth_headers, json={"apiKey": TEST_KEY}
    )
    assert response.status_code == expected
    assert TEST_KEY not in response.text
    assert db_session.query(LeadRouterConnection).count() == 0
    assert len(upstream["calls"]) == 1


def test_api_keys_inherit_data_access_but_cannot_manage_credentials(
    client, auth_headers, upstream, catalog
):
    connected = connect(client, auth_headers)
    brand, _ = catalog
    for access in ["read", "write"]:
        key = client.post(
            "/api/v1/api-keys",
            headers=auth_headers,
            json={"name": "test-native-controller", "access": access},
        ).json()["apiKey"]
        headers = {"Authorization": f"Bearer {key}"}
        assert (
            client.get("/api/v1/leadrouter/campaigns", headers=headers).status_code
            == 200
        )
        assert (
            client.delete("/api/v1/leadrouter/connection", headers=headers).status_code
            == 403
        )
        saved = client.put(
            f"/api/v1/leadrouter/defaults/brand/{brand.id}",
            headers=headers,
            json={"campaignId": CAMPAIGN_ID, "connectionId": connected["id"]},
        )
        assert saved.status_code == (403 if access == "read" else 200)


def test_invalid_keys_and_unknown_fields_are_rejected(client, auth_headers):
    for body in [
        {"apiKey": "pk_test_posting_key"},
        {"apiKey": TEST_KEY + "\n"},
        {"apiKey": TEST_KEY, "baseUrl": "http://127.0.0.1"},
        {"apiKey": TEST_KEY, "userId": str(uuid4())},
    ]:
        result = client.put(
            "/api/v1/leadrouter/connection", headers=auth_headers, json=body
        )
        assert result.status_code == 422
        assert body["apiKey"] not in result.text


def test_transport_bounds_and_invalid_response(monkeypatch):
    for response in [
        httpx.Response(200, content=b"x" * (provider.MAX_RESPONSE_BYTES + 1)),
        httpx.Response(200, json=["invalid"]),
        httpx.Response(200, json={"data": []}),
    ]:
        monkeypatch.setattr(
            provider,
            "make_client",
            lambda: httpx.Client(
                transport=httpx.MockTransport(lambda request: response)
            ),
        )
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as error:
            provider.campaigns(TEST_KEY, "partner")
        assert error.value.status_code == 502
