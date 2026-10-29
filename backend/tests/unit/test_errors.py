from app.domain import errors


def test_entry_code_not_found_error_has_expected_contract() -> None:
    error = errors.EntryCodeNotFoundError()

    assert isinstance(error, errors.NotFoundError)
    assert error.status_code == 404
    assert error.code == "NOT_FOUND"
    assert (
        error.message == "We couldn't find an event with this code. Check the code and try again."
    )


def test_conflict_error_has_conflict_status() -> None:
    error = errors.ConflictError()

    assert isinstance(error, errors.AppError)
    assert error.status_code == 409


def test_event_closed_error_has_expected_contract() -> None:
    error = errors.EventClosedError()

    assert isinstance(error, errors.ConflictError)
    assert error.status_code == 409
    assert error.code == "EVENT_CLOSED"
    assert error.message == "This event has ended."


def test_display_name_taken_error_has_expected_contract() -> None:
    error = errors.DisplayNameTakenError()

    assert isinstance(error, errors.ConflictError)
    assert error.status_code == 409
    assert error.code == "DISPLAY_NAME_TAKEN"
    assert error.message == "This display name is already taken in this event."
