import re
import time
import uuid

from starlette.datastructures import Headers, MutableHeaders
from starlette.responses import JSONResponse

from app.telemetry.runtime import emit, error_attributes, error_message, trace_context

TRACEPARENT = re.compile(r"^00-([0-9a-f]{32})-([0-9a-f]{16})-([0-9a-f]{2})$")


def valid_uuid(value):
    try:
        return str(uuid.UUID(value)) if value else None
    except (ValueError, TypeError, AttributeError):
        return None


class TelemetryMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        headers = Headers(scope=scope)
        parent = TRACEPARENT.fullmatch(headers.get("traceparent", ""))
        valid = parent and int(parent[1], 16) and int(parent[2], 16)
        ctx = {
            "trace_id": parent[1] if valid else uuid.uuid4().hex,
            "span_id": uuid.uuid4().hex[:16],
            "parent_span_id": parent[2] if valid else None,
            "request_id": str(uuid.uuid4()),
            "session_id": valid_uuid(headers.get("x-session-id")),
            "user_id": None,
        }
        ctx["diagnostics"] = scope["path"].startswith("/api/v1/telemetry")
        token = trace_context.set(ctx)
        scope.setdefault("state", {})["request_id"] = ctx["request_id"]
        start = time.perf_counter()
        started = False
        recorded = False
        status = 500
        # Avoid recursive diagnostics traffic; key/feedback audit events are explicit.
        excluded = (
            scope["path"].startswith("/api/v1/telemetry") or scope["path"] == "/health"
        )

        def record():
            nonlocal recorded
            if recorded or excluded:
                return
            recorded = True
            route = getattr(scope.get("route"), "path", None) or "unmatched"
            emit(
                "request",
                f"{scope['method']} {route}",
                level=(
                    "error" if status >= 500 else "warning" if status >= 400 else "info"
                ),
                status_code=status,
                duration_ms=round((time.perf_counter() - start) * 1000, 3),
                attributes={
                    "method": scope["method"],
                    "route": route,
                    "entity_ids": {
                        key: valid_uuid(str(value))
                        for key, value in scope.get("path_params", {}).items()
                        if valid_uuid(str(value))
                    },
                },
            )

        async def tracked_send(message):
            nonlocal started, status
            if message["type"] == "http.response.start":
                started = True
                status = message["status"]
                response_headers = MutableHeaders(scope=message)
                response_headers["X-Request-ID"] = ctx["request_id"]
                response_headers["traceparent"] = (
                    f"00-{ctx['trace_id']}-{ctx['span_id']}-01"
                )
            await send(message)
            if message["type"] == "http.response.body" and not message.get(
                "more_body", False
            ):
                record()

        try:
            if ctx["diagnostics"] and scope["method"] in {"POST", "PUT", "PATCH"}:
                chunks = []
                size = 0
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    size += len(message.get("body", b""))
                    if size > 65536:
                        response = JSONResponse(
                            status_code=413,
                            content={
                                "error": {
                                    "code": "BODY_TOO_LARGE",
                                    "message": "Telemetry payload exceeds 64 KiB.",
                                    "details": None,
                                }
                            },
                        )
                        await response(scope, receive, tracked_send)
                        return
                    chunks.append(message)
                    if not message.get("more_body", False):
                        break
                original_receive = receive

                async def buffered_receive():
                    return chunks.pop(0) if chunks else await original_receive()

                receive = buffered_receive
            await self.app(scope, receive, tracked_send)
        except Exception as exc:
            emit(
                "exception",
                "unhandled_exception",
                level="error",
                message=error_message(exc),
                attributes=error_attributes(exc),
            )
            if not started:
                response = JSONResponse(
                    status_code=500,
                    content={
                        "error": {
                            "code": "INTERNAL_ERROR",
                            "message": "An unexpected error occurred.",
                            "details": {
                                "request_id": ctx["request_id"],
                                "trace_id": ctx["trace_id"],
                            },
                        }
                    },
                )
                await response(scope, receive, tracked_send)
            else:
                raise
        finally:
            record()
            trace_context.reset(token)
