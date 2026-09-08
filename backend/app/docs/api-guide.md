# API guide and examples

theLeadRouter — Ad Studio

## Base URL and authentication
Production API origin: https://ad-builder-backend-production.up.railway.app
Browser app: https://breadwinner.a4d.com
Interactive reference: /api/v1/docs
OpenAPI JSON: /api/v1/openapi.json

Export BREADWINNER_API_URL as the origin (without /api/v1) and BREADWINNER_API_KEY securely in your shell. These variables are examples for your client; they are not application deployment settings.

```sh
curl --fail-with-body "$BREADWINNER_API_URL/api/v1/auth/me" \
  -H "Authorization: Bearer $BREADWINNER_API_KEY"
curl --fail-with-body "$BREADWINNER_API_URL/api/v1/brands?limit=20" \
  -H "Authorization: Bearer $BREADWINNER_API_KEY"
curl --fail-with-body "$BREADWINNER_API_URL/api/v2/workspaces?limit=20&offset=0" \
  -H "Authorization: Bearer $BREADWINNER_API_KEY"
```

## Contract rules
Use the downloaded OpenAPI file as the authority for each method, path, schema, required field, and response. Existing APIs contain both snake_case and camelCase contracts; do not invent a global transformation. Legacy endpoints often return arrays or `{detail: ...}` errors. Workspace, theme, and user-key endpoints use `{data, pagination}` for lists and structured `{error:{code,message,details}}` errors. Pagination parameters differ by endpoint; inspect the operation.

Read-only keys allow GET/HEAD/OPTIONS on protected data endpoints. All other methods require platform:write, including POST-based exports. Provider OAuth and browser account-security endpoints require a session. Legacy bot operations require legacy bot scopes. Public documentation and health endpoints need no key.

## Changes and retries
Read the current resource before updating it. Follow the endpoint's documented required fields. Do not reuse IDs from another account or workspace. A read/write key can invoke operations that incur provider usage or publish campaigns; it is not restricted to browser draft mode. Network timeouts do not prove a write failed. Reconcile provider IDs or application records before resubmitting.

401 means invalid/revoked/expired credentials; replace the key through the browser. 403 means insufficient scope, role, inactive account, or resource access; do not retry with guessed IDs. 422 indicates invalid input. 429 indicates a rate limit. Provider errors can be reported per service rather than as one global failure.
