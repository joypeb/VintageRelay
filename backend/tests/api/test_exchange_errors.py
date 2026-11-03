import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.domain import errors


@pytest.mark.parametrize(
    ("error_name", "code", "details"),
    [
        ("IntentNotActiveError", "INTENT_NOT_ACTIVE", {}),
        (
            "ProposalVersionMismatchError",
            "PROPOSAL_VERSION_MISMATCH",
            {"currentStatus": "invalidated", "latestProposalId": "proposal-2"},
        ),
        (
            "ProposalVersionMismatchError",
            "PROPOSAL_VERSION_MISMATCH",
            {"currentStatus": "rejected", "latestProposalId": None},
        ),
    ],
)
def test_exchange_conflict_error_response(
    app: FastAPI, client: TestClient, error_name, code, details
):
    error_class = getattr(errors, error_name)

    def fail():
        raise error_class(details=details)

    app.add_api_route("/test-exchange-conflict", fail)
    response = client.get("/test-exchange-conflict")

    assert response.status_code == 409
    error = response.json()["error"]
    assert error["code"] == code
    assert error["message"] and error["message"].isascii()
    assert error["details"] == (details or None)
    assert error["requestId"] == response.headers["X-Request-ID"]
