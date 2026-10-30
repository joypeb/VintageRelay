from app.domain import enums


def test_clothing_status_values() -> None:
    assert {value.value for value in enums.ClothingStatus} == {
        "available",
        "confirmed",
        "withdrawn",
    }


def test_ownership_values() -> None:
    assert {value.value for value in enums.Ownership} == {"mine", "others", "all"}
