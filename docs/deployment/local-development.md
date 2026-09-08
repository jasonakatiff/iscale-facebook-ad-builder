# Develop theLeadRouter — Ad Studio locally

Source: [the public Ad Studio repository](https://github.com/jasonakatiff/theleadrouter-ad-studio). For a hosted workspace, use the [Railway installer](install-on-railway.md). The commands here run a development installation on your computer.

## Configuration shared by both paths

Supply these values through your shell or process manager. Setup does not create, modify, or load `.env.local`. Keep the same signing and encryption values for every backend and worker start; replacing them invalidates sessions or makes saved credentials unreadable.

| Setting | Value |
| --- | --- |
| `SECRET_KEY` | A securely generated signing secret, at least 32 random bytes. |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | A Fernet key: URL-safe base64 encoding of 32 random bytes. |
| `ADMIN_EMAIL` | A valid email address for the initial installation owner. |
| `ADMIN_PASSWORD` | At least 12 characters and at most 72 UTF-8 bytes. |

Generate keys once in your password manager or another trusted secret-management tool and retain them for future starts. One-time generation commands, if needed:

```bash
python3 -c 'import secrets; print(secrets.token_urlsafe(32))'
python3 -c 'import base64, secrets; print(base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())'
```

These commands display new values; they do not configure the application. Store them securely and supply them as process settings. Do not regenerate them when repeating setup. The owner fields are required on the first start of an empty database; later starts preserve the existing owner and can omit both fields.

AI-provider keys are configured after owner login through **Settings → Integrations**. No paid provider connection is required to initialize the workspace. Keep secrets out of frontend `VITE_*` settings.

## Setup command

Requires Bash, Python 3.11+, Node.js 20.19+ or 22.12+, npm, and a dedicated PostgreSQL 15+ development database. Use a `postgresql://` connection URL in the `DATABASE_URL` process setting. Do not point development setup at a shared production database.

```bash
git clone https://github.com/jasonakatiff/theleadrouter-ad-studio.git theleadrouter-ad-studio
cd theleadrouter-ad-studio
# Configure the process settings above, including DATABASE_URL, before continuing.
./setup.sh --check
./setup.sh
```

`--check` validates the Python/Node prerequisites and database/signing/encryption configuration without contacting PostgreSQL or installing dependencies. It reports setting names without displaying credential values. Database connectivity and first-owner validation happen during initialization.

The default command creates or reuses `backend/venv`, installs backend requirements and frontend lockfile dependencies, and calls the shared v2 database bootstrap. An empty database receives its schema, migration revision, owner, and pending setup state. A versioned database receives migrations; an existing database without migration history is rejected for explicit recovery rather than guessed.

For already-installed dependencies, use `./setup.sh --skip-install`. `AD_STUDIO_PYTHON` selects an existing Python interpreter for preflight and this mode; otherwise setup uses `backend/venv/bin/python` if present, then `python3`.

Start three terminals from the repository root. The backend and worker need the same configured process environment:

```bash
# Terminal 1
cd backend
./venv/bin/python startup.py

# Terminal 2
cd backend
./venv/bin/python -m app.sync_worker

# Terminal 3
cd frontend
npm run dev
```

If using a custom interpreter with `--skip-install`, use the paths printed by setup. Open http://localhost:5173 and log in as the installation owner. First login opens the setup wizard. API docs are at http://localhost:8000/api/v1/docs. Stop each process with Ctrl+C when development is complete. Local media remains under `backend/uploads` by default.

## Docker Compose

Requires Docker with Compose v2 and a running Docker daemon. Host Python, Node, and PostgreSQL are unnecessary. Configure the four shared settings above in the terminal running Compose; `DATABASE_URL` is wired to the bundled database automatically.

```bash
docker compose --env-file /dev/null up --build
```

Use `/dev/null` on macOS, Linux, or WSL to prevent Compose from implicitly loading an unrelated `.env`. Missing signing or encryption settings stop configuration before services start. Docker downloads/builds images and installs frontend dependencies on first startup.

| Service | Behavior |
| --- | --- |
| PostgreSQL | Internal database with a named data volume; no host database port. |
| Backend | Waits for PostgreSQL health, bootstraps v2, then serves the API with source reload. |
| Worker | Starts after backend readiness; records its heartbeat and processes synchronization jobs. |
| Frontend | Runs Vite with container-owned dependencies and proxies API/media requests to the backend. |

Open http://localhost:5173 and log in as the owner. The API binds to http://localhost:8000. Both ports are restricted to loopback. If occupied, set `AD_STUDIO_FRONTEND_PORT` and `AD_STUDIO_BACKEND_PORT` before startup; frontend proxying and the backend's allowed origins follow these values.

Stop and remove containers while preserving data:

```bash
docker compose --env-file /dev/null down
```

Run `up --build` again from the same checkout with the same keys. Named volumes retain the owner, setup progress, encrypted provider keys, and uploaded media. Preserve the Compose project name when relocating the checkout, because it determines which volumes are used. Do not add `--volumes` to `down` for an installation whose data you want to keep.

The older Compose file stored uploads in the host's `backend/uploads` directory. This directory remains on disk; the new media volume does not import its files automatically. When upgrading that development stack, retain a backup and copy those existing uploads into the backend container's `/app/uploads` volume before removing the old checkout.

The bundled database password and source mounts are for local development. OAuth applications and optional external storage need their own backend/worker settings added to Compose; the default stack uses local media and in-app AI configuration.

## Automated verification

- `python3 -m unittest discover -s backend/tests/local_setup -v` checks read-only setup preflight, failure handling, and credential preservation.
- `backend/tests/integration/test_installation_bootstrap.py` uses an isolated test PostgreSQL database for empty/concurrent bootstraps and actual setup-command reruns with encrypted credential decryption.
- CI builds the backend/worker images, then runs `backend/scripts/check_compose_installation.py <image-tag>` against this Compose file. It checks owner login, onboarding, frontend proxying, worker heartbeat, and database/media/credential persistence after container removal and recreation. Test resources are removed afterward; no AI provider calls are made.
