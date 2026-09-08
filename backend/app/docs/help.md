# Help and downloadable documentation

theLeadRouter — Ad Studio

Open Help & API Docs from the sidebar. Browse the user-guide list, download an individual Markdown file, search the endpoint list, open Swagger, or download the complete ZIP. The ZIP includes all Markdown guides plus OpenAPI JSON and an endpoint index generated from the running application.

Documentation endpoints are public and contain no user credentials or private application records. GET /api/v1/help/docs lists guides, GET /api/v1/help/docs/{slug} returns Markdown, and GET /api/v1/help/download returns the ZIP. Add `?download=true` to a Markdown URL for an attachment response.

The bundle identifies the app release. Redownload it after upgrades so your automation follows the deployed schemas. API keys authorize requests; documentation alone does not provide access.

The **Posting queue, failures and data refresh** guide covers buyer/admin workflows, cadence, retry caps, notifications and reconciliation. **Delivery API: queue, retries, notifications and reports** covers all delivery operations and legacy ad submission. Both are included in the ZIP alongside typed delivery response schemas in OpenAPI.
