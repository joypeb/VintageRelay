from datetime import UTC, datetime, timedelta
from importlib import import_module

import pytest

# Each leg is (participant_id, offered_clothing_id, wanted_clothing_id).
A = ("a", "garment-a", "garment-b")
B = ("b", "garment-b", "garment-c")
C = ("c", "garment-c", "garment-a")
B_TO_A = ("b", "garment-b", "garment-a")


def matching():
    return import_module("app.domain.matching")


def test_detects_two_person_swap_once():
    cycles = matching().detect_cycles([A, B_TO_A])
    assert len(cycles) == 1
    assert set(cycles[0]) == {A, B_TO_A}


def test_detects_three_person_cycle_once_in_any_input_order():
    cycles = matching().detect_cycles([C, A, B])
    assert len(cycles) == 1
    assert set(cycles[0]) == {A, B, C}


@pytest.mark.parametrize("legs", [[A, B], [A], [A, B, ("a", "garment-c", "garment-a")]])
def test_does_not_detect_open_or_repeated_participant_cycle(legs):
    assert matching().detect_cycles(legs) == []


def test_cycle_key_is_order_independent_but_preserves_legs():
    cycle_key = matching().cycle_key
    assert cycle_key([A, B, C]) == cycle_key([C, A, B]) == cycle_key([B, C, A])
    assert cycle_key([A, B, C]) != cycle_key([A, B_TO_A])


@pytest.mark.parametrize("status", ["rejected", "cancelled"])
def test_suppresses_unchanged_ended_cycle_and_lifts_on_change(status):
    is_suppressed = matching().is_suppressed
    ended_at = datetime(2026, 11, 3, tzinfo=UTC)
    before = ended_at - timedelta(seconds=1)
    after = ended_at + timedelta(seconds=1)
    assert is_suppressed(status, ended_at, [before, ended_at], [1, 2], [1, 2])
    assert not is_suppressed(status, ended_at, [before, after], [1, 2], [1, 2])
    assert not is_suppressed(status, ended_at, [before, ended_at], [1, 3], [1, 2])


@pytest.mark.parametrize("status", ["pending", "confirmed", "invalidated"])
def test_other_proposal_states_do_not_suppress(status):
    ended_at = datetime(2026, 11, 3, tzinfo=UTC)
    assert not matching().is_suppressed(status, ended_at, [ended_at], [1], [1])
