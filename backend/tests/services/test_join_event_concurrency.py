from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import UTC, datetime
from threading import Barrier, Event, local

import pytest
from sqlalchemy import select

from app.domain.errors import DisplayNameTakenError, EventClosedError
from app.models.participant import Participant
from app.repositories import event as event_repo
from app.repositories import participant as participant_repo
from app.schemas.event import EventCreate
from app.services.event import EventService
from tests.conftest import count_rows


def setup_event(db, settings):
    result = EventService(db, settings).create(
        EventCreate(name="Swap", organizer_display_name="Mina")
    )
    with db.read() as session:
        actor = session.get(Participant, result.event.organizer_participant_id)
    assert actor is not None
    return result.event, actor


def body(code, name):
    from app.schemas.event import ParticipantCreate

    return ParticipantCreate(entry_code=code, display_name=name)


@pytest.mark.parametrize(("first", "second"), [("Ana", "ANA"), ("Straße", "STRASSE")])
def test_concurrent_casefold_names_allow_one_join(db, settings, monkeypatch, first, second):
    event, _ = setup_event(db, settings)
    payloads = [body(event.entry_code, name) for name in (first, second)]
    barrier = Barrier(2, timeout=5)
    original_write = db.write

    @contextmanager
    def synchronized_write():
        barrier.wait()
        with original_write() as session:
            yield session

    monkeypatch.setattr(db, "write", synchronized_write)

    def attempt(payload):
        try:
            EventService(db, settings).join(event.id, payload)
            return "joined"
        except DisplayNameTakenError:
            return "duplicate"

    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(attempt, payload) for payload in payloads]
        results = [future.result(timeout=10) for future in futures]
    assert sorted(results) == ["duplicate", "joined"]
    with db.read() as session:
        names = session.scalars(
            select(Participant.display_name).where(Participant.event_id == event.id)
        ).all()
    assert sum(name.casefold() == first.casefold() for name in names) == 1


@pytest.mark.parametrize("first", ["join", "close"])
def test_join_and_close_are_serialized_in_controlled_order(db, settings, monkeypatch, first):
    event, actor = setup_event(db, settings)
    payload = body(event.entry_code, "Joon")
    before = count_rows(db, "participants")
    inside, release, second_started = Event(), Event(), Event()
    thread_state = local()
    original_write = db.write
    original_add = participant_repo.add
    original_close = event_repo.mark_closed

    @contextmanager
    def observed_write():
        if getattr(thread_state, "second", False):
            second_started.set()
        with original_write() as session:
            yield session

    def hold_add(session, participant):
        result = original_add(session, participant)
        inside.set()
        assert release.wait(timeout=6)
        return result

    def hold_close(session, event_id, closed_at):
        result = original_close(session, event_id, closed_at)
        inside.set()
        assert release.wait(timeout=6)
        return result

    monkeypatch.setattr(db, "write", observed_write)
    if first == "join":
        monkeypatch.setattr(participant_repo, "add", hold_add)
    else:
        monkeypatch.setattr(event_repo, "mark_closed", hold_close)

    def run(action, second=False):
        thread_state.second = second
        service = EventService(db, settings, clock=lambda: datetime(2026, 10, 29, tzinfo=UTC))
        if action == "join":
            return service.join(event.id, payload)
        return service.close(actor, event.id)

    with ThreadPoolExecutor(max_workers=2) as pool:
        first_future = pool.submit(run, first)
        try:
            assert inside.wait(timeout=5), "first operation did not reach its write"
            second_future = pool.submit(run, "close" if first == "join" else "join", True)
            assert second_started.wait(timeout=5), "second operation did not attempt its write"
        finally:
            release.set()
        first_result = first_future.result(timeout=10)
        if first == "join":
            assert first_result.event.me.display_name == "Joon"
            assert second_future.result(timeout=10).status == "closed"
            assert count_rows(db, "participants") == before + 1
        else:
            assert first_result.status == "closed"
            with pytest.raises(EventClosedError):
                second_future.result(timeout=10)
            assert count_rows(db, "participants") == before
