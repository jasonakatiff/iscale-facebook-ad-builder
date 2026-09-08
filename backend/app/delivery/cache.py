import hashlib
from datetime import timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.delivery.budget import now_utc
from app.delivery.models import ProviderCache


def cached_metadata(key, access_token, engine, load, force_refresh=False):
    from app.delivery.queue import get_settings

    key += ":" + hashlib.sha256((access_token or "").encode()).hexdigest()[:16]
    with Session(engine) as initial, initial.begin():
        lifetime = get_settings(initial).metadata_cache_hours
    with Session(engine) as db, db.begin():
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 195558005))"),
            {"key": key},
        )
        cached = db.get(ProviderCache, key)
        if (
            cached
            and not force_refresh
            and now_utc() < cached.fetched_at + timedelta(hours=lifetime)
        ):
            return cached.payload
        payload = load()
        db.merge(ProviderCache(key=key, payload=payload, fetched_at=now_utc()))
        return payload
