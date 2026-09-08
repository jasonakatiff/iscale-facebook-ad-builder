"""Shared admission control for provider requests; limits are application policy."""

import json
from datetime import datetime, timedelta, timezone
from urllib.parse import urlsplit

from sqlalchemy import delete, func, select, text
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.delivery import config
from app.delivery.models import ApiCooldown, ApiRequest, DeliverySettings


def now_utc():
    return datetime.now(timezone.utc)


class RequestDeferred(Exception):
    def __init__(self, until, may_have_written=False, platform="meta"):
        label = {"meta": "Facebook", "google": "Google", "tiktok": "TikTok"}[platform]
        super().__init__(label + " request budget is busy; work has been deferred")
        self.until = until
        self.may_have_written = may_have_written


class RequestBudget:
    def __init__(self, engine=None, platform="meta"):
        if engine is None:
            from app.database import engine
        self.engine = engine
        if platform not in {"meta", "google", "tiktok"}:
            raise ValueError("Unsupported request platform")
        self.platform = platform

    def scope(self, value):
        return value if self.platform == "meta" else self.platform + ":" + value

    def deferred(self, until):
        return RequestDeferred(until, platform=self.platform)

    def limits(self, db):
        if self.platform == "meta":
            db.execute(insert(DeliverySettings).values(id=1).on_conflict_do_nothing())
            return db.get(DeliverySettings, 1)
        from types import SimpleNamespace
        from app.analytics.models import AnalyticsSettings
        from app.analytics.schemas import SourceConfig

        stored = db.get(AnalyticsSettings, self.platform)
        values = SourceConfig.model_validate(
            stored.values if stored else {}
        ).model_dump()
        return SimpleNamespace(
            **values,
            import_requests_per_minute=values["api_requests_per_minute"],
            account_requests_per_minute=values["api_requests_per_minute"],
            api_usage_pause_percent=80
        )

    def reserve(self, account_id, lane, cost=1):
        if not isinstance(cost, int) or cost < 1:
            raise ValueError("Request cost must be a positive integer")
        with Session(self.engine) as db, db.begin():
            db.execute(
                text("SELECT pg_advisory_xact_lock(:key)"),
                {
                    "key": config.BUDGET_LOCK_KEY
                    + {"meta": 0, "google": 20, "tiktok": 21}[self.platform]
                },
            )
            settings = self.limits(db)
            now = now_utc()
            cooldown = db.scalar(
                select(func.max(ApiCooldown.until)).where(
                    ApiCooldown.scope.in_(
                        [
                            self.scope("global"),
                            self.scope("account:" + (account_id or "")),
                        ]
                    )
                )
            )
            if cooldown and cooldown > now:
                raise self.deferred(cooldown)
            db.execute(
                delete(ApiRequest).where(
                    ApiRequest.platform == self.platform,
                    ApiRequest.started_at <= now - timedelta(days=1),
                )
            )
            minute = ApiRequest.started_at > now - timedelta(minutes=1)
            totals = db.execute(
                select(
                    func.coalesce(func.sum(ApiRequest.cost), 0),
                    func.coalesce(func.sum(ApiRequest.cost).filter(minute), 0),
                    func.coalesce(
                        func.sum(ApiRequest.cost).filter(
                            minute, ApiRequest.lane == "import"
                        ),
                        0,
                    ),
                    func.coalesce(
                        func.sum(ApiRequest.cost).filter(
                            minute, ApiRequest.account_id == account_id
                        ),
                        0,
                    ),
                    func.min(ApiRequest.started_at),
                    func.coalesce(
                        func.sum(ApiRequest.cost).filter(ApiRequest.lane == "import"), 0
                    ),
                ).where(ApiRequest.platform == self.platform)
            ).one()
            day, total, imports, account, oldest, day_imports = totals
            if day + cost > settings.api_daily_request_limit:
                raise self.deferred((oldest or now) + timedelta(days=1))
            import_daily_limit = max(
                1,
                settings.api_daily_request_limit
                * settings.import_requests_per_minute
                // settings.api_requests_per_minute,
            )
            if lane == "import" and day_imports + cost > import_daily_limit:
                raise self.deferred((oldest or now) + timedelta(days=1))
            if (
                total + cost > settings.api_requests_per_minute
                or (
                    lane == "import"
                    and imports + cost > settings.import_requests_per_minute
                )
                or (
                    account_id and account + cost > settings.account_requests_per_minute
                )
            ):
                raise self.deferred(now + timedelta(minutes=1))
            active = list(
                db.scalars(
                    select(ApiRequest).where(
                        ApiRequest.platform == self.platform,
                        ApiRequest.finished_at.is_(None),
                        ApiRequest.expires_at > now,
                    )
                )
            )
            import_slots = max(
                1, settings.api_max_concurrency - (1 if self.platform == "meta" else 0)
            )
            if len(active) >= settings.api_max_concurrency or (
                lane == "import"
                and sum(item.lane == "import" for item in active) >= import_slots
            ):
                raise self.deferred(min(item.expires_at for item in active))
            ticket = ApiRequest(
                platform=self.platform,
                account_id=account_id,
                lane=lane,
                cost=cost,
                started_at=now,
                expires_at=now + timedelta(seconds=config.REQUEST_LEASE_SECONDS),
            )
            db.add(ticket)
            db.flush()
            return ticket.id

    def finish(self, ticket_id, headers=None, status=200):
        headers = {str(key).lower(): value for key, value in (headers or {}).items()}
        with Session(self.engine) as db, db.begin():
            ticket = db.get(ApiRequest, ticket_id)
            if ticket is None:
                return
            now = now_utc()
            ticket.finished_at = now
            settings = self.limits(db)
            pauses = {}
            for header in [
                "x-app-usage",
                "x-ad-account-usage",
                "x-business-use-case-usage",
            ]:
                try:
                    usage = json.loads(headers.get(header, "{}"))
                except (TypeError, ValueError):
                    continue
                scopes = (
                    usage.items()
                    if header == "x-business-use-case-usage" and isinstance(usage, dict)
                    else [(None, usage)]
                )
                for account, value in scopes:
                    records = value if isinstance(value, list) else [value]
                    for record in records:
                        if not isinstance(record, dict):
                            continue
                        values = [
                            record.get(key, 0)
                            for key in [
                                "call_count",
                                "total_cputime",
                                "total_time",
                                "acc_id_util_pct",
                            ]
                        ]
                        high = any(
                            isinstance(value, (int, float))
                            and value >= settings.api_usage_pause_percent
                            for value in values
                        )
                        regain = record.get("estimated_time_to_regain_access", 0)
                        regain = regain if isinstance(regain, (int, float)) else 0
                        if high or regain > 0:
                            scope = "global"
                            target = (
                                "act_" + str(account).removeprefix("act_")
                                if account
                                else ticket.account_id
                            )
                            if header != "x-app-usage" and target:
                                scope = "account:" + target
                            seconds = max(
                                config.USAGE_COOLDOWN_SECONDS, min(regain * 60, 86400)
                            )
                            pauses[scope] = max(pauses.get(scope, 0), seconds)
            try:
                retry_after = max(0, min(int(headers.get("retry-after", 0)), 86400))
            except (TypeError, ValueError):
                retry_after = 0
            if status == 429 or retry_after:
                scope = (
                    "account:" + ticket.account_id
                    if self.platform == "meta" and ticket.account_id
                    else "global"
                )
                pauses[scope] = max(
                    pauses.get(scope, 0), retry_after, config.USAGE_COOLDOWN_SECONDS
                )
            for scope, seconds in pauses.items():
                statement = insert(ApiCooldown).values(
                    scope=self.scope(scope), until=now + timedelta(seconds=seconds)
                )
                db.execute(
                    statement.on_conflict_do_update(
                        index_elements=["scope"],
                        set_={
                            "until": func.greatest(
                                ApiCooldown.until, statement.excluded.until
                            )
                        },
                    )
                )

    def call(self, operation, *, account_id=None, lane="interactive", cost=1):
        ticket = self.reserve(account_id, lane, cost)
        response = None
        try:
            response = operation()
            return response
        finally:
            self.finish(
                ticket, getattr(response, "headers", None), response_status(response)
            )


