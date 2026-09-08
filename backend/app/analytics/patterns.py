"""Stratified winner-overlap tests; ad-group ranking is observational, not causal."""

from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from hashlib import sha256
from itertools import combinations
import json
import math
import random
from zoneinfo import ZoneInfo

from app.analytics import config


def features(snapshot):
    values = dict(snapshot.get("metadata") or {})
    context = snapshot.get("generation_context") or {}
    values.update(
        {key: context.get(key) for key in ["template_id", "brand_id", "product_id"]}
    )
    values.update(
        {
            key: snapshot.get(key)
            for key in ["created_by_id", "source_type", "media_type"]
        }
    )
    if snapshot.get("media_url"):
        values["image_or_video"] = sha256(snapshot["media_url"].encode()).hexdigest()[
            :16
        ]
    template = context.get("template")
    if not context.get("template_id") and isinstance(template, dict):
        values["template"] = template.get("id") or template.get("name")
    palette = context.get("brand_colors")
    if isinstance(palette, (dict, list)) and palette:
        values["brand_palette"] = json.dumps(
            palette, sort_keys=True, separators=(",", ":")
        )
    images = context.get("input_images")
    input_traits = (
        {
            ("input_image", sha256(value.encode()).hexdigest()[:16])
            for value in images[:20]
            if isinstance(value, str) and value
        }
        if isinstance(images, list)
        else set()
    )
    return frozenset(input_traits) | frozenset(
        (str(k), str(v).strip().casefold())
        for k, v in values.items()
        if isinstance(v, (str, int))
        and str(v).strip().casefold() not in {"", "unknown", "none", "null"}
        and len(str(v)) <= 500
    )


