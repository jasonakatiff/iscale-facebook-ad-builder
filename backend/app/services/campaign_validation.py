"""Campaign draft validation and Meta payload normalization."""

import re
from copy import deepcopy
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
from zoneinfo import ZoneInfo

OBJECTIVES = {
    "OUTCOME_SALES": (
        ["OFFSITE_CONVERSIONS", "LINK_CLICKS"],
        [
            "PURCHASE",
            "ADD_TO_CART",
            "INITIATE_CHECKOUT",
            "ADD_PAYMENT_INFO",
            "SUBSCRIBE",
        ],
    ),
    "OUTCOME_LEADS": (
        ["OFFSITE_CONVERSIONS"],
        ["LEAD", "COMPLETE_REGISTRATION", "CONTACT"],
    ),
    "OUTCOME_TRAFFIC": (
        ["LINK_CLICKS", "LANDING_PAGE_VIEWS", "IMPRESSIONS", "REACH"],
        [],
    ),
    "OUTCOME_ENGAGEMENT": (["POST_ENGAGEMENT", "THRUPLAY", "VIDEO_VIEWS"], []),
    "OUTCOME_AWARENESS": (["REACH", "IMPRESSIONS", "THRUPLAY"], []),
}
SPECIAL_CATEGORIES = {
    "HOUSING",
    "EMPLOYMENT",
    "FINANCIAL_PRODUCTS_SERVICES",
    "ISSUES_ELECTIONS_POLITICS",
}
GEO_TYPES = ("countries", "regions", "cities", "geo_markets", "zips")
PLATFORMS = ("facebook", "instagram", "audience_network", "messenger")


def money_to_minor(value):
    text = str(value).strip()
    if not re.fullmatch(r"\d+(?:\.\d{1,2})?", text):
        raise ValueError("Enter a nonnegative amount with at most two decimal places.")
    try:
        amount = Decimal(text) * 100
        if not amount.is_finite() or amount > 9007199254740991:
            raise ValueError("Amount is too large.")
        return int(amount)
    except InvalidOperation:
        raise ValueError("Invalid amount.")


def account_time_to_utc(value, timezone_name):
    if not timezone_name:
        raise ValueError("Ad account timezone is unavailable. Sync the ad account.")
    try:
        zone = ZoneInfo(timezone_name)
        local = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except (ValueError, KeyError):
        raise ValueError("Invalid start time or ad account timezone.")
    if local.tzinfo:
        return local.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    candidates = set()
    for fold in (0, 1):
        utc = local.replace(tzinfo=zone, fold=fold).astimezone(timezone.utc)
        if utc.astimezone(zone).replace(tzinfo=None) == local:
            candidates.add(utc)
    if len(candidates) != 1:
        raise ValueError(
            "This time is skipped or repeated by daylight saving. Choose another start time."
        )
    return candidates.pop().strftime("%Y-%m-%dT%H:%M:%SZ")


def validate_objective(objective, goal, event):
    config = OBJECTIVES.get(objective)
    if not config or goal not in config[0]:
        raise ValueError(
            "Optimization goal is incompatible with the campaign objective."
        )
    if goal == "OFFSITE_CONVERSIONS" and event not in config[1]:
        raise ValueError(
            "The conversion event is incompatible with the campaign objective."
        )


def normalize_targeting(targeting):
    result = {}
    for source, dest in [("ageMin", "age_min"), ("ageMax", "age_max")]:
        if source in targeting or dest in targeting:
            result[dest] = targeting.get(source, targeting.get(dest))
    minimum, maximum = result.get("age_min", 18), result.get("age_max", 65)
    if (
        not isinstance(minimum, int)
        or not isinstance(maximum, int)
        or not 18 <= minimum <= maximum <= 65
    ):
        raise ValueError(
            "Target ages must be between 18 and 65, with minimum no greater than maximum."
        )
    for field in (
        "genders",
        "publisher_platforms",
        "device_platforms",
        "locales",
        "flexible_spec",
        "interests",
    ):
        if targeting.get(field):
            result[field] = deepcopy(targeting[field])
    for platform in PLATFORMS:
        field = f"{platform}_positions"
        if (
            platform in targeting.get("publisher_platforms", PLATFORMS)
            and field in targeting
        ):
            if not targeting[field]:
                raise ValueError(f"Select at least one {platform} placement.")
            result[field] = list(targeting[field])
    if "publisher_platforms" in targeting and not targeting["publisher_platforms"]:
        raise ValueError("Select at least one placement.")
    geo = targeting.get("geo_locations", {"countries": targeting.get("countries", [])})
    excluded = targeting.get("excluded_geo_locations", {})
    for field, source, prefix in [
        ("geo_locations", geo, ""),
        ("excluded_geo_locations", excluded, "excluded_"),
    ]:
        normalized = {}
        for kind in GEO_TYPES:
            values = source.get(kind) or (geo.get(prefix + kind, []) if prefix else [])
            if not values:
                continue
            locations = []
            for value in values:
                key = str(value.get("key", "") if isinstance(value, dict) else value)
                if not key:
                    raise ValueError("Location key is required.")
                if kind == "countries":
                    locations.append(key.upper())
                else:
                    location = {"key": key}
                    if kind == "cities" and isinstance(value, dict):
                        for attr in ("radius", "distance_unit"):
                            if attr in value:
                                location[attr] = value[attr]
                    locations.append(location)
            normalized[kind] = locations
        if normalized:
            result[field] = normalized
    for kind in GEO_TYPES:
        key = lambda value: value["key"] if isinstance(value, dict) else value
        included = {
            key(value) for value in result.get("geo_locations", {}).get(kind, [])
        }
        excluded = {
            key(value)
            for value in result.get("excluded_geo_locations", {}).get(kind, [])
        }
        if included & excluded:
            raise ValueError("The same location cannot be both included and excluded.")
    for field in ("custom_audiences", "excluded_custom_audiences"):
        if targeting.get(field):
            result[field] = [{"id": str(value["id"])} for value in targeting[field]]
    included_ids = {value["id"] for value in result.get("custom_audiences", [])}
    if included_ids.intersection(
        value["id"] for value in result.get("excluded_custom_audiences", [])
    ):
        raise ValueError("An audience cannot be both included and excluded.")
    return result


