"""Alembic environment: resolve the database URL and run migrations."""

from logging.config import fileConfig

from sqlalchemy import create_engine
from sqlalchemy.pool import NullPool

import app.models  # noqa: F401  # Import for side effect: register models on Base.metadata.
from alembic import context
from app.core.config import get_settings
from app.models.base import Base

config = context.config

if config.config_file_name is not None:
    # Migrations can run in-process (tests call alembic.command.upgrade), and the default
    # would disable existing app loggers, breaking log capture after migrations.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def get_url() -> str:
    """Prefer an explicit config URL (tests) and otherwise use application settings."""
    url = config.get_main_option("sqlalchemy.url")
    return url or get_settings().database_url


def run_migrations_offline() -> None:
    """Emit migration SQL without connecting to a database."""
    context.configure(
        url=get_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # SQLite cannot ALTER most constraints, so emit batch operations.
        render_as_batch=True,
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against a live database connection."""
    engine = create_engine(get_url(), poolclass=NullPool)
    try:
        with engine.connect() as connection:
            context.configure(
                connection=connection,
                target_metadata=target_metadata,
                render_as_batch=True,
            )

            with context.begin_transaction():
                context.run_migrations()
    finally:
        engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
