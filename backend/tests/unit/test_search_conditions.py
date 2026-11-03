import pytest

from app.ai.schemas import SearchInterpretation, SearchMeasurement
from app.services import search


def raw(**kwargs):
    return SearchInterpretation(
        category=kwargs.get("category"),
        colors=kwargs.get("colors", []),
        measurements=kwargs.get("measurements", []),
        keywords=kwargs.get("keywords", []),
        unrecognized=kwargs.get("unrecognized", []),
    )


def test_unknown_category_and_colors_are_preserved_as_unrecognized():
    result = search.to_search_conditions(
        raw(category="poncho", colors=["green", "green", "ultraviolet", "ultraviolet"])
    )
    assert result.category is None
    assert result.colors == ["green"]
    assert result.unrecognized == ["poncho", "ultraviolet"]


@pytest.mark.parametrize("category", ["top", "outer", "bottom", "other"])
def test_known_categories_are_retained(category):
    assert search.to_search_conditions(raw(category=category)).category == category


def test_all_measurement_names_are_retained_and_unknown_names_are_unrecognized():
    names = ["totalLength", "chest", "shoulder", "sleeve", "waist", "hem", "inseam", "thigh"]
    measurements = [SearchMeasurement(name=name, min=10, max=20) for name in [*names, "collar"]]
    result = search.to_search_conditions(raw(measurements=measurements))
    assert set(result.measurements) == set(names)
    assert all(value.min == 10 and value.max == 20 for value in result.measurements.values())
    assert result.unrecognized == ["collar"]


@pytest.mark.parametrize(("minimum", "maximum"), [(21, 20), (0, 20), (-1, 20), (20, 121)])
def test_invalid_measurement_ranges_are_dropped(minimum, maximum):
    result = search.to_search_conditions(
        raw(measurements=[SearchMeasurement(name="chest", min=minimum, max=maximum)])
    )
    assert result.measurements == {}


@pytest.mark.parametrize(
    ("value", "minimum", "maximum"),
    [(0.5, 0.1, 1.5), (1, 0.1, 2), (21, 20, 22), (120, 119, 120)],
)
def test_single_measurement_value_is_widened_within_bounds(value, minimum, maximum):
    result = search.to_search_conditions(
        raw(measurements=[SearchMeasurement(name="chest", min=value, max=value)])
    )
    assert result.measurements["chest"].min == minimum
    assert result.measurements["chest"].max == maximum


def test_empty_strings_are_dropped():
    result = search.to_search_conditions(
        raw(
            category=" ",
            colors=["", "  "],
            measurements=[SearchMeasurement(name="", min=1, max=2)],
            unrecognized=["", "  ", "oversized"],
        )
    )
    assert result.category is None
    assert result.colors == []
    assert result.measurements == {}
    assert result.unrecognized == ["oversized"]


def test_keywords_are_lowercased_deduplicated_and_blank_or_overlong_dropped():
    result = search.to_search_conditions(
        raw(keywords=["Workwear", " denim ", "workwear", " ", "x" * 41])
    )
    assert result.keywords == ["workwear", "denim"]
