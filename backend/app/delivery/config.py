import os

WORKER_ENABLED = (
    os.getenv(
        "DELIVERY_WORKER_ENABLED",
        "true" if os.getenv("RAILWAY_ENVIRONMENT_NAME") else "false",
    ).lower()
    == "true"
)
WORKER_INTERVAL = 1
LOCK_KEYS = {"posting": 195558001, "sync": 195558002}
READ_DEADLINE_SECONDS = 900
RETRY_BASE_SECONDS = 5
RETRY_CAP_SECONDS = 300
VIDEO_POLL_SECONDS = 10
VIDEO_TIMEOUT_SECONDS = 600
MAX_PENDING_PER_BUYER = 1000
MAX_REPORT_PAGES = 1000
DEFAULTS = {
    "performance_interval_seconds": 14400,
    "stable_status_interval_seconds": 3600,
    "lookback_days": 2,
    "reconcile_days": 35,
    "reconcile_interval_hours": 24,
    "metadata_cache_hours": 24,
    "api_requests_per_minute": 120,
    "import_requests_per_minute": 60,
    "account_requests_per_minute": 60,
    "api_daily_request_limit": 10000,
    "api_max_concurrency": 2,
    "api_usage_pause_percent": 80,
    "async_poll_seconds": 30,
}
REQUEST_LEASE_SECONDS = 180
BUDGET_LOCK_KEY = 195558004
USAGE_COOLDOWN_SECONDS = 300
MANUAL_REFRESH_COOLDOWN_SECONDS = 300
NEW_AD_HOURS = 24
MAX_REPORT_DAYS = 90
REPORT_PAGE_SIZE = 500
DATASET = "daily:7d_click,1d_view:conversion_time:no_breakdowns:v1"
GRAPH_VERSION = (
    os.getenv("FACEBOOK_API_VERSION")
    or os.getenv("VITE_FACEBOOK_API_VERSION")
    or "v24.0"
)

STATUS_BATCH_SIZE = 50

POST_RETRY_DEADLINE_SECONDS = 900
