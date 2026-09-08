"""Isolated browser QA only: real app/DB, simulated Meta. Never uses provider credentials."""

import os
import sys
import threading
from datetime import date
from pathlib import Path
from urllib.parse import urlsplit

sys.path.insert(0, str(Path(__file__).parents[2]))
target = urlsplit(os.environ.get("DATABASE_URL", ""))
if (
    target.hostname not in {"localhost", "127.0.0.1"}
    or not target.path.startswith("/test_delivery_browser_")
    or os.environ.get("DELIVERY_DEMO") != "1"
):
    raise RuntimeError(
        "Demo requires explicit DELIVERY_DEMO=1 and isolated test_delivery_browser_* localhost database"
    )
if os.environ.get("DELIVERY_WORKER_ENABLED") != "false":
    raise RuntimeError("Real provider workers must be disabled for the demo")

from app.main import app
from app.database import Base, engine, SessionLocal
from app.models import User, Role, Permission, FacebookCampaign, FacebookAdSet
from app.core.security import get_password_hash
from app.delivery.models import DeliverySettings
from app.delivery.queue import posting_tick
from app.delivery.sync import sync_tick
from app.delivery import api
from app.delivery.provider import matches_job
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

ads = {}
serial = 910000


class FakeProvider:
    @classmethod
    def for_user(cls, db, owner_id):
        return cls()

    def upload_image(self, *args):
        return "test-image-hash"

    def upload_video(self, *args, **kwargs):
        return {"video_id": "912345", "status": "processing"}

    def video_status(self, *args):
        return {"status": {"video_status": "ready"}}

    def video_thumbnails(self, *args):
        return ["https://example.com/test-thumbnail.jpg"]

    def create_creative(self, data, account_id):
        return {"id": "913456"}

    def create_ad(self, data, account_id):
        global serial
        serial += 1
        identity = str(serial)
        ads[identity] = {
            "id": identity,
            "name": data["name"],
            "account_id": account_id.removeprefix("act_"),
            "adset_id": data["adset_id"],
            "creative": {"id": data["creative_id"]},
            "effective_status": "PAUSED",
        }
        if data["name"].startswith("test-timeout"):
            raise TimeoutError("test-simulated-lost-response")
        return {"id": identity}

    def account_info(self, account_id):
        return {"id": account_id, "currency": "USD", "timezone_name": "UTC"}

    def ad_status(self, ad_id):
        return ads[ad_id]

    def ad_statuses(self, ad_ids):
        return {ad_id: ads[ad_id] for ad_id in ad_ids}

    def insight_pages(self, account_id, ad_ids, since, until):
        yield [
            {
                "ad_id": ad_id,
                "date_start": until.isoformat(),
                "date_stop": until.isoformat(),
                "impressions": "100",
                "clicks": "3",
                "spend": "0.29",
                "actions": [],
            }
            for ad_id in ad_ids
        ]

    def reconciliation_candidates(self, job):
        return [
            {"id": ad["id"], "name": ad["name"]}
            for ad in ads.values()
            if matches_job(job, ad)
        ]


api.DeliveryProvider = FakeProvider
app.add_middleware(
    CORSMiddleware,
    allow_origins=[os.environ["DELIVERY_DEMO_FRONTEND"]],
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)
Base.metadata.create_all(engine)
with SessionLocal() as db:
    permission = Permission(id="test-delivery-write", name="campaigns:write")
    role = Role(id="test-delivery-buyer-role", name="test-delivery-buyer")
    role.permissions = [permission]
    admin = User(
        id="test-delivery-admin",
        email="test-delivery-admin@example.com",
        name="test-delivery-admin",
        hashed_password=get_password_hash("test-delivery-password"),
        is_active=True,
        is_superuser=True,
    )
    buyer = User(
        id="test-delivery-buyer",
        email="test-delivery-buyer@example.com",
        name="test-delivery-buyer",
        hashed_password=get_password_hash("test-delivery-password"),
        is_active=True,
        roles=[role],
    )
    db.add_all(
        [
            admin,
            buyer,
            DeliverySettings(id=1),
            FacebookCampaign(
                id="test-delivery-campaign",
                name="test-delivery-campaign",
                objective="OUTCOME_SALES",
                budget_type="ABO",
                fb_campaign_id="911111",
            ),
        ]
    )
    db.flush()
    db.add(
        FacebookAdSet(
            id="test-delivery-adset",
            campaign_id="test-delivery-campaign",
            name="test-delivery-adset",
            optimization_goal="OFFSITE_CONVERSIONS",
            fb_adset_id="912222",
        )
    )
    db.commit()

stop = threading.Event()
threads = []


@app.on_event("startup")
def start_demo_workers():
    def run(tick):
        while not stop.is_set():
            tick(engine, FakeProvider)
            stop.wait(0.1)

    for tick in [posting_tick, sync_tick]:
        thread = threading.Thread(target=run, args=(tick,), daemon=True)
        threads.append(thread)
        thread.start()


@app.on_event("shutdown")
def stop_demo_workers():
    stop.set()
    for thread in threads:
        thread.join(timeout=5)


if __name__ == "__main__":
    uvicorn.run(app, host="127.0.0.1", port=int(os.environ["DELIVERY_DEMO_PORT"]))