def campaign_params(data):
    params = {
        "name": data.get("name"),
        "objective": data.get("objective"),
        "status": data.get("status") or "PAUSED",
        "special_ad_categories": data.get(
            "specialAdCategories", data.get("special_ad_categories", [])
        ),
    }
    if not set(params["special_ad_categories"]).issubset(SPECIAL_CATEGORIES):
        raise ValueError("Invalid Special Ad Category.")
    countries = data.get(
        "specialAdCategoryCountries", data.get("special_ad_category_country", [])
    )
    if countries:
        params["special_ad_category_country"] = countries
    if (data.get("budgetType") or data.get("budget_type")) == "CBO":
        params["daily_budget"] = money_to_minor(
            data.get("dailyBudget", data.get("daily_budget"))
        )
        params["bid_strategy"] = (
            data.get("bidStrategy")
            or data.get("bid_strategy")
            or "LOWEST_COST_WITHOUT_CAP"
        )
    else:
        params["is_adset_budget_sharing_enabled"] = False
    return params


def adset_params(data, timezone_name=None):
    goal = data.get("optimizationGoal") or data.get("optimization_goal")
    event = data.get("conversionEvent") or data.get("conversion_event")
    if data.get("objective"):
        validate_objective(data["objective"], goal, event)
    targeting = normalize_targeting(data.get("targeting", {}))
    targeting["targeting_automation"] = {
        "advantage_audience": data.get(
            "advantageAudience", data.get("advantage_audience", 0)
        )
    }
    params = {
        "name": data.get("name"),
        "campaign_id": data.get("campaign_id"),
        "billing_event": "IMPRESSIONS",
        "optimization_goal": goal,
        "is_dynamic_creative": False,
        "status": data.get("status") or "PAUSED",
        "targeting": targeting,
    }
    if goal == "OFFSITE_CONVERSIONS":
        pixel = data.get("pixelId") or data.get("pixel_id")
        if not pixel or not event:
            raise ValueError(
                "Pixel and conversion event are required for website conversions."
            )
        params["promoted_object"] = {"pixel_id": pixel, "custom_event_type": event}
        params["destination_type"] = "WEBSITE"
        attribution = data.get("attributionSetting", "7d_click")
        attribution_map = {
            "1d_click": [{"event_type": "CLICK_THROUGH", "window_days": 1}],
            "7d_click": [{"event_type": "CLICK_THROUGH", "window_days": 7}],
            "1d_click_1d_view": [
                {"event_type": "CLICK_THROUGH", "window_days": 1},
                {"event_type": "VIEW_THROUGH", "window_days": 1},
            ],
            "7d_click_1d_view": [
                {"event_type": "CLICK_THROUGH", "window_days": 7},
                {"event_type": "VIEW_THROUGH", "window_days": 1},
            ],
        }
        if attribution not in attribution_map:
            raise ValueError("Select a supported attribution window.")
        params["attribution_spec"] = attribution_map[attribution]
    budget_type = data.get("budgetType") or data.get("budget_type")
    strategy = (
        data.get("bidStrategy") or data.get("bid_strategy") or "LOWEST_COST_WITHOUT_CAP"
    )
    if budget_type != "CBO":
        params["daily_budget"] = money_to_minor(
            data.get("dailyBudget", data.get("daily_budget"))
        )
        params["bid_strategy"] = strategy
    if strategy in ("COST_CAP", "LOWEST_COST_WITH_BID_CAP"):
        params["bid_amount"] = money_to_minor(
            data.get("bidAmount", data.get("bid_amount"))
        )
        if not params["bid_amount"]:
            raise ValueError("Bid amount must be positive.")
    start = data.get("startTime") or data.get("start_time")
    if start:
        params["start_time"] = account_time_to_utc(start, timezone_name)
    return params
