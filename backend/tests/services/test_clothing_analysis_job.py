"""Job tests for 018 background AI analysis (T008, Red).

The job service module does not exist yet, so this file FAILs on import.
Tests call the service function directly (no TestClient BackgroundTasks).
"""

import logging

from sqlalchemy import select, update

from app.ai.fake import FakeAnalyzer
from app.ai.protocols import AIUnavailableError
from app.ai.schemas import AnalysisResult
from app.models.clothing import Clothing
from app.models.clothing_analysis import ClothingAnalysis
from app.repositories import clothing_analysis as analysis_repo
from app.services.clothing_analysis import mark_pending_failed, run_clothing_analysis


def _register_garment(client, event_id, token, upload):  # type: ignore[no-untyped-def]
    photo = upload(event_id, token)
    response = client.post(
        f"/api/v1/events/{event_id}/clothing",
        headers={"Authorization": f"Bearer {token}"},
        json={
            "photoIds": [photo["id"]],
            "category": "top",
            "title": "Private green jacket title",
            "description": "Private cropped jacket description",
        },
    )
    assert response.status_code == 201
    return response.json(), photo


def _current_row(db, clothing_id):  # type: ignore[no-untyped-def]
    with db.read() as session:
        return session.scalar(
            select(ClothingAnalysis).where(ClothingAnalysis.clothing_id == clothing_id)
        )


def _done_result(colors=("blue",)):  # type: ignore[no-untyped-def]
    return AnalysisResult(
        colors=list(colors),
        pattern="solid",
        material_estimate="cotton",
        style_tags=["casual"],
        visible_details=["pocket"],
        size_label=None,
        uncertainties=[],
    )


def test_done_saved_at_same_version_via_conditional_write(
    client, db, settings, registration_context
) -> None:
    event, _participant, token, _, upload = registration_context
    created, _photo = _register_garment(client, event["event"]["id"], token, upload)
    clothing_id = created["id"]
    version = created["contentVersion"]

    fake = FakeAnalyzer(result=_done_result(("blue",)))
    run_clothing_analysis(
        db=db,
        settings=settings,
        clothing_id=clothing_id,
        content_version=version,
        analyzer=fake,
    )

    row = _current_row(db, clothing_id)
    assert row is not None
    assert row.status == "done"
    assert row.content_version == version
    assert row.features is not None
    assert row.features["colors"] == ["blue"]
    assert len(fake.calls) == 1


def test_old_version_result_discarded(client, db, settings, registration_context) -> None:
    event, _participant, token, _, upload = registration_context
    created, _photo = _register_garment(client, event["event"]["id"], token, upload)
    clothing_id = created["id"]

    edited = client.patch(
        f"/api/v1/clothing/{clothing_id}",
        headers={"Authorization": f"Bearer {token}"},
        json={"title": "Private green jacket title v2"},
    )
    assert edited.status_code == 200
    assert edited.json()["contentVersion"] == 2

    stale_fake = FakeAnalyzer(result=_done_result(("red",)))
    run_clothing_analysis(
        db=db,
        settings=settings,
        clothing_id=clothing_id,
        content_version=1,
        analyzer=stale_fake,
    )

    row = _current_row(db, clothing_id)
    assert row is not None
    assert row.content_version == 2
    assert row.status == "pending"
    assert row.features is None or row.features.get("colors") != ["red"]


def test_withdrawn_garment_result_discarded(client, db, settings, registration_context) -> None:
    event, _participant, token, _, upload = registration_context
    created, _photo = _register_garment(client, event["event"]["id"], token, upload)
    clothing_id = created["id"]
    version = created["contentVersion"]

    withdrawn = client.delete(
        f"/api/v1/clothing/{clothing_id}",
        headers={"Authorization": f"Bearer {token}"},
    )
    assert withdrawn.status_code == 204

    fake = FakeAnalyzer(result=_done_result(("green",)))
    run_clothing_analysis(
        db=db,
        settings=settings,
        clothing_id=clothing_id,
        content_version=version,
        analyzer=fake,
    )

    row = _current_row(db, clothing_id)
    assert row is not None
    assert row.status != "done"
    assert row.features is None


