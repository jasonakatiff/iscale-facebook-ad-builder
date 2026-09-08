"""Real local API and PostgreSQL with simulated storage, analysis and delivery."""

import os
from datetime import datetime, timedelta, timezone
from uuid import uuid4
from types import SimpleNamespace
from app.core.config import settings
from app.api.v1 import uploads

from tests import feedback_server as fixture
from app.creatives import api as creatives
from app.creatives.models import CreativeAsset
from app.creatives.service import register_generated
from app.database import SessionLocal, engine
from app.delivery import queue, sync
from app.delivery.models import (
    DeliveryJob,
    DeliverySettings,
    DeliverySync,
    DeliveryPostAttempt,
)
from app.models import GeneratedAd, User

if (
    os.environ.get("CREATIVE_DEMO") != "1"
    or os.environ.get("DELIVERY_WORKER_ENABLED") != "false"
):
    raise RuntimeError(
        "Explicit isolated creative fixture and disabled live workers required"
    )

app = fixture.app
uploads.get_s3_client = lambda: SimpleNamespace(
    upload_fileobj=lambda file, *args, **kwargs: file.read()
)
settings.R2_PUBLIC_URL = "https://example.com"
settings.R2_BUCKET_NAME = "test-creatives"
creatives.analyze_media = lambda *args: {
    "background": "studio",
    "lighting": "natural",
    "color_scheme": "warm",
}

with SessionLocal() as db:
    owner = db.query(User).filter_by(email=os.environ["TEST_EMAIL"]).one()
    if not db.get(GeneratedAd, "test-generated-creative"):
        ad = GeneratedAd(
            id="test-generated-creative",
            created_by_id=owner.id,
            headline="test-generated-creative",
            image_url="https://example.com/test.png",
        )
        db.add(ad)
        db.flush()
        asset = register_generated(db, ad, owner.id)
        asset.metadata_values = {"lighting": "natural", "background": "studio"}
        asset.metadata_revision, asset.analysis_status = 1, "ready"
        db.commit()


class SimulatedDelivery:
    def upload_image(self, *args):
        return "test-hash"

    def upload_video(self, *args, **kwargs):
        return {"video_id": "123456", "status": "processing"}

    def video_status(self, *args):
        return {"status": {"video_status": "ready"}}

    def video_thumbnails(self, *args):
        return ["https://example.com/test-thumbnail.png"]

    def create_creative(self, *args):
        return {"id": "123457"}

    def create_ad(self, *args):
        return {"id": str(uuid4().int)[:18]}

    def account_info(self, account_id):
        return {"id": account_id, "currency": "USD", "timezone_name": "UTC"}

    def start_report(self, account_id, since, until):
        return "123458"

    def report_status(self, report_id):
        return {
            "id": report_id,
            "async_status": "Job Completed",
            "async_percent_completion": 100,
        }

    def report_page(self, report_id, cursor=None):
        from app.delivery.models import ManagedAd

        today = datetime.now(timezone.utc).date().isoformat()
        with SessionLocal() as db:
            return [
                {
                    "account_id": ad.account_id.removeprefix("act_"),
                    "ad_id": ad.fb_ad_id,
                    "date_start": today,
                    "date_stop": today,
                    "impressions": "100",
                    "clicks": "3",
                    "spend": "0.29",
                    "actions": [],
                }
                for ad in db.query(ManagedAd)
            ], None


@app.post("/test-creatives/tick")
def tick():
    """Advance only this isolated fixture; no provider writes or background loop."""
    with SessionLocal() as db:
        for job in db.query(DeliveryJob).filter(DeliveryJob.status == "queued"):
            job.available_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        config = queue.get_settings(db)
        config.paused = False
        for job in db.query(DeliveryJob).filter(
            DeliveryJob.post_started_at.isnot(None)
        ):
            job.post_started_at = datetime.now(timezone.utc) - timedelta(days=2)
            if job.finished_at:
                job.finished_at = datetime.now(timezone.utc) - timedelta(days=2)
        for attempt in db.query(DeliveryPostAttempt):
            attempt.started_at = datetime.now(timezone.utc) - timedelta(days=2)
            if attempt.finished_at:
                attempt.finished_at = datetime.now(timezone.utc) - timedelta(days=2)
        for item in db.query(DeliverySync):
            item.next_run_at = (
                datetime.now(timezone.utc) + timedelta(days=1)
                if item.kind == "status"
                else datetime.now(timezone.utc) - timedelta(seconds=1)
            )
        db.commit()
    queue.posting_tick(engine, SimulatedDelivery)
    sync.sync_tick(engine, SimulatedDelivery)
    return {"simulated": True}
