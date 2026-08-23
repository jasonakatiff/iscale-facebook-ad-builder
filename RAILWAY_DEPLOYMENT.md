# Railway Deployment Guide

This guide walks you through deploying the Facebook Ad Builder to Railway.

## Overview

Railway will host:
- **Backend Service**: Python FastAPI application (Docker container)
- **Frontend Service**: React/Vite static site
- **PostgreSQL Database**: Managed database service

## Prerequisites

- Railway account ([sign up here](https://railway.app))
- GitHub account (for automatic deployments)
- Your project pushed to a GitHub repository

## Step 1: Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Authorize Railway to access your GitHub account
5. Select your repository

## Step 2: Add PostgreSQL Database

1. In your Railway project dashboard, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Railway will automatically create a PostgreSQL database
4. Note the exact name of the PostgreSQL service (usually `Postgres`)

> [!IMPORTANT]
> Railway creates `DATABASE_URL` on the PostgreSQL service. The backend still needs a reference variable pointing to it; it is not automatically injected into every application service.

## Step 3: Configure Backend Service

Railway config-as-code applies to one service at a time. Configure the backend service as follows:

- Root directory: `/` (the repository root)
- Config file path: `/railway.toml`
- Builder: Dockerfile
- Dockerfile path: `backend/Dockerfile`

Keeping the backend root at `/` is required because the Dockerfile copies files using paths such as `backend/requirements.txt`.

### Set Environment Variables

1. Click on the **backend** service
2. Go to the **"Variables"** tab
3. Add the following variables. In the first line, replace `Postgres` with the exact name of your PostgreSQL service if it is different:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
SECRET_KEY=generate_a_secure_random_value
GEMINI_API_KEY=your_gemini_api_key_here
FAL_AI_API_KEY=your_fal_ai_api_key_here
KIE_AI_API_KEY=your_kie_ai_api_key_here
FACEBOOK_ACCESS_TOKEN=your_facebook_token_here
FACEBOOK_AD_ACCOUNT_ID=your_facebook_ad_account_id_here
ALLOWED_ORIGINS=https://your-frontend-domain
```

> [!IMPORTANT]
> Create `DATABASE_URL` on the **backend service**, not only on the PostgreSQL service. The value must use Railway's reference syntax, such as `${{Postgres.DATABASE_URL}}`. Also keep `SECRET_KEY` set; the backend intentionally refuses to start without both variables.

> [!WARNING]
> `VITE_*` variables are frontend build variables. They do not replace the backend variables above. Do not commit real tokens or secret values to this repository.

### Initialize Database Schema

The backend's `startup.py` script handles database initialization before starting FastAPI. On a brand-new PostgreSQL service, it creates the current schema, seeds roles and permissions, creates the admin account when `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set, and records the schema as the current Alembic head. On an existing database, it runs the normal Alembic migrations.

Once `DATABASE_URL` and `SECRET_KEY` are present, no manual schema initialization command is required.

> [!TIP]
> If a migration needs to be run manually, use Railway's CLI or the service shell after confirming that the backend has access to `DATABASE_URL`.

## Step 4: Configure Frontend Service

Configure the frontend as a separate Railway service:

- Root directory: `/frontend`
- Config file path: `/frontend/railway.toml`

The frontend config uses Railpack to run `npm ci && npm run build`, then serves the Vite build with `npm run preview`.

### Set Environment Variables

1. Click on the **frontend** service
2. Go to the **"Variables"** tab
3. Add the following environment variables:

```
VITE_API_URL=https://${{backend.RAILWAY_PUBLIC_DOMAIN}}/api/v1
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
VITE_FACEBOOK_ACCESS_TOKEN=your_facebook_token_here
VITE_FACEBOOK_AD_ACCOUNT_ID=your_facebook_ad_account_id_here
```

> [!IMPORTANT]
> The `VITE_API_URL` uses Railway's reference syntax to automatically get your backend service URL. Include both the `https://` prefix and the `/api/v1` path: `https://${{backend.RAILWAY_PUBLIC_DOMAIN}}/api/v1`.

### Enable Public Networking

1. In the **frontend** service settings
2. Go to **"Settings"** → **"Networking"**
3. Click **"Generate Domain"** to get a public URL for your frontend

## Step 5: Deploy

Railway will automatically deploy both services when you push to your GitHub repository.

### Manual Deployment

If you need to manually trigger a deployment:

1. Go to your service (backend or frontend)
2. Click **"Deployments"** tab
3. Click **"Deploy"** button

## Step 6: Verify Deployment

### Check Backend

1. Get your backend URL from the backend service settings
2. Visit `https://your-backend-url.railway.app/health`
3. You should see: `{"status": "healthy"}`
4. Visit `https://your-backend-url.railway.app/api/v1/docs` to see the API documentation

### Check Frontend

1. Get your frontend URL from the frontend service settings
2. Visit the URL in your browser
3. The application should load and connect to the backend

### Test Database Connection

1. Try creating a brand or product in the application
2. Check the backend logs to ensure database operations are working
3. You can also connect to the PostgreSQL database using the connection string from Railway

## Environment Variables Reference

### Backend Service

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `SECRET_KEY` | JWT signing key (required) | `random-secure-value` |
| `GEMINI_API_KEY` | Google Gemini API key | `AIza...` |
| `FACEBOOK_ACCESS_TOKEN` | Facebook Marketing API token | `EAAx...` |
| `FACEBOOK_AD_ACCOUNT_ID` | Facebook Ad Account ID | `act_123456789` |
| `ALLOWED_ORIGINS` | Comma-separated frontend origins | `https://frontend.example.com` |

### Frontend Service

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `https://backend.railway.app` |
| `VITE_SUPABASE_URL` | Supabase project URL | `https://xxx.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key | `eyJ...` |
| `VITE_FACEBOOK_ACCESS_TOKEN` | Facebook Marketing API token | `EAAx...` |
| `VITE_FACEBOOK_AD_ACCOUNT_ID` | Facebook Ad Account ID | `act_123456789` |

## Troubleshooting

### Backend Won't Start

**Error: "DATABASE_URL environment variable is required"**
- Ensure the PostgreSQL database is added to your project
- Open the **backend service** → **Variables** and confirm `DATABASE_URL` exists there
- Check that the reference uses the exact PostgreSQL service name: `${{Postgres.DATABASE_URL}}`
- Redeploy the backend after saving the variable

**Error: "SECRET_KEY environment variable is required"**
- Add `SECRET_KEY` to the **backend service** variables
- Generate one locally with: `python -c "import secrets; print(secrets.token_urlsafe(32))"`
- Redeploy the backend after saving the variable

**Error: "Failed to connect to database"**
- Check the PostgreSQL service is running
- Verify the connection string is correct
- Check the backend logs for more details

### Frontend Can't Connect to Backend

**Error: Network request failed**
- Verify `VITE_API_URL` is set correctly
- Ensure the backend service has a public domain generated
- Check CORS settings in the backend (should allow your frontend domain)

### Database Schema Not Initialized

**Error: "relation does not exist"**
- Confirm the backend is using the intended PostgreSQL service
- Check the migration/bootstrap output from the `startup.py` command

### Build Failures

**Frontend build fails**
- Check that all dependencies are in `package.json`
- Verify Node.js version compatibility
- Check build logs for specific errors

**Backend build fails**
- Verify all Python dependencies are in `requirements.txt`
- Check that the Dockerfile is in the correct location
- Review build logs for missing system dependencies

## Automatic Deployments

Railway automatically deploys when you push to your GitHub repository:

1. Push changes to your `main` branch (or configured branch)
2. Railway detects the changes
3. Both services rebuild and redeploy automatically
4. Check deployment status in the Railway dashboard

## Railway CLI (Optional)

For advanced usage, install the Railway CLI:

```bash
# Install Railway CLI
npm i -g @railway/cli

# Login
railway login

# Link to your project
railway link

# View logs
railway logs

# Run commands in the backend service
railway run python init_db.py

# Open service in browser
railway open
```

## Cost Estimation

Railway pricing (as of 2024):

- **Hobby Plan**: $5/month + usage
  - Includes $5 of usage credit
  - ~500 hours of runtime
  - Suitable for development/testing

- **Pro Plan**: $20/month + usage
  - Includes $20 of usage credit
  - Better for production workloads

> [!TIP]
> Start with the Hobby plan and upgrade as needed. Monitor your usage in the Railway dashboard.

## Next Steps

After successful deployment:

1. **Set up custom domain** (optional)
   - Go to frontend service → Settings → Networking
   - Add your custom domain and configure DNS

2. **Enable monitoring**
   - Set up error tracking (e.g., Sentry)
   - Monitor application logs in Railway dashboard

3. **Configure CI/CD**
   - Railway automatically deploys from GitHub
   - Add GitHub Actions for testing before deployment

4. **Backup database**
   - Railway provides automatic backups for Pro plan
   - Consider setting up additional backup strategy

## Support

- [Railway Documentation](https://docs.railway.app)
- [Railway Discord](https://discord.gg/railway)
- [Railway Status](https://status.railway.app)
