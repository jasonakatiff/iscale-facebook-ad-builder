from datetime import datetime, timedelta, timezone
from decimal import Decimal
from sqlalchemy import select
from app.analytics import config
from app.analytics.models import (
    AnalyticsSource,
    AnalyticsAccount,
    AnalyticsAd,
    AnalyticsInsight,
)
from app.delivery.models import ManagedAd, AdInsight
from app.delivery.provider import decimal_value


def action_value(values, event):
    if values is None:
        return None
    found = [r.get("value", "0") for r in values if r.get("action_type") == event]
    if len(found) > 1:
        raise ValueError(
            "Duplicate conversion event values prevent a reliable comparison"
        )
    return str(decimal_value(found[0] if found else "0"))


def observations(db, user, options, platform=None, account_id=None, all_users=False):
    since = (
        datetime.now(timezone.utc)
        - timedelta(days=options.days + options.maturity_days + 2)
    ).date()
    rows = []
    if platform in {None, "google", "tiktok"}:
        q = (
            select(AnalyticsInsight, AnalyticsAd, AnalyticsAccount, AnalyticsSource)
            .join(AnalyticsAd, AnalyticsInsight.ad_id == AnalyticsAd.id)
            .join(AnalyticsAccount, AnalyticsAd.account_id == AnalyticsAccount.id)
            .join(AnalyticsSource, AnalyticsAccount.source_id == AnalyticsSource.id)
            .where(AnalyticsInsight.report_date >= since)
        )
        if not all_users:
            q = q.where(AnalyticsSource.owner_id == user.id)
        if platform:
            q = q.where(AnalyticsSource.platform == platform)
        if account_id:
            q = q.where(AnalyticsAccount.external_id == account_id)
        for insight, ad, account, source in db.execute(
            q.order_by(AnalyticsInsight.report_date.desc(), AnalyticsInsight.id).limit(
                config.MAX_ANALYSIS_ROWS + 1
            )
        ):
            rows.append(
                dict(
                    id=insight.id,
                    ad_key=ad.id,
                    external_ad_id=ad.external_id,
                    name=ad.name,
                    platform=source.platform,
                    account_id=account.external_id,
                    account_name=account.name,
                    currency=insight.currency,
                    timezone=insight.timezone,
                    attribution=insight.dataset,
                    report_date=insight.report_date.isoformat(),
                    snapshot=ad.creative_snapshot,
                    linked_by_id=ad.linked_by_id,
                    launched_by_id=None,
                    **{
                        k: insight.dimensions.get(k)
                        for k in ["campaign_id", "group_id", "objective", "format"]
                    },
                    **{
                        k: (
                            str(getattr(insight, k))
                            if getattr(insight, k) is not None
                            else None
                        )
                        for k in [
                            "impressions",
                            "clicks",
                            "spend",
                            "conversions",
                            "conversion_value",
                        ]
                    },
                    imported_at=insight.imported_at.isoformat()
                )
            )
    if platform in {None, "meta"}:
        q = (
            select(AdInsight, ManagedAd)
            .join(ManagedAd, AdInsight.managed_ad_id == ManagedAd.id)
            .where(AdInsight.report_date >= since)
        )
        if not all_users:
            q = q.where(ManagedAd.owner_id == user.id)
        if account_id:
            q = q.where(ManagedAd.account_id == account_id)
        for insight, ad in db.execute(
            q.order_by(AdInsight.report_date.desc(), AdInsight.id).limit(
                config.MAX_ANALYSIS_ROWS + 1
            )
        ):
            rows.append(
                dict(
                    id=insight.id,
                    ad_key="meta:" + ad.id,
                    external_ad_id=ad.fb_ad_id,
                    name=ad.name,
                    platform="meta",
                    account_id=ad.account_id,
                    account_name=ad.account_id,
                    currency=insight.currency,
                    timezone=insight.account_timezone,
                    attribution=insight.dataset + ":" + options.meta_conversion_event,
                    report_date=insight.report_date.isoformat(),
                    snapshot=ad.creative_snapshot,
                    linked_by_id=None,
                    launched_by_id=ad.owner_id,
                    campaign_id=None,
                    group_id=ad.fb_adset_id,
                    objective="adset_defined",
                    format=(ad.creative_snapshot or {}).get("media_type"),
                    impressions=str(insight.impressions),
                    clicks=str(insight.clicks),
                    spend=str(insight.spend),
                    conversions=action_value(
                        insight.actions, options.meta_conversion_event
                    ),
                    conversion_value=action_value(
                        insight.action_values, options.meta_conversion_event
                    ),
                    imported_at=insight.imported_at.isoformat(),
                )
            )
    if len(rows) > config.MAX_ANALYSIS_ROWS:
        raise ValueError(
            "Select a platform, account or shorter period; the report exceeds 50,000 daily rows"
        )
    return rows
