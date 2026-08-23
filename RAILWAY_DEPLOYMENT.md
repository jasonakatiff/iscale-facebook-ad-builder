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
4. The `DATABASE_URL` environment variable will be automatically set for all services

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
3. Add the following environment variables:

```
DATABASE_URL=${{Postgres.DATABASE_URL}}
GEMINI_API_KEY=your_gemini_api_key_here
VITE_FACEBOOK_ACCESS_TOKEN=your_facebook_token_here
VITE_FACEBOOK_AD_ACCOUNT_ID=your_facebook_ad_account_id_here
```

> [!IMPORTANT]
> The `DATABASE_URL` variable uses Railway's reference syntax to automatically link to your PostgreSQL database.

### Initialize Database Schema

After the first deployment:

1. Click on the **backend** service
2. Go to the **"Deployments"** tab
3. Click on the latest deployment
4. Click **"View Logs"**
5. Once the service is running, go to the **"Settings"** tab
6. Under **"Deploy"**, find the **"Custom Start Command"** section
7. Temporarily change the start command to: `python init_db.py && uvicorn app.main:app --host 0.0.0.0 --port $PORT`
8. Trigger a new deployment
9. After the database is initialized, change the start command back to: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`

> [!TIP]
> Alternatively, you can run `python init_db.py` using Railway's CLI or by connecting to the service shell.

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
VITE_API_URL=${{backend.RAILWAY_PUBLIC_DOMAIN}}
VITE_SUPABASE_URL=your_supabase_url_here
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key_here
VITE_FACEBOOK_ACCESS_TOKEN=your_facebook_token_here
VITE_FACEBOOK_AD_ACCOUNT_ID=your_facebook_ad_account_id_here
```

> [!IMPORTANT]
> The `VITE_API_URL` uses Railway's reference syntax to automatically get your backend service URL. Make sure to include `https://` prefix: `https://${{backend.RAILWAY_PUBLIC_DOMAIN}}`

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
| `GEMINI_API_KEY` | Google Gemini API key | `AIza...` |
| `VITE_FACEBOOK_ACCESS_TOKEN` | Facebook Marketing API token | `EAAx...` |
| `VITE_FACEBOOK_AD_ACCOUNT_ID` | Facebook Ad Account ID | `act_123456789` |

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
- Verify the `DATABASE_URL` variable is set correctly
- Check that the reference syntax is correct: `${{Postgres.DATABASE_URL}}`

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
- You need to run `python init_db.py` to create the database tables
- Follow the database initialization steps in Step 3

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
