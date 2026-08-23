<p align="center">
  <img src="frontend/public/breadwinner_logo.png" alt="Facebook Ad Builder" width="120" />
</p>

<h1 align="center">Facebook Ad Builder</h1>

<p align="center">
  <strong>AI-powered Facebook ad automation platform</strong><br>
  From competitor research to ad generation and campaign management
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
  <a href="https://iscale.com">iSCALE.com</a> • <a href="https://a4d.com">A4D.com</a><br>
  <a href="https://t.me/jasonakatiff">Telegram</a> • <a href="mailto:jason@jasonakatiff.com">jason@jasonakatiff.com</a>
</p>

---

## Overview

Facebook Ad Builder is a full-stack application that streamlines the entire Facebook advertising workflow. Use AI to research competitors, generate compelling ad copy and images, and manage campaigns—all from one platform.

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

### Prerequisites

- **Node.js** 18+ ([download](https://nodejs.org))
- **Python** 3.11+ ([download](https://python.org))
- **PostgreSQL** 15+ (local or cloud: [Railway](https://railway.app), [Supabase](https://supabase.com))

### Option 1: Interactive Setup (Recommended)

Run the setup wizard which will guide you through the entire configuration:

```bash
git clone https://github.com/yourusername/facebook_ad_builder.git
cd facebook_ad_builder
./setup.sh
```

The wizard will:
1. Check all prerequisites
2. Walk you through configuring API keys
3. Set up the database
4. Create your admin account

### Option 2: Manual Setup

<details>
<summary>Click to expand manual setup instructions</summary>

#### 1. Clone and Install

```bash
git clone https://github.com/yourusername/facebook_ad_builder.git
cd facebook_ad_builder

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

```bash
cp .env.example .env.local
```

Edit `.env.local` with your credentials. See [Environment Variables](#environment-variables) for details.

#### 3. Initialize Database

```bash
cd backend
source venv/bin/activate
python init_db.py
```

#### 4. Start the Application

```bash
# Terminal 1: Backend
cd backend
source venv/bin/activate
uvicorn app.main:app --reload --port 8000

# Terminal 2: Frontend
cd frontend
npm run dev
```

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
# Add to .env.local
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
2. Create a bucket (e.g., `facebook-ads`)
3. Go to R2 → Manage R2 API Tokens → Create API token
4. Grant read/write permissions for your bucket
5. Enable public access: Bucket Settings → Public Access → Enable R2.dev subdomain

```bash
# Add to .env.local
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=your-access-key
R2_SECRET_ACCESS_KEY=your-secret-key
R2_BUCKET_NAME=facebook-ads
R2_PUBLIC_URL=https://pub-xxx.r2.dev
```

</details>

---

## Environment Variables

Create a `.env.local` file in the project root:

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `SECRET_KEY` | ✅ | JWT signing key (generate random string) |
| `GEMINI_API_KEY` | ✅ | Google Gemini API key |
| `ALLOWED_ORIGINS` | Production | Comma-separated CORS origins |
| `FACEBOOK_ACCESS_TOKEN` | For FB features | Facebook Marketing API token |
| `FACEBOOK_AD_ACCOUNT_ID` | For FB features | Facebook Ad Account ID |
| `R2_*` | For uploads | Cloudflare R2 credentials |
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
facebook_ad_builder/
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
| Storage | Cloudflare R2 |
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
| `POST` | `/api/v1/research/scrape` | Scrape competitor ads |
| `POST` | `/api/v1/ad-remix/generate` | Generate ad variations |
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

### Railway (Recommended)

Deploy to [Railway](https://railway.app) in minutes:

1. Fork this repo to your GitHub account
2. [Create a new Railway project](https://railway.app/new)
3. Click "Deploy from GitHub repo" and select your fork
4. Add a PostgreSQL database: **+ New** → **Database** → **PostgreSQL**
5. Set environment variables in both services (see `.env.example`)
6. Set `ALLOWED_ORIGINS` to your frontend URL
7. Deploy!

> **Tip:** Railway config-as-code files configure one service at a time. For this monorepo, configure the backend service with the root `railway.toml`, keep its root directory at `/`, and configure the frontend service with `/frontend/railway.toml` and root directory `/frontend`.

📖 **[Full Deployment Guide →](./RAILWAY_DEPLOYMENT.md)**

### Docker

```bash
# Backend
cd backend
docker build -t fb-ad-backend .
docker run -p 8000:8000 --env-file ../.env.local fb-ad-backend

# Frontend
cd frontend
docker build -t fb-ad-frontend .
docker run -p 5173:5173 fb-ad-frontend
```

---

## Troubleshooting

<details>
<summary><strong>DATABASE_URL environment variable is required</strong></summary>

- Ensure `.env.local` exists in the project root
- Verify the DATABASE_URL format: `postgresql://user:pass@host:5432/dbname`
- Check PostgreSQL is running: `pg_isready`

</details>

<details>
<summary><strong>CORS errors in browser</strong></summary>

- Add your frontend URL to `ALLOWED_ORIGINS` in `.env.local`
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

- Website: [iSCALE.com](https://iscale.com) | [A4D.com](https://a4d.com)
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
  Built with ❤️ by <a href="https://iscale.com">iSCALE</a> using FastAPI, React, and AI
</p>
