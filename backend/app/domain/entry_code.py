import secrets

ENTRY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
ENTRY_CODE_LENGTH = 6


def normalize_entry_code(value: str) -> str:
    return value.strip().upper()


def generate_entry_code() -> str:
    """Generate an unpredictable entry code without ambiguous characters."""
    return "".join(secrets.choice(ENTRY_CODE_ALPHABET) for _ in range(ENTRY_CODE_LENGTH))
