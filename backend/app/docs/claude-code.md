# Use Ad Builder & Manager from Claude Code

theLeadRouter — Ad Builder & Manager

## Documentation pack
Download the documentation ZIP from Help & API Docs. Extract the Markdown files and openapi.json into your working project. Add this folder to Claude Code context. The files contain documentation only; they do not authenticate Claude Code and contain no private API key.

Create a user API key in Ad Builder & Manager. Start with read-only. Provide BREADWINNER_API_URL and BREADWINNER_API_KEY through your existing secure shell environment. Never paste the key into a committed document, prompt transcript, theme file, or repository. A read/write key is necessary for changes and remains limited by the owner's current permissions.

## Suggested project instructions
```text
Use the Ad Builder & Manager Markdown guides and openapi.json in this project as the API contract.
Read BREADWINNER_API_URL and BREADWINNER_API_KEY from the process environment.
Do not print, log, commit, or embed the key in URLs or generated files.
Verify the authenticated identity with GET /api/v1/auth/me before acting.
Use exact paths, methods, schemas, and pagination from OpenAPI.
Read existing resources before making changes; preserve account and workspace IDs.
Explain the concrete effects before campaign publication, spend changes, deletions, or bulk writes.
After a timeout, reconcile results before retrying a write.
Do not treat prototype or legacy Reporting sample values as live performance.
```

Start with: “Read the docs, verify my identity, and list the brands I can access.” Then use specific requests such as listing workspace accounts, creating a brand, generating draft creative, or inspecting campaign insights. Only the actual API operations are automatable; a visual prototype does not imply a backend endpoint exists.

No MCP server installation is required for ordinary HTTP access from Claude Code. The downloadable JSON can also be used with an OpenAPI client generator. Inspect any generated client before supplying credentials. Revoke the integration key from Ad Builder & Manager when it is no longer needed.
