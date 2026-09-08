"""Bounded, best-effort collection. No request bodies, SQL, or stack locals."""

from contextlib import contextmanager
from contextvars import ContextVar
from datetime import datetime, timedelta, timezone
from functools import wraps
import hashlib
import inspect
import logging
import os
from pathlib import Path
from queue import Queue, Empty, Full
import re
from threading import Event, Lock, Thread
import time
import traceback
import uuid

from app.telemetry import config

trace_context = ContextVar("telemetry_context", default=None)
suppressed = ContextVar("telemetry_suppressed", default=False)
_redacted_values = ContextVar("telemetry_redacted_values", default=())
_SECRET_KEY = re.compile(
    r"password|passwd|secret|token|authorization|cookie|api.?key|worker.?key|credential|dsn|database_url|prompt|body|payload",
    re.I,
)
_ASSIGNMENT = re.compile(
    r"""(?i)((?:password|passwd|secret|token|access_token|api[_-]?key|worker[_-]?key|authorization|cookie)["']?\s*[=:]\s*)["']?[^\s,;}"']+["']?"""
)

_EMAIL = re.compile(
    r"(?<![A-Za-z0-9._%+-])[A-Za-z0-9._%+-]++@[A-Za-z0-9.-]++"
)
_URL = re.compile(r"https?://[^\s]++")


def _redact_url(match):
    url = match.group().split("?", 1)[0].split("#", 1)[0]
    scheme, _, target = url.partition("://")
    authority, slash, path = target.partition("/")
    if "@" in authority:
        authority = "[REDACTED]@" + authority.rsplit("@", 1)[1]
    return scheme + "://" + authority + slash + path


@contextmanager
def redact_values(*values):
    """Keep operation-local credentials out of telemetry without retaining them."""
    token = _redacted_values.set(_redacted_values.get() + tuple(v for v in values if v))
    try:
        yield
    finally:
        _redacted_values.reset(token)


def sanitize(value, depth=0):
    if depth > 6:
        return "[TRUNCATED]"
    if isinstance(value, dict):
        return {
            str(k)[:100]: (
                "[REDACTED]" if _SECRET_KEY.search(str(k)) else sanitize(v, depth + 1)
            )
            for k, v in list(value.items())[:30]
        }
    if isinstance(value, (list, tuple)):
        return [sanitize(v, depth + 1) for v in value[:30]]
    if value is None or isinstance(value, (bool, int, float)):
        return value
    text = str(value)[:8000]
    text = re.sub(r"(?s)\[(?:SQL|parameters):.*", "[DATABASE_DETAILS_REDACTED]", text)
    for secret in _redacted_values.get():
        text = text.replace(secret, "[REDACTED]")
    for key, secret in os.environ.items():
        if _SECRET_KEY.search(key) and len(secret) >= 6:
            text = text.replace(secret, "[REDACTED]")
    text = re.sub(r"(?i)\b(?:Bearer|Basic)\s+[^\s,;]+", "[REDACTED]", text)
    text = re.sub(r"\b(?:bw_(?:tlm|live)_|bwp_worker_)[A-Za-z0-9_-]+", "[REDACTED]", text)
    text = re.sub(
        r"\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[REDACTED]", text
    )
    text = _URL.sub(_redact_url, text)
    text = _EMAIL.sub("[EMAIL]", text)
    text = _ASSIGNMENT.sub(r"\1[REDACTED]", text)
    return text[:4000]


def error_attributes(error):
    frames = traceback.extract_tb(error.__traceback__)[-15:]
    return {
        "exception_type": type(error).__name__,
        "frames": [
            {"file": Path(f.filename).name, "function": f.name, "line": f.lineno}
            for f in frames
        ],
    }


def error_message(error):
    from sqlalchemy.exc import SQLAlchemyError

    if isinstance(error, SQLAlchemyError):
        return "Database operation failed; see exception type and stack frames."
    try:
        return sanitize(str(error))
    except Exception:
        return type(error).__name__


def capture_exception(error, operation, *, message=None):
    emit(
        "exception",
        operation,
        level="warning",
        message=error_message(error) if message is None else message,
        attributes={**error_attributes(error), "handled": True},
    )


def make_event(kind, name, level="info", message=None, attributes=None, **fields):
    ctx = trace_context.get() or {}
    attrs = sanitize(attributes or {})
    result = {
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc),
        "trace_id": ctx.get("trace_id") or uuid.uuid4().hex,
        "span_id": ctx.get("span_id") or uuid.uuid4().hex[:16],
        "parent_span_id": ctx.get("parent_span_id"),
        "request_id": ctx.get("request_id"),
        "session_id": ctx.get("session_id"),
        "user_id": ctx.get("user_id"),
        "kind": kind[:32],
        "level": level,
        "name": sanitize(name)[:200],
        "message": sanitize(message) if message is not None else None,
        "duration_ms": None,
        "status_code": None,
        "fingerprint": None,
        "attributes": attrs,
        "environment": config.ENVIRONMENT,
        "release": config.RELEASE,
    }
    result.update(fields)
    if level == "error":
        identity = f"{kind}:{name}:{attrs.get('exception_type')}:{attrs.get('frames')}:{result['status_code']}:{attrs.get('host')}:{attrs.get('operation')}"
        if kind == "browser":
            identity += ":" + (result["message"] or "")
        result["fingerprint"] = hashlib.sha256(identity.encode()).hexdigest()
    return result


