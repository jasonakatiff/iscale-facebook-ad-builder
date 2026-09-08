"""Instrument existing clients without collecting arguments or payloads."""

from functools import wraps
import inspect
import logging
import time
from urllib.parse import urlsplit

from sqlalchemy import event

from app.telemetry import config
from app.telemetry.runtime import (
    emit,
    error_attributes,
    error_message,
    span,
    suppressed,
    trace_context,
)

_installed = False


def active():
    ctx = trace_context.get()
    return (
        config.ENABLED and ctx and not ctx.get("diagnostics") and not suppressed.get()
    )


def wrap_client(owner, method, name, describe=None):
    original = getattr(owner, method, None)
    if original is None or getattr(original, "_telemetry_wrapped", False):
        return

    def attributes(args, kwargs):
        try:
            return describe(args, kwargs) if describe else {}
        except Exception:
            return {}

    def finish(outcome, result):
        status = getattr(result, "status_code", None)
        if isinstance(status, int):
            outcome["status_code"] = status
            if status >= 400:
                outcome["level"] = "error"

    if inspect.iscoroutinefunction(original):

        @wraps(original)
        async def wrapped(*args, **kwargs):
            if not active():
                return await original(*args, **kwargs)
            with span(name, "dependency", **attributes(args, kwargs)) as outcome:
                result = await original(*args, **kwargs)
                finish(outcome, result)
                return result

    else:

        @wraps(original)
        def wrapped(*args, **kwargs):
            if not active():
                return original(*args, **kwargs)
            with span(name, "dependency", **attributes(args, kwargs)) as outcome:
                result = original(*args, **kwargs)
                finish(outcome, result)
                return result

    wrapped._telemetry_wrapped = True
    setattr(owner, method, wrapped)


def request_attributes(args, kwargs):
    request = args[1] if len(args) > 1 else kwargs.get("request")
    return {"host": urlsplit(str(request.url)).hostname, "method": request.method}


class ApplicationLogHandler(logging.Handler):
    def emit(self, record):
        if not record.name.startswith("app.") or record.levelno < logging.WARNING:
            return
        try:
            attributes = {"logger": record.name}
            if record.exc_info and record.exc_info[1]:
                attributes.update(error_attributes(record.exc_info[1]))
            message = (
                error_message(record.exc_info[1])
                if record.exc_info and record.exc_info[1]
                else record.getMessage()
            )
            emit(
                "log",
                record.name,
                level="error" if record.levelno >= logging.ERROR else "warning",
                message=message,
                attributes=attributes,
            )
        except Exception:
            from app.telemetry.runtime import collector

            collector.dropped += 1


def install_instrumentation(engine):
    global _installed
    if _installed or not config.ENABLED:
        return
    _installed = True

    @event.listens_for(engine, "before_cursor_execute")
    def before(conn, cursor, statement, parameters, context, executemany):
        if active():
            context._telemetry_start = time.perf_counter()

    @event.listens_for(engine, "after_cursor_execute")
    def after(conn, cursor, statement, parameters, context, executemany):
        started = getattr(context, "_telemetry_start", None)
        if started is not None:
            words = statement.lstrip().split(None, 1)
            operation = words[0].upper() if words else "OTHER"
            if operation not in {
                "SELECT",
                "INSERT",
                "UPDATE",
                "DELETE",
                "BEGIN",
                "COMMIT",
                "ROLLBACK",
            }:
                operation = "OTHER"
            emit(
                "database",
                "postgres.query",
                duration_ms=round((time.perf_counter() - started) * 1000, 3),
                attributes={"operation": operation, "row_count": cursor.rowcount},
            )

    @event.listens_for(engine, "handle_error")
    def failed(context):
        if active():
            emit(
                "database",
                "postgres.query",
                level="error",
                attributes={
                    "exception_type": type(context.original_exception).__name__
                },
            )

    import httpx
    import requests

    wrap_client(httpx.Client, "send", "http.client", request_attributes)
    wrap_client(httpx.AsyncClient, "send", "http.client", request_attributes)
    wrap_client(requests.Session, "send", "http.client", request_attributes)
    from botocore.client import BaseClient

    wrap_client(
        BaseClient,
        "_make_api_call",
        "storage.client",
        lambda args, kwargs: {
            "service": args[0].meta.service_model.service_name,
            "operation": args[1] if len(args) > 1 else kwargs.get("operation_name"),
        },
    )
    import google.generativeai as genai

    wrap_client(genai.GenerativeModel, "generate_content", "gemini.generate_content")
    wrap_client(
        genai.GenerativeModel, "generate_content_async", "gemini.generate_content"
    )
    logging.getLogger().addHandler(ApplicationLogHandler())
