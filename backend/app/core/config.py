from functools import lru_cache
from typing import Literal

from pydantic import SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None)

    database_url: str = "sqlite:///./data/app.db"
    app_base_url: str = "http://localhost:3000"
    log_level: str = "INFO"
    log_format: Literal["text", "json"] = "text"
    photo_dir: str = "data/photos"
    ai_api_key: SecretStr | None = None
    ai_api_base_url: str = "https://api.meta.ai/v1"
    ai_model_id: str = "muse-spark-1.3"
    ai_analysis_timeout_seconds: float = 30.0
    ai_search_timeout_seconds: float = 20.0
    ai_slot_wait_seconds: float = 2.0

    @field_validator("app_base_url")
    @classmethod
    def normalize_app_base_url(cls, value: str) -> str:
        return value.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
