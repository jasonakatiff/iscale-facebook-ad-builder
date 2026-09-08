"""
Facebook Ad Builder - Backend API

Created by Jason Akatiff
iSCALE.com | A4D.com
Telegram: @jasonakatiff
Email: jason@jasonakatiff.com
"""

import os
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import Response, JSONResponse
from fastapi.exceptions import RequestValidationError
from fastapi.exception_handlers import request_validation_exception_handler
from app.core.installation import InstallationError
from uvicorn.middleware.proxy_headers import ProxyHeadersMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.telemetry.middleware import TelemetryMiddleware
from app.telemetry.runtime import collector, emit
from app.core.config import settings
from app.core.rate_limit import limiter
from app.core.oauth_state import clear_oauth_state_cookie
# Imported eagerly (not just where used) so a missing/malformed
# OAUTH_TOKEN_ENCRYPTION_KEY fails app startup immediately, matching the
# fail-fast pattern already used for SECRET_KEY in app.core.config.
from app.core import token_encryption  # noqa: F401

app = FastAPI(
    title="BreadWinner API by theLeadRouter.com",
    description="Automate research, creative generation, campaigns, reporting, and workspaces. Use a user API key in the Bearer Authorization header; keys inherit current user permissions. Download Markdown guides and the OpenAPI bundle from /api/v1/help/download.",
    contact={"name": "theLeadRouter.com", "url": "https://theleadrouter.com"},
    version="1.0.0",
    openapi_url="/api/v1/openapi.json",
    docs_url="/api/v1/docs",
    redoc_url="/api/v1/redoc",
)

@app.exception_handler(InstallationError)
async def installation_error_handler(request, exc):
    return JSONResponse(status_code=exc.status_code, content=exc.body(), headers={"Cache-Control": "no-store"})


@app.exception_handler(RequestValidationError)
async def safe_validation_handler(request, exc):
    if request.url.path.startswith("/api/v1/installation"):
        return JSONResponse(status_code=422, content={"error": {
            "code": "invalid_input", "message": "Check the form values and paste a complete API key without spaces.",
            "details": None}}, headers={"Cache-Control": "no-store"})
    return await request_validation_exception_handler(request, exc)


# Register rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# Security headers middleware
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    if request.url.path in {
        "/api/v1/google-ads/oauth/callback",
        "/api/v1/facebook/oauth/callback",
        "/api/v1/tiktok-ads/oauth/callback",
    }:
        clear_oauth_state_cookie(response)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    if request.url.path not in {"/api/v1/docs", "/api/v1/redoc", "/api/v1/openapi.json"}:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: https:; "
            "connect-src 'self'; "
            "frame-ancestors 'none'; "
            "object-src 'none'; "
            "base-uri 'self'"
        )
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response

# Railway terminates HTTPS at its reverse proxy before forwarding to the app.
trusted_proxies = os.getenv("TRUSTED_PROXIES", "*")
app.add_middleware(ProxyHeadersMiddleware, trusted_hosts=[trusted_proxies] if trusted_proxies != "*" else ["*"])

app.add_middleware(TelemetryMiddleware)

# CORS origins from env var or defaults
default_origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "http://localhost:3000",
]
extra_origins = os.getenv("ALLOWED_ORIGINS", "").split(",")
allowed_origins = default_origins + [o.strip() for o in extra_origins if o.strip()]

# CORS Middleware - explicit methods and headers
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "X-Requested-With", "X-API-Key", "X-Session-ID", "traceparent", "Idempotency-Key"],
    expose_headers=["X-Total-Count", "X-Request-ID", "traceparent"],
    max_age=600,
)

@app.get("/")
async def root():
    return {"message": "Welcome to the Facebook Ad Automation API"}

@app.get("/health")
async def health_check():
    return {"status": "healthy"}

@app.get("/health/ready")
def readiness():
    from app.services.installation_health import installation_ready
    ready = installation_ready()
    return JSONResponse(status_code=200 if ready else 503, content={"status": "ready" if ready else "not_ready"})

