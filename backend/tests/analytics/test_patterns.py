from copy import deepcopy
from datetime import datetime, timezone
from app.analytics.patterns import analyze_patterns
from app.analytics.schemas import PatternConfig

NOW = datetime(2026, 9, 8, 12, tzinfo=timezone.utc)


def observations(groups=3, count=12):
    rows = []
    for group in range(groups):
        for i in range(count):
            winner = i < 3
            rows.append(
                dict(
                    ad_key=f"test-{group}-{i}",
                    platform="google",
                    account_id="123",
                    currency="USD",
                    attribution="primary:interaction",
                    group_id=str(group),
                    objective="SEARCH",
                    report_date="2026-09-04",
                    timezone="UTC",
                    impressions="2000",
                    clicks="200" if winner else "20",
                    spend="100.29",
                    conversions="10" if winner else "0",
                    conversion_value=None,
                    snapshot={
                        "asset_id": f"test-creative-{group}-{i}",
                        "metadata_revision": 1,
                        "metadata": {
                            "lighting": "hard" if winner else "soft",
                            "background": "studio" if winner else "outdoors",
                        },
                        "generation_context": {},
                        "source_type": "external_upload",
                        "created_by_id": "test-buyer",
                    },
                )
            )
    return rows


def test_finds_supported_single_and_paired_traits_without_zero_conversion_survivor_bias():
    result = analyze_patterns(observations(), PatternConfig(), now=NOW)
    assert result["coverage"]["eligible_creatives"] == 36
    assert result["coverage"]["winners"] == 9
    hard = next(
        p
        for p in result["data"]
        if p["traits"] == [{"field": "lighting", "value": "hard"}]
    )
    assert hard["support"] == 9 and hard["winner_count"] == 9
    assert hard["evidence"] == "supported" and hard["q_value"] <= 0.1
    assert any(
        len(p["traits"]) == 2 and p["evidence"] == "supported" for p in result["data"]
    )


def test_duplicate_ads_do_not_inflate_independent_creative_count():
    rows = observations()
    copies = [{**deepcopy(r), "ad_key": r["ad_key"] + "-copy"} for r in rows]
    a = analyze_patterns(rows, PatternConfig(), now=NOW)
    b = analyze_patterns(rows + copies, PatternConfig(), now=NOW)
    assert (
        a["coverage"]["eligible_creatives"] == b["coverage"]["eligible_creatives"] == 36
    )
    assert a["data"] == b["data"]


def test_tied_cohort_is_not_arbitrarily_ranked():
    rows = observations()
    for row in rows:
        row["conversions"] = "10"
    result = analyze_patterns(rows, PatternConfig(), now=NOW)
    assert result["coverage"]["winners"] == 0 and result["data"] == []


def test_separates_currency_and_account_and_excludes_missing_links_and_immature_days():
    rows = observations(groups=1, count=4)
    rows[0]["currency"] = "EUR"
    rows[1]["account_id"] = "456"
    rows[2]["snapshot"] = None
    rows[3]["report_date"] = "2026-09-08"
    result = analyze_patterns(rows, PatternConfig(), now=NOW)
    assert result["data"] == []
    assert result["coverage"]["unlinked_ads"] == 1
    assert result["coverage"]["immature_rows"] == 1


def test_roas_does_not_treat_unavailable_revenue_as_zero():
    result = analyze_patterns(observations(), PatternConfig(metric="roas"), now=NOW)
    assert result["data"] == [] and result["coverage"]["eligible_creatives"] == 0


def test_traits_constant_within_ad_groups_do_not_become_cross_group_signals():
    rows = observations()
    for row in rows:
        row["snapshot"]["metadata"] = {"background": row["group_id"]}
    assert analyze_patterns(rows, PatternConfig(), now=NOW)["data"] == []


def test_conflicting_snapshots_for_one_creative_are_excluded():
    rows = observations()
    conflicting = deepcopy(rows[0])
    conflicting["snapshot"]["metadata"]["lighting"] = "different"
    result = analyze_patterns(rows + [conflicting], PatternConfig(), now=NOW)
    assert result["coverage"]["conflicting_creatives"] == 1


def test_reusing_same_creatives_across_accounts_does_not_multiply_evidence():
    rows = observations()
    repeated = [
        {
            **deepcopy(row),
            "account_id": "456",
            "ad_key": row["ad_key"] + "-other-account",
        }
        for row in rows
    ]
    original = analyze_patterns(rows, PatternConfig(), now=NOW)
    result = analyze_patterns(rows + repeated, PatternConfig(), now=NOW)
    assert (
        result["coverage"]["eligible_creatives"]
        == original["coverage"]["eligible_creatives"]
    )
    assert result["coverage"]["repeated_creative_groups"] == len(rows)
    assert result["data"] == original["data"]


def test_pairs_do_not_promote_a_constant_strategist_as_a_signal():
    result = analyze_patterns(observations(), PatternConfig(), now=NOW)
    assert all(
        trait["field"] != "created_by_id"
        for item in result["data"]
        for trait in item["traits"]
    )


def test_two_connections_to_one_remote_ad_do_not_double_exposure():
    rows = observations()
    for row in rows:
        row["external_ad_id"] = row["ad_key"]
        row["impressions"] = "600"
    copies = [
        {**deepcopy(row), "ad_key": row["ad_key"] + "-connection"} for row in rows
    ]
    result = analyze_patterns(rows + copies, PatternConfig(), now=NOW)
    assert result["coverage"]["eligible_creatives"] == 0
    assert result["coverage"]["duplicate_daily_rows"] == len(rows)


def test_generation_inputs_include_source_images_builtin_template_and_palette():
    from app.analytics.patterns import features
    from hashlib import sha256

    snapshot = {
        "generation_context": {
            "input_images": ["https://example.com/product.png"],
            "template": {"id": "builtin-comparison"},
            "brand_colors": {"primary": "#FF0000"},
        }
    }
    result = features(snapshot)
    assert (
        "input_image",
        sha256(b"https://example.com/product.png").hexdigest()[:16],
    ) in result
    assert ("template", "builtin-comparison") in result
    assert ("brand_palette", '{"primary":"#ff0000"}') in result