def analyze_patterns(rows, options, *, now=None):
    now = now or datetime.now(timezone.utc)
    coverage = dict(
        imported_ads=len({r["ad_key"] for r in rows}),
        unlinked_ads=0,
        immature_rows=0,
        conflicting_creatives=0,
        repeated_creative_groups=0,
        eligible_creatives=0,
        winners=0,
        cohorts=0,
    )
    physical_rows = {}
    conflicts = set()
    conflicting_assets = set()
    for row in rows:
        key = (
            tuple(
                str(row.get(k) or "")
                for k in [
                    "platform",
                    "account_id",
                    "group_id",
                    "external_ad_id",
                    "report_date",
                    "attribution",
                    "currency",
                    "timezone",
                ]
            )
            if row.get("external_ad_id")
            else (row["ad_key"], str(row["report_date"]))
        )
        previous = physical_rows.get(key)
        if previous:
            left, right = previous.get("snapshot") or {}, row.get("snapshot") or {}
            if left.get("asset_id") != right.get("asset_id") or features(
                left
            ) != features(right):
                conflicts.add(key)
                conflicting_assets.update(
                    value
                    for value in [left.get("asset_id"), right.get("asset_id")]
                    if value
                )
            if str(previous.get("imported_at") or "") > str(
                row.get("imported_at") or ""
            ):
                continue
        physical_rows[key] = row
    coverage["duplicate_daily_rows"] = len(rows) - len(physical_rows)
    coverage["conflicting_daily_rows"] = len(conflicts)
    coverage["conflicting_creatives"] = len(conflicting_assets)
    rows = [row for key, row in physical_rows.items() if key not in conflicts]
    unlinked = set()
    units = {}
    for row in rows:
        day = date.fromisoformat(str(row["report_date"]))
        last = now.astimezone(ZoneInfo(row["timezone"])).date() - timedelta(
            days=options.maturity_days + 1
        )
        if day > last:
            coverage["immature_rows"] += 1
            continue
        if day < last - timedelta(days=options.days - 1):
            continue
        snapshot = row.get("snapshot")
        if not snapshot or not snapshot.get("asset_id"):
            unlinked.add(row["ad_key"])
            continue
        cohort = tuple(
            str(row.get(k) or "")
            for k in [
                "platform",
                "account_id",
                "currency",
                "attribution",
                "group_id",
                "objective",
                "format",
            ]
        )
        if not row.get("group_id"):
            continue
        key = cohort + (snapshot["asset_id"],)
        trait_set = features(snapshot)
        unit = units.setdefault(
            key,
            dict(
                cohort=cohort,
                features=trait_set,
                conflict=False,
                asset_id=snapshot["asset_id"],
                snapshot=snapshot,
                impressions=Decimal(0),
                clicks=Decimal(0),
                spend=Decimal(0),
                conversions=Decimal(0),
                conversion_value=Decimal(0),
                value_known=True,
            ),
        )
        unit["conflict"] |= unit["features"] != trait_set
        for metric in ["impressions", "clicks", "spend", "conversions"]:
            unit[metric] += Decimal(str(row[metric]))
        if row.get("conversion_value") is None:
            unit["value_known"] = False
        else:
            unit["conversion_value"] += Decimal(str(row["conversion_value"]))
    coverage["unlinked_ads"] = len(unlinked)
    if len(units) > config.MAX_CREATIVE_UNITS:
        raise ValueError(
            "Select one account or a shorter reporting period; analysis is limited to 2,000 creative/ad-group combinations"
        )
    cohorts = defaultdict(list)
    for unit in units.values():
        if unit["conflict"] or unit["asset_id"] in conflicting_assets:
            if unit["asset_id"] not in conflicting_assets:
                coverage["conflicting_creatives"] += 1
            continue
        if unit["impressions"] < options.min_impressions:
            continue
        if options.metric == "ctr":
            unit["score"] = unit["clicks"] / unit["impressions"]
        elif options.metric == "cpa":
            if unit["spend"] <= 0:
                continue
            unit["score"] = unit["conversions"] / unit["spend"]
        else:
            if not unit["value_known"] or unit["spend"] <= 0:
                continue
            unit["score"] = unit["conversion_value"] / unit["spend"]
        cohorts[unit["cohort"]].append(unit)
    representatives = {}
    for group in cohorts.values():
        for unit in group:
            previous = representatives.get(unit["asset_id"])
            if previous is None or (-unit["impressions"], unit["cohort"]) < (
                -previous["impressions"],
                previous["cohort"],
            ):
                representatives[unit["asset_id"]] = unit
    for key, group in cohorts.items():
        independent = [
            unit for unit in group if representatives[unit["asset_id"]] is unit
        ]
        coverage["repeated_creative_groups"] += len(group) - len(independent)
        cohorts[key] = independent
    eligible = []
    strata = []
    winners = 0
    for key, group in sorted(cohorts.items()):
        if len(group) < options.min_cohort_creatives:
            continue
        if (
            options.metric == "cpa"
            and sum(u["conversions"] for u in group) < options.min_cohort_conversions
        ):
            continue
        group.sort(key=lambda u: (-u["score"], u["asset_id"]))
        count = math.ceil(len(group) * options.winner_percent / 100)
        if group[count - 1]["score"] == group[count]["score"]:
            continue
        start = len(eligible)
        eligible.extend(group)
        indices = list(range(start, len(eligible)))
        strata.append((indices, count))
        winners |= sum(1 << i for i in indices[:count])
    coverage.update(
        eligible_creatives=len(eligible),
        winners=winners.bit_count(),
        cohorts=len(strata),
    )
    masks = defaultdict(int)
    for i, unit in enumerate(eligible):
        singles = [(trait,) for trait in sorted(unit["features"])]
        for candidate in singles + list(combinations(sorted(unit["features"]), 2)):
            masks[candidate] |= 1 << i
    group_masks = [
        (sum(1 << i for i in indices), len(indices)) for indices, _ in strata
    ]
    informative_traits = {
        traits[0]
        for traits, mask in masks.items()
        if len(traits) == 1
        and any(
            0 < (mask & group_mask).bit_count() < size
            for group_mask, size in group_masks
        )
    }
    candidates = []
    for traits, mask in masks.items():
        if not all(trait in informative_traits for trait in traits):
            continue
        comparable = 0
        expected = 0.0
        for indices, k in strata:
            group_mask = sum(1 << i for i in indices)
            count = (mask & group_mask).bit_count()
            if 0 < count < len(indices):
                comparable |= group_mask
                expected += count * k / len(indices)
        mask &= comparable
        support = mask.bit_count()
        if support < options.min_trait_creatives:
            continue
        candidates.append(
            dict(
                traits=traits,
                mask=mask,
                support=support,
                expected=expected,
                observed=(mask & winners).bit_count(),
                exceed=1,
            )
        )
    candidates.sort(key=lambda c: (-c["support"], c["traits"]))
    total_candidates = len(candidates)
    candidates = candidates[: config.MAX_CANDIDATES]
    if candidates:
        rng = random.Random(195558010)
        for _ in range(config.PERMUTATIONS):
            sample = 0
            for indices, k in strata:
                for i in rng.sample(indices, k):
                    sample |= 1 << i
            for candidate in candidates:
                candidate["exceed"] += (
                    sample & candidate["mask"]
                ).bit_count() >= candidate["observed"]
        ordered = sorted(candidates, key=lambda c: c["exceed"])
        q = 1.0
        for rank in range(len(ordered), 0, -1):
            candidate = ordered[rank - 1]
            candidate["p"] = candidate["exceed"] / (config.PERMUTATIONS + 1)
            q = min(q, candidate["p"] * len(ordered) / rank)
            candidate["q"] = q
    output = []
    for c in candidates:
        if c["observed"] <= c["expected"]:
            continue
        output.append(
            dict(
                traits=[{"field": k, "value": v} for k, v in c["traits"]],
                support=c["support"],
                winner_count=c["observed"],
                expected_winners=round(c["expected"], 3),
                winner_rate=round(c["observed"] / c["support"], 4),
                baseline_winner_rate=round(c["expected"] / c["support"], 4),
                p_value=round(c["p"], 6),
                q_value=round(c["q"], 6),
                evidence="supported" if c["q"] <= options.max_fdr else "exploratory",
                creative_examples=list(
                    {
                        u["asset_id"]: {
                            key: u["snapshot"].get(key)
                            for key in [
                                "asset_id",
                                "name",
                                "media_url",
                                "media_type",
                                "source_type",
                            ]
                        }
                        for i, u in enumerate(eligible)
                        if c["mask"] & (1 << i)
                    }.values()
                )[:12],
                creative_ids=sorted(
                    {
                        u["asset_id"]
                        for i, u in enumerate(eligible)
                        if c["mask"] & (1 << i)
                    }
                )[:12],
            )
        )
    output.sort(
        key=lambda c: (
            c["q_value"],
            -(c["winner_count"] - c["expected_winners"]),
            c["traits"][0]["field"],
        )
    )
    return {
        "data": output[:50],
        "coverage": coverage,
        "tested_patterns": len(candidates),
        "available_patterns": total_candidates,
        "method": "within-ad-group winner ranking; stratified permutation; Benjamini-Hochberg FDR",
        "permutations": config.PERMUTATIONS,
        "settings": options.model_dump(),
        "computed_at": now.isoformat(),
    }
