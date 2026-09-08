from datetime import datetime, timezone
from copy import deepcopy
from sqlalchemy import select, text

from app.creatives.models import CreativeAsset, CreativeEvent
from app.creatives.schemas import CreativeMetadata


def event(db, asset, actor_id, action, details=None):
    db.add(
        CreativeEvent(
            asset_id=asset.id, actor_id=actor_id, action=action, details=details or {}
        )
    )


def lock_asset(db, identity):
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtextextended(:identity, 195558006))"),
        {"identity": identity},
    )


def register_generated(db, ad, actor_id):
    lock_asset(db, "generated:" + ad.id)
    asset = db.scalar(
        select(CreativeAsset).where(CreativeAsset.generated_ad_id == ad.id)
    )
    if asset:
        return asset
    context = {
        **(ad.generation_context or {}),
        "generated_ad_id": ad.id,
        "template_id": ad.template_id,
        "brand_id": ad.brand_id,
        "product_id": ad.product_id,
        "prompt": ad.prompt,
        "dimensions": ad.dimensions,
        "headline": ad.headline,
        "body": ad.body,
        "cta": ad.cta,
    }
    asset = CreativeAsset(
        generated_ad_id=ad.id,
        source_type="system_generated",
        created_by_id=ad.created_by_id,
        registered_by_id=actor_id,
        name=(ad.headline or ad.size_name or "Generated creative")[:255],
        media_url=ad.video_url if ad.media_type == "video" else ad.image_url,
        media_type=ad.media_type or "image",
        thumbnail_url=ad.thumbnail_url,
        generation_context=context,
        metadata_values=CreativeMetadata().model_dump(),
    )
    if not asset.media_url:
        raise ValueError("Generated creative has no saved media")
    db.add(asset)
    db.flush()
    event(db, asset, actor_id, "generated_registered")
    return asset


def snapshot(asset):
    return deepcopy(
        {
            "asset_id": asset.id,
            "source_type": asset.source_type,
            "created_by_id": asset.created_by_id,
            "generated_ad_id": asset.generated_ad_id,
            "media_url": asset.media_url,
            "media_type": asset.media_type,
            "metadata": asset.metadata_values,
            "metadata_revision": asset.metadata_revision,
            "generation_context": asset.generation_context,
            "analysis_model": asset.analysis_model,
            "analyzed_by_id": asset.analyzed_by_id,
            "analyzed_at": asset.analyzed_at.isoformat() if asset.analyzed_at else None,
        }
    )


def now():
    return datetime.now(timezone.utc)
