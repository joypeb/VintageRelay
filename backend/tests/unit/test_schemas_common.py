from datetime import UTC, datetime

import pytest
from app.schemas.common import ApiModel, UtcDatetime
from pydantic import ValidationError


class ExampleModel(ApiModel):
    created_at: UtcDatetime
    display_name: str


def test_utc_datetime_serialization_uses_milliseconds_and_camel_case() -> None:
    model = ExampleModel(created_at=datetime(2026, 10, 27, 5, 30, tzinfo=UTC), display_name="Mina")

    result = model.model_dump(by_alias=True, mode="json")

    assert result["createdAt"] == "2026-10-27T05:30:00.000Z"


def test_camel_case_input_strips_whitespace() -> None:
    data = {"createdAt": "2026-10-27T05:30:00Z", "displayName": "  Mina  "}

    model = ExampleModel.model_validate(data)

    assert model.display_name == "Mina"


def test_unknown_key_raises_extra_forbidden() -> None:
    data = {"createdAt": "2026-10-27T05:30:00Z", "displayName": "Mina", "unknown": 1}

    with pytest.raises(ValidationError) as exc:
        ExampleModel.model_validate(data)

    assert exc.value.errors()[0]["type"] == "extra_forbidden"
