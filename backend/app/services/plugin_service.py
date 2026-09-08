"""Private package execution and leased service jobs; no provider credentials or writes."""

import hashlib
import json
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import and_, or_

from app.core import plugin_config as limits
from app.models import PluginInstallation, PluginRun, User
from app.schemas.plugins import PLACEHOLDER, PluginDocument, bounded_json
from app.telemetry.runtime import trace_context

PENDING = ("queued", "running")


def now():
    return datetime.now(timezone.utc)


def digest(value):
    return hashlib.sha256(
        json.dumps(
            value,
            sort_keys=True,
            separators=(",", ":"),
            ensure_ascii=False,
            allow_nan=False,
        ).encode()
    ).hexdigest()


def token_hash(value):
    return hashlib.sha256(value.encode()).hexdigest()


def pagination(total, limit, offset, length):
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "hasMore": offset + length < total,
    }


def plugin_payload(row):
    return {
        "id": row.id,
        "document": row.document,
        "packageDigest": row.package_digest,
        "enabled": row.enabled,
        "configuration": row.configuration,
        "workerKeyPrefix": row.worker_key_prefix,
        "workerKeyExpiresAt": row.worker_key_expires_at,
        "workerLastSeenAt": row.worker_last_seen_at,
        "createdAt": row.created_at,
        "updatedAt": row.updated_at,
    }


def run_payload(row, installation):
    return {
        "id": row.id,
        "pluginId": row.installation_id,
        "pluginName": installation.document["name"],
        "pluginVersion": installation.version,
        "packageDigest": row.package_digest,
        "status": row.status,
        "inputs": row.inputs,
        "configuration": row.configuration,
        "output": row.output,
        "error": row.error,
        "createdAt": row.created_at,
        "completedAt": row.completed_at,
        "expiresAt": row.expires_at,
    }


def owned(db, user_id, plugin_id, include_archived=False):
    query = db.query(PluginInstallation).filter_by(id=str(plugin_id), user_id=user_id)
    if not include_archived:
        query = query.filter(PluginInstallation.archived_at.is_(None))
    row = query.populate_existing().with_for_update().first()
    if row is None:
        raise HTTPException(404, "Plugin not found")
    return row


def owned_run(db, user_id, run_id):
    hint = (
        db.query(PluginRun.installation_id)
        .join(PluginInstallation)
        .filter(
            PluginRun.id == str(run_id),
            PluginInstallation.user_id == user_id,
        )
        .first()
    )
    if hint is None:
        raise HTTPException(404, "Run not found")
    installation = owned(db, user_id, hint.installation_id, include_archived=True)
    expire_runs(db, installation.id)
    row = (
        db.query(PluginRun)
        .filter_by(id=str(run_id))
        .populate_existing()
        .with_for_update()
        .one()
    )
    return installation, row


def expire_runs(db, installation_id):
    timestamp = now()
    db.query(PluginRun).filter(
        PluginRun.installation_id == installation_id,
        PluginRun.status.in_(PENDING),
        or_(
            PluginRun.expires_at <= timestamp,
            and_(
                PluginRun.status == "running", PluginRun.lease_expires_at <= timestamp
            ),
        ),
    ).update(
        {
            "status": "expired",
            "error": "The service deadline expired. Start a new run to try again.",
            "completed_at": timestamp,
        },
        synchronize_session=False,
    )


def cancel_pending(db, row):
    db.query(PluginRun).filter(
        PluginRun.installation_id == row.id, PluginRun.status.in_(PENDING)
    ).update(
        {"status": "cancelled", "completed_at": now()},
        synchronize_session=False,
    )


def bound_values(fields, values, require=True):
    if set(values) - {field.name for field in fields}:
        raise HTTPException(422, "Inputs contain undeclared fields")
    result = {}
    for field in fields:
        value = values.get(field.name, field.default)
        if require and field.required and (value is None or value == ""):
            raise HTTPException(422, f"{field.label} is required")
        if field.kind != "json" and value is not None and not isinstance(value, str):
            raise HTTPException(422, f"{field.label} requires text")
        result[field.name] = value
    try:
        return bounded_json(result)
    except ValueError as error:
        raise HTTPException(422, str(error)) from None


def evaluate_template(template, values):
    remaining = limits.MAX_VALUE_BYTES

    def encoded(value):
        return json.dumps(value, ensure_ascii=False, allow_nan=False)

    def consume(size):
        nonlocal remaining
        remaining -= size
        if remaining < 0:
            raise ValueError("Plugin data exceeds the size limit")

    def render(value):
        if isinstance(value, str):
            match = PLACEHOLDER.fullmatch(value)
            if match:
                result = values[match.group(1)]
                consume(len(encoded(result).encode()))
                return result
            parts = []
            consume(2)

            def append(part):
                consume(len(encoded(part).encode()) - 2)
                parts.append(part)

            cursor = 0
            for match in PLACEHOLDER.finditer(value):
                append(value[cursor : match.start()])
                replacement = values[match.group(1)]
                append(
                    replacement
                    if isinstance(replacement, str)
                    else encoded(replacement)
                )
                cursor = match.end()
            append(value[cursor:])
            return "".join(parts)
        if isinstance(value, list):
            consume(2 + max(0, len(value) - 1) * 2)
            return [render(item) for item in value]
        if isinstance(value, dict):
            consume(2 + max(0, len(value) - 1) * 2)
            result = {}
            for key, child in value.items():
                consume(len(encoded(key).encode()) + 2)
                result[key] = render(child)
            return result
        consume(len(encoded(value).encode()))
        return value

    return render(template)


