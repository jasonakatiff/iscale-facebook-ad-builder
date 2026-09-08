from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta

import pytest

from app.delivery.queue import get_settings, utcnow


def test_concurrent_requests_share_one_budget(engine, sessions):
    from app.delivery.budget import RequestBudget, RequestDeferred

    with sessions() as db:
        settings = get_settings(db)
        settings.api_requests_per_minute = 3
        settings.import_requests_per_minute = 2
        settings.account_requests_per_minute = 3
        settings.api_max_concurrency = 10
        db.commit()

    def reserve(_):
        try:
            budget = RequestBudget(engine)
            ticket = budget.reserve("act_123", "interactive")
            budget.finish(ticket)
            return True
        except RequestDeferred:
            return False

    with ThreadPoolExecutor(max_workers=6) as pool:
        assert sum(pool.map(reserve, range(8))) == 3


def test_import_allowance_preserves_launch_headroom(engine, sessions):
    from app.delivery.budget import RequestBudget, RequestDeferred

    with sessions() as db:
        settings = get_settings(db)
        settings.api_requests_per_minute = 4
        settings.import_requests_per_minute = 2
        db.commit()
    budget = RequestBudget(engine)
    budget.finish(budget.reserve("act_123", "import", cost=2))
    with pytest.raises(RequestDeferred):
        budget.reserve("act_456", "import")
    budget.finish(budget.reserve("act_456", "interactive", cost=2))
    with pytest.raises(RequestDeferred):
        budget.reserve("act_789", "interactive")


def test_cooldowns_and_concurrency_are_shared(engine, sessions):
    from app.delivery.budget import RequestBudget, RequestDeferred

    with sessions() as db:
        get_settings(db).api_max_concurrency = 1
        db.commit()
    budget = RequestBudget(engine)
    ticket = budget.reserve("act_123", "import")
    with pytest.raises(RequestDeferred):
        RequestBudget(engine).reserve("act_456", "interactive")
    budget.finish(ticket, {"X-App-Usage": '{"call_count":85}'})
    with pytest.raises(RequestDeferred) as deferred:
        RequestBudget(engine).reserve("act_456", "interactive")
    assert deferred.value.until > utcnow() + timedelta(seconds=30)


def test_denied_reservation_does_not_consume_capacity(engine, sessions):
    from app.delivery.budget import RequestBudget, RequestDeferred
    from app.delivery.models import ApiRequest

    with sessions() as db:
        get_settings(db).account_requests_per_minute = 1
        db.commit()
    budget = RequestBudget(engine)
    budget.finish(budget.reserve("act_123", "interactive"))
    with pytest.raises(RequestDeferred):
        budget.reserve("act_123", "interactive")
    budget.finish(budget.reserve("act_456", "interactive"))
    with sessions() as db:
        assert db.query(ApiRequest).count() == 2


def test_daily_budget_reserves_import_headroom_and_resets_after_24_hours(
    engine, sessions, monkeypatch
):
    import app.delivery.budget as module

    with sessions() as db:
        get_settings(db).api_daily_request_limit = 4
        db.commit()
    now = utcnow()
    monkeypatch.setattr(module, "now_utc", lambda: now)
    budget = module.RequestBudget(engine)
    budget.finish(budget.reserve("act_123", "import", cost=2))
    with pytest.raises(module.RequestDeferred):
        budget.reserve("act_123", "import")
    budget.finish(budget.reserve("act_123", "interactive", cost=2))
    with pytest.raises(module.RequestDeferred) as blocked:
        budget.reserve("act_456", "interactive")
    assert blocked.value.until == now + timedelta(days=1)
    monkeypatch.setattr(module, "now_utc", lambda: now + timedelta(days=1, seconds=1))
    budget.finish(budget.reserve("act_456", "import"))


def test_account_cooldown_leaves_other_accounts_available(engine, sessions):
    from app.delivery.budget import RequestBudget, RequestDeferred

    with sessions() as db:
        get_settings(db)
        db.commit()
    budget = RequestBudget(engine)
    budget.finish(
        budget.reserve("act_123", "import"),
        {"X-Ad-Account-Usage": '{"acc_id_util_pct":90}'},
    )
    with pytest.raises(RequestDeferred):
        budget.reserve("act_123", "interactive")
    budget.finish(budget.reserve("act_456", "interactive"))
