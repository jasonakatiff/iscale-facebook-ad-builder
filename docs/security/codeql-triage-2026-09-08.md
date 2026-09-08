# Critical/high CodeQL triage — 2026-09-08

Scope: the 17 critical/high alerts on `main` at
`cd83d131301b44548bf1e1b0261661df034f485c`. Findings below are based on source/caller
inspection and isolated regression tests. No production penetration test or live
Facebook write was performed. GitHub alerts have not been manually dismissed.

## Fixed or hardened

| Alerts | Finding and impact | Change and evidence |
| --- | --- | --- |
| #16, #17 — critical | Legacy image/video uploads accepted arbitrary destinations. A campaign writer could request localhost, cloud metadata addresses, or redirect to private services. The same methods accepted filesystem paths and passed them to the Facebook SDK. | Both methods now use the existing `download_media` context manager. Tests reject private IPv4/IPv6, metadata addresses, file URLs, absolute and relative filesystem paths. Existing downloader resolves all addresses, rejects non-public addresses, connects to a pinned IP with the original TLS hostname, and revalidates each redirect. |
| #12, #13 — high | Temporary file creation/removal depended on URL-derived values; caller-supplied local files also reached the SDK. | The custom temp-file logic is removed. Downloader-owned filenames use fixed suffixes and are cleaned up on success and provider exceptions. Regression tests verify no leftover file and no provider upload for disallowed sources. |
| #23, #24, #25 — critical | All three first requests had a fixed `graph.facebook.com` host, so arbitrary-host SSRF was not reproduced. Resource paths accepted traversal/query syntax and requests followed redirects by default. | Legacy video reads require ASCII decimal IDs. Delivery reads allow only IDs/account IDs and the three used edges (`ads`, `insights`, `thumbnails`), plus the existing root multi-ID lookup. All three disable and reject redirects. Video credentials now use an Authorization header. Invalid-path and redirect tests fail before a second request. |
| #20, #21 — high | Unanchored, overlapping email/query regexes caused excessive backtracking. Repeated hostile strings exceeded the 500 ms regression deadline. | Email matching now has a start boundary and possessive quantifiers; URL matching consumes one token and strips userinfo/query/fragment with string operations. The same deadline test passes and credential/email/query redaction remains covered. Python 3.11+ is required, matching CI and the application runtime. |

Public media remains supported. Local server paths are intentionally rejected at
the API boundary and return HTTP 422. Provider success is mocked in these tests;
temporary-file handling and DNS/redirect decision logic execute for real.

## Non-exploitable under the current data flow

| Alert | Evidence and classification |
| --- | --- |
| #18 — critical, theme importer | `GitHubImport.github_only` requires HTTPS and an exact `github.com` or `raw.githubusercontent.com` authority, rejects queries/fragments and invalid path characters, then constructs a fixed raw.githubusercontent.com URL. Both import and persisted-theme refresh run this validator. The HTTP client disables redirects and environment proxies and bounds response size. Existing tests verify arbitrary-host rejection, private-host redirects, 32 KB limits, timeout handling, import and refresh. No arbitrary-host SSRF identified. |
| #11 — high, OAuth state cookie | The value is a signed HS256 CSRF state, containing user ID, provider, random nonce, purpose and a 10-minute expiry. It contains no provider access/refresh token or password. The cookie is HttpOnly and Secure by default; HTTP development uses the explicit insecure option. Callbacks require a matching cookie, verify signature/purpose/provider/expiry, and clear the cookie. Existing tests cover mismatch and absent cookie rejection and successful clearing. Encrypting this signed, non-confidential state would not fix an observed vulnerability. |
| #14 — high, API-key hashing | The reported source is `test_user_api_keys.py` reading the newly generated `apiKey` response; CodeQL labels it a password. Production creates these values with `secrets.token_urlsafe(32)`. SHA-256 hashes a 256-bit random bearer key, not a human password. Human passwords use bcrypt. Existing lifecycle tests prove hash-only persistence, revoked-key rejection, and read/write scope enforcement. Replacing this hash would invalidate stored keys without a demonstrated benefit. |
| #15 — high, telemetry-key test | This is an assertion that the database contains the SHA-256 digest of a generated random API key. It is not a production password-hashing operation; the same key generation described for #14 applies. |
| #19 — high, upload test | The substring check is an assertion against a mocked R2 upload response, not a production URL validator. It grants no access and initiates no outbound request. |
| #26 — high, prototype exporter | The regex extracts script references from the trusted Vite build artifact. It is not applied to user-submitted HTML and is not an HTML sanitization boundary. Both embedded JS and CSS are repository-controlled build output. No remotely controllable input reaches this exporter. |
| #27, #28 — high, prototype media preview | The source is the user's file picker. The `src` value is created by `URL.createObjectURL(file)` and kept in component memory; no raw file content or attacker-provided URL is inserted as HTML. Preview sinks are `<img>` and `<video>`, and filenames are React text/attributes. No `innerHTML`, `document.write`, `iframe`, `object`, or `embed` sink exists in this flow. SVG image-context restrictions disable script execution. This is source inspection, not a new browser acceptance run. |

These classifications are specific to the existing callers and sinks. New callers,
weaker validators, different preview elements, or human-selected API keys require
review. They do not establish that the entire application is vulnerability-free.

## Verification

- Phase 0: 38 failures and 6 passes reproduce missing upload/Graph protections and
  slow redaction. Two additional API tests reproduced HTTP 500 instead of 422.
- After implementation: 139 focused tests passed, including real local PostgreSQL
  API/OAuth/key/telemetry tests. Outbound provider transports were mocked.
- Full backend suite: 504 passed, one existing XPASS. The final redaction-order
  correction passed the 139-test affected group. GitHub CI status is tracked in the
  [implementation plan](../plans/security-codeql-findings.md).
- This task does not resolve the separate Dependabot backlog or the existing
  non-blocking Bandit/pip-audit/npm-audit workflow. Their alerts must not be treated
  as addressed by this patch.

## References

- [OWASP SSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html): redirect handling and address validation.
- [CodeQL hashing guidance](https://codeql.github.com/codeql-query-help/python/py-weak-sensitive-data-hashing/): SHA-2 for data outside limited-input-space password hashing.
- [MDN SVG image contexts](https://developer.mozilla.org/en-US/docs/Web/SVG/Guides/SVG_as_an_image): script restrictions for images, distinct from embedded documents.
