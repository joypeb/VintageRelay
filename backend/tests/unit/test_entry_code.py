from app.domain.entry_code import (
    ENTRY_CODE_ALPHABET,
    ENTRY_CODE_LENGTH,
    generate_entry_code,
)


def test_entry_code_alphabet_matches_specification() -> None:
    assert ENTRY_CODE_ALPHABET == "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def test_entry_code_length_matches_specification() -> None:
    assert ENTRY_CODE_LENGTH == 6


def test_generated_entry_codes_have_six_characters() -> None:
    codes = [generate_entry_code() for _ in range(1_000)]

    assert all(len(code) == 6 for code in codes)


def test_generated_entry_codes_use_only_allowed_characters() -> None:
    codes = [generate_entry_code() for _ in range(1_000)]

    assert all(set(code) <= set("ABCDEFGHJKLMNPQRSTUVWXYZ23456789") for code in codes)


def test_generated_entry_codes_exclude_ambiguous_characters() -> None:
    codes = [generate_entry_code() for _ in range(1_000)]

    assert all(set(code).isdisjoint("0O1I") for code in codes)
