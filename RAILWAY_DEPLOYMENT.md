# Deploy theLeadRouter — Ad Studio on Railway

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/rNhJ3h?version=ad-studio)

Use the [customer installation guide](docs/deployment/install-on-railway.md) for a new Ad Studio workspace. This page replaces the older manual three-service guide; the current installer provides four services, persistent storage, generated credentials, and guided owner setup.

## Install your workspace

1. Follow the deploy link, sign in to Railway, and select your workspace.
2. Set **Backend → ADMIN_EMAIL** and **ADMIN_PASSWORD**, then deploy. These are the only required inputs. The password needs at least 12 characters and at most 72 UTF-8 bytes.
3. Open the **Frontend** service's public website and sign in with the owner credentials.
4. Connect AI providers in the setup wizard or **Settings → Integrations**, then add your brand and product.

Hosting and provider usage are billed through your own accounts. The [customer guide](docs/deployment/install-on-railway.md) covers provider configuration, generation, recovery, and backups.

## What the template configures

| Service | Runtime | Networking and storage |
| --- | --- | --- |
| Backend | Root build context; `backend/Dockerfile`; `python startup.py` | Public HTTPS domain; media volume mounted at `/app/uploads` |
| Frontend | `/frontend` build context; `Dockerfile.railway`; nginx | Public HTTPS domain; `VITE_API_URL` points to the Backend origin plus `/api/v1` |
| Worker | Root build context; `backend/Dockerfile.sync-worker`; `python -m app.sync_worker` | Private; shares backend database and signing/encryption configuration |
| Postgres | PostgreSQL container | Private; data volume mounted at `/var/lib/postgresql/data` |

The frontend uses Docker/nginx. The template sets its start command to `/docker-entrypoint.sh nginx -g "daemon off;"` so nginx receives Railway's runtime port configuration.

The template wires `DATABASE_URL`, generates internal signing/encryption/database credentials, and preserves them on template updates. Backend startup initializes an empty database, stamps the current migration revision, creates the owner and installation state, and applies migrations to existing versioned databases. The worker waits for the supported schema.

Keep provider access tokens, application secrets, database credentials, and encryption keys in the backend/worker configuration or the supported encrypted integration settings. Frontend `VITE_*` values are public build configuration; never place access tokens there.

## Maintainer configuration reference

The hosted template is represented by [.railway/serialized-template.json](.railway/serialized-template.json). [.railway/template.json](.railway/template.json) records its release status and owner inputs. [railway.toml](railway.toml) and [frontend/railway.toml](frontend/railway.toml) configure individual services; they do not create the complete stack or its volumes.

Use the [template maintainer guide](docs/deployment/railway-template-maintainer.md) for source changes, isolated installation checks, and publishing the template. That guide also distinguishes public release verification from the separate private deployment.

## Verification and updates

The unlisted preview has passed fresh Railway deployment, owner login/setup, backend readiness, worker heartbeat, and browser branding checks. Earlier installer checks covered database/media persistence and independent credentials. Paid AI generation, an independent-account dashboard install, nontechnical pilot acceptance, and cloud backup/restore rehearsal remain open; the template is not listed in Railway's marketplace.

Before updating, back up both database and media volumes and preserve compatible signing/encryption configuration. A database backup alone does not contain saved creative files. Check the [release history](CHANGELOG.md) and follow the maintainer guide's rollback procedure. Do not reset encryption keys or run automatic down-migrations during an update.
