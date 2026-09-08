# Remaining CodeQL review — September 8, 2026

Scope: all 21 open alerts on `e2bbeaf`, after PR #48. Review performed locally by
Codex against actual callers and data flow; no independent agent review is claimed.

## Findings repaired by this follow-up

| Alerts | Problem | Fix and verification |
| --- | --- | --- |
| #22 | Campaign preflight returned `str(error)` for provider errors, exposing internal messages and possible credentials/paths. | Fixed messages for unexpected errors; a dedicated `CampaignValidationError` carries application-authored user guidance. Regression tests reproduce both RuntimeError and ValueError leaks before the patch and verify rejection afterward. Existing integer-cent/Decimal calculations and validation tests are retained. |
| #1–#9 | Three workflows did not explicitly restrict their GitHub token. | Workflows declare `contents: read`; manual health/wait/failure jobs receive no token permissions. Required PR CI verifies normal checkout/test/artifact behavior. |
| #10 | Codecov used a mutable third-party action tag. | Pin `b9fd7d16f6d7d1b5d2bec1a2887e65ceed900238`, verified by dereferencing the annotated upstream v4.6.0 tag. Repository policy permits this exact SHA. The old tag stays permitted until all active workflows use the pin. |

## False positives reviewed individually

| Alerts | Actual trust boundary and evidence |
| --- | --- |
| #29: media SSRF | `app/delivery/media.py` resolves the hostname, rejects every non-global IP, and connects to the validated numeric address. TLS uses the original hostname for certificate verification/SNI. Automatic redirects/retries are disabled and each redirect re-enters validation. Tests in `tests/security/test_codeql_regressions.py` cover loopback/metadata/local-file rejection, DNS pinning, TLS hostname and private redirects. The scanner follows user input into `pool.urlopen` without recognizing this custom boundary. |
| #25: partial Graph SSRF | `DeliveryProvider.read` fullmatches a numeric ID (optional `act_`) with only ads/insights/thumbnails edges or the empty multi-ID root. The host is fixed to graph.facebook.com, credentials stay in headers, and redirects are rejected. Existing regression tests reject path/query injection and redirects. |
| #18: theme import SSRF | `GitHubImport.github_only` accepts only exact HTTPS github.com/raw.githubusercontent.com authorities and safe path components, then constructs a fixed raw.githubusercontent.com URL. Both import and stored-theme refresh run it. The HTTP client disables redirects/proxies and enforces a 32 KB response limit. `tests/unit/test_theme_library.py` covers arbitrary hosts, redirects, limits, timeouts and both caller paths. |
| #11: OAuth state cookie | The cookie contains a signed, short-lived user/provider/nonce/purpose state, not a password or provider credential. It is HttpOnly and Secure by default; callbacks verify signature, expiry, provider and cookie match. `tests/unit/test_pr3_security.py` exercises the state/callback boundary. Encryption is unnecessary for these non-confidential claims. |
| #14: API-key digest | CodeQL mistakes the API-key test response for a password source. `app/api/v1/api_keys.py` generates a 256-bit random bearer key using secrets.token_urlsafe(32). `_hash_api_key` hashes this high-entropy key with SHA-256; human passwords use bcrypt. Existing API-key lifecycle tests verify hash storage, revocation and scopes. Changing hashing would invalidate keys without an observed security benefit. |
| #15: telemetry-key digest assertion | The reported operation is a test assertion that a randomly generated API key is stored as its SHA-256 digest. This is not password hashing. `tests/telemetry/test_telemetry.py` covers the complete key lifecycle and scope enforcement. |
| #19: R2 URL substring | The reported substring operation is only an assertion against a mocked R2 upload response in `tests/test_uploads.py`. It does not validate or authorize an outbound URL in production. |
| #26: prototype HTML extractor | The regex extracts script references from repository-controlled Vite build output; it is not a sanitizer for user-supplied HTML. No remote input is consumed by `scripts/export-workflow-prototype.mjs`. |
| #27/#28: prototype media preview | `URL.createObjectURL(file)` supplies the in-memory media map. Only img/video receive the blob URL; filenames are escaped React text/attributes. No raw HTML or document embedding sink exists in this flow. SVG image context does not run scripts. This is source review, not a new browser penetration test. |

The ten entries above were dismissed individually with source-specific comments
linking [PR #50](https://github.com/jasonakatiff/theleadrouter-ad-studio/pull/50).
Alerts #15 and #19 use the test-only disposition; the other eight use false positive.
No supported vulnerability was dismissed.

False-positive conclusions apply to these current callers and sinks. Future changes
need fresh review. Dismissal status and API receipts are recorded in the delivered
verification report; this document does not equate scanner silence with application
security. No query suites or paths are excluded from CodeQL.

## Dependency repairs and limits

- python-jose 3.3.0 → 3.5.0. The new regression manually signs a JWT using an
  OpenSSH ECDSA public key as an HMAC secret: the old dependency accepted it; the
  patched dependency rejects the key. Normal authentication/OAuth tests also run.
- Vitest and coverage-v8 1.6.0 → 3.2.7, compatible with the existing Vite 7 runtime.
- concurrently 9.2.1 → 9.2.4 updates its exact shell-quote dependency from 1.8.3
  to patched 1.9.0. No override or new direct shell-quote dependency is introduced.
- Fresh npm audit: critical entries drop from 4 to 0 (25 non-critical entries
  remain: 18 high, 4 moderate, 3 low). npm counts affected dependency packages;
  GitHub Dependabot alert counts use a different grouping. The Python requirements
  change fixes the critical python-jose advisory; unrelated Python advisories remain.

The existing Bandit/pip-audit/npm-audit CI job is advisory-only and is not evidence
that the dependency backlog is empty. Live Facebook writes, paid AI, account 2FA,
and customer production installations were not exercised.

## Primary references

- [python-jose releases](https://github.com/mpdavis/python-jose/releases) and
  [algorithm-confusion advisory](https://github.com/advisories/GHSA-6c5p-j8vq-pqhj).
- [Vitest advisory](https://github.com/vitest-dev/vitest/security/advisories/GHSA-5xrq-8626-4rwp)
  and [v3 migration guidance](https://v3.vitest.dev/guide/migration.html).
- [shell-quote advisory](https://github.com/advisories/GHSA-w7jw-789q-3m8p).
- [SHA-2 versus password hashing](https://codeql.github.com/codeql-query-help/python/py-weak-sensitive-data-hashing/).
- [SVG image restrictions](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image).
