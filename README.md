<p align="center">
  <img src="frontend/public/leadrouter-mark.svg" alt="theLeadRouter — Ad Studio" width="120" />
</p>

<h1 align="center">theLeadRouter — Ad Studio</h1>

<p align="center">
  <strong>Version 2 · Release candidate</strong><br>
  Research, create, launch, and manage ad campaigns from one workspace
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#documentation">Documentation</a> •
  <a href="#deployment">Deployment</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/python-3.11+-blue.svg" alt="Python 3.11+">
  <img src="https://img.shields.io/badge/node-18+-green.svg" alt="Node 18+">
  <img src="https://img.shields.io/badge/react-19-61dafb.svg" alt="React 19">
  <img src="https://img.shields.io/badge/fastapi-0.100+-009688.svg" alt="FastAPI">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License">
</p>

<p align="center">
  Created by <strong>Jason Akatiff</strong><br>
  <a href="https://theleadrouter.com">theLeadRouter.com</a> • <a href="https://iscale.com">iSCALE.com</a> • <a href="https://a4d.com">A4D.com</a><br>
  <a href="https://t.me/jasonakatiff">Telegram</a> • <a href="mailto:jason@jasonakatiff.com">jason@jasonakatiff.com</a>
</p>

## Install on Railway — preview

[![Deploy on Railway](https://railway.com/button.svg)](https://railway.com/deploy/rNhJ3h?version=ad-studio)

Deploy your own **theLeadRouter — Ad Studio** workspace, enter your owner email/password, then connect AI keys in the setup wizard. Keys can be changed later in **Settings → Integrations**. No terminal or manual database wiring is needed.

The unlisted **Ad Studio** preview passed a fresh cloud installation, owner login/setup, worker readiness, and browser branding check. Earlier installer checks covered database and media persistence. Paid AI generation and nontechnical pilot acceptance remain open. Hosting and AI usage use your own accounts. See the [installation guide](docs/deployment/install-on-railway.md).

---

## Overview

**theLeadRouter — Ad Studio** is the v2 ad workspace, formerly BreadWinner / Facebook Ad Builder. Research competitors, generate ad copy and creative, launch campaigns, manage delivery, and review performance in one place. LeadRouter campaign connections, workspace API keys, plugins, and guided setup are included in the v2 release candidate.

### Guided Railway installation (release preview)

Use the **Deploy on Railway** button above. The installer provides a first-run wizard and Settings → Integrations for encrypted AI keys, brand/product setup, and a first image ad. See the [customer installation guide](docs/deployment/install-on-railway.md) and [release procedure](docs/deployment/railway-template-maintainer.md).

See [product naming and compatibility](docs/brand-guidelines.md) for the v2 identity.

### Key Capabilities

- **Competitor Intelligence** — Scrape and analyze ads from the Facebook Ad Library
- **AI Content Generation** — Create ad copy and images using Google Gemini and Fal.ai
- **Brand Management** — Maintain consistent brand voice, colors, and assets
- **Template System** — Deconstruct winning ads into reusable blueprints
- **Campaign Management** — Create and manage Facebook campaigns via API

---

## Features

### 🔍 Competitor Research
Scrape ads directly from Facebook's Ad Library. Analyze competitor strategies, track active campaigns, and identify winning ad formats.

### 🎨 Brand Management
Create and manage brand profiles with:
- Brand voice and messaging guidelines
- Color palettes (primary, secondary, highlight)
- Logo and visual assets
- Multiple products per brand

### 🤖 AI-Powered Ad Generation
Generate high-converting ads using AI:
- **Copy Generation** — Compelling headlines, body text, and CTAs
- **Image Generation** — AI-created visuals via Fal.ai
- **Ad Remix** — Transform winning competitor ads into your brand style

### 📋 Template Library
Build a library of proven ad structures:
- Deconstruct successful ads into blueprints
- Reuse templates across brands and products
- Track performance by template type

### 📊 Campaign Management
Manage Facebook campaigns directly:
- Create campaigns, ad sets, and ads
- Upload creative assets
- Monitor campaign status
- Sync with Facebook Ads Manager

---

## Quick Start

### Install your own workspace (recommended)

1. [Deploy on Railway](https://railway.com/deploy/rNhJ3h?version=ad-studio), sign in to your Railway account, and select your workspace.
2. Enter your owner email and password in **Backend → ADMIN_EMAIL / ADMIN_PASSWORD**, then deploy. The installer creates the frontend, backend, background worker, PostgreSQL database, and persistent storage.
3. Open the deployed **Frontend** website and sign in. Connect your AI providers and add a brand/product in the setup wizard. Provider accounts pay for any ads you generate.

Follow the [installation guide](docs/deployment/install-on-railway.md) for password requirements, provider setup, and backups. Railway is the only published installer for Ad Studio today; see [other hosting options](#other-hosting-options) for alternatives under consideration.

## Local Development

The commands below are for developers running the code locally. The Railway installer above does not require local Node.js, Python, or PostgreSQL.

### Prerequisites

- **Node.js** 20.19+ or 22.12+ ([download](https://nodejs.org))
- **Python** 3.11+ ([download](https://python.org))
- **PostgreSQL** 15+ (local or cloud: [Railway](https://railway.app), [Supabase](https://supabase.com))

### Guided Local Setup

Clone this public repository and configure the process settings described in the [local development guide](docs/deployment/local-development.md). Then run:

```bash
./setup.sh --check  # Read-only prerequisite and configuration check
./setup.sh          # Install dependencies and initialize the v2 database
```

The setup command preserves supplied signing/encryption keys and existing owners. It never creates or overwrites secret files. Use `./setup.sh --skip-install` when dependencies are already installed. It prints separate backend, worker, and frontend start commands.

### Manual Local Setup

Use the steps below to install and start each component yourself.

<details>
<summary>Click to expand manual setup instructions</summary>

#### 1. Clone and Install

```bash
git clone https://github.com/jasonakatiff/theleadrouter-ad-studio.git theleadrouter-ad-studio
cd theleadrouter-ad-studio

# Backend
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# Frontend
cd ../frontend
npm install
```

#### 2. Configure Environment

Use a dedicated development PostgreSQL database. Configure `DATABASE_URL`, `SECRET_KEY`, `OAUTH_TOKEN_ENCRYPTION_KEY`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` in the backend process environment before starting it. Supply the same database and signing/encryption values to the worker. See [Environment Variables](#environment-variables) and `.env.example` for the complete configuration.

The owner password needs at least 12 characters and at most 72 UTF-8 bytes. The first startup creates the owner; subsequent starts preserve the existing account and credentials. Keep the signing and encryption keys stable between starts.

The commands below assume these process environments are already configured. Merely creating a root `.env.local` does not load it into backend commands. AI keys can be added after signing in through **Settings → Integrations**.

#### 3. Start the Backend

In a terminal at the repository root:

```bash
cd backend
source venv/bin/activate
python startup.py
```

The startup entry point initializes an empty database, records the Alembic revision, creates the owner and setup state, and starts the API on port 8000 by default. For an existing versioned database, it applies migrations. `init_db.py` alone does not perform the v2 installation bootstrap.

#### 4. Start the Worker and Frontend

Open two more terminals at the repository root:

```bash
# Terminal 2: Worker, with the same backend process environment
cd backend
source venv/bin/activate
python -m app.sync_worker

# Terminal 3: Frontend
cd frontend
npm run dev
```

Sign in with the owner credentials to reach the setup wizard. Use the [customer guide](docs/deployment/install-on-railway.md) for the provider and brand/product steps after login.

</details>

### Access the Application

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API Documentation | http://localhost:8000/api/v1/docs |

---

## External Services

### Required Services

| Service | Purpose | Setup Guide |
|---------|---------|-------------|
| **PostgreSQL** | Database | Local install, [Railway](https://railway.app), or [Supabase](https://supabase.com) |
| **Google Gemini** | AI text generation & vision | [Get API Key](https://aistudio.google.com/app/apikey) |

### Optional Services

| Service | Purpose | Setup Guide |
|---------|---------|-------------|
| **Facebook Marketing API** | Campaign management, Ad Library | [Developer Portal](https://developers.facebook.com) |
| **Fal.ai** | AI image generation | [fal.ai](https://fal.ai) |
| **Cloudflare R2** | Image/video storage | [Cloudflare Dashboard](https://dash.cloudflare.com) |

### Facebook Developer Setup

<details>
<summary>Click to expand Facebook API setup</summary>

1. Go to [developers.facebook.com](https://developers.facebook.com)
2. Create a new app → Select "Business" type
3. Add the "Marketing API" product
4. Go to Tools → Graph API Explorer
5. Generate a User Access Token with these permissions:
   - `ads_management`
   - `ads_read`
   - `business_management`
6. Find your Ad Account ID in [Ads Manager](https://adsmanager.facebook.com) → Settings

```bash
# Configure in the backend and worker process environments
FACEBOOK_ACCESS_TOKEN=your-token
FACEBOOK_AD_ACCOUNT_ID=act_123456789
FACEBOOK_APP_ID=your-app-id
FACEBOOK_APP_SECRET=your-app-secret
```

> **Note:** Access tokens expire after ~60 days. For production, implement token refresh.

</details>

### Cloudflare R2 Setup

<details>
<summary>Click to expand R2 storage setup</summary>

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → R2
2. Create a bucket (e.g., `theleadrouter-ad-studio`)
3. Go to R2 → Manage R2 API Tokens → Create API token
4. Grant read/write permissions for your bucket
5. Enable public access: Bucket Settings → Public Access → Enable R2.dev subdomain

```bash
# Configure in the backend process environment
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=theleadrouter-ad-studio
R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

</details>

---

## Environment Variables

For local development or a custom deployment, configure the values below. The Railway installer creates the database connection and signing/encryption keys automatically; its setup wizard stores AI keys through **Settings → Integrations**.

The backend and worker read their process environments. A root `.env.local` file is not loaded by these commands automatically. Keep provider tokens and other secrets out of frontend `VITE_*` settings.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SECRET_KEY` | ✅ | JWT signing key (generate random string) |
| `OAUTH_TOKEN_ENCRYPTION_KEY` | ✅ | Fernet key for encrypted integration credentials; share the same value with the worker |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | First startup | Owner account created by `startup.py`; existing installations keep their owner |
| `GEMINI_API_KEY` | For AI features | Optional environment fallback; the owner can configure Gemini in Settings → Integrations |
| `ALLOWED_ORIGINS` | Production | Comma-separated CORS origins |
| `FACEBOOK_ACCESS_TOKEN` | For FB features | Facebook Marketing API token |
| `FACEBOOK_AD_ACCOUNT_ID` | For FB features | Facebook Ad Account ID |
| `R2_*` | Optional | Cloudflare R2 credentials; the Railway installer uses a persistent media volume by default |
| `FAL_AI_API_KEY` | For image gen | Fal.ai API key |

See `.env.example` for all available options.

---

## Usage Guide

### 1. Create a Brand

Navigate to **Brands** → **New Brand**

- Enter brand name and description
- Upload logo
- Set brand colors (primary, secondary, highlight)
- Define brand voice/tone guidelines

### 2. Add Products

Navigate to **Products** → **New Product**

- Select the parent brand
- Add product name and description
- Upload product images
- Set default landing page URL

### 3. Research Competitors

Navigate to **Research** → **Scrape Brand Ads**

- Enter a competitor's Facebook Page ID or URL
- View their active ads
- Save interesting ads for reference
- Analyze ad copy and creative patterns

### 4. Generate Ads

Navigate to **Create Ads**

- Select brand and product
- Choose a template or start fresh
- AI generates multiple ad variations
- Edit and refine as needed
- Export or push to Facebook

### 5. Manage Campaigns

Navigate to **Campaigns**

- Create new campaigns
- Set up ad sets with targeting
- Add ads with your generated creative
- Monitor performance

---

## Architecture

```
theleadrouter-ad-studio/
├── backend/                 # Python FastAPI
│   ├── app/
│   │   ├── api/v1/         # REST endpoints
│   │   │   ├── brands.py
│   │   │   ├── products.py
│   │   │   ├── research.py
│   │   │   ├── ad_remix.py
│   │   │   └── facebook.py
│   │   ├── services/       # Business logic
│   │   │   ├── facebook_service.py
│   │   │   ├── ad_remix_service.py
│   │   │   └── scraper.py
│   │   ├── models.py       # SQLAlchemy models
│   │   └── main.py         # FastAPI app
│   └── requirements.txt
├── frontend/               # React + Vite
│   ├── src/
│   │   ├── pages/         # Route components
│   │   ├── components/    # Reusable UI
│   │   ├── context/       # React context
│   │   └── lib/           # Utilities
│   └── package.json
└── .env.example           # Environment template
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TailwindCSS |
| Backend | Python 3.11+, FastAPI, SQLAlchemy |
| Database | PostgreSQL |
| AI | Google Gemini, Fal.ai |
| Storage | Persistent media volume on Railway; optional Cloudflare R2 |
| Auth | JWT (access + refresh tokens) |

---

## API Reference

Interactive API documentation is available at `/api/v1/docs` when running the backend.

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/v1/auth/login` | Authenticate user |
| `GET` | `/api/v1/brands` | List all brands |
| `POST` | `/api/v1/brands` | Create a brand |
| `GET` | `/api/v1/products` | List all products |
| `POST` | `/api/v1/research/search` | Search competitor ads |
| `POST` | `/api/v1/ad-remix/reconstruct` | Reconstruct an ad concept from a blueprint |
| `POST` | `/api/v1/facebook/campaigns` | Create Facebook campaign |

---

## Testing

### E2E Tests (agent-browser)

```bash
cd frontend

# Run all smoke tests
npm run test:smoke

# Run with authentication
TEST_EMAIL=user@example.com TEST_PASSWORD=xxx npm run test
```

### Unit Tests

```bash
# Frontend
cd frontend
npm run test:unit

# Backend
cd backend
pytest
```

---

## Deployment

### Railway — available preview

Use the [Deploy on Railway installer](https://railway.com/deploy/rNhJ3h?version=ad-studio) for a new **theLeadRouter — Ad Studio** workspace. It deploys all four connected services from this public repository:

| Service | Purpose |
| --- | --- |
| Frontend | Ad Studio website |
| Backend | API, authentication, and creative media storage |
| Worker | Background synchronization |
| PostgreSQL | Workspace data |

Database and media volumes retain saved data. The only required installation inputs are your owner email and password; configure AI keys after signing in. The template is publicly shareable and unlisted in Railway's marketplace.

See the [customer installation guide](docs/deployment/install-on-railway.md) or [template maintainer guide](docs/deployment/railway-template-maintainer.md).

### Other hosting options

Platform documentation checked on **2026-09-08 (UTC)**. These are possible deployment targets; **Ad Studio installers for them are not implemented or tested yet**.

| Platform | Installation approach | Ad Studio status |
| --- | --- | --- |
| [Render](https://render.com/docs/deploy-to-render) | A Deploy to Render button backed by a [Blueprint](https://render.com/docs/blueprint-spec) can define the web services, worker, PostgreSQL, and media disk. | Recommended next target based on the existing architecture; no installer yet. |
| [Northflank](https://northflank.com/docs/v1/application/infrastructure-as-code/share-a-template) | A shared template lets customers add and run the application stack in their own account. | Under consideration; no template yet. |
| [DigitalOcean Marketplace](https://docs.digitalocean.com/products/marketplace/) | A Droplet 1-Click App packages the stack in a server image with a marketplace listing. | Under consideration; requires an Ad Studio image and listing. |
| [Coolify](https://coolify.io/docs/services/introduction) | A Docker Compose package runs on a customer's server connected to Coolify; catalog templates are curated separately. | Under consideration; no production package or catalog entry yet. |

DigitalOcean's [App Platform deploy button](https://docs.digitalocean.com/products/app-platform/how-to/add-deploy-do-button/) documents one service or static site, optionally with a development database. App Platform also [does not support persistent volumes](https://docs.digitalocean.com/products/app-platform/details/limits/). An App Platform installer needs a different service/storage setup from the current Railway package.

Each host needs its own deployment definition and fresh-install verification. Customers use their own hosting and AI-provider accounts.

### Docker — developer builds

```bash
# From the repository root, build the application images
docker build -f backend/Dockerfile -t theleadrouter-ad-studio-backend .
docker build -f frontend/Dockerfile -t theleadrouter-ad-studio-frontend frontend
```

For local development, [Docker Compose](docker-compose.yml) runs PostgreSQL, the backend, the sync worker, and Vite. Supply `SECRET_KEY`, `OAUTH_TOKEN_ENCRYPTION_KEY`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD` through your process environment, then run:

```bash
docker compose --env-file /dev/null up --build
```

The backend performs the v2 bootstrap before the worker starts. Named volumes preserve the database and media across `docker compose --env-file /dev/null down` and subsequent startup. HTTP ports bind to your own computer. See [local development](docs/deployment/local-development.md) for prerequisites, stable credentials, ports, and restart instructions. This development stack uses source mounts and the Vite dev server; the Railway installer remains the hosted deployment path.

## Documentation

- [Install Ad Studio on Railway](docs/deployment/install-on-railway.md)
- [Local development and Docker Compose](docs/deployment/local-development.md)
- [Railway template maintenance and verification](docs/deployment/railway-template-maintainer.md)
- [Product naming and compatibility](docs/brand-guidelines.md)
- [Release history](CHANGELOG.md)

---

## Troubleshooting

<details>
<summary><strong>DATABASE_URL environment variable is required</strong></summary>

- Ensure `DATABASE_URL` is available in the backend process environment
- Verify the DATABASE_URL format: `postgresql://user:pass@host:5432/dbname`
- Check PostgreSQL is running: `pg_isready`

</details>

<details>
<summary><strong>CORS errors in browser</strong></summary>

- Add your frontend URL to `ALLOWED_ORIGINS` in the backend process environment
- Restart the backend server

</details>

<details>
<summary><strong>Facebook API errors</strong></summary>

- Check if your access token has expired (they last ~60 days)
- Verify Ad Account ID format: `act_123456789`
- Ensure required permissions are granted

</details>

<details>
<summary><strong>AI generation not working</strong></summary>

- Verify `GEMINI_API_KEY` is set correctly
- Check API quota at [Google AI Studio](https://aistudio.google.com)
- For image generation, ensure `FAL_AI_API_KEY` is configured

</details>

---

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

---

## Author

**Jason Akatiff**

- Product: [theLeadRouter.com](https://theleadrouter.com)
- Creator websites: [iSCALE.com](https://iscale.com) | [A4D.com](https://a4d.com)
- Telegram: [@jasonakatiff](https://t.me/jasonakatiff)
- Email: [jason@jasonakatiff.com](mailto:jason@jasonakatiff.com)

## Built with AI

This project is part of the [Built with AI](https://builtwithai.com/open-source) open source collection — free tools built by the AI builder community.

**[Join the community →](https://builtwithai.com/apply)**

---

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

---

<p align="center">
  <a href="https://theleadrouter.com"><strong>theLeadRouter — Ad Studio</strong></a><br>
  Built with ❤️ by <a href="https://iscale.com">iSCALE</a> using FastAPI, React, and AI
</p>


## Additional Ad Integrations

Connect accounts from **Google Ads**, **TikTok Ads**, or **Facebook Campaigns**. The **Overview** page combines platform reporting. Configure the backend variables below; `.env.example` contains callback URL examples.

- **Google Ads:** `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_DEVELOPER_TOKEN`, and `GOOGLE_ADS_OAUTH_REDIRECT_URI`; set `GOOGLE_ADS_LOGIN_CUSTOMER_ID` when using a manager account.
- **TikTok Ads:** `TIKTOK_ADS_APP_ID`, `TIKTOK_ADS_APP_SECRET`, and `TIKTOK_ADS_OAUTH_REDIRECT_URI`. `TIKTOK_ADS_API_BASE_URL` overrides the API endpoint.
- **Meta OAuth:** `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`, and `FACEBOOK_OAUTH_REDIRECT_URI`. Existing `FACEBOOK_ACCESS_TOKEN` and `FACEBOOK_AD_ACCOUNT_ID` configuration remains available.
- **OAuth storage:** Set `OAUTH_TOKEN_ENCRYPTION_KEY` to a Fernet key for encrypted provider credentials. Set `FRONTEND_URL` to the frontend origin and register each configured callback URL with its provider.
- **Bot API keys:** From `backend/`, run `python scripts/create_api_key.py --name "campaign-bot" --scopes ads:read ads:draft --created-by-user-id USER_UUID`, replacing `USER_UUID` with the account owner's ID. Save the printed key securely; it is displayed once.

`frontend/Dockerfile` and `frontend/nginx.conf` provide a static frontend with a same-origin backend proxy; the Docker build defaults `VITE_API_URL` to `/api/v1`. See [Docker — developer builds](#docker--developer-builds) for the local Compose stack.
