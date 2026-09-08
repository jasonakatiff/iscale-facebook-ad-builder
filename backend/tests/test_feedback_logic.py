"""Real campaign logic; only the external Meta SDK transport is replaced."""

from copy import deepcopy
from unittest.mock import MagicMock, patch
import pytest
from app.services.campaign_validation import (
    normalize_targeting,
    money_to_minor,
    account_time_to_utc,
    validate_objective,
)
from app.services.facebook_service import FacebookService


def test_money_precision():
    assert money_to_minor("19.99") == 1999
    assert money_to_minor("0.29") == 29
    for value in ["NaN", "-1", "1.001", "", "Infinity"]:
        with pytest.raises(ValueError):
            money_to_minor(value)


def test_account_timezone_and_dst():
    assert (
        account_time_to_utc("2026-09-10T01:00", "America/New_York")
        == "2026-09-10T05:00:00Z"
    )
    for value in ["2026-03-08T02:30", "2026-11-01T01:30"]:
        with pytest.raises(ValueError):
            account_time_to_utc(value, "America/New_York")


def test_targeting_keeps_exclusions_placements_and_audiences_without_display_fields():
    original = {
        "ageMin": 25,
        "ageMax": 60,
        "geo_locations": {
            "countries": [{"key": "US", "name": "United States"}],
            "excluded_regions": [{"key": "3843", "name": "California"}],
        },
        "publisher_platforms": ["facebook", "instagram"],
        "facebook_positions": ["feed"],
        "instagram_positions": ["story"],
        "custom_audiences": [{"id": "11", "name": "Lookalike"}],
        "excluded_custom_audiences": [{"id": "22", "name": "Customers"}],
    }
    before = deepcopy(original)
    result = normalize_targeting(original)
    assert result["geo_locations"] == {"countries": ["US"]}
    assert result["excluded_geo_locations"] == {"regions": [{"key": "3843"}]}
    assert result["facebook_positions"] == ["feed"]
    assert result["instagram_positions"] == ["story"]
    assert result["custom_audiences"] == [{"id": "11"}]
    assert result["excluded_custom_audiences"] == [{"id": "22"}]
    assert result["age_min"] == 25
    assert original == before


def test_invalid_objective_event_rejected():
    with pytest.raises(ValueError, match="conversion"):
        validate_objective("OUTCOME_LEADS", "OFFSITE_CONVERSIONS", "PURCHASE")
    validate_objective("OUTCOME_LEADS", "OFFSITE_CONVERSIONS", "LEAD")
    with pytest.raises(ValueError):
        validate_objective("OUTCOME_TRAFFIC", "OFFSITE_CONVERSIONS", "PURCHASE")


def test_targeting_rejects_conflicting_locations_and_invalid_age():
    with pytest.raises(ValueError):
        normalize_targeting(
            {
                "geo_locations": {"countries": ["US"]},
                "excluded_geo_locations": {"countries": ["US"]},
            }
        )
    with pytest.raises(ValueError):
        normalize_targeting({"ageMin": 70, "ageMax": 80})


@patch("app.services.facebook_service.User")
def test_account_cache_and_manual_sync(meta_user):
    service = FacebookService()
    service.api = MagicMock()
    service.access_token = "test-cache-" + str(id(service))
    meta_user.return_value.get_ad_accounts.return_value = [
        {"id": "act_123", "name": "test-account"}
    ]
    first = service.get_ad_accounts()
    first[0]["name"] = "test-mutated"
    assert service.get_ad_accounts()[0]["name"] == "test-account"
    assert meta_user.return_value.get_ad_accounts.call_count == 1
    service.get_ad_accounts(force_refresh=True)
    assert meta_user.return_value.get_ad_accounts.call_count == 2


@patch("app.services.facebook_service.User")
def test_account_cache_separates_selected_connections(meta_user):
    token = "test-connection-cache"
    meta_user.return_value.get_ad_accounts.return_value = [
        {"id": "act_111", "name": "test-first"},
        {"id": "act_222", "name": "test-second"},
    ]
    first = FacebookService.__new__(FacebookService)
    first.api, first.access_token, first.ad_account_id = object(), token, "act_111"
    second = FacebookService.__new__(FacebookService)
    second.api, second.access_token, second.ad_account_id = object(), token, "act_222"
    assert first.get_ad_accounts(force_refresh=True) == [{"id": "act_111", "name": "test-first"}]
    assert second.get_ad_accounts() == [{"id": "act_222", "name": "test-second"}]
    assert first.get_ad_accounts() == [{"id": "act_111", "name": "test-first"}]
    assert meta_user.return_value.get_ad_accounts.call_count == 2


@patch("app.services.facebook_service.Campaign")
@patch("app.services.facebook_service.AdAccount")
def test_adset_uses_actual_parent_objective_and_budget(meta_account, meta_campaign):
    service = FacebookService()
    meta_account.return_value.api_get.return_value = {
        "timezone_name": "America/New_York",
        "min_daily_budget": 500,
    }
    meta_campaign.return_value.api_get.return_value = {
        "objective": "OUTCOME_LEADS",
        "daily_budget": "1999",
        "bid_strategy": "LOWEST_COST_WITHOUT_CAP",
    }
    payload = {
        "name": "test-adset",
        "campaign_id": "123",
        "objective": "OUTCOME_SALES",
        "budgetType": "ABO",
        "dailyBudget": "19.99",
        "optimizationGoal": "OFFSITE_CONVERSIONS",
        "conversionEvent": "PURCHASE",
        "pixelId": "11",
        "targeting": {"geo_locations": {"countries": ["US"]}},
    }
    with pytest.raises(ValueError):
        service.create_adset(payload, "123")
    meta_account.return_value.create_ad_set.assert_not_called()
    service.create_adset({**payload, "conversionEvent": "LEAD"}, "123")
    params = meta_account.return_value.create_ad_set.call_args.kwargs["params"]
    assert "daily_budget" not in params
    assert params["status"] == "PAUSED"


@patch("app.services.facebook_service.AdAccount")
def test_ads_default_to_paused(meta_account):
    service = FacebookService()
    service.create_ad({"name": "test-ad", "adset_id": "11", "creative_id": "22"}, "123")
    assert (
        meta_account.return_value.create_ad.call_args.kwargs["params"]["status"]
        == "PAUSED"
    )


@patch("app.services.facebook_service.AdAccount")
def test_categories_and_creative_identity_tracking_reach_meta(meta_account):
    service = FacebookService()
    service.create_campaign(
        {
            "name": "test-campaign",
            "objective": "OUTCOME_LEADS",
            "specialAdCategories": ["ISSUES_ELECTIONS_POLITICS"],
        },
        "123",
    )
    assert meta_account.return_value.create_campaign.call_args.kwargs["params"][
        "special_ad_categories"
    ] == ["ISSUES_ELECTIONS_POLITICS"]
    service.create_creative(
        {
            "name": "test-creative",
            "page_id": "11",
            "instagramId": "22",
            "urlParameters": "ad_id={{ad.id}}",
            "website_url": "https://example.com",
            "image_hash": "test-hash",
        },
        "123",
    )
    params = meta_account.return_value.create_ad_creative.call_args.kwargs["params"]
    assert params["object_story_spec"]["instagram_user_id"] == "22"
    assert params["url_tags"] == "ad_id={{ad.id}}"
