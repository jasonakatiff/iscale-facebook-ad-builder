# Delivery API: queue, retries, notifications and reports

BreadWinner · Powered by theLeadRouter.com

Base origin: `https://api.example.com`. Paths below start at `/api/v1/delivery` unless stated otherwise. [Swagger](/api/v1/docs#/delivery), [OpenAPI JSON](/api/v1/openapi.json), [user guide](/api/v1/help/docs/posting-queue), and [complete documentation ZIP](/api/v1/help/download) are public.

## Authentication and common contracts

Use `Authorization: Bearer <session JWT or bw_live_ user key>`. User keys inherit the owner's current roles and permissions. GET requires `platform:read`; every POST/PUT also requires `platform:write`, including notification acknowledgment. A read/write key does not grant administrator access or `campaigns:write` by itself. Legacy bot keys and diagnostics-only keys do not grant delivery access.

Buyers can read their own jobs, imports and report rows; admins can read all buyers. Notifications are always recipient-specific. Inaccessible job IDs return 404. IDs are strings, account IDs normalize to `act_` plus digits, and Meta object IDs are numeric strings. Timestamps are UTC ISO8601, nullable values are explicit `null`, and `report_date` is an account-local `YYYY-MM-DD` date. Clients must check HTTP status before using JSON.

List responses are `{ "data": [...], "pagination": { "total": 1, "limit": 50, "offset": 0, "hasMore": false } }`. Jobs, syncs and reports default to `limit=50`; notifications default to 20. These limits accept 1–100 and `offset` accepts 0 or greater. Reconciliation candidates return all verified matches in one envelope, with `limit=total`, `offset=0` and no pagination inputs; an empty result has `limit=0`.

## Operations

| Method and path | Access | Input and successful result |
| --- | --- | --- |
| `GET /settings` | Active user | Effective `config`, current `defaults`, posting/import heartbeats and process worker flag |
| `PUT /settings` | Admin | Full configuration object → `{config}` |
| `POST /launches` | `campaigns:write` | Launch body → HTTP 202 job |
| `GET /jobs` | Owner or admin | Optional exact `job_id`, pagination → job list, newest first |
| `GET /jobs/{job_id}` | Owner or admin | Job |
| `POST /jobs/{job_id}/cancel` | Owner or admin | No body → cancelled job; only queued jobs |
| `POST /jobs/{job_id}/retry` | Owner or admin with `campaigns:write` | `{ "failure_id": "current-failure-UUID" }` → requeued job |
| `GET /jobs/{job_id}/candidates` | Admin | Exact verified Meta ad candidates `{id,name}` |
| `POST /jobs/{job_id}/reconcile` | Admin | `{ "fb_ad_id": "123456789" }` → succeeded job |
| `GET /notifications` | Current recipient | Pagination → unread, unresolved failure notifications |
| `POST /notifications/{notification_id}/read` | Current recipient | No body → `{id,read_at}` |
| `GET /syncs` | Owner or admin | Pagination → buyer/account import schedules |
| `POST /syncs/{sync_id}/restart` | Admin | No body → `{id,status,coalesced}`; repeated/in-progress refreshes reuse existing work |
| `GET /report` | Owner or admin | `days=7` (1–90), pagination → daily rows plus `dataset` |

All success responses are HTTP 200 except launch submission (202). Request schemas reject extra fields except the legacy final-ad body described below.

## Configuration

| Field | Default | Allowed |
| --- | --- | --- |
| `min_interval_seconds` | 2 | Integer 1–3600 |
| `max_posts` | 30 | Integer 1–10000 |
| `window_seconds` | 60 | Integer 1–86400 |
| `max_post_retries` | 3 | Integer 0–10 additional attempts |
| `max_read_retries` | 3 | Integer 0–10 additional attempts |
| `status_interval_seconds` | 300 | Integer 60–86400 |
| `performance_interval_seconds` | 14400 | Integer 60–86400 (4-hour default) |
| `stable_status_interval_seconds` | 3600 | Integer 60–86400 |
| `lookback_days` | 2 | Integer 1–90 recent reporting days |
| `reconcile_days` | 35 | Integer 1–90 correction days |
| `reconcile_interval_hours` | 24 | Integer 1–168 |
| `metadata_cache_hours` | 24 | Integer 1–168 |
| `api_requests_per_minute` | 120 | Integer 1–10000 shared request units |
| `import_requests_per_minute` | 60 | Integer 1–10000 import request units |
| `account_requests_per_minute` | 60 | Integer 1–10000 per-account request units |
| `api_daily_request_limit` | 10000 | Integer 1–1000000 in a rolling 24 hours |
| `api_max_concurrency` | 2 | Integer 1–10 in-flight requests |
| `api_usage_pause_percent` | 80 | Integer 10–95 provider-reported usage threshold |
| `async_poll_seconds` | 30 | Integer 15–300 report-job polling interval |
| `paused` | false | Boolean |
| `imports_enabled` | true | Boolean |

`PUT /settings` replaces all settings. **Omitted fields reset to defaults.** GET first, edit `config`, then send that full object; do not send the heartbeat wrapper. Numbers must be JSON integers, not strings or booleans. Both cadence/window limits apply to final-ad attempts across all buyers/replicas, including retries and uncertain writes. Running requests finish when posting is paused. Imports use an independent switch. Import requests/minute cannot exceed shared requests/minute, the correction window must cover the recent window, and stable status cannot refresh more often than new/pending status. Invalid combinations return 422. Saving settings recalculates idle import schedules.

`GET /settings` returns `config` (effective persisted settings), `defaults` (this release’s defaults), nullable `posting_heartbeat`, nullable `sync_heartbeat` and `worker_enabled_on_this_server`. The flag describes the responding process; shared heartbeats are evidence of worker activity. The full operating behavior is in the user guide.

## Submit media, creative and ad work

Prepare saved media through `/api/v1/creatives`: GET the shared library (default `limit=24`, maximum 100), POST multipart field `file` to `/uploads` for external media (201), or POST `/generated/{generated_id}` to register existing generated media (200). These writes require `campaigns:write`. POST `/{asset_id}/analyze` when analysis is not ready; this invokes the configured Gemini provider and returns the asset with `analysis_status="ready"` on success. GET `/{asset_id}` to read the confirmed ID, media URL/type and readiness before launch. See [creative operations in Swagger](/api/v1/docs#/creatives) for the complete library contract.

`POST /launches` requires a saved application ad set whose `fb_adset_id` is populated. `local_adset_id` is the **local** ID; the backend derives its Meta ID. New launches also require an analyzed, unarchived saved `creative_asset_id`. The submitted media URL/type and any supplied generated-ad ID must match it. The server takes generated-ad ID, thumbnail and an immutable provenance snapshot from that asset. Media must be reachable by the worker through durable public storage; browser blob URLs and ephemeral local uploads cannot serve queued work. URLs cannot embed credentials.

| Field | Required | Constraint / default |
| --- | --- | --- |
| `request_key` | Yes | 1–160 characters; stable per intended submission |
| `account_id` | Yes | Digits with optional `act_` prefix |
| `name` | Yes | 1–160 characters |
| `local_adset_id` | Yes | 1–160 characters; existing saved ad set |
| `page_id` | Yes | Numeric string |
| `media_url` | Yes | HTTP(S) URL to image/video |
| `media_type` | Yes | `image` or `video` |
| `primary_text` | Yes | Up to 10000 characters; empty allowed |
| `headline` | Yes | Up to 1000 characters; empty allowed |
| `website_url` | Yes | HTTP(S) landing-page URL |
| `thumbnail_url` | No | HTTP(S) URL or `null`; new launches use the selected asset’s thumbnail |
| `description` | No | Up to 1000 characters; default empty |
| `cta` | No | 1–50 uppercase letters/underscores; default `LEARN_MORE` |
| `status` | No | `PAUSED` (default) or `ACTIVE`; wizard uses PAUSED |
| `resume_creative_id` | No | Confirmed numeric Meta creative ID or `null`; skips creation stages |
| `generated_ad_id` | No | Must match selected asset when supplied; server uses the asset’s source ID |
| `creative_asset_id` | New launches | 1–160 characters; analyzed, unarchived saved asset; optional in schema only for pre-release submission replays |
| `instagram_user_id` | No | Numeric string or `null` |
| `url_tags` | No | Up to 2000 characters; default empty |

Illustrative request; replace sample IDs/media with your account's values. This write queues a real ad when called against production. The following commands assume the API origin and user key are already present in your shell; do not put credentials in JSON or source files.

```sh
curl --fail-with-body "$BREADWINNER_API_URL/api/v1/delivery/launches" \
  -H "Authorization: Bearer $BREADWINNER_API_KEY" \
  -H 'Content-Type: application/json' \
  --data '{"request_key":"launch-example-001","account_id":"act_123456789","name":"Example paused ad","local_adset_id":"saved-local-adset-id","creative_asset_id":"saved-ready-creative-id","page_id":"234567890","media_url":"https://media.example.com/ad.jpg","media_type":"image","primary_text":"Example copy","headline":"Example headline","website_url":"https://example.com/offer","status":"PAUSED"}'
```

Idempotency is scoped to the submitting buyer across `/launches` and the legacy ad submission endpoint. Repeat the **same key and same payload** after a lost submission response; it returns the original job when the referenced ad set/creative still passes submission validation, including a failed/cancelled/completed job. An archived, unavailable or changed creative can now fail validation on replay; use the stored job ID to inspect the original job instead of issuing a new key. Pre-release submissions without an asset can replay an existing matching job but cannot create a new untracked launch. A changed payload under the same key returns `SUBMISSION_CONFLICT`. Each buyer can have at most 1,000 queued/working jobs. Use a new key only for a new, reviewed submission, never to bypass an uncertain write.

### Existing creative: legacy final-ad endpoint

`POST /api/v1/facebook/ads?ad_account_id=act_123456789` requires `campaigns:write` and `Idempotency-Key: <1–160 characters>`. Body: `{ "name": "Example paused ad", "adset_id": "345678901", "creative_id": "456789012", "status": "PAUSED" }`. `name`, `adset_id` and `creative_id` are required; name is 1–160 characters and Meta IDs are numeric strings. `status` defaults to PAUSED and also permits ACTIVE. Extra legacy wizard fields are ignored.

It returns HTTP 202 with the same job structure, **not** an immediate Meta ad ID. Campaign/ad-set/creative creation endpoints still contact Meta synchronously. The legacy endpoint retains FastAPI's `{detail: ...}` error envelope; a submission conflict is `{ "detail": { "error": { "code": "SUBMISSION_CONFLICT", "message": "...", "details": null } } }`. Do not apply the delivery error parser to legacy routes without handling this wrapper.

## Job responses and retry safety

```json
{
  "id": "00000000-0000-4000-8000-000000000001",
  "owner_id": "buyer-id",
  "name": "Example paused ad",
  "account_id": "act_123456789",
  "kind": "launch",
  "status": "queued",
  "stage": "image",
  "results": {},
  "created_at": "2026-09-08T06:00:00Z",
  "updated_at": "2026-09-08T06:00:00Z",
  "post_started_at": null,
  "finished_at": null,
  "error_message": null,
  "error_code": null,
  "provider_error_code": null,
  "provider_error_subcode": null,
  "retry_allowed": false,
  "failure_id": null,
  "write_failures": 0,
  "available_at": "2026-09-08T06:00:00Z",
  "generated_ad_id": null,
  "creative_asset_id": null,
  "creative_snapshot": null
}
```

The response example represents a pre-release launch without creative tracking; new launches include asset provenance. `kind` is `launch` or `ad`. `status` is `queued`, `working`, `succeeded`, `failed`, `needs_reconciliation` or `cancelled`. `stage` is `image`, `video_upload`, `video_ready`, `creative`, `ad` or `complete`. `results` contains only confirmed checkpoints as they become available: `image_hash`, `video_id`, `thumbnail_url`, `creative_id`, `ad_id`. Payloads, request hashes and provider secrets are not returned. `owner_id` and `generated_ad_id` can be null after source deletion. `creative_asset_id` and `creative_snapshot` are null for untracked historical jobs. A snapshot freezes `asset_id`, `source_type`, `created_by_id`, `generated_ad_id`, media URL/type, `metadata`, `metadata_revision`, `generation_context`, `analysis_model`, `analyzed_by_id` and `analyzed_at`. Later asset edits/archive do not rewrite the launch snapshot.

Poll the returned ID using `GET /jobs/{job_id}`; the app polls every 5 seconds. A queued automatic retry has a future `available_at`. `write_failures` counts confirmed failures/pre-write attempts in the current retry cycle and resets on manual retry; it is not a lifetime attempt count. `succeeded` confirms the Meta ad was saved locally, not Meta approval or active serving. A confirmed `ad_id` on a stopped job must be reconciled, not reposted.

For manual retry, first GET the job and require `status="failed"`, `retry_allowed=true`, and a non-null `failure_id`. Repair the reported issue, then POST that exact UUID to `/jobs/{job_id}/retry`. The server locks the job, preserves the payload/stage/confirmed IDs and starts a new bounded cycle. Duplicate or stale failure IDs return `NOT_RETRYABLE`. If the retry response is lost, GET the job: it may already be queued. An uncertain result, cancelled job or existing ad ID cannot use this operation.

Final-ad reconciliation requires `needs_reconciliation` at stage `ad`. GET candidates performs bounded provider reads (at most 20 pages/120 seconds). POST reconcile verifies the submitted ID again against account, ad set, creative and launch marker before saving it locally and scheduling imports. No new Meta object is created. Unknown upload/creative outcomes have no automated recovery endpoint.

## Notifications

`GET /notifications` returns each current recipient's unread notices for the job's current unresolved terminal failure. Rows contain `id`, `job_id`, `name`, `status` (`failed` or `needs_reconciliation`), `message`, `created_at` and `read_at` (null in this list). `pagination.total` is the unread visible count, not an all-time failure count.

The backend creates one row per active buyer/admin recipient per failure, in the same transaction as the failure. Admins read their own notification copies. Role changes are checked on reads; becoming an admin does not backfill old notifications. Requeued/resolved jobs leave the unread list, while stored notice rows remain. There is no email/Slack delivery.

POST `/notifications/{notification_id}/read` affects only that recipient. While the failure remains current, repeating acknowledgment returns the original `read_at`. A foreign, inaccessible or resolved notice returns `NOT_FOUND`. Dismissing a notice does not retry or repair its job. The UI polls notices every 30 seconds.

## Imports and report rows

`GET /syncs` returns `id`, `account_id`, `kind` (`status` or `performance`), `status` (`idle`, `running`, `retry_wait`, `waiting`, `deferred`, `failed`), `failures`, `next_run_at`, nullable `last_success_at`, nullable `last_reconciled_at` and nullable `error_message`. `last_reconciled_at` tracks the wide performance correction run, not posting reconciliation. New/pending ads (created within 24 hours, or status null/PENDING_REVIEW/PROCESSING) use the short status interval; stable ads use the longer interval. Import intervals start after a successful run; a due correction or a newly added ad can schedule earlier work. `waiting` means the async report is processing/downloading; `deferred` means shared request capacity is unavailable and does not consume a failure retry. Capacity deferral extends the run deadline. Exhausted/permanent failures remain stopped.

Admin restart returns `coalesced=true` with the current status when work is active, waiting, deferred, retrying, already due, or still fresh within the 300-second manual-refresh cooldown without newly added ads. Otherwise it resets the counter/deadline, clears failed report staging and returns `status="idle", coalesced=false`. It does not fetch synchronously or enable disabled imports.

`GET /report` returns the pagination envelope plus `dataset`, currently `daily:7d_click,1d_view:conversion_time:no_breakdowns:v1`. Each row contains:

| Fields | Meaning |
| --- | --- |
| `id`, `name`, `account_id`, `fb_ad_id` | Snapshot ID, managed-ad name and Meta identity |
| `launched_by_id`, `launched_by_name`, `creative_created_by_name` | Nullable launching user and original creator identity/name |
| `creative_asset_id`, `creative_snapshot` | Nullable saved asset and immutable launch provenance |
| `effective_status` | Last imported Meta status, or null |
| `report_date`, `currency`, `account_timezone` | Account-local reporting date, currency code and IANA timezone |
| `impressions`, `clicks`, `spend` | Exact numeric strings; spend is in account currency |
| `actions` | Provider action array; inspect each action type and attribution value |
| `imported_at` | UTC timestamp of the committed import |

Rows are sorted by date descending, name and snapshot ID. Read the selected `days` inclusive of each account's current local date. Increasing `days` to 90 only reads retained records; it does not backfill missing history. Normal imports replace `lookback_days` (default 2); first/correction runs replace `reconcile_days` (default 35), with `reconcile_interval_hours=24` by default. Both windows accept up to 90 days. A report row ID can change when its window is replaced; use account/Meta ad ID/date/dataset for client deduplication, not the snapshot UUID alone. Replays never increment prior totals, and failed partial pagination preserves the previous window. Async reports run at ad-account level within the buyer’s credential scope; only managed-ad rows are staged and promoted. A complete report replaces its window atomically. Status imports commit successful batches independently, so use each ad’s status freshness separately from complete-run success.

Only queued/reconciled managed ads are imported; pre-queue ads are not adopted automatically. Keep currencies separate and do not sum overlapping conversion action types. LeadRouter lifetime metrics are a separate dataset. An empty list is not proof of zero lifetime activity: check managed-ad coverage, import status and freshness.

## Shared Meta request admission

Final-ad cadence and Meta request budgets are separate limits. Request budgets cover the integrated Meta transport, including SDK/media/creative calls, status reads, account-level report creation/polling/pages, metadata discovery and reconciliation. Batches and multi-ID reads consume one unit per contained operation/ID. These controls are application policy, not a promise of Meta’s available quota; Google/TikTok retain their existing behavior.

The import lane uses at most its configured requests/minute and a proportional daily allowance: `max(1, api_daily_request_limit × import_requests_per_minute // api_requests_per_minute)` (default 5,000 of 10,000 units). It can occupy at most `max(1, api_max_concurrency - 1)` slots; shared limits still apply. Daily usage is a rolling 24-hour window. Provider usage at the configured threshold and rate-limit/Retry-After signals can defer requests longer.

Account metadata is cached for `metadata_cache_hours` within the credential scope. Performance uses one resumable account report, rather than one insight request per ad. An SDK preparation that may already have written before capacity runs out stops for reconciliation; a confirmed pre-write deferral queues work without consuming retry failures.

## Errors and recovery decisions

Delivery routes use `{ "error": { "code": "NOT_RETRYABLE", "message": "This failure cannot be retried. Refresh the job and reconcile any uncertain result.", "details": null } }`. Validation uses HTTP 422, code `VALIDATION_ERROR`, and `details` such as `[{"field":"body.failure_id","message":"Input should be a valid UUID"}]`. Auth/role exceptions use code `REQUEST_FAILED`; HTTP status distinguishes them. Unexpected server/proxy failures can be non-JSON; preserve the job/key and reconcile before another write.

| HTTP | Codes | Client action |
| --- | --- | --- |
| 401 / 403 | `REQUEST_FAILED` | Restore login/key scope or current role/permission |
| 404 | `NOT_FOUND` | Resource absent or inaccessible; do not guess another buyer's IDs |
| 409 | `SUBMISSION_CONFLICT` | Same key with different payload, or buyer pending quota reached |
| 409 | `NOT_CANCELLABLE`, `NOT_RETRYABLE`, `NOT_RECONCILABLE` | Refresh job and follow its current state |
| 409 | `WORKER_BUSY` | Retry the admin operation after the active worker operation finishes |
| 409 | `IDENTITY_MISMATCH` | Select only a verified matching Meta ad |
| 422 | `VALIDATION_ERROR`, `ADSET_REQUIRED`, `CREATIVE_REQUIRED`, `CREATIVE_NOT_READY`, `CREATIVE_MISMATCH` | Correct fields or save the referenced resource |
| 429 | `REQUEST_BUDGET_BUSY` | Honor the `Retry-After` seconds header; capacity is unavailable |
| 502 | `FACEBOOK_READ_FAILED` | Restore provider access/availability before repeating the read/verification |

A successfully submitted job can later fail even though submission returned 202. Inspect `error_code`, `error_message`, safe nullable numeric `provider_error_code`/`provider_error_subcode`, and `retry_allowed` on the job:

| Job error | Handling |
| --- | --- |
| `META_RATE_LIMIT`, `MEDIA_DOWNLOAD` | Automatic bounded retry for a confirmed safe failure; manual retry can be offered after exhaustion |
| `META_CONNECTION`, `META_PERMISSION`, `BUYER_PERMISSION`, `MEDIA_INVALID` | Repair connection, access or media; retry only when allowed |
| `META_INPUT`, `META_REJECTED` | Correct/review the draft; no automatic queue retry |
| `VIDEO_TIMEOUT`, `VIDEO_PROCESSING`, `VIDEO_READ_FAILED` | Check or replace video; no manual queue retry |
| `POST_RETRY_EXHAUSTED` | Cycle deadline reached; manual retry can be offered |
| `META_WRITE_UNKNOWN`, `LOCAL_SAVE_FAILED` | Preserve confirmed IDs and reconcile; never blindly repost |
| `POSTING_FAILED` | Fallback stopped failure; follow the returned message/state |

The service cannot guarantee exactly-once execution across Meta and PostgreSQL. Durable keys, stage checkpoints, attempt accounting and explicit reconciliation prevent blind duplicate submission; ambiguous outcomes deliberately stop.
