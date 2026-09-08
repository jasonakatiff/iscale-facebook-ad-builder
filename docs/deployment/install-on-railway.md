# Install theLeadRouter — Ad Builder & Manager

[Deploy Ad Builder & Manager on Railway — preview](https://railway.com/deploy/rNhJ3h)

The unlisted preview has passed a fresh Railway installation, owner login, independent credential generation, and database/media persistence checks. Live paid AI generation and nontechnical pilot acceptance remain unverified. The template is not listed in the Railway marketplace.

Install your preview:

1. Open the **Deploy Ad Builder & Manager on Railway** link above, sign in to Railway, and select your workspace. Your Railway account pays for hosting, database storage, and saved creative files. Check [Railway pricing](https://railway.com/pricing) before deploying.
2. Configure **Backend** with `ADMIN_EMAIL` (your owner email) and `ADMIN_PASSWORD` (your owner password), then choose **Deploy**. These are the only two required inputs. The password needs at least 12 characters and at most 72 UTF-8 bytes. Save it in your password manager.
3. When deployment finishes, open **Frontend** and its website link. Sign in with your owner credentials.
4. In the setup wizard, connect **Google Gemini** for copy and **fal.ai** for images. Each card includes instructions and a link to get a key. Your providers bill your own accounts. Saving a key does not use generation credits. Gemini offers a connection check; fal.ai verifies its generation key when you create the first image.
5. Add your brand, then add a product and select that brand in the product form. A photo is optional. Describe the audience and offer, then choose **Generate one ad**. This step can incur AI-provider charges.
6. When the image is saved, choose **Download image** or open your creative gallery. This flow does not launch an advertising campaign.

You can choose **Finish later**, then reopen the wizard from **Settings → Integrations**. Progress is saved. Update, test, replace, or disconnect your provider keys in those same settings. Changes take effect on the next request without a restart. Only an administrator can manage these shared provider connections.

Kie AI is optional storage for a video-provider key. Connecting it does not enable a video workflow in this release. Advertising-account authorization remains a separate Connections workflow.

## If a connection fails

| Message | Action |
| --- | --- |
| Not connected | Add the named provider in Settings → Integrations. |
| Invalid key | Get a replacement key with generation permissions and save it. |
| Insufficient credit | Add provider credits, then test again. |
| Temporarily unavailable | Check the provider's request history before retrying. A timed-out request can still incur a charge. |
| Image generated but storage failed | Download the recovery image immediately. Preserve the file before retrying storage. |
| Image ready but gallery save failed | Use **Save to gallery** on the existing result. This retry does not generate another image. |

Generation never substitutes a placeholder image when a key is missing.

## Keeping your installation safe

Enable scheduled backups for both the database and creative-media volumes in Railway. Keep your Railway account protected and save the installation's signing/encryption configuration in your password manager. Losing the encryption key prevents recovery of stored integration credentials. A database backup alone does not contain your media files.

Apply template updates only after checking the release notes and taking backups. Media storage uses one backend instance; updates can briefly interrupt access. Increasing traffic or storage needs is a separate capacity decision.

Report installation problems through [the project issue tracker](https://github.com/jasonakatiff/iscale-facebook-ad-builder/issues). Include the failing step and displayed message. Never include API keys, passwords, tokens, or database URLs.
