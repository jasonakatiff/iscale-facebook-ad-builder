# Posting queue, failures and data refresh

BreadWinner · Powered by theLeadRouter.com

The Posting queue at /posting-queue holds ads submitted by the Facebook campaign wizard and queued ad API. You can leave the page after submission. New launches use analyzed saved creative from the Creative Library; external media uploads also become saved assets. The backend uploads media to Meta, waits for video processing, creates the creative and ad, and saves confirmed IDs between stages. Wizard ads are created PAUSED. **Posted** confirms creation and local persistence; Meta approval and active delivery are separate states.

Buyers see their own jobs. Administrators see all buyers and edit shared controls on Posting queue or Settings → Traffic source sync (`/settings?tab=traffic`). Creating or retrying an ad requires `campaigns:write`. Campaign/ad-set setup remains synchronous; the final-ad posting quota covers final-ad attempts, including failed and uncertain attempts. Media uploads and creative creation are additional provider requests outside the final-ad quota, covered by the separate shared Meta request budget.

## Shared controls

| Control | Default | Meaning |
| --- | --- | --- |
| Minimum posting interval | 2 seconds | Minimum gap between final-ad attempts across buyers and server replicas |
| Maximum posts / window | 30 / 60 seconds | Maximum final-ad attempts in the rolling window; both posting limits apply |
| Maximum posting retries | 3 | Additional automatic attempts after a confirmed retryable failure |
| Maximum read retries | 3 | Additional attempts after a retryable import or video-read failure |
| New/pending status interval | 300 seconds | Ads created within 24 hours, or with unknown/pending/processing status |
| Stable status interval | 3600 seconds | Status checks for older stable ads |
| Performance interval | 14400 seconds (4 hours) | Time after a successful daily-granularity performance import before the next run |
| Pause posting | Off | Stops subsequent posting work; an in-flight provider request finishes |
| Enable imports | On | Runs the independent status/performance schedules |

To allow a one-second cadence, an admin sets the minimum interval to 1 and a compatible window limit, such as 60 per 60 seconds. With 30 per 60 seconds, the rolling limit still caps throughput. Provider processing time and Meta rate limits can make posting slower. Settings are platform-wide, not per buyer.

The queue page refreshes local status every 5 seconds. The notification bell refreshes every 30 seconds. These browser polls do not pull data from Meta. Heartbeats indicate whether the posting/import workers are running.

## Shared Meta request limits

Settings also controls total provider request volume, separate from final-ad cadence:

| Control | Default |
| --- | --- |
| Shared Meta request units/minute | 120 |
| Import request units/minute | 60 |
| Per-account request units/minute | 60 |
| Rolling 24-hour request units | 10000 |
| In-flight requests | 2 |
| Provider usage pause threshold | 80% |
| Account metadata cache | 24 hours |
| Async report polling | 30 seconds |

Batches/multi-ID reads count the operations inside them. Imports have a proportional daily allowance (5,000 at defaults) and at most one of the two default concurrency slots, preserving room for interactive work. Shared, account, daily and provider-usage limits all apply. Capacity pauses defer queued/import work without spending failure retries; a preparation that may already have written stops for reconciliation. These controls apply to the integrated Meta transport; Google/TikTok retain their existing behavior.

## When an ad does not post

| Queue state | What it means | Next action |
| --- | --- | --- |
| Queued | Awaiting its turn, cadence allowance, or a scheduled retry | Wait; cancel if no longer needed |
| Working | A backend stage is running | Wait for the stage to finish |
| Posted (`succeeded`) | Confirmed Meta ad ID saved locally | Inspect imported status; creation is not approval |
| Failed | Processing stopped with an actionable error | Repair the named issue; use Retry only when offered |
| Needs reconciliation | A write may have succeeded without a reliable response | Admin verifies the existing Meta object; do not submit another copy |
| Cancelled | Queued work was stopped | Completed media/creative objects remain in Meta |

Confirmed rate-limit rejections and media-download failures before a Meta write can retry automatically with exponential backoff and jitter, starting at 5 seconds and capped at 300 seconds. A longer provider retry delay is honored within the 15-minute cycle deadline. The retry cap counts additional attempts: 0 disables automatic retries. Automatic retries remain **Queued** with a next-attempt time.

