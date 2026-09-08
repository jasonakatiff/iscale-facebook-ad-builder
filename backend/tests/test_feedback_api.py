"""Feedback API acceptance tests against an isolated PostgreSQL database."""

from uuid import uuid4


def test_presets_require_auth(client):
    response = client.get("/api/v1/facebook/presets")
    assert response.status_code in (401, 403)
    assert set(response.json()["error"]) == {"code", "message", "details"}


def test_preset_crud_and_pagination(client, auth_headers):
    payload = {
        "name": "test-preset-" + str(uuid4()),
        "vertical": "test-legal",
        "ad_account_id": "act_123",
        "settings": {
            "campaignData": {"objective": "OUTCOME_LEADS"},
            "creativeData": {"pageId": "11"},
        },
    }
    result = client.post("/api/v1/facebook/presets", json=payload, headers=auth_headers)
    assert result.status_code == 201, result.text
    preset_id = result.json()["id"]
    try:
        response = client.get(
            "/api/v1/facebook/presets?ad_account_id=act_123&limit=1&offset=0",
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert set(response.json()["pagination"]) == {
            "total",
            "limit",
            "offset",
            "hasMore",
        }
        assert response.json()["data"][0]["id"] == preset_id
        update = client.put(
            "/api/v1/facebook/presets/" + preset_id,
            json={**payload, "name": "test-updated"},
            headers=auth_headers,
        )
        assert update.status_code == 200
        assert update.json()["name"] == "test-updated"
        missing = client.put(
            "/api/v1/facebook/presets/" + str(uuid4()),
            json=payload,
            headers=auth_headers,
        )
        assert missing.status_code == 404
        assert set(missing.json()["error"]) == {"code", "message", "details"}
    finally:
        assert (
            client.delete(
                "/api/v1/facebook/presets/" + preset_id, headers=auth_headers
            ).status_code
            == 204
        )


def test_preset_rejects_credentials(client, auth_headers):
    response = client.post(
        "/api/v1/facebook/presets",
        json={
            "name": "test-secret",
            "vertical": "",
            "ad_account_id": "act_123",
            "settings": {"accessToken": "test-token"},
        },
        headers=auth_headers,
    )
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "VALIDATION_ERROR"
    assert "test-token" not in response.text


def test_pagination_rejects_invalid_boundaries(client, auth_headers):
    for query in ("limit=0", "offset=-1"):
        response = client.get("/api/v1/facebook/presets?" + query, headers=auth_headers)
        assert response.status_code == 422
        assert response.json()["error"]["code"] == "VALIDATION_ERROR"


def test_preflight_requires_auth_before_accessing_meta(client):
    response = client.post("/api/v1/facebook/preflight", json={})
    assert response.status_code in (401, 403)


def test_preset_owner_isolation(client, auth_headers, db_session):
    from app.models import User, CampaignPreset
    from app.core.security import get_password_hash

    owner = User(
        email="test-other-" + str(uuid4()) + "@example.com",
        hashed_password=get_password_hash("test-password"),
        is_active=True,
    )
    db_session.add(owner)
    db_session.flush()
    preset = CampaignPreset(
        user_id=owner.id,
        name="test-private-preset",
        vertical="",
        ad_account_id="act_123",
        settings={},
    )
    db_session.add(preset)
    db_session.commit()
    try:
        response = client.get("/api/v1/facebook/presets", headers=auth_headers)
        assert not any(row["id"] == preset.id for row in response.json()["data"])
        response = client.delete(
            "/api/v1/facebook/presets/" + preset.id, headers=auth_headers
        )
        assert response.status_code == 404
        assert db_session.get(CampaignPreset, preset.id) is not None
    finally:
        db_session.delete(preset)
        db_session.delete(owner)
        db_session.commit()


def test_tracking_defaults_round_trip(client, auth_headers, test_user, db_session):
    from app.models import CampaignPreference

    account_id = "test-" + str(uuid4())
    try:
        response = client.put(
            "/api/v1/facebook/tracking-defaults?ad_account_id=" + account_id,
            json={"urlParameters": "ad_id={{ad.id}}"},
            headers=auth_headers,
        )
        assert response.status_code == 200
        response = client.get(
            "/api/v1/facebook/tracking-defaults?ad_account_id=" + account_id,
            headers=auth_headers,
        )
        assert response.json() == {
            "urlParameters": "ad_id={{ad.id}}",
            "scope": "account",
        }
    finally:
        db_session.query(CampaignPreference).filter_by(
            id=f"user:{test_user.id}:account:{account_id}"
        ).delete()
        db_session.commit()


def test_new_money_columns_preserve_fractional_budgets(
    client, auth_headers, db_session
):
    from app.models import FacebookCampaign, FacebookAdSet

    campaign_id, adset_id = str(uuid4()), str(uuid4())
    try:
        response = client.post(
            "/api/v1/facebook/campaigns/save",
            json={
                "id": campaign_id,
                "name": "test-precision",
                "objective": "OUTCOME_LEADS",
                "budgetType": "CBO",
                "dailyBudget": "19.99",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        assert db_session.get(FacebookCampaign, campaign_id).daily_budget_minor == 1999
        response = client.post(
            "/api/v1/facebook/adsets/save",
            json={
                "id": adset_id,
                "campaignId": campaign_id,
                "name": "test-precision",
                "optimizationGoal": "OFFSITE_CONVERSIONS",
                "dailyBudget": "19.99",
                "bidAmount": "0.29",
            },
            headers=auth_headers,
        )
        assert response.status_code == 200
        row = db_session.get(FacebookAdSet, adset_id)
        assert row.daily_budget_minor == 1999
        assert row.bid_amount_minor == 29
    finally:
        db_session.query(FacebookAdSet).filter_by(id=adset_id).delete()
        db_session.query(FacebookCampaign).filter_by(id=campaign_id).delete()
        db_session.commit()


def test_additive_migration_preserves_existing_rows():
    import importlib.util
    from pathlib import Path
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from app.database import engine

    spec = importlib.util.spec_from_file_location(
        "feedback_migration",
        Path(__file__).parents[1]
        / "alembic/versions/bw_feedback_001_campaign_settings.py",
    )
    migration = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(migration)
    with engine.connect() as connection:
        transaction = connection.begin()
        try:
            schema = "test_migration_" + uuid4().hex
            connection.exec_driver_sql(f"CREATE SCHEMA {schema}")
            connection.exec_driver_sql(f"SET LOCAL search_path TO {schema}")
            connection.exec_driver_sql("CREATE TABLE users (id varchar PRIMARY KEY)")
            connection.exec_driver_sql(
                "CREATE TABLE facebook_campaigns (id varchar PRIMARY KEY, daily_budget integer)"
            )
            connection.exec_driver_sql(
                "CREATE TABLE facebook_adsets (id varchar PRIMARY KEY, daily_budget integer, bid_amount integer)"
            )
            connection.exec_driver_sql(
                "INSERT INTO facebook_campaigns VALUES ('test-old', 19)"
            )
            with Operations.context(MigrationContext.configure(connection)):
                migration.upgrade()
            assert connection.exec_driver_sql(
                "SELECT daily_budget, daily_budget_minor FROM facebook_campaigns WHERE id = 'test-old'"
            ).one() == (19, None)
            assert (
                connection.exec_driver_sql(
                    "SELECT count(*) FROM campaign_presets"
                ).scalar()
                == 0
            )
        finally:
            transaction.rollback()


def test_dashboard_activity_matches_saved_campaigns(client, auth_headers):
    from app.models import FacebookCampaign
    from app.database import SessionLocal

    campaign_id = str(uuid4())
    # The test process DATABASE_URL is the isolated test database.
    with SessionLocal() as db:
        db.add(
            FacebookCampaign(
                id=campaign_id,
                name="test-recent-campaign",
                objective="OUTCOME_LEADS",
                budget_type="ABO",
            )
        )
        db.commit()
        try:
            response = client.get("/api/v1/dashboard/stats", headers=auth_headers)
            assert response.status_code == 200
            assert any(
                row["id"] == campaign_id for row in response.json()["recent_activity"]
            )
        finally:
            db.query(FacebookCampaign).filter_by(id=campaign_id).delete()
            db.commit()
