"""Shared fixtures.

Add the engine/db fixtures (real SQLite file in ``tmp_path``), domain factories,
and the fake AI client override here once ``app/core/db.py`` and ``app/ai/`` exist.
See docs/rules/dev/backend/testing.md.
"""

from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
