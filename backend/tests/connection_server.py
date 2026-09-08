"""Local M1a browser scenarios; real app/auth/DB, simulated Meta transport only."""
import os
import json
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException
from pydantic import BaseModel
from facebook_business.api import FacebookAdsApi, FacebookResponse

from tests import feedback_server as fixture
from app.core.deps import get_current_active_user
from app.core.token_encryption import encrypt_token
from app.database import get_db
from app.models import MetaAdsConnection, User
from app.services.facebook_service import FacebookService

app = fixture.app  # feedback_server rejects nonlocal/non-test databases before app import.
scenario = "managed"


def meta_transport(self, method, path, params=None, **kwargs):
    edge = ("/".join(path) if isinstance(path, (tuple, list)) else str(path)).rstrip("/").split("/")[-1]
    if method == "GET" and edge == "adaccounts":
        fixture.meta_calls.append({"method": method, "path": "adaccounts", "params": params or {}})
        accounts = [] if scenario == "empty" else [fixture.account, {**fixture.account, "id": "act_456", "account_id": "456", "name": "test-second-account"}]
        return FacebookResponse(body=json.dumps({"data": accounts}), http_status=200, headers={})
    if method == "GET" and edge == "act_456":
        return FacebookResponse(body=json.dumps({**fixture.account, "id": "act_456", "account_id": "456"}), http_status=200, headers={})
    return fixture.meta_transport(self, method, path, params=params, **kwargs)


FacebookAdsApi.call = meta_transport


class ScenarioRequest(BaseModel):
    scenario: str


@app.post("/test-connection-scenario")
def set_scenario(body: ScenarioRequest, user: User = Depends(get_current_active_user), db=Depends(get_db)):
    global scenario
    if not user.is_superuser or not user.email.startswith("test-"):
        raise HTTPException(403, "Fixture user required")
    if body.scenario not in {"managed", "disconnected", "personal", "selection", "expired", "empty", "managed-after-personal"}:
        raise HTTPException(422, "Unknown test scenario")
    scenario = body.scenario
    for key in ("FACEBOOK_ACCESS_TOKEN", "VITE_FACEBOOK_ACCESS_TOKEN", "FACEBOOK_AD_ACCOUNT_ID", "VITE_FACEBOOK_AD_ACCOUNT_ID"):
        os.environ[key] = ""
    if scenario in {"managed", "empty", "managed-after-personal"}:
        os.environ["FACEBOOK_ACCESS_TOKEN"] = "test-managed-token"
        os.environ["FACEBOOK_AD_ACCOUNT_ID"] = "123"
    db.query(MetaAdsConnection).filter_by(user_id=user.id).delete()
    if scenario in {"personal", "selection", "expired", "managed-after-personal"}:
        expiry = datetime.now(timezone.utc) + timedelta(days=-1 if scenario == "expired" else 20)
        db.add(MetaAdsConnection(user_id=user.id, ad_account_id="act_123", account_name="test-feedback-account", encrypted_access_token=encrypt_token("test-personal-token"), access_token_expires_at=expiry, is_active=scenario != "selection"))
        if scenario == "selection":
            db.add(MetaAdsConnection(user_id=user.id, ad_account_id="act_456", account_name="test-second-account", encrypted_access_token=encrypt_token("test-second-token"), access_token_expires_at=expiry, is_active=False))
    db.commit()
    FacebookService._accounts_cache.clear()
    fixture.meta_calls.clear()
    return {"scenario": scenario}
