# Theme Library and GitHub skins

theLeadRouter — Ad Builder & Manager

Open Themes. Workflow is the default blue skin based on the workflow prototype. Ad Builder & Manager Classic restores the earlier warm palette; Forest provides a green alternative. Apply a built-in theme immediately, or Customize it to save a private copy. The top-bar appearance switch still chooses light, dark, or system mode.

## Build and manage a skin
Choose Create theme, enter a name, and edit both palettes. Each palette defines canvas, panel, text, muted, accent, accentText, accentInk, and border as six-digit hex colors. Save validates readable text and button contrast of at least 4.5:1. Theme files contain colors only, not CSS, scripts, fonts, or arbitrary HTML.

Saved themes belong to your user account and persist on the server. Apply selects a skin in this browser; that preference also styles the login page in this browser. Edit updates your library item. Download exports a portable JSON file. Delete removes the library entry; deleting the currently applied theme restores Workflow. Exporting or deleting a theme never writes to its GitHub repository.

## GitHub workflow
Export a theme JSON, commit it to a public GitHub repository, and paste its file link into Connect a GitHub theme. Both github.com/.../blob/.../theme.json and raw.githubusercontent.com/.../theme.json are supported. You can import another author's file or your own. The file must be at most 32 KB. URLs with query parameters, non-GitHub hosts, redirects, and invalid theme content are rejected.

Refresh GitHub pulls that file again after its author changes it. Refresh is manual, not scheduled. A commit-SHA URL pins a version; a branch URL can receive later updates. Private repositories and automatic GitHub writes/OAuth are not connected in this release. Use local JSON import/export for private themes.

Your server theme library remains private until you choose to publish its exported JSON yourself. Never put an API key or other secret in a theme file.

API group: /api/v1/themes. GET lists your themes; POST creates one; PUT/DELETE /{theme_id} update or remove an owned theme. POST /import-github imports a public file; POST /{theme_id}/refresh-github refreshes its source. A read/write key is required for writes and imports. The theme document request schema is in OpenAPI. Colors accepted by the server are safe settings rather than executable skin code.