def emit(kind, name, **kwargs):
    if not config.ENABLED or suppressed.get():
        return None
    try:
        record = make_event(kind, name, **kwargs)
        collector.enqueue(record)
        return record["id"]
    except Exception:
        collector.dropped += 1
        return None


@contextmanager
def span(name, kind="operation", **attributes):
    parent = trace_context.get() or {}
    ctx = {
        **parent,
        "trace_id": parent.get("trace_id") or uuid.uuid4().hex,
        "parent_span_id": parent.get("span_id"),
        "span_id": uuid.uuid4().hex[:16],
    }
    token = trace_context.set(ctx)
    start = time.perf_counter()
    outcome = {"attributes": attributes}
    if kind == "job":
        emit("job", name, attributes={**attributes, "phase": "started"})
    try:
        yield outcome
    except Exception as exc:
        outcome.update(level="error", message=error_message(exc))
        outcome["attributes"].update(error_attributes(exc))
        raise
    finally:
        if kind == "job":
            outcome["attributes"]["phase"] = (
                "failed" if outcome.get("level") == "error" else "completed"
            )
        emit(
            kind,
            name,
            duration_ms=round((time.perf_counter() - start) * 1000, 3),
            **outcome,
        )
        trace_context.reset(token)


def observe(name, kind="operation"):
    def decorate(fn):
        if inspect.iscoroutinefunction(fn):

            @wraps(fn)
            async def async_wrapper(*args, **kwargs):
                with span(name, kind):
                    return await fn(*args, **kwargs)

            return async_wrapper

        @wraps(fn)
        def sync_wrapper(*args, **kwargs):
            with span(name, kind):
                return fn(*args, **kwargs)

        return sync_wrapper

    return decorate


class Collector:
    def __init__(self):
        self.queue = Queue(maxsize=config.QUEUE_SIZE)
        self.dropped = 0
        self.written = 0
        self.last_success_at = None
        self.last_error_at = None
        self._engine = None
        self._thread = None
        self._stop = Event()
        self._lock = Lock()
        self._last_prune = 0

    @property
    def engine(self):
        if self._engine is None:
            from sqlalchemy import create_engine
            from app.core.config import settings

            self._engine = create_engine(
                settings.DATABASE_URL,
                pool_size=1,
                max_overflow=1,
                pool_timeout=2,
                pool_pre_ping=True,
                connect_args={
                    "connect_timeout": 2,
                    "options": "-c statement_timeout=2000 -c lock_timeout=1000",
                },
            )
        return self._engine

    def enqueue(self, record):
        try:
            self.queue.put_nowait(record)
        except Full:
            self.dropped += 1

    def persist(self, batch):
        from app.models import TelemetryEvent

        with self.engine.begin() as conn:
            conn.execute(TelemetryEvent.__table__.insert(), batch)

    def drain(self):
        with self._lock:
            batch = []
            for _ in range(config.BATCH_SIZE):
                try:
                    batch.append(self.queue.get_nowait())
                except Empty:
                    break
            if not batch:
                return
            token = suppressed.set(True)
            try:
                self.persist(batch)
                self.written += len(batch)
                self.last_success_at = datetime.now(timezone.utc)
            except Exception:
                self.dropped += len(batch)
                self.last_error_at = datetime.now(timezone.utc)
                logging.getLogger("telemetry.collector").warning(
                    "Telemetry persistence failed; dropped %s events", len(batch)
                )
            finally:
                suppressed.reset(token)

    def prune(self):
        from app.models import TelemetryEvent as E
        from sqlalchemy import select, delete, or_, text

        cutoff = datetime.now(timezone.utc) - timedelta(days=config.RETENTION_DAYS)
        with self.engine.begin() as conn:
            if not conn.execute(
                text("SELECT pg_try_advisory_xact_lock(87420917)")
            ).scalar():
                return
            overflow = (
                select(E.id)
                .order_by(E.created_at.desc(), E.id.desc())
                .offset(config.MAX_EVENTS)
                .limit(config.PRUNE_BATCH_SIZE)
            )
            expired = (
                select(E.id).where(E.created_at < cutoff).limit(config.PRUNE_BATCH_SIZE)
            )
            conn.execute(delete(E).where(or_(E.id.in_(overflow), E.id.in_(expired))))

    def _run(self):
        while not self._stop.wait(1):
            self.drain()
            if time.monotonic() - self._last_prune > 60:
                try:
                    self.prune()
                except Exception:
                    self.last_error_at = datetime.now(timezone.utc)
                    logging.getLogger("telemetry.collector").warning(
                        "Telemetry retention check failed"
                    )
                self._last_prune = time.monotonic()

    def start(self):
        if not config.ENABLED or (self._thread and self._thread.is_alive()):
            return
        self._stop.clear()
        self._thread = Thread(target=self._run, name="telemetry-writer", daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=5)
        deadline = time.monotonic() + 3
        while not self.queue.empty() and time.monotonic() < deadline:
            self.drain()


collector = Collector()
