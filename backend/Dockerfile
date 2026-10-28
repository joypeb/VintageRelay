# syntax=docker/dockerfile:1
# Runtime image for the Vintage Relay API (research R15).
FROM ghcr.io/astral-sh/uv:python3.14-bookworm-slim

WORKDIR /app

# Compile bytecode on install and copy instead of hardlinking, so the virtual
# environment stays valid across image layers and volumes.
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy

# Dependency layer: install only third-party dependencies so this layer is
# reused unless pyproject.toml or uv.lock changes.
COPY pyproject.toml uv.lock .python-version ./
RUN uv sync --locked --no-dev --no-install-project

# Application layer.
COPY app/ ./app/
COPY alembic/ ./alembic/
COPY alembic.ini ./
RUN uv sync --locked --no-dev

# Use the project virtual environment and keep the SQLite file on the mounted
# /data volume so it survives container replacement.
ENV PATH="/app/.venv/bin:$PATH" \
    DATABASE_URL=sqlite:////data/app.db

RUN mkdir -p /data

EXPOSE 8000

# Apply migrations on start, then run a single worker.
CMD ["sh", "-c", "alembic upgrade head && exec fastapi run app/main.py --host 0.0.0.0 --port 8000"]
