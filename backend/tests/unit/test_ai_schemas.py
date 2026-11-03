"""Pinned contract for app.ai.schemas AnalysisResult (018).

Pins the strict flat schema from spec FR-005, research section 2, and
ai-features 2.1/2.3:

- colors use the fixed 14-word vocabulary; unknown colors are dropped and an
  empty list is allowed.
- pattern is an enum (solid, striped, checked, floral, graphic, other) or null;
  unknown values are rejected.
- style_tags and visible_details keep at most 8 entries with empty strings
  dropped.
- uncertainty messages are capped at 200 chars with empty messages dropped;
  aspect is a closed enum.
- size_label is nullable.
- the schema is flat and strict (no additional properties).
"""

import pytest
from pydantic import ValidationError

from app.ai.schemas import AnalysisResult

COLOR_VOCABULARY = frozenset(
    {
        "black",
        "white",
        "gray",
        "beige",
        "brown",
        "red",
        "orange",
        "yellow",
        "green",
        "blue",
        "navy",
        "purple",
        "pink",
        "multicolor",
    }
)

PATTERNS = {"solid", "striped", "checked", "floral", "graphic", "other"}

ASPECTS = {"condition", "size", "fit", "material", "logo", "color", "other"}


def _valid_payload(**overrides):
    payload = {
        "colors": ["green", "navy"],
        "pattern": "solid",
        "material_estimate": "denim",
        "style_tags": ["cropped", "vintage"],
        "visible_details": ["front zip"],
        "size_label": "M",
        "uncertainties": [{"aspect": "logo", "message": "Check the back for a logo."}],
    }
    payload.update(overrides)
    return payload


def test_valid_result_parses_all_fields():
    result = AnalysisResult(**_valid_payload())

    assert list(result.colors) == ["green", "navy"]
    assert result.pattern == "solid"
    assert result.material_estimate == "denim"
    assert list(result.style_tags) == ["cropped", "vintage"]
    assert list(result.visible_details) == ["front zip"]
    assert result.size_label == "M"
    assert len(result.uncertainties) == 1
    assert result.uncertainties[0].aspect == "logo"


def test_colors_accept_full_vocabulary():
    for color in sorted(COLOR_VOCABULARY):
        result = AnalysisResult(**_valid_payload(colors=[color]))

        assert list(result.colors) == [color]


def test_unknown_colors_are_dropped_and_empty_colors_allowed():
    result = AnalysisResult(**_valid_payload(colors=["teal", "green", "", "navy"]))

    assert list(result.colors) == ["green", "navy"]

    assert list(AnalysisResult(**_valid_payload(colors=[])).colors) == []


def test_colors_capped_to_first_three_in_order():
    result = AnalysisResult(**_valid_payload(colors=["red", "green", "blue", "black"]))

    assert list(result.colors) == ["red", "green", "blue"]


def test_unknown_pattern_is_rejected_and_null_allowed():
    for pattern in sorted(PATTERNS):
        assert AnalysisResult(**_valid_payload(pattern=pattern)).pattern == pattern

    assert AnalysisResult(**_valid_payload(pattern=None)).pattern is None

    with pytest.raises(ValidationError):
        AnalysisResult(**_valid_payload(pattern="paisley"))


def test_style_tags_truncated_to_eight_with_empty_dropped():
    tags = [f"tag-{index}" for index in range(10)] + ["", "   "]
    result = AnalysisResult(**_valid_payload(style_tags=tags))

    assert list(result.style_tags) == [f"tag-{index}" for index in range(8)]


def test_visible_details_truncated_to_eight_with_empty_dropped():
    details = ["", *[f"detail-{index}" for index in range(10)]]
    result = AnalysisResult(**_valid_payload(visible_details=details))

    assert list(result.visible_details) == [f"detail-{index}" for index in range(8)]


def test_uncertainty_message_capped_at_200_chars():
    result = AnalysisResult(
        **_valid_payload(uncertainties=[{"aspect": "color", "message": "x" * 250}])
    )

    assert result.uncertainties[0].message == "x" * 200


def test_uncertainty_empty_message_dropped():
    result = AnalysisResult(
        **_valid_payload(
            uncertainties=[
                {"aspect": "color", "message": "   "},
                {"aspect": "size", "message": "Check the size label in person."},
            ]
        )
    )

    assert [item.message for item in result.uncertainties] == ["Check the size label in person."]


def test_unknown_uncertainty_aspect_is_rejected():
    for aspect in sorted(ASPECTS):
        payload = _valid_payload(uncertainties=[{"aspect": aspect, "message": "Check it."}])
        assert AnalysisResult(**payload).uncertainties[0].aspect == aspect

    with pytest.raises(ValidationError):
        AnalysisResult(
            **_valid_payload(uncertainties=[{"aspect": "brand", "message": "Check it."}])
        )


def test_size_label_is_nullable():
    assert AnalysisResult(**_valid_payload(size_label=None)).size_label is None
    assert AnalysisResult(**_valid_payload(size_label="M")).size_label == "M"

    assert AnalysisResult(**_valid_payload(size_label="")).size_label is None


def test_missing_size_label_is_rejected():
    payload = _valid_payload()
    del payload["size_label"]

    with pytest.raises(ValidationError):
        AnalysisResult(**payload)


def test_extra_keys_are_rejected_by_strict_flat_schema():
    assert AnalysisResult.model_config.get("extra") == "forbid"
    assert set(AnalysisResult.model_fields) == {
        "colors",
        "pattern",
        "material_estimate",
        "style_tags",
        "visible_details",
        "size_label",
        "uncertainties",
    }

    with pytest.raises(ValidationError):
        AnalysisResult(**_valid_payload(price_estimate="expensive"))


def test_json_schema_requires_every_property_for_strict_mode():
    # Meta strict json_schema rejects any property missing from "required" (400).
    schema = AnalysisResult.model_json_schema()
    assert set(schema["required"]) == set(schema["properties"])
    for definition in schema.get("$defs", {}).values():
        assert set(definition["required"]) == set(definition["properties"])
