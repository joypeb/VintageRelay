import hashlib
import re

from app.core.security import generate_participant_token, hash_participant_token


def test_generated_participant_token_has_minimum_length() -> None:
    token = generate_participant_token()

    assert isinstance(token, str)
    assert len(token) >= 43


def test_generated_participant_token_uses_base64url_characters() -> None:
    token = generate_participant_token()

    assert re.fullmatch(r"[A-Za-z0-9_-]+", token) is not None


def test_generated_participant_tokens_are_different() -> None:
    first = generate_participant_token()
    second = generate_participant_token()

    assert first != second


def test_hash_participant_token_matches_sha256() -> None:
    token = "example-participant-token"

    result = hash_participant_token(token)

    assert result == hashlib.sha256(token.encode()).hexdigest()


def test_hash_participant_token_has_lowercase_hex_format() -> None:
    token = "example-participant-token"

    result = hash_participant_token(token)

    assert re.fullmatch(r"[0-9a-f]{64}", result) is not None


def test_hash_participant_token_differs_from_input() -> None:
    token = "example-participant-token"

    result = hash_participant_token(token)

    assert result != token
