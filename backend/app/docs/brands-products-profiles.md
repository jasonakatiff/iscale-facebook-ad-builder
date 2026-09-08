# Brands, Products, and Customer Profiles

theLeadRouter — Ad Builder & Manager

Start with Brands. Add a brand name, voice, colors, and logo. Use Products to attach product descriptions, product shots, and default landing-page URLs to that brand. Use Customer Profiles to describe demographics, pain points, and goals, then associate profiles with brands.

These inputs guide AI prompts and creative selection. They do not create a Meta campaign. Verify product URLs and image rights before generation.

API groups: /api/v1/brands, /api/v1/products, /api/v1/profiles, and /api/v1/uploads. Their exact create/update payloads are in openapi.json. Brand/product/profile writes require corresponding user permissions in addition to a read/write key. Deleting a brand can cascade to its products; retrieve related records first.

The legacy catalog is shared by the installation. API keys preserve existing permissions; they do not introduce per-user isolation for this catalog.
