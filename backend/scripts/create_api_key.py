"""One-off CLI to mint a machine-to-machine API key (e.g. for the Hermes
Telegram bot). The plaintext key is printed exactly once and is never logged
or stored — only its SHA-256 hash is persisted.

Usage (run from the `backend/` directory so the `app` package resolves):
    python scripts/create_api_key.py --name "ads-studio-agent (Telegram bot)" --scopes ads:read ads:draft
"""
import argparse
import hashlib
import secrets
import sys
from pathlib import Path

# Allow running as `python scripts/create_api_key.py` without installing the
# app package — insert the backend/ directory (this script's parent) on sys.path.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.database import SessionLocal  # noqa: E402
from app.models import ApiKey  # noqa: E402

ALLOWED_SCOPES = {"ads:read", "ads:draft"}
KEY_PREFIX = "ads_studio"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--name", required=True, help="Human-readable label, e.g. the Hermes profile name")
    parser.add_argument(
        "--created-by-user-id",
        help="Required for keys that must read one owner's Ads Studio overview (e.g. the Hermes bot).",
    )
    parser.add_argument(
        "--scopes",
        nargs="+",
        required=True,
        choices=sorted(ALLOWED_SCOPES),
        help="One or more of: ads:read ads:draft (ads:publish/ads:spend do not exist as bot scopes)",
    )
    args = parser.parse_args()

    raw_key = f"{KEY_PREFIX}_{secrets.token_urlsafe(32)}"
    key_hash = hashlib.sha256(raw_key.encode()).hexdigest()

    db = SessionLocal()
    try:
        api_key = ApiKey(
            name=args.name,
            key_hash=key_hash,
            scopes=list(args.scopes),
            created_by_user_id=args.created_by_user_id,
        )
        db.add(api_key)
        db.commit()
        db.refresh(api_key)
    finally:
        db.close()

    print("API key created. Copy it now — it will not be shown again:\n")
    print(f"  {raw_key}\n")
    print(f"  id:     {api_key.id}")
    print(f"  name:   {api_key.name}")
    print(f"  scopes: {', '.join(api_key.scopes)}")


if __name__ == "__main__":
    main()
