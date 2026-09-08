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
