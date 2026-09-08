"""Dependency and exception-response regressions without live provider calls."""

import base64
import hashlib
import hmac
import json
from unittest.mock import Mock

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from jose import jwt
from jose.exceptions import JWKError

from app.api.v1 import campaign_settings


def test_jwt_rejects_openssh_ecdsa_public_key_as_hmac_secret():
    public_key = (
        ec.generate_private_key(ec.SECP256R1())
        .public_key()
        .public_bytes(
            serialization.Encoding.OpenSSH, serialization.PublicFormat.OpenSSH
        )
    )
    header = base64.urlsafe_b64encode(b'{"alg":"HS256"}').rstrip(b"=")
    payload = base64.urlsafe_b64encode(b'{"sub":"test-attacker"}').rstrip(b"=")
    signing_input = header + b"." + payload
    signature = base64.urlsafe_b64encode(
        hmac.new(public_key, signing_input, hashlib.sha256).digest()
    ).rstrip(b"=")
    forged = (signing_input + b"." + signature).decode()

    with pytest.raises(JWKError, match="asymmetric key"):
        jwt.decode(forged, public_key, algorithms=["HS256"])


@pytest.mark.parametrize(
    "error,status,code",
    [
        (
            RuntimeError("test-provider-token=private /srv/internal.py"),
            502,
            "FACEBOOK_ERROR",
        ),
        (
            ValueError("test-provider-token=private /srv/internal.py"),
            400,
            "INVALID_CAMPAIGN",
        ),
    ],
)
def test_preflight_hides_provider_exception_details(monkeypatch, error, status, code):
    service = Mock()
    service.get_account_details.side_effect = error
    monkeypatch.setattr("app.api.v1.facebook.get_facebook_service", lambda *_: service)
    capture = Mock()
    monkeypatch.setattr(campaign_settings, "capture_exception", capture)
    payload = campaign_settings.PreflightRequest(
        ad_account_id="act_123",
        campaignData={},
        adsetData={},
        creativeData={},
        adsData=[{"name": "test-ad"}],
    )

    response = campaign_settings.preflight(payload, db=Mock(), user=Mock())

    assert response.status_code == status
    body = json.loads(response.body)
    assert body["error"]["code"] == code
    assert set(body["error"]) == {"code", "message", "details"}
    assert "test-provider-token" not in response.body.decode()
    assert "/srv/internal.py" not in response.body.decode()
    capture.assert_called_once_with(error, "campaign_settings.preflight")


def test_preflight_preserves_trusted_validation_guidance(monkeypatch):
    service = Mock()
    service.get_account_details.return_value = {"min_daily_budget": 100}
    monkeypatch.setattr("app.api.v1.facebook.get_facebook_service", lambda *_: service)
    monkeypatch.setattr(campaign_settings, "capture_exception", Mock())
    payload = campaign_settings.PreflightRequest(
        ad_account_id="act_123",
        campaignData={},
        adsetData={},
        creativeData={},
        adsData=[{"name": "test-ad"}],
    )

    response = campaign_settings.preflight(payload, db=Mock(), user=Mock())

    assert response.status_code == 400
    assert json.loads(response.body)["error"]["message"] == "Campaign Name is required."
