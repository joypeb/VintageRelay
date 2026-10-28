from pathlib import Path

import pytest
from app.core.config import Settings
from pydantic import ValidationError


@pytest.fixture(autouse=True)
def clear_settings_env(monkeypatch: pytest.MonkeyPatch) -> None:
    for key in ("DATABASE_URL", "APP_BASE_URL", "LOG_LEVEL", "LOG_FORMAT"):
        monkeypatch.delenv(key, raising=False)


def test_missing_environment_uses_defaults() -> None:
    settings = Settings()

    assert settings.database_url == "sqlite:///./data/app.db"
    assert settings.app_base_url == "http://localhost:3000"
    assert settings.log_level == "INFO"
    assert settings.log_format == "text"


def test_environment_values_override_defaults(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "sqlite:///custom.db")
    monkeypatch.setenv("APP_BASE_URL", "https://example.test")
    monkeypatch.setenv("LOG_LEVEL", "DEBUG")
    monkeypatch.setenv("LOG_FORMAT", "json")

    settings = Settings()

    assert settings.database_url == "sqlite:///custom.db"
    assert settings.app_base_url == "https://example.test"
    assert settings.log_level == "DEBUG"
    assert settings.log_format == "json"


def test_invalid_log_format_raises_validation_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LOG_FORMAT", "xml")

    with pytest.raises(ValidationError):
        Settings()


def test_dotenv_in_working_directory_is_not_read(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / ".env").write_text("LOG_FORMAT=json\n", encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    settings = Settings()

    assert settings.log_format == "text"
