"""Fernet-based encryption for OAuth tokens stored at rest (Google Ads, TikTok
Ads refresh/access tokens). Fails loudly at import time if the key is missing
or malformed — there is no silent plaintext fallback."""
import os
from cryptography.fernet import Fernet, InvalidToken

_KEY_ENV_VAR = "OAUTH_TOKEN_ENCRYPTION_KEY"


def _load_key() -> bytes:
    raw = os.getenv(_KEY_ENV_VAR, "")
    if not raw:
        raise ValueError(
            f"{_KEY_ENV_VAR} environment variable is required to store OAuth "
            "tokens securely.\n"
            "Generate one with: python -c \"from cryptography.fernet import "
            "Fernet; print(Fernet.generate_key().decode())\""
        )
    try:
        # Validate shape by constructing a Fernet instance now, not on first use.
        Fernet(raw.encode() if isinstance(raw, str) else raw)
    except (ValueError, TypeError) as exc:
        raise ValueError(
            f"{_KEY_ENV_VAR} is malformed — it must be a base64-encoded 32-byte "
            "key as produced by Fernet.generate_key()."
        ) from exc
    return raw.encode() if isinstance(raw, str) else raw


_fernet = Fernet(_load_key())


def encrypt_token(plaintext: str) -> str:
    """Encrypt a token for storage. Returns a string safe to store in a Text column."""
    return _fernet.encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a token previously produced by encrypt_token. Raises InvalidToken
    if the ciphertext is corrupt or was encrypted with a different key."""
    try:
        return _fernet.decrypt(ciphertext.encode()).decode()
    except InvalidToken:
        raise ValueError(
            "Failed to decrypt stored OAuth token — the encryption key may have "
            "changed, or the stored value is corrupt."
        )
