"""Validate process settings and initialize through the shared v2 bootstrap."""

import argparse
import base64
import binascii
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit


class SetupError(ValueError):
    pass


def validate_environment(values):
    required = ("DATABASE_URL", "SECRET_KEY", "OAUTH_TOKEN_ENCRYPTION_KEY")
    missing = [name for name in required if not values.get(name)]
    if missing:
        raise SetupError("Set these process environment variables: " + ", ".join(missing))
    try:
        database = urlsplit(values["DATABASE_URL"])
        database.port
        if database.scheme != "postgresql" or database.path in {"", "/"}:
            raise ValueError
    except ValueError:
        raise SetupError("DATABASE_URL must use postgresql:// and include a database name and valid port.") from None
    if values["SECRET_KEY"] == "your-secret-key-change-in-production":
        raise SetupError("Replace the SECRET_KEY example placeholder in your process environment.")
    try:
        key = base64.b64decode(values["OAUTH_TOKEN_ENCRYPTION_KEY"], altchars=b"-_", validate=True)
        if len(key) != 32:
            raise ValueError
    except (ValueError, binascii.Error):
        raise SetupError("OAUTH_TOKEN_ENCRYPTION_KEY must be a Fernet key encoding 32 bytes.") from None
    if bool(values.get("ADMIN_EMAIL")) != bool(values.get("ADMIN_PASSWORD")):
        raise SetupError("Supply both ADMIN_EMAIL and ADMIN_PASSWORD for initial owner setup.")


def bootstrap():
    backend = Path(__file__).resolve().parents[1]
    os.chdir(backend)
    sys.path.insert(0, str(backend))
    from startup import bootstrap_database

    bootstrap_database()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Ad Studio local environment preflight")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--check", action="store_true")
    mode.add_argument("--bootstrap", action="store_true")
    args = parser.parse_args(argv)
    if sys.version_info < (3, 11):
        print("Python 3.11 or newer is required.", file=sys.stderr)
        return 2
    try:
        validate_environment(os.environ)
    except SetupError as error:
        print(str(error), file=sys.stderr)
        return 2
    if args.check:
        print("Database and signing/encryption settings passed validation.")
        return 0
    try:
        bootstrap()
    except Exception as error:
        print(
            f"Database bootstrap failed ({type(error).__name__}). Check database access, "
            "first-install ADMIN_EMAIL/ADMIN_PASSWORD, and migration state. "
            "The owner password needs 12 characters and at most 72 UTF-8 bytes.",
            file=sys.stderr,
        )
        return 1
    print("Ad Studio database setup complete; existing owners and settings are preserved.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
