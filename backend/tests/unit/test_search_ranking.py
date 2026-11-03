from datetime import UTC, datetime

import pytest

from app.models.clothing import Clothing
from app.models.clothing_analysis import ClothingAnalysis
from app.schemas.search import MeasurementRange, SearchConditions


def garment(name, **values):
    return Clothing(id=name, category=values.pop("category", "top"), content_version=2, **values)


def analysis(status="done", version=2, colors=None, **features):
    return ClothingAnalysis(
        status=status,
        content_version=version,
        features={"colors": colors or ["green"], **features},
        uncertainties=[],
        updated_at=datetime.now(UTC),
    )


def test_category_filters_without_adding_points():
    from app.services.search import condition_count, rank

    top, outer = garment("top"), garment("outer", category="outer")
    conditions = SearchConditions(category="top")
    assert rank([(top, None), (outer, None)], conditions) == [(top, 0, False)]
    assert condition_count(conditions) == 0


@pytest.mark.parametrize(
    ("row", "score"),
    [
        (analysis(), 1),
        (analysis("pending"), 0),
        (analysis("failed"), 0),
        (analysis("stale"), 0),
        (analysis(version=1), 0),
        (None, 0),
    ],
)
def test_colors_require_current_done_analysis(row, score):
    from app.services.search import condition_count, rank

    item = garment("item")
    conditions = SearchConditions(colors=["green", "green"])
    assert rank([(item, row)], conditions) == [(item, score, False)]
    assert condition_count(conditions) == 1


def test_each_distinct_matching_color_scores_once():
    from app.services.search import condition_count, rank

    item = garment("item")
    conditions = SearchConditions(colors=["green", "black", "green", "white"])
    assert rank([(item, analysis(colors=["green", "black"]))], conditions) == [(item, 2, False)]
    assert condition_count(conditions) == 3


def test_ranges_are_inclusive_open_sided_and_use_camel_case_names():
    from app.services.search import condition_count, rank

    item = garment("item", measure_chest=20, measure_total_length=30, measure_waist=40)
    conditions = SearchConditions(
        measurements={
            "chest": MeasurementRange(min=20, max=20),
            "totalLength": MeasurementRange(max=30),
            "waist": MeasurementRange(min=40),
            "sleeve": MeasurementRange(min=1),
        }
    )
    assert rank([(item, None)], conditions) == [(item, 3, False)]
    assert condition_count(conditions) == 4


def test_rank_sorts_by_score_then_missing_then_input_order_keeps_zeroes():
    from app.services.search import rank

    missing = garment("missing")
    unmatched = garment("unmatched", measure_chest=50)
    matched_first = garment("matched-first", measure_chest=20)
    matched_second = garment("matched-second", measure_chest=20)
    conditions = SearchConditions(measurements={"chest": MeasurementRange(min=19, max=21)})
    assert rank(
        [(missing, None), (matched_first, None), (unmatched, None), (matched_second, None)],
        conditions,
    ) == [
        (matched_first, 1, False),
        (matched_second, 1, False),
        (unmatched, 0, False),
        (missing, 0, True),
    ]


def test_no_conditions_preserves_input_order_and_no_missing_flag():
    from app.services.search import condition_count, rank

    first, second = garment("first"), garment("second", measure_chest=20)
    conditions = SearchConditions()
    assert rank([(first, None), (second, None)], conditions) == [
        (first, 0, False),
        (second, 0, False),
    ]
    assert condition_count(conditions) == 0


def test_each_keyword_scores_once_from_analysis_or_owner_text():
    from app.services.search import condition_count, rank

    tagged = garment("tagged", title="Jacket", description="Warm")
    texted = garment("texted", title="Denim chore coat", description="Workwear classic")
    neither = garment("neither", title="Tee", description="Plain")
    rows = [
        (neither, analysis()),
        (texted, None),
        (tagged, analysis(style_tags=["Workwear"], material_estimate="nylon")),
    ]
    conditions = SearchConditions(keywords=["workwear", "nylon", "denim"])
    assert rank(rows, conditions) == [
        (texted, 2, False),
        (tagged, 2, False),
        (neither, 0, False),
    ]
    assert condition_count(conditions) == 3


def test_keywords_ignore_stale_analysis_but_still_match_owner_text():
    from app.services.search import rank

    item = garment("item", title="Nylon parka", description="Light")
    row = analysis(version=1, style_tags=["workwear"])
    conditions = SearchConditions(keywords=["workwear", "nylon"])
    assert rank([(item, row)], conditions) == [(item, 1, False)]
