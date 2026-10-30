from functools import lru_cache
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None)

    database_url: str = "sqlite:///./data/app.db"
    app_base_url: str = "http://localhost:3000"
    log_level: str = "INFO"
    log_format: Literal["text", "json"] = "text"
    photo_dir: str = "data/photos"

    @field_validator("app_base_url")
    @classmethod
    def normalize_app_base_url(cls, value: str) -> str:
        return value.rstrip("/")


@lru_cache
def get_settings() -> Settings:
    return Settings()