def test_failure_sets_failed_with_scrubbed_log(
    client, db, settings, registration_context, caplog
) -> None:
    event, _participant, token, _, upload = registration_context
    created, _photo = _register_garment(client, event["event"]["id"], token, upload)
    clothing_id = created["id"]
    version = created["contentVersion"]
    title = created["title"]
    description = created["description"]

    failing = FakeAnalyzer(error=AIUnavailableError("boom"))
    caplog.set_level(logging.WARNING)
    caplog.clear()
    run_clothing_analysis(
        db=db,
        settings=settings,
        clothing_id=clothing_id,
        content_version=version,
        analyzer=failing,
    )

    row = _current_row(db, clothing_id)
    assert row is not None
    assert row.status == "failed"
    assert row.features is None

    failed_records = [
        record for record in caplog.records if record.getMessage() == "ai_call_failed"
    ]
    assert len(failed_records) >= 1
    for record in caplog.records:
        formatted = f"{record.getMessage()} {record.args}"
        assert title not in formatted
        assert description not in formatted
    assert title not in caplog.text
    assert description not in caplog.text


def test_race_keeps_first_done(client, db, settings, registration_context) -> None:
    event, _participant, token, _, upload = registration_context
    created, _photo = _register_garment(client, event["event"]["id"], token, upload)
    clothing_id = created["id"]
    version = created["contentVersion"]

    first = FakeAnalyzer(result=_done_result(("blue",)))
    run_clothing_analysis(
        db=db,
        settings=settings,
        clothing_id=clothing_id,
        content_version=version,
        analyzer=first,
    )
    second = FakeAnalyzer(result=_done_result(("red",)))
    run_clothing_analysis(
        db=db,
        settings=settings,
        clothing_id=clothing_id,
        content_version=version,
        analyzer=second,
    )

    row = _current_row(db, clothing_id)
    assert row is not None
    assert row.status == "done"
    assert row.features is not None
    assert row.features["colors"] == ["blue"]


def test_startup_cleanup_marks_leftover_pending_failed(client, db, registration_context) -> None:
    event, _participant, token, _, upload = registration_context
    created, _photo = _register_garment(client, event["event"]["id"], token, upload)
    clothing_id = created["id"]
    with db.read() as session:
        row = session.scalar(
            select(ClothingAnalysis).where(ClothingAnalysis.clothing_id == clothing_id)
        )
    assert row is not None
    if row.status != "pending":
        with db.write() as session:
            session.execute(
                update(ClothingAnalysis)
                .where(ClothingAnalysis.clothing_id == clothing_id)
                .values(status="pending", features=None)
            )

    marked = mark_pending_failed(db)
    assert marked >= 1

    row = _current_row(db, clothing_id)
    assert row is not None
    assert row.status == "failed"


def test_job_uses_single_conditional_write_first_wins(
    client, db, settings, registration_context
) -> None:
    event, _participant, token, _, upload = registration_context
    created, _photo = _register_garment(client, event["event"]["id"], token, upload)
    clothing_id = created["id"]
    version = created["contentVersion"]

    with db.write() as session:
        clothing = session.get(Clothing, clothing_id)
        assert clothing is not None
        analysis_repo.replace_pending(session, clothing_id, version, clothing.updated_at)

    calls = {"count": 0}
    real_replace = analysis_repo.replace_pending

    def _no_replace(*args, **kwargs):  # type: ignore[no-untyped-def]
        calls["count"] += 1
        return real_replace(*args, **kwargs)

    import app.repositories.clothing_analysis as repo_module

    monkeypatched = False
    try:
        repo_module.replace_pending = _no_replace  # type: ignore[method-assign]
        monkeypatched = True
        run_clothing_analysis(
            db=db,
            settings=settings,
            clothing_id=clothing_id,
            content_version=version,
            analyzer=FakeAnalyzer(result=_done_result(("navy",))),
        )
    finally:
        if monkeypatched:
            repo_module.replace_pending = real_replace  # type: ignore[method-assign]

    assert calls["count"] == 0
    row = _current_row(db, clothing_id)
    assert row is not None
    assert row.status == "done"
