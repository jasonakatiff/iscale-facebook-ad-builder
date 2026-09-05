import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    PROJECT_NAME: str = "Facebook Ad Automation App"
    API_V1_STR: str = "/api/v1"

    # White-label brand (per-client deployments; server-side references)
    BRAND_NAME: str = os.getenv("BRAND_NAME", "Nalarin Ads Studio")

    # Where to send the browser after a successful OAuth connect flow
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

    # Database - PostgreSQL Required
    DATABASE_URL: str = os.getenv("DATABASE_URL")
    
    # Validate DATABASE_URL is set
    if not DATABASE_URL:
        raise ValueError(
            "DATABASE_URL environment variable is required. "
            "Please set it to your PostgreSQL connection string.\n"
            "Example: postgresql://user:password@localhost:5432/facebook_ad_builder"
        )
    
    # Validate that it's PostgreSQL
    if not DATABASE_URL.startswith("postgresql://") and not DATABASE_URL.startswith("postgres://"):
        raise ValueError(
            "DATABASE_URL must be a PostgreSQL connection string. "
            f"Got: {DATABASE_URL.split(':')[0]}://...\n"
            "SQLite is no longer supported. Please use PostgreSQL."
        )
    
    # External APIs
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY", "")
    FAL_AI_API_KEY: str = os.getenv("FAL_AI_API_KEY", "")
    KIE_AI_API_KEY: str = os.getenv("KIE_AI_API_KEY", "")
    FACEBOOK_ACCESS_TOKEN: str = os.getenv("FACEBOOK_ACCESS_TOKEN", "")
    FACEBOOK_APP_ID: str = os.getenv("FACEBOOK_APP_ID", "")
    FACEBOOK_APP_SECRET: str = os.getenv("FACEBOOK_APP_SECRET", "")
    FACEBOOK_OAUTH_REDIRECT_URI: str = os.getenv("FACEBOOK_OAUTH_REDIRECT_URI", "")

    @property
    def facebook_ads_enabled(self) -> bool:
        return bool(self.FACEBOOK_APP_ID and self.FACEBOOK_APP_SECRET and self.FACEBOOK_OAUTH_REDIRECT_URI)

    # Google Ads OAuth (blank until connected — routes return a clear 500 with
    # a config-missing message rather than crashing app startup, since not
    # every deployment needs Google Ads on day one)
    GOOGLE_ADS_CLIENT_ID: str = os.getenv("GOOGLE_ADS_CLIENT_ID", "")
    GOOGLE_ADS_CLIENT_SECRET: str = os.getenv("GOOGLE_ADS_CLIENT_SECRET", "")
    GOOGLE_ADS_DEVELOPER_TOKEN: str = os.getenv("GOOGLE_ADS_DEVELOPER_TOKEN", "")
    GOOGLE_ADS_LOGIN_CUSTOMER_ID: str = os.getenv("GOOGLE_ADS_LOGIN_CUSTOMER_ID", "")
    GOOGLE_ADS_OAUTH_REDIRECT_URI: str = os.getenv("GOOGLE_ADS_OAUTH_REDIRECT_URI", "")

    @property
    def google_ads_enabled(self) -> bool:
        return bool(self.GOOGLE_ADS_CLIENT_ID and self.GOOGLE_ADS_CLIENT_SECRET and self.GOOGLE_ADS_DEVELOPER_TOKEN)

    # TikTok Marketing API OAuth. Credentials are issued after the developer
    # app has been approved for Marketing API access in TikTok for Business.
    TIKTOK_ADS_APP_ID: str = os.getenv("TIKTOK_ADS_APP_ID", "")
    TIKTOK_ADS_APP_SECRET: str = os.getenv("TIKTOK_ADS_APP_SECRET", "")
    TIKTOK_ADS_OAUTH_REDIRECT_URI: str = os.getenv("TIKTOK_ADS_OAUTH_REDIRECT_URI", "")
    TIKTOK_ADS_API_BASE_URL: str = os.getenv(
        "TIKTOK_ADS_API_BASE_URL", "https://business-api.tiktok.com/open_api/v1.3"
    )

    @property
    def tiktok_ads_enabled(self) -> bool:
        return bool(self.TIKTOK_ADS_APP_ID and self.TIKTOK_ADS_APP_SECRET)

    # Auth settings - SECRET_KEY is required
    SECRET_KEY: str = os.getenv("SECRET_KEY", "")
    if not SECRET_KEY or SECRET_KEY == "your-secret-key-change-in-production":
        raise ValueError(
            "SECRET_KEY environment variable is required for security.\n"
            "Generate one with: python -c \"import secrets; print(secrets.token_urlsafe(32))\""
        )

    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))  # 30 minutes
    REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))  # 7 days

    # Cloudflare R2 Storage (S3-compatible)
    R2_ACCOUNT_ID: str = os.getenv("R2_ACCOUNT_ID", "")
    R2_ACCESS_KEY_ID: str = os.getenv("R2_ACCESS_KEY_ID", "")
    R2_SECRET_ACCESS_KEY: str = os.getenv("R2_SECRET_ACCESS_KEY", "")
    R2_BUCKET_NAME: str = os.getenv("R2_BUCKET_NAME", "")
    R2_PUBLIC_URL: str = os.getenv("R2_PUBLIC_URL", "")

    @property
    def r2_enabled(self) -> bool:
        return bool(self.R2_ACCOUNT_ID and self.R2_ACCESS_KEY_ID and self.R2_SECRET_ACCESS_KEY)

    @property
    def r2_endpoint_url(self) -> str:
        return f"https://{self.R2_ACCOUNT_ID}.r2.cloudflarestorage.com"

settings = Settings()
