import os


def bounded_int(name, default, minimum, maximum):
    try:
        return max(minimum, min(int(os.getenv(name, default)), maximum))
    except ValueError:
        return default


ENABLED = os.getenv("TELEMETRY_ENABLED", "true").lower() == "true"
QUEUE_SIZE = bounded_int("TELEMETRY_QUEUE_SIZE", 2000, 100, 10000)
BATCH_SIZE = 100
RETENTION_DAYS = bounded_int("TELEMETRY_RETENTION_DAYS", 14, 1, 90)
MAX_EVENTS = bounded_int("TELEMETRY_MAX_EVENTS", 250000, 1000, 1000000)
PRUNE_BATCH_SIZE = 5000
INGEST_PER_MINUTE = 120
FEEDBACK_PER_MINUTE = 10
ENVIRONMENT = os.getenv("RAILWAY_ENVIRONMENT_NAME", "local")[:80]
RELEASE = (os.getenv("RAILWAY_GIT_COMMIT_SHA") or os.getenv("TELEMETRY_RELEASE") or "")[
    :80
] or None
