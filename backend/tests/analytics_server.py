"""Local PostgreSQL/browser fixture; all advertising calls are simulated."""

import os
from datetime import datetime, timedelta, timezone
from app.core.config import settings
from tests import creatives_server as fixture
from app.database import SessionLocal, engine
from app.models import User, GoogleAdsConnection, TikTokAdsConnection
from app.analytics.models import (
    AnalyticsAd,
    AnalyticsSource,
    AnalyticsAccount,
    AnalyticsSettings,
)
from app.analytics.sync import analytics_tick
from app.analytics.schemas import SourceConfig
from app.creatives.models import CreativeAsset
from app.creatives.service import snapshot
from app.core.security import get_password_hash

if os.environ.get("ANALYTICS_DEMO") != "1":
    raise RuntimeError("Explicit analytics simulation required")
app = fixture.app
settings.GOOGLE_ADS_CLIENT_ID = "test-client"
settings.GOOGLE_ADS_CLIENT_SECRET = "test-secret"
settings.GOOGLE_ADS_DEVELOPER_TOKEN = "test-developer"
settings.TIKTOK_ADS_APP_ID = "test-app"
settings.TIKTOK_ADS_APP_SECRET = "test-secret"
with SessionLocal() as db:
    owner = db.query(User).filter_by(email=os.environ["TEST_EMAIL"]).one()
    owner_id = owner.id
    for platform, model, values in [
        (
            "google",
            GoogleAdsConnection,
            {"customer_id": "123", "encrypted_refresh_token": "test-unused"},
        ),
        (
            "tiktok",
            TikTokAdsConnection,
            {"advertiser_id": "456", "encrypted_refresh_token": "test-unused"},
        ),
    ]:
        if not db.query(model).filter_by(user_id=owner.id).first():
            db.add(
                model(
                    user_id=owner.id,
                    account_name="test-" + platform,
                    is_active=True,
                    **values,
                )
            )
    if not db.get(User, "test-analytics-viewer"):
        db.add(
            User(
                id="test-analytics-viewer",
                email="test-analytics-viewer@example.com",
                name="test-viewer",
                hashed_password=get_password_hash(os.environ["TEST_PASSWORD"]),
                is_active=True,
                is_superuser=False,
            )
        )
    for group in range(3):
        for i in range(12):
            identity = f"test-pattern-{group}-{i}"
            if not db.get(CreativeAsset, identity):
                db.add(
                    CreativeAsset(
                        id=identity,
                        name=identity,
                        source_type="external_upload",
                        created_by_id=owner.id,
                        media_url="https://example.com/" + identity + ".png",
                        media_type="image",
                        analysis_status="ready",
                        metadata_revision=1,
                        metadata_values={
                            "lighting": "hard" if i < 3 else "soft",
                            "background": "studio" if i < 3 else "outdoors",
                        },
                    )
                )
    db.commit()


class Provider:
    def __init__(self, db, source, engine):
        self.platform = source.platform

    def discover(self, cursor=None):
        identity = "123" if self.platform == "google" else "456"
        return [
            dict(
                external_id=identity,
                name="test-" + self.platform + "-account",
                currency="USD",
                timezone="UTC",
                manager_id=None,
            )
        ], None

    def page(self, account, since, until, cursor):
        day = (datetime.now(timezone.utc) - timedelta(days=4)).date()
        if not since <= day <= until:
            return [], None
        return [
            dict(
                external_key=f"test-remote-{g}-{i}",
                external_id=str(1000 + g * 12 + i),
                name=f"test-remote-{g}-{i}",
                account_id=account.external_id,
                report_date=day.isoformat(),
                currency="USD",
                timezone="UTC",
                dataset=self.platform + ":test-conversion:v1",
                dimensions={
                    "campaign_id": "999",
                    "group_id": str(g + 100),
                    "objective": "test-sales",
                    "format": "image",
                },
                impressions="2000",
                clicks="200" if i < 3 else "20",
                spend="100.29",
                conversions="10" if i < 3 else "0",
                conversion_value="250" if i < 3 else "0",
            )
            for g in range(3)
            for i in range(12)
        ], None


@app.post("/test-analytics/tick")
def tick():
    for _ in range(12):
        analytics_tick(engine, Provider)
    with SessionLocal() as db:
        for ad in db.query(AnalyticsAd).filter(AnalyticsAd.name == "test-remote-0-0"):
            ad.creative_asset_id = None
            ad.creative_snapshot = None
            ad.binding_revision = 0
        db.flush()
        for ad in db.query(AnalyticsAd).filter(AnalyticsAd.creative_asset_id.is_(None)):
            if ad.name == "test-remote-0-0":
                continue
            asset = db.get(
                CreativeAsset, ad.name.replace("test-remote", "test-pattern")
            )
            ad.creative_asset_id = asset.id
            ad.creative_snapshot = snapshot(asset)
            ad.binding_revision = 1
            ad.linked_by_id = owner_id
            ad.linked_at = datetime.now(timezone.utc)
        db.commit()
    return {"simulated": True}
