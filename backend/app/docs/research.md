# Research and saved searches

theLeadRouter — Ad Builder & Manager

Open Research. Create a search with a keyword, country, result limit, and optional negative keywords or vertical. Start the search and monitor its status. Filter results to find reusable references; inspect media, copy, platform, and dates before using an ad as inspiration.

Saved searches can preserve search configuration. Scheduled searches depend on the separate research scheduler being deployed; saving a schedule alone does not prove that it is running. Workspace account refresh is a separate manual feature.

Use Research Settings to manage excluded pages and keywords. Adding an exclusion affects later research filtering; it does not revoke Meta account access.

API group: /api/v1/research. The OpenAPI file contains each search, saved-search, blacklist, vertical, page, and log operation and its request schema. Starting a scrape or search is a write and can consume provider quota. Use a read/write API key with the owner's required permission.

If results are empty, inspect filters, exclusions, provider errors, and the actual search status before starting another search. Errors appear in toasts or job status; avoid repeatedly submitting a pending search.