# Database Connection Validation
@app.on_event("startup")
async def startup_event():
    """Validate PostgreSQL connection on startup"""
    from app.database import engine
    from sqlalchemy import text

    try:
        with engine.connect() as conn:
            result = conn.execute(text("SELECT version()"))
            version = result.scalar()
            print(f"✅ Connected to PostgreSQL")
            print(f"   Version: {version}")
    except Exception as e:
        print(f"Database connection failed: {type(e).__name__}")
        raise RuntimeError("Database connection failed; check database configuration") from None

    from app.telemetry.instrumentation import install_instrumentation
    install_instrumentation(engine)
    collector.start()
    from app.delivery.runtime import workers
    workers.start(engine)
    emit("lifecycle", "application.started")


@app.on_event("shutdown")
async def shutdown_telemetry():
    emit("lifecycle", "application.stopped")
    from app.delivery.runtime import workers
    workers.stop()
    collector.stop()


# Include Routers
from app.delivery.api import router as delivery_router
app.include_router(delivery_router, prefix="/api/v1/delivery", tags=["delivery"])
from app.api.v1 import telemetry
app.include_router(telemetry.router, prefix="/api/v1/telemetry", tags=["telemetry"])
from app.api.v1 import brands, products, research, generated_ads, templates, facebook, uploads, dashboard, copy_generation, profiles, ad_remix, prompts, ad_styles, auth, users, google_ads, overview, tiktok_ads, bot

app.include_router(auth.router, prefix="/api/v1/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/v1/users", tags=["users"])
app.include_router(brands.router, prefix="/api/v1/brands", tags=["brands"])
app.include_router(products.router, prefix="/api/v1/products", tags=["products"])
app.include_router(research.router, prefix="/api/v1/research", tags=["research"])
app.include_router(generated_ads.router, prefix="/api/v1/generated-ads", tags=["generated-ads"])
app.include_router(templates.router, prefix="/api/v1/templates", tags=["templates"])
app.include_router(facebook.router, prefix="/api/v1/facebook", tags=["facebook"])
app.include_router(uploads.router, prefix="/api/v1/uploads", tags=["uploads"])
app.include_router(dashboard.router, prefix="/api/v1/dashboard", tags=["dashboard"])
app.include_router(copy_generation.router, prefix="/api/v1/copy-generation", tags=["copy-generation"])
app.include_router(profiles.router, prefix="/api/v1/profiles", tags=["profiles"])
app.include_router(ad_remix.router, prefix="/api/v1/ad-remix", tags=["ad-remix"])
app.include_router(prompts.router, prefix="/api/v1/prompts", tags=["prompts"])
app.include_router(ad_styles.router, prefix="/api/v1/ad-styles", tags=["ad-styles"])
app.include_router(google_ads.router, prefix="/api/v1/google-ads", tags=["google-ads"])
app.include_router(overview.router, prefix="/api/v1/overview", tags=["overview"])
app.include_router(tiktok_ads.router, prefix="/api/v1/tiktok-ads", tags=["tiktok-ads"])
app.include_router(bot.router, prefix="/api/v1/bot", tags=["bot"])

from app.api.v2 import workspaces

app.include_router(workspaces.router, prefix="/api/v2", tags=["workspace accounts"])

from app.api.v1 import api_keys, themes, help, leadrouter, plugins
app.include_router(plugins.router, prefix="/api/v1/plugins", tags=["plugin library"])
app.include_router(plugins.worker_router, prefix="/api/v1/plugin-worker", tags=["plugin services"])
app.include_router(leadrouter.router, prefix="/api/v1/leadrouter", tags=["native LeadRouter"])
app.include_router(api_keys.router, prefix="/api/v1/api-keys", tags=["user API keys"])

app.include_router(themes.router, prefix="/api/v1/themes", tags=["theme library"])

app.include_router(help.router, prefix="/api/v1/help", tags=["help and documentation"])

from app.api.v1 import installation
app.include_router(installation.router, prefix="/api/v1/installation", tags=["installation and service connections"])

# Mount static files for uploads
import os
from app.api.v1.uploads import UPLOAD_DIR
uploads_dir = str(UPLOAD_DIR)
os.makedirs(uploads_dir, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=uploads_dir), name="uploads")