def install(db, user, document):
    db.query(User).filter_by(id=user.id).with_for_update().one()
    data = document.model_dump(mode="json")
    package_digest = digest(data)
    row = (
        db.query(PluginInstallation)
        .filter_by(user_id=user.id, slug=document.slug, version=document.version)
        .with_for_update()
        .first()
    )
    if row:
        if row.package_digest != package_digest:
            raise HTTPException(
                409,
                "This version already exists with different content. Use a new version.",
            )
        if row.archived_at is not None:
            row.archived_at = None
            row.enabled = True
            row.updated_at = now()
            db.commit()
        return row, False
    if (
        db.query(PluginInstallation).filter_by(user_id=user.id).count()
        >= limits.MAX_INSTALLATIONS
    ):
        raise HTTPException(409, "Plugin version storage limit reached")
    row = PluginInstallation(
        user_id=user.id,
        slug=document.slug,
        version=document.version,
        document=data,
        package_digest=package_digest,
        configuration=bound_values(document.configFields, {}, require=False),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, True


def create_run(db, user, plugin_id, body):
    db.query(User).filter_by(id=user.id).with_for_update().one()
    installation = owned(db, user.id, plugin_id)
    if not installation.enabled:
        raise HTTPException(409, "Enable this plugin before running it")
    document = PluginDocument.model_validate(installation.document)
    inputs = bound_values(document.inputs, body.inputs)
    configuration = bound_values(document.configFields, installation.configuration)
    input_digest = digest(
        {
            "inputs": inputs,
            "configuration": configuration,
            "package": installation.package_digest,
        }
    )
    existing = (
        db.query(PluginRun)
        .filter_by(installation_id=installation.id, request_id=str(body.requestId))
        .first()
    )
    if existing:
        if existing.input_digest != input_digest:
            raise HTTPException(
                409, "This request ID was used with different inputs or configuration"
            )
        expire_runs(db, installation.id)
        db.refresh(existing)
        result = run_payload(existing, installation)
        db.commit()
        return result, 200
    expire_runs(db, installation.id)
    if (
        db.query(PluginRun)
        .join(PluginInstallation)
        .filter(PluginInstallation.user_id == user.id)
        .count()
        >= limits.MAX_RUNS
    ):
        raise HTTPException(409, "Plugin run history storage limit reached")
    if (
        db.query(PluginRun)
        .filter(
            PluginRun.installation_id == installation.id, PluginRun.status.in_(PENDING)
        )
        .count()
        >= limits.MAX_PENDING_RUNS
    ):
        raise HTTPException(409, "Too many pending runs for this plugin")
    output = None
    if document.execution == "template":
        try:
            output = bounded_json(
                evaluate_template(document.template, {**configuration, **inputs})
            )
        except ValueError as error:
            raise HTTPException(422, str(error)) from None
    timestamp = now()
    row = PluginRun(
        installation_id=installation.id,
        request_id=str(body.requestId),
        input_digest=input_digest,
        package_digest=installation.package_digest,
        inputs=inputs,
        configuration=configuration,
        status="succeeded" if document.execution == "template" else "queued",
        output=output,
        expires_at=timestamp + timedelta(seconds=limits.RUN_TTL_SECONDS),
        completed_at=timestamp if document.execution == "template" else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return run_payload(row, installation), (
        201 if document.execution == "template" else 202
    )


def revoke_worker(db, row):
    row.worker_key_hash = None
    row.worker_key_prefix = None
    row.worker_key_expires_at = None
    row.worker_last_seen_at = None
    row.worker_generation += 1
    cancel_pending(db, row)


def mint_worker(db, row, days):
    if row.document["execution"] != "service" or not row.enabled:
        raise HTTPException(409, "Enable a service plugin before connecting its worker")
    if row.worker_key_hash:
        revoke_worker(db, row)
    else:
        row.worker_generation += 1
    raw = "bwp_worker_" + secrets.token_urlsafe(32)
    row.worker_key_hash = token_hash(raw)
    row.worker_key_prefix = raw[:18]
    row.worker_key_expires_at = now() + timedelta(days=days)
    row.updated_at = now()
    db.commit()
    return raw


def worker_installation(db, credential):
    if not credential.startswith("bwp_worker_") or len(credential) > 128:
        raise HTTPException(401, "Invalid service credential")
    row = (
        db.query(PluginInstallation)
        .join(User)
        .filter(
            PluginInstallation.worker_key_hash == token_hash(credential),
            User.is_active.is_(True),
        )
        .populate_existing()
        .with_for_update(of=PluginInstallation)
        .first()
    )
    if (
        row is None
        or row.worker_key_expires_at is None
        or row.worker_key_expires_at <= now()
    ):
        raise HTTPException(401, "Service credential expired or revoked")
    if row.archived_at or not row.enabled or row.document["execution"] != "service":
        raise HTTPException(403, "This plugin is unavailable")
    context = trace_context.get()
    if context is not None:
        context["user_id"] = row.user_id
    row.worker_last_seen_at = now()
    expire_runs(db, row.id)
    return row


def worker_run(db, installation, run_id):
    row = (
        db.query(PluginRun)
        .filter_by(id=str(run_id), installation_id=installation.id)
        .populate_existing()
        .with_for_update()
        .first()
    )
    if row is None:
        raise HTTPException(404, "Run not found")
    return row


def check_lease(row, installation, lease_token, terminal=False):
    if (
        row.worker_generation != installation.worker_generation
        or not secrets.compare_digest(row.lease_hash or "", token_hash(lease_token))
    ):
        raise HTTPException(409, "This service no longer holds the run lease")
    if terminal and row.status in ("succeeded", "failed"):
        return
    if (
        row.status != "running"
        or row.lease_expires_at is None
        or row.lease_expires_at <= now()
        or row.expires_at <= now()
    ):
        raise HTTPException(409, "This run is no longer accepting service results")
