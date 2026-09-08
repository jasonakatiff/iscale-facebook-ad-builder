from unittest.mock import Mock
import pytest
import requests

from app.delivery.provider import DeliveryProvider, ProviderError


@pytest.mark.parametrize(
    "status,code,transient,expected",
    [
        (401, 190, True, False),
        (403, 200, True, False),
        (400, 100, False, False),
        (429, 4, False, True),
        (503, 2, True, True),
    ],
)
def test_graph_failure_classification(monkeypatch, status, code, transient, expected):
    provider = DeliveryProvider.__new__(DeliveryProvider)
    provider.access_token = "test-private-token"
    response = Mock(ok=False, status_code=status, headers={"Retry-After": "17"})
    response.json.return_value = {
        "error": {
            "code": code,
            "is_transient": transient,
            "message": "test-secret-message",
        }
    }
    request = Mock(return_value=response)
    monkeypatch.setattr(requests, "get", request)
    with pytest.raises(ProviderError) as failure:
        provider.ad_status("123")
    assert failure.value.retryable is expected
    assert failure.value.retry_after == 17
    assert "test-secret" not in str(failure.value)
    assert "test-private-token" not in request.call_args.args[0]


def test_account_metadata_cache_is_shared_and_expires(monkeypatch, engine, sessions):
    from datetime import timedelta
    from app.delivery.models import ProviderCache, ApiRequest
    from app.delivery.queue import utcnow

    response = Mock(ok=True, status_code=200, headers={})
    response.json.return_value = {
        "id": "act_123",
        "currency": "USD",
        "timezone_name": "UTC",
    }
    request = Mock(return_value=response)
    monkeypatch.setattr(requests, "get", request)
    for _ in range(2):
        provider = DeliveryProvider()
        provider.access_token = "test-cache-token"
        provider.configure_budget(engine, "act_123", "import")
        assert provider.account_info("act_123")["currency"] == "USD"
    assert request.call_count == 1
    with sessions() as db:
        db.query(ProviderCache).one().fetched_at = utcnow() - timedelta(hours=25)
        assert db.query(ApiRequest).count() == 1
        db.commit()
    provider.account_info("act_123")
    assert request.call_count == 2


def test_sdk_requests_and_batch_members_use_shared_budget(
    monkeypatch, engine, sessions
):
    from facebook_business.session import FacebookSession
    from app.delivery.budget import create_api, RequestBudget
    from app.delivery.models import ApiRequest

    response = Mock(status_code=200, headers={}, text='{"id":"123"}')
    monkeypatch.setattr(requests.Session, "request", Mock(return_value=response))
    api = create_api("test-sdk-token", budget=RequestBudget(engine))
    api.call("GET", ("act_123",), params={"fields": "id"})
    api.call(
        "POST",
        (),
        params={
            "batch": [
                {"method": "GET", "relative_url": "act_123"},
                {"method": "GET", "relative_url": "act_456"},
            ]
        },
    )
    with sessions() as db:
        records = db.query(ApiRequest).order_by(ApiRequest.started_at).all()
        assert [record.cost for record in records] == [1, 2]
        assert all(record.finished_at for record in records)


def test_graph_throttle_persists_cooldown_without_retry_after(
    monkeypatch, engine, sessions
):
    from app.delivery.budget import RequestDeferred

    response = Mock(ok=False, status_code=400, headers={})
    response.json.return_value = {"error": {"code": 4}}
    request = Mock(return_value=response)
    monkeypatch.setattr(requests, "get", request)
    provider = DeliveryProvider()
    provider.access_token = "test-rate-token"
    provider.configure_budget(engine, "act_123", "import")
    with pytest.raises(ProviderError):
        provider.read("act_123")
    with pytest.raises(RequestDeferred):
        provider.read("act_123")
    assert request.call_count == 1


def test_queue_provider_uses_buyers_personal_connection(sessions, buyer, monkeypatch):
    from app.core.token_encryption import encrypt_token
    from app.models import MetaAdsConnection

    monkeypatch.setenv("FACEBOOK_ACCESS_TOKEN", "test-platform-token")
    with sessions() as db:
        db.add(
            MetaAdsConnection(
                user_id=buyer.id,
                encrypted_access_token=encrypt_token("test-personal-token"),
                is_active=True,
                ad_account_id="act_789",
            )
        )
        db.commit()
        provider = DeliveryProvider.for_user(db, buyer.id)
        assert provider.access_token == "test-personal-token"
        assert provider.ad_account_id == "act_789"


def test_queue_does_not_fall_back_from_expired_personal_connection(
    sessions, buyer, monkeypatch
):
    from datetime import datetime, timedelta, timezone
    from app.core.token_encryption import encrypt_token
    from app.models import MetaAdsConnection

    monkeypatch.setenv("FACEBOOK_ACCESS_TOKEN", "test-platform-token")
    with sessions() as db:
        db.add(
            MetaAdsConnection(
                user_id=buyer.id,
                encrypted_access_token=encrypt_token("test-expired"),
                is_active=True,
                ad_account_id="act_789",
                access_token_expires_at=datetime.now(timezone.utc) - timedelta(days=1),
            )
        )
        db.commit()
        with pytest.raises(ProviderError):
            DeliveryProvider.for_user(db, buyer.id)
