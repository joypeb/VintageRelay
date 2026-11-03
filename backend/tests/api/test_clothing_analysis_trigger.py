"""Trigger tests for 018 background AI analysis (T007, Red).

Register returns ``analysis.status == pending`` for v1 without waiting for the
model; edit bumps the version replacing the row with a new pending; replay
creates no new row and keeps the version.
"""

import threading
import time
from concurrent.futures import Future, ThreadPoolExecutor

from sqlalchemy import select

from app.ai.deps import get_analyzer
from app.ai.fake import FakeAnalyzer
from app.models.clothing_analysis import ClothingAnalysis


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _wait_for(predicate, timeout: float = 5.0):  # type: ignore[no-untyped-def]
    deadline = time.time() + timeout
    while time.time() < deadline:
        value = predicate()
        if value:
            return value
        time.sleep(0.05)
    return predicate()


def _all_rows(db):  # type: ignore[no-untyped-def]
    with db.read() as session:
        return session.scalars(select(ClothingAnalysis)).all()


def test_register_returns_pending_v1_without_waiting(client, db, app, registration_context) -> None:
    event, _participant, token, _, upload = registration_context
    event_id = event["event"]["id"]
    photo = upload(event_id, token)

    gate = threading.Event()
    fake = FakeAnalyzer(gate=gate)
    app.dependency_overrides[get_analyzer] = lambda: fake
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            future: Future = pool.submit(
                client.post,
                f"/api/v1/events/{event_id}/clothing",
                headers=_auth(token),
                json={
                    "photoIds": [photo["id"]],
                    "category": "top",
                    "title": "Green denim jacket",
                    "description": "Cropped green jacket, size M.",
                },
            )
            started = _wait_for(lambda: len(fake.calls) >= 1)
            assert started, "background analysis job never started"
            assert not gate.is_set(), "job completed before pending was asserted"

            rows = _wait_for(lambda: _all_rows(db) or None)
            assert rows is not None and len(rows) == 1
            assert rows[0].status == "pending"
            assert rows[0].content_version == 1

            gate.set()
            response = future.result(timeout=35)
    finally:
        app.dependency_overrides.pop(get_analyzer, None)
        gate.set()

    assert response.status_code == 201
    body = response.json()
    assert body["contentVersion"] == 1
    assert body["analysis"] is not None
    assert body["analysis"]["status"] == "pending"
    assert body["analysis"]["contentVersion"] == 1


def test_edit_bumps_version_replacing_row_with_new_pending(
    client, db, app, registration_context
) -> None:
    event, _participant, token, _, upload = registration_context
    event_id = event["event"]["id"]
    photo = upload(event_id, token)

    app.dependency_overrides[get_analyzer] = lambda: FakeAnalyzer()
    try:
        created = client.post(
            f"/api/v1/events/{event_id}/clothing",
            headers=_auth(token),
            json={
                "photoIds": [photo["id"]],
                "category": "top",
                "title": "Green denim jacket",
                "description": "Cropped green jacket, size M.",
            },
        )
    finally:
        app.dependency_overrides.pop(get_analyzer, None)
    assert created.status_code == 201
    clothing_id = created.json()["id"]
    first_rows = _all_rows(db)
    first_id = first_rows[0].id if first_rows else None

    gate = threading.Event()
    fake = FakeAnalyzer(gate=gate)
    app.dependency_overrides[get_analyzer] = lambda: fake
    try:
        with ThreadPoolExecutor(max_workers=1) as pool:
            future: Future = pool.submit(
                client.patch,
                f"/api/v1/clothing/{clothing_id}",
                headers=_auth(token),
                json={"title": "Updated green jacket"},
            )
            started = _wait_for(lambda: len(fake.calls) >= 1)
            assert started, "background analysis job never started for edit"
            assert not gate.is_set(), "edit job completed before pending was asserted"

            def _pending_v2():  # type: ignore[no-untyped-def]
                with db.read() as session:
                    row = session.scalar(
                        select(ClothingAnalysis).where(ClothingAnalysis.clothing_id == clothing_id)
                    )
                    return row if row is not None and row.content_version == 2 else None

            row = _wait_for(_pending_v2)
            assert row is not None
            assert row.status == "pending"
            assert row.content_version == 2
            with db.read() as session:
                count = len(
                    session.scalars(
                        select(ClothingAnalysis).where(ClothingAnalysis.clothing_id == clothing_id)
                    ).all()
                )
            assert count == 1
            if first_id is not None:
                assert row.id != first_id

            gate.set()
            response = future.result(timeout=35)
    finally:
        app.dependency_overrides.pop(get_analyzer, None)
        gate.set()

    assert response.status_code == 200
    body = response.json()
    assert body["contentVersion"] == 2
    assert body["analysis"] is not None
    assert body["analysis"]["status"] == "pending"
    assert body["analysis"]["contentVersion"] == 2


def test_replay_edit_creates_no_new_row(client, db, app, registration_context) -> None:
    event, _participant, token, _, upload = registration_context
    event_id = event["event"]["id"]
    photo = upload(event_id, token)

    app.dependency_overrides[get_analyzer] = lambda: FakeAnalyzer()
    try:
        created = client.post(
            f"/api/v1/events/{event_id}/clothing",
            headers=_auth(token),
            json={
                "photoIds": [photo["id"]],
                "category": "top",
                "title": "Green denim jacket",
                "description": "Cropped green jacket, size M.",
            },
        )
        assert created.status_code == 201
        clothing_id = created.json()["id"]

        edited = client.patch(
            f"/api/v1/clothing/{clothing_id}",
            headers=_auth(token),
            json={"title": "Updated green jacket"},
        )
        assert edited.status_code == 200
        assert edited.json()["contentVersion"] == 2
    finally:
        app.dependency_overrides.pop(get_analyzer, None)

    with db.read() as session:
        before = session.scalar(
            select(ClothingAnalysis).where(ClothingAnalysis.clothing_id == clothing_id)
        )
        assert before is not None
        before_id = before.id
        before_version = before.content_version

    replay_fake = FakeAnalyzer()
    app.dependency_overrides[get_analyzer] = lambda: replay_fake
    try:
        replay = client.patch(
            f"/api/v1/clothing/{clothing_id}",
            headers=_auth(token),
            json={"title": "Updated green jacket"},
        )
    finally:
        app.dependency_overrides.pop(get_analyzer, None)

    assert replay.status_code == 200
    assert replay.json()["contentVersion"] == before_version
    assert replay_fake.calls == []
    with db.read() as session:
        after = session.scalar(
            select(ClothingAnalysis).where(ClothingAnalysis.clothing_id == clothing_id)
        )
        assert after is not None
        rows = session.scalars(
            select(ClothingAnalysis).where(ClothingAnalysis.clothing_id == clothing_id)
        ).all()
    assert len(rows) == 1
    assert after.id == before_id
    assert after.content_version == before_version
