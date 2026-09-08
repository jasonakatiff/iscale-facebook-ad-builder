# CLAUDE.md

Read [AGENTS.md](AGENTS.md) before working. It defines the canonical public
repository, mandatory target checks and environment boundaries for every agent.
This file adds architecture and coding context; keep it consistent with AGENTS.md.

## Startup Checks

On load, verify required tools are installed:

```bash
# Check agent-browser (required for e2e testing)
command -v agent-browser >/dev/null || echo "WARNING: agent-browser not installed. Run: npm install -g agent-browser && agent-browser install"
```

## Project Overview

Facebook Ad Automation App - A full-stack application for automating the lifecycle of Facebook video and image ads, from competitor research to ad creation, launching, and performance reporting.

**Tech Stack:**
- Frontend: React 19 + Vite + TailwindCSS
- Backend: Python FastAPI (Python 3.11+)
- Database: PostgreSQL on Railway
- Storage: Persistent Railway media volume; optional Cloudflare R2 (S3-compatible)
- Testing: agent-browser (e2e), Vitest (unit)
- Hosting: Railway (backend + frontend + worker + PostgreSQL)

## Development Commands

Follow [Manual Local Setup in README](README.md#manual-local-setup) with a dedicated
PostgreSQL database and process environment. Backend startup is `python startup.py`
from `backend/`; the worker uses `python -m app.sync_worker`. Do not use the legacy
setup wizard, Compose startup or `init_db.py` alone for a fresh v2 installation.

Frontend commands from `frontend/`: `npm ci`, `npm run dev`, `npm run test:unit`,
`npm run test:coverage`, and `npm run build`. Tests and servers require the target
checks and cleanup in AGENTS.md. Use the isolated database variables and commands
in [.github/workflows/test.yml](.github/workflows/test.yml) for backend validation.

## Architecture

### Database Models (backend/app/models.py)

Core entities and their relationships:

- **Brand**: Central entity with logo, colors (primary/secondary/highlight), voice
  - Has many Products (cascade delete)
  - Has many CustomerProfiles (many-to-many via brand_profiles table)
  - Has many GeneratedAds

- **Product**: Belongs to Brand, contains description, product_shots (JSON), default_url

- **CustomerProfile**: Demographics, pain_points, goals - linked to Brands

- **WinningAds**: Template library with structural analysis, blueprint_json for Ad Remix Engine

- **GeneratedAd**: Output from AI generation, links Brand + Product + Template, includes ad_bundle_id for grouping

- **FacebookCampaign/AdSet/Ad**: Hierarchy for Facebook campaign management with fb_*_id fields for syncing

- **ScrapedAd**: Competitor ads from research module

### Backend Structure (FastAPI)

```
backend/app/
├── main.py              # FastAPI app, CORS, router registration
├── database.py          # SQLAlchemy engine, SessionLocal, Base
├── models.py            # All SQLAlchemy models
├── core/
│   └── config.py        # Settings, validates DATABASE_URL is PostgreSQL
├── api/v1/              # API endpoints (all prefixed /api/v1)
│   ├── brands.py
│   ├── products.py
│   ├── profiles.py      # Customer profiles
│   ├── generated_ads.py # AI-generated ads
│   ├── facebook.py      # Campaign/AdSet/Ad management
│   ├── research.py      # Competitor scraping
│   ├── ad_remix.py      # Blueprint deconstruction/reconstruction
│   ├── copy_generation.py
│   ├── templates.py
│   ├── uploads.py
│   └── dashboard.py
├── services/            # Business logic
│   ├── facebook_service.py    # Facebook Marketing API (facebook-business SDK)
│   ├── research_service.py
│   ├── scraper.py
│   └── ad_remix_service.py    # Uses Gemini Vision for template analysis
└── schemas/             # Pydantic models (if exists)
```

**Key Backend Patterns:**
- All routes use `/api/v1` prefix
- Database dependency injection via `Depends(get_db)`
- PostgreSQL required - config.py validates DATABASE_URL on startup
- Facebook API uses `facebook-business` SDK (AdAccount, Campaign, AdSet, Ad, AdCreative, AdImage)
- AI services use Google Gemini (GEMINI_API_KEY) and Fal.ai (FAL_AI_API_KEY)
- File uploads go to Cloudflare R2 when configured, falls back to local `uploads/` for dev

### Frontend Structure (React + Vite)

```
frontend/src/
├── App.jsx              # Router setup, wraps with ToastProvider/BrandProvider/CampaignProvider
├── main.jsx             # Entry point
├── components/          # Reusable UI components
│   ├── Layout.jsx       # Main layout with navigation
│   ├── Toast.jsx        # Toast notification component
│   ├── Wizard.jsx       # Multi-step wizard
│   ├── BrandForm.jsx
│   ├── ProductForm.jsx
│   ├── CustomerProfileForm.jsx
│   └── ...wizard steps and builders
├── pages/               # Route components
│   ├── Dashboard.jsx
│   ├── Research.jsx     # Competitor analysis
│   ├── CreateAds.jsx    # Ad creation flow
│   ├── ImageAds.jsx
│   ├── VideoAds.jsx
│   ├── AdRemix.jsx      # Template remix engine
│   ├── GeneratedAds.jsx # View generated ads
│   ├── Brands.jsx
│   ├── Products.jsx
│   ├── CustomerProfiles.jsx
│   ├── FacebookCampaigns.jsx
│   ├── WinningAds.jsx   # Template library
│   └── Reporting.jsx
├── context/             # React Context for global state
│   ├── ToastContext.jsx     # useToast() hook
│   ├── BrandContext.jsx
│   └── CampaignContext.jsx
└── lib/                 # Utilities
    ├── supabase.js
    └── facebookApi.js
```

**Key Frontend Patterns:**
- API calls to backend at `http://localhost:8000/api/v1`
- All routes wrapped in Layout component for consistent navigation
- Toast notifications managed via ToastContext

## Critical UI/UX Rules (from specifications.md)

### Toast Notifications (MANDATORY)

**NEVER use browser `alert()`.** Always use the `useToast` hook:

```javascript
import { useToast } from '../context/ToastContext';

const { showSuccess, showError, showWarning, showInfo } = useToast();

showSuccess('Operation completed successfully');
showError('Failed to save. Please try again.');
showWarning('This action cannot be undone');
showInfo('Processing your request...');
```

- Duration defaults to 5 seconds (customizable via second parameter)
- Types: `success` (green), `error` (red), `warning` (amber), `info` (blue)

### Confirmation Modals (MANDATORY)

**NEVER use browser `confirm()`.** Create custom modal components:

```javascript
const [showDeleteModal, setShowDeleteModal] = useState(false);

const handleDelete = () => setShowDeleteModal(true);

const confirmDelete = async () => {
    setShowDeleteModal(false);
    // Perform delete action
    showSuccess('Deleted successfully');
};
```

Modal design requirements:
- Backdrop blur with semi-transparent overlay
- Clear title and description
- Destructive actions use red buttons
- Non-destructive actions use gray/neutral buttons
- Icon to indicate action type (trash, warning, etc.)

## Database and Environment Configuration

PostgreSQL is required. Use a dedicated development/test database and isolated
media storage; never reuse the private BreadWinner database for public work.
Supply configuration through the command's process environment, preserving stable
signing/encryption values for an existing installation. Never create or overwrite
user-owned secret files. See [README environment variables](README.md#environment-variables)
and the [installer guide](docs/deployment/install-on-railway.md) for required values.
A missing public credential does not authorize a private-environment fallback.

## Search & Refactoring Tools

- Use `ast-grep` for structural code search/replace (AST-aware, not text):
  - `ast-grep -p 'const API_URL = $VAL' --lang js` - find API_URL declarations
  - `ast-grep -p 'useState($INIT)' --lang tsx` - find useState patterns
  - `ast-grep -p '$OLD($$$)' -r '$NEW($$$)' --lang js` - rename functions
  - Useful for bulk refactors across React/JS codebase

## Code Style & Standards

### Backend (Python)
- **Style Guide**: PEP 8
- **Formatter**: Black (line length 88)
- **Linter**: Flake8 or Ruff
- **Imports**: Sort with isort
- **Naming**: `snake_case` for functions/variables, `PascalCase` for classes

### Frontend (JavaScript/React)
- **Formatter**: Prettier
- **Linter**: ESLint (react, react-hooks plugins)
- **Naming**:
  - Components: `PascalCase.jsx`
  - Functions/Variables: `camelCase`
  - Constants: `UPPER_SNAKE_CASE`

## Security Notes

- CORS restricted to specific origins (configure via ALLOWED_ORIGINS env var)
- JWT-based authentication implemented (access + refresh tokens)
- File uploads limited to images (jpg, jpeg, png, gif, webp), 10MB max
- All secrets stored in environment variables (never committed)
- CSP configured in frontend to restrict resource loading

## Key Features

1. **Brand Management**: Create brands with voice, colors, logos
2. **Product Catalog**: Manage products with descriptions and images
3. **Customer Profiles**: Define target audience demographics
4. **Research Module**: Scrape competitor ads from Facebook Ad Library
5. **Ad Generation**: AI-powered ad creation using Gemini + Fal.ai
6. **Ad Remix Engine**: Deconstruct winning ads into blueprints, reconstruct with new brands
7. **Facebook Campaign Management**: Create/manage campaigns, ad sets, and ads via API
8. **Generated Ads Gallery**: View ads grouped by bundle_id
9. **Reporting**: Analytics dashboard (in development)

## Deployment and Verification

This public repository distributes installer source; it has no shared production
application URL. Follow the [release procedure](docs/deployment/railway-template-maintainer.md)
and [installer guide](docs/deployment/install-on-railway.md). Identify the actual
installation and authorized scope before deployment or runtime checks.

Use [.github/workflows/test.yml](.github/workflows/test.yml) and
[.github/workflows/installation.yml](.github/workflows/installation.yml) for current
isolated backend, frontend, browser and container checks. Keep simulated providers,
skipped live-app checks and actual customer-runtime verification distinct.

**agent-browser Quick Reference:**
```bash
agent-browser open <url>          # Open URL
agent-browser snapshot            # Get accessibility tree
agent-browser click '<selector>'  # Click element
agent-browser fill '<sel>' 'val'  # Fill input
agent-browser screenshot /tmp/x.png
agent-browser close               # Close browser
```

**Cloudflare R2 Setup:**
- Bucket: configured via R2_BUCKET_NAME
- Public access enabled via R2.dev URL
- CORS configured to allow frontend origins

## Common Gotchas

- Database migrations run automatically on deploy via Dockerfile CMD
- Always commit ALL new migration files and their dependencies before pushing
- Frontend API URL set via `VITE_API_URL` env var (build-time, not runtime)
- When adding new origins: update CORS in `main.py` AND CSP in `index.html`
- Ad account IDs auto-prefixed with 'act_' if missing (facebook_service.py)
- Local development and tests use dedicated databases and isolated storage; public work must not fall back to the deprecated private installation.
