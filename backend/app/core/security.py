import hashlib
import secrets

PARTICIPANT_TOKEN_BYTES = 32


def generate_participant_token() -> str:
    """Generate a participant token with 256 bits of randomness."""
    return secrets.token_urlsafe(PARTICIPANT_TOKEN_BYTES)


def hash_participant_token(token: str) -> str:
    """Hash a participant token for storage and lookup."""
    return hashlib.sha256(token.encode()).hexdigest()
