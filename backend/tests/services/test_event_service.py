import hashlib
import logging

from sqlalchemy import text

import app.models  # noqa: F401
from app.core.security import hash_participant_token


def test_create_persists_trimmed_names_and_only_token_hash(client, db):
    response = client.post(
        "/api/v1/events", json={"name": "  Swap  ", "organizerDisplayName": "  Mina  "}
    )

    assert response.status_code == 201
    token = response.json()["participantToken"]
    with db.read() as session:
        event = session.execute(text("SELECT * FROM events")).mappings().one()
        participants = session.execute(text("SELECT * FROM participants")).mappings().all()
        matched = (
            session.execute(
                text("SELECT * FROM participants WHERE session_token_hash = :token_hash"),
                {"token_hash": hash_participant_token(token)},
            )
            .mappings()
            .all()
        )

    assert len(participants) == len(matched) == 1
    assert participants[0]["session_token_hash"] == hashlib.sha256(token.encode()).hexdigest()
    assert token not in participants[0].values()
    assert matched[0]["id"] == event["organizer_participant_id"]
    assert event["name"] == "Swap"
    assert participants[0]["display_name"] == "Mina"


def test_successful_create_logs_event_without_secrets(client, caplog):
    caplog.set_level(logging.INFO)

    response = client.post("/api/v1/events", json={"name": "Swap", "organizerDisplayName": "Mina"})

    assert response.status_code == 201
    body = response.json()
    records = [record for record in caplog.records if record.msg == "event_created"]
    assert len(records) == 1
    assert records[0].event_id == body["event"]["id"]
    for record in caplog.records:
        for secret in (body["participantToken"], body["event"]["entryCode"]):
            assert secret not in record.getMessage()
            assert secret not in str(record.__dict__.values())
