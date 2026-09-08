# Creative Building: image, video, and remix

theLeadRouter — Ad Studio

Open Creative Building and choose a format. Image Ads uses a brand, product, audience profile, style or template, and generation settings. Review those choices, generate, and inspect the result before saving or using it in a campaign.

Video Ads supports the video workflow and upload paths exposed by the current app. Provider availability depends on deployment configuration. Ad Remix deconstructs a reference into a blueprint and rebuilds it using selected brand and product inputs. Winning Ads provides reusable template references.

Generated Ads is the saved output gallery. Review images/video and copy, download assets where offered, and use the gallery's export or deletion controls. Groups can share an ad_bundle_id. Generating or saving creative does not automatically publish an ad to a network.

API groups: /api/v1/generated-ads, /api/v1/ad-remix, /api/v1/copy-generation, /api/v1/templates, and /api/v1/uploads. Use OpenAPI request schemas for provider-specific options and multipart uploads. AI generation and media processing can incur provider usage charges. An API key authorizes the call; deployment-level AI and storage credentials are still required.

If generation fails, inspect the returned error and configured provider status. Do not interpret an empty gallery as proof that a generation was never submitted. Refresh status or reconcile saved records before retrying an expensive action.
