import pytest
from pydantic import ValidationError

try:
    from app.schemas.clothing import ClothingUpdate
except ImportError:  # Red phase: schema not implemented yet.
    ClothingUpdate = None  # type: ignore[assignment]


@pytest.fixture(autouse=True)
def require_clothing_update():
    if ClothingUpdate is None:
        pytest.xfail(reason="ClothingUpdate not implemented in app.schemas.clothing")


def error_locs(exc):
    return [".".join(str(part) for part in error["loc"]) for error in exc.value.errors()]


@pytest.mark.parametrize(
    "body",
    [
        {"title": "Green jacket"},
        {"description": "Cropped jacket, size M."},
        {"category": "top"},
        {"photoIds": ["photo-1"]},
        {"measurements": {"chest": 21.0}},
    ],
)
def test_update_accepts_single_optional_field(body):
    model = ClothingUpdate.model_validate(body)

    assert model.model_fields_set == set(body)


def test_update_accepts_full_valid_body():
    body = {
        "photoIds": ["photo-1", "photo-2"],
        "category": "outer",
        "title": "Green denim jacket",
        "description": "Cropped green jacket, size M.",
        "measurements": {"totalLength": 22.5, "chest": 21.0, "sleeve": 24.0},
    }

    model = ClothingUpdate.model_validate(body)

    assert model.title == "Green denim jacket"
    assert model.photo_ids == ["photo-1", "photo-2"]


def test_update_rejects_empty_body():
    with pytest.raises(ValidationError):
        ClothingUpdate.model_validate({})


@pytest.mark.parametrize(
    "body",
    [
        {"title": "Jacket", "extra": True},
        {"unknown": 1},
    ],
)
def test_update_rejects_unknown_fields(body):
    with pytest.raises(ValidationError) as exc:
        ClothingUpdate.model_validate(body)

    assert any(error["type"] == "extra_forbidden" for error in exc.value.errors())


def test_update_rejects_duplicate_photo_ids():
    with pytest.raises(ValidationError):
        ClothingUpdate.model_validate({"photoIds": ["photo-1", "photo-1"]})


@pytest.mark.parametrize("photo_ids", [[], [f"photo-{index}" for index in range(11)]])
def test_update_rejects_photo_ids_outside_bounds(photo_ids):
    with pytest.raises(ValidationError):
        ClothingUpdate.model_validate({"photoIds": photo_ids})


@pytest.mark.parametrize(
    "body",
    [
        {"title": "   "},
        {"title": "x" * 101},
        {"title": "Jacket\x00"},
        {"description": ""},
        {"description": "   "},
        {"description": "x" * 1001},
        {"category": "shoes"},
    ],
)
def test_update_reuses_registration_field_rules(body):
    with pytest.raises(ValidationError):
        ClothingUpdate.model_validate(body)


@pytest.mark.parametrize("measurements", [None, {}])
def test_update_null_or_empty_measurements_clears(measurements):
    model = ClothingUpdate.model_validate({"measurements": measurements})

    assert model.measurements is None


def test_update_accepts_partial_measurements():
    model = ClothingUpdate.model_validate({"measurements": {"chest": 21.0}})

    assert model.measurements is not None
    assert model.measurements.chest == 21.0


def test_update_accepts_category_change_with_fitting_measurements():
    model = ClothingUpdate.model_validate(
        {"category": "bottom", "measurements": {"waist": 32.0, "inseam": 30.0}}
    )

    assert model.category == "bottom"
    assert model.measurements is not None
    assert model.measurements.waist == 32.0


@pytest.mark.parametrize(
    ("body", "field"),
    [
        (
            {"category": "bottom", "measurements": {"sleeve": 20.0}},
            "measurements.sleeve",
        ),
        (
            {"category": "top", "measurements": {"waist": 20.0}},
            "measurements.waist",
        ),
        (
            {"category": "other", "measurements": {"chest": 20.0}},
            "measurements",
        ),
    ],
)
def test_update_rejects_category_measurement_mismatch(body, field):
    with pytest.raises(ValidationError) as exc:
        ClothingUpdate.model_validate(body)

    assert field in error_locs(exc)


@pytest.mark.parametrize(
    ("body", "field"),
    [
        ({"category": "top", "measurements": {"chest": 0}}, "measurements.chest"),
        ({"category": "top", "measurements": {"chest": -1}}, "measurements.chest"),
        ({"category": "top", "measurements": {"chest": 121}}, "measurements.chest"),
        ({"category": "top", "measurements": {"chest": "wide"}}, "measurements.chest"),
        ({"category": "top", "measurements": {"unknown": 20}}, "measurements.unknown"),
    ],
)
def test_update_rejects_invalid_measurement_values(body, field):
    with pytest.raises(ValidationError) as exc:
        ClothingUpdate.model_validate(body)

    assert field in error_locs(exc)
