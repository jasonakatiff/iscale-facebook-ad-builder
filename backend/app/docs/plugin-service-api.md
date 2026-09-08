# Plugin package and service API

theLeadRouter — Ad Studio

All URLs below are relative to the backend origin. Package uploads are JSON requests, not executable archives. The UI and API use the same private installation and run records. Reference the running OpenAPI document at `/api/v1/openapi.json` for field types and status codes.

## Package contract version 1

```json
{
  "schemaVersion": 1,
  "slug": "company-brief-service",
  "name": "Company Brief Service",
  "version": "1.0.0",
  "description": "Processes the brief you explicitly submit.",
  "category": "prompts",
  "execution": "service",
  "inputs": [{"name": "brief", "label": "Brief", "required": true}],
  "configFields": [{"name": "voice", "label": "Voice", "default": "Direct"}],
  "template": null
}
```

Categories: `prompts`, `images`, `campaigns`, `optimization`, `other`. Execution: `template` or `service`. Field kinds: `text` (default), `multiline`, or `json`. Local templates use literal `{{fieldName}}` substitutions; an exact placeholder preserves a JSON field's value, while interpolation inside text serializes JSON. Expressions, undeclared fields, duplicate names, executable fields and dynamic object keys are rejected. Templates bind once; substituted user text is never evaluated again.

Maximum package size is 128 KB, request body 256 KB, inputs/configuration/output 64 KB each, 32 input fields and 32 configuration fields, and 12 JSON nesting levels. JSON numbers must be finite. Decimal money values supplied by your application belong in exact strings with explicit currency/units. Package versions use numeric major.minor.patch. Exports contain normalized defaults and retain the same canonical digest.

## User API

Authenticate with the user's `bw_live_` key in `Authorization: Bearer`. Read/write access is needed for mutations. Never give a broad user key to an external worker.

| Method | Route | Purpose |
| --- | --- | --- |
| GET | `/api/v1/plugins` | List active private installations. |
| POST | `/api/v1/plugins/validate` | Validate/normalize a package without installing. |
| POST | `/api/v1/plugins` | Install a package; 201 for new, 200 for identical reimport. Conflicting version content returns 409. |
| GET | `/api/v1/plugins/{id}` | Read installation metadata/configuration. |
| GET | `/api/v1/plugins/{id}/package` | Download the credential-free package. |
| PATCH | `/api/v1/plugins/{id}` | Set `enabled` or replace `configuration`. |
| DELETE | `/api/v1/plugins/{id}` | Uninstall, revoke service access, cancel unfinished jobs, preserve history. |
| POST | `/api/v1/plugins/{id}/runs` | Submit `{requestId, inputs}`; 201 for a completed local run, 202 for a queued service job. |
| GET | `/api/v1/plugins/runs` | Paginated history, including uninstalled versions; optional `pluginId` filter. |
| GET | `/api/v1/plugins/runs/{id}` | Read status, submitted data and result. |
| POST | `/api/v1/plugins/runs/{id}/cancel` | Cancel an unfinished run. Terminal runs are unchanged. |
| GET | `/api/v1/plugins/examples` | Included local/service package definitions. |
| GET | `/api/v1/plugins/example-worker` | Download the standard-library-only Python worker demonstration. |

`requestId` is a client-generated UUID. Retrying the same ID and exact normalized input/configuration/package returns the same run (200); changing content with the same ID returns 409. Explicitly starting a new run requires a new ID. Keep the same request ID across a network retry. Lists return `{data, pagination: {total, limit, offset, hasMore}}`; errors use `{error: {code, message, details}}`.

Browser-session-only credentials: `POST /api/v1/plugins/{id}/worker-key` with `{expiresInDays: 90}` creates or rotates a key; `DELETE` on that route revokes it. Expiry is 1–365 days. The create response contains `workerKey` once, alongside metadata. Revoke/rotate cancels unfinished jobs and invalidates old leases.

## Company-hosted or locally running workers

Workers authenticate with `Authorization: Bearer bwp_worker_…`. Each credential is limited to one installation and cannot invoke general user/plugin management APIs. The company operates the processing logic; it can call its own image-generation, strategy or analysis service with its own credentials.

1. `GET /api/v1/plugin-worker/jobs` lists this installation's queued job IDs and deadlines. It does not expose other installations or their data.
2. `POST /api/v1/plugin-worker/jobs/{id}/claim` atomically claims a queued job. Save the response's `leaseToken` in memory. The `data` contains immutable inputs/configuration and package/version/digest provenance. A competing claim gets 409.
3. For work lasting more than five minutes, `POST /api/v1/plugin-worker/jobs/{id}/heartbeat` with `{leaseToken}` extends the lease up to the original one-hour job deadline.
4. `POST /api/v1/plugin-worker/jobs/{id}/result` with `{leaseToken, output}` completes the job. On service failure, send `{leaseToken, failed: true}`. Do not include credentials in result data.
5. Retry a result submission with the same lease and identical output after a transient network error. The server returns the already accepted result without rerunning the job. Different output, expired leases or cancelled jobs return 409. Revoked credentials return 401/403.

Output is bounded JSON: text, lists, objects, numbers, booleans or null. Results are data only. A returned recommendation or campaign payload does not execute an ad action. A category name and a pinned manifest cannot prove the remote service's implementation stayed unchanged; record your algorithm version in the output when reproducibility matters.

## Example worker

Download `/api/v1/plugins/example-worker` after signing in. The included worker reads `BREADWINNER_API_ORIGIN` and `BREADWINNER_PLUGIN_WORKER_KEY` from its process environment without writing them to disk. Run `python3 plugin-worker.py --once` to process one queued Service Starter job; omit `--once` to poll until interrupted. The default API origin is `https://ad-builder-backend-production.up.railway.app`. Plain HTTP is accepted only for an explicitly configured loopback origin during development.

The example echoes the submitted brief and identifies itself as a connection test. Replace its `process_job` function with your service implementation. The example's synchronous operation completes within a lease; long-running implementations must heartbeat. No provider credentials, advertising writes, or paid API calls are included in the example.