Connection and permission failures stop for repair. A buyer with posting permission, or an admin with that permission, can select **Retry [ad name]** when the failed job permits it. Confirming reuses the same payload, job and confirmed IDs, and starts a new bounded retry cycle. Invalid ad settings require a corrected draft; failed video processing requires checking or replacing the video. Old failures whose safety was not recorded remain stopped.

A timeout, ambiguous server response or interrupted multipart video upload does not prove the write failed. Unknown outcomes never retry automatically or through the Retry button. For a final-ad failure, an admin loads reconciliation candidates and links a verified existing ad. The account, ad set, creative and unique launch marker must match. Linking creates no additional Meta ad. An empty candidate list does not prove no ad exists. Uncertain upload/creative stages remain stopped for investigation.

## Failure notifications

Terminal failures create persistent in-app notifications for the active submitting buyer and active admins. Each recipient gets one copy per failure. The bell/toast links to the exact job; dismissing your copy does not dismiss another person's copy or change the job. Requeued/resolved failures leave the unread list. Newly granted admins use the queue for historical failures. There are no email or Slack notifications in this release.

Messages name the corrective action and safe numeric Meta codes when available. They do not expose raw provider payloads or access tokens. A notification connection error is visible; refresh the queue to inspect the job directly.

## Import frequency, identity and duplicate prevention

Successful posting or final-ad reconciliation creates one managed-ad identity joining the submitting buyer, account, queue job, Meta ad/ad-set/creative IDs, local ad record and optional generated-ad source. Account plus Meta ad ID is unique. Two import schedules are created per buyer/account: status and performance. The first run becomes due immediately; subsequent successful runs use the configured intervals.

Performance imports normally refresh the last 2 account-local reporting days. The first successful wide import, and the next correction run due 24 hours later, refresh the last 35 days for late conversions and corrections. Admins configure both windows (1–90 days) and correction cadence (1–168 hours); correction days must cover recent days. This is a scheduled correction window, not a fixed midnight cron. The dataset uses daily rows, 7-day click/1-day view attribution, conversion reporting time and no breakdowns.

There is one snapshot per managed ad, reporting date and dataset. An async account-level performance report stages validated managed-ad pages, then **replaces** its window only when complete, including removing rows Meta no longer returns. It does not add the same totals again. Partial report pagination preserves the previous visible window and success timestamp. Status imports save successful batches independently; an interrupted status run can leave some ads fresher than others. Posting and importing have separate PostgreSQL locks, so multiple replicas cannot process the same queue concurrently.

Retries persist across worker interruptions and stop at the read limit or the 15-minute import deadline, excluding time deferred for request capacity. Authentication, permission and invalid-input errors stop without automatic retry. Exhausted schedules stay **Failed** until an admin repairs the issue and selects **Restart import**. Restart reuses an active/already-due refresh or a recent successful refresh within five minutes when no newer ad needs importing. Otherwise it schedules work; it does not mean fresh data has already arrived. Video processing has a separate 10-minute limit.

Campaign Reporting at /reporting shows imported daily Meta records and separately labeled LeadRouter lifetime counts. No managed ads or no imported data produces an empty state, not sample totals. Account currency, account timezone and import time accompany the rows. Never combine currencies or overlapping action types. Pre-queue ads are not adopted automatically; competitor research and workspace metadata refreshes are separate systems. Older retained snapshots remain readable, but automatic corrections cover the configured window (35 days by default). Reporting also retains the launching buyer and original creative creator separately, using the immutable launch snapshot.

## API and deployment references

The [delivery API reference](/api/v1/help/docs/delivery-api) includes all operations, exact fields, permissions, errors and examples. [Swagger](/api/v1/docs#/delivery) and the [documentation ZIP](/api/v1/help/download) are generated from the running release. These documentation links are public; queue and reporting pages require a normal signed-in session.

The queue, recovery and later request-control/creative-tracking releases are integrated. Effective persisted settings are returned separately from current defaults by `GET /settings`. Application/database/recovery flows were tested with a simulated Meta provider; production schema, workers and read/UI checks passed. A real new-ad publication through Meta was not performed for release verification. Repository `docs/delivery.md` contains the operator migration/runtime guide and release evidence.