def response_status(response):
    status = getattr(response, "status_code", 200)
    if response is not None and status >= 400:
        try:
            data = response.json()
        except (TypeError, ValueError):
            return status
        if (
            isinstance(data, dict)
            and isinstance(data.get("error"), dict)
            and data["error"].get("code") in {4, 17, 32, 613, 80004}
        ):
            return 429
    return status


def request_cost(params):
    params = params or {}
    if not isinstance(params, dict):
        return 1
    batch = params.get("batch")
    if isinstance(batch, str):
        batch = json.loads(batch)
    if isinstance(batch, list):
        return max(1, len(batch))
    ids = params.get("ids")
    return max(1, len(ids.split(","))) if isinstance(ids, str) else 1


def create_api(
    access_token, app_id=None, app_secret=None, lane="interactive", budget=None
):
    from facebook_business.api import FacebookAdsApi
    from facebook_business.session import FacebookSession

    budget = budget or RequestBudget()
    session = FacebookSession(
        app_id=app_id, app_secret=app_secret, access_token=access_token, timeout=120
    )
    api = FacebookAdsApi(session, api_version=config.GRAPH_VERSION)
    api._budget_account_id = None
    api._budget_writes = 0
    api._budget_lane = lane
    api._request_budget = budget
    send = session.requests.request

    def guarded(method, url, **kwargs):
        budget = api._request_budget
        path = urlsplit(url).path.split("/")
        account_id = next(
            (part for part in path if part.startswith("act_")), api._budget_account_id
        )
        cost = request_cost(kwargs.get("params") or kwargs.get("data"))
        try:
            ticket = budget.reserve(account_id, api._budget_lane, cost)
        except RequestDeferred as error:
            error.may_have_written = api._budget_writes > 0
            raise
        response = None
        try:
            if method.upper() != "GET":
                api._budget_writes += 1
            response = send(method, url, **kwargs)
            return response
        finally:
            budget.finish(
                ticket, getattr(response, "headers", None), response_status(response)
            )

    session.requests.request = guarded
    return api
