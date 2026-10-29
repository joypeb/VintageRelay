import logging
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import UTC, datetime
from threading import Barrier, Lock

from app.models.participant import Participant
from app.repositories import event as event_repo
from app.schemas.event import EventCreate
from app.services.event import EventService


def test_overlapping_close_calls_have_one_transition(db, settings, monkeypatch, caplog):
    service = EventService(db, settings)
    created = service.create(EventCreate(name="Swap", organizer_display_name="Mina"))
    with db.read() as session:
        actor = session.get(Participant, created.event.organizer_participant_id)
    assert actor is not None
    barrier = Barrier(2, timeout=5)
    original_write = db.write
    original_update = getattr(event_repo, "mark_closed", None)
    updates = []
    lock = Lock()

    @contextmanager
    def synchronized_write():
        barrier.wait()
        with original_write() as session:
            yield session

    def count_update(session, event_id, closed_at):
        result = original_update(session, event_id, closed_at)
        with lock:
            updates.append(result)
        return result

    monkeypatch.setattr(db, "write", synchronized_write)
    monkeypatch.setattr(event_repo, "mark_closed", count_update, raising=False)
    caplog.set_level(logging.INFO, logger="app.services.event")
    fixed = datetime(2026, 10, 29, 9, tzinfo=UTC)

    def close():
        return EventService(db, settings, clock=lambda: fixed).close(actor, created.event.id)

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(close) for _ in range(2)]
        results = [future.result(timeout=10) for future in futures]
    assert all(result.status == "closed" and result.closed_at == fixed for result in results)
    assert updates == [1]
    assert len([r for r in caplog.records if r.getMessage() == "event_closed"]) == 1
