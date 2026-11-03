"""Pure two-/three-person exchange cycle logic (no DB imports).

Legs are ``(participant_id, offered_clothing_id, wanted_clothing_id)`` tuples.
"""

from collections.abc import Sequence
from datetime import datetime
from itertools import permutations

Leg = tuple[str, str, str]

_SUPPRESSED_STATUSES = frozenset({"rejected", "cancelled"})


def _is_two_cycle(first: Leg, second: Leg) -> bool:
    if first[0] == second[0]:
        return False
    if first[1] == first[2] or second[1] == second[2]:
        return False
    return first[1] == second[2] and second[1] == first[2]


def _is_ordered_three_cycle(first: Leg, second: Leg, third: Leg) -> bool:
    if len({first[0], second[0], third[0]}) != 3:
        return False
    for leg in (first, second, third):
        if leg[1] == leg[2]:
            return False
    return second[1] == first[2] and third[1] == second[2] and first[1] == third[2]


def detect_cycles(legs: Sequence[Leg]) -> list[list[Leg]]:
    """Find each two-/three-person swap exactly once, regardless of input order."""
    unique = list(dict.fromkeys(legs))
    cycles: list[list[Leg]] = []
    for i in range(len(unique)):
        for j in range(i + 1, len(unique)):
            if _is_two_cycle(unique[i], unique[j]):
                cycles.append([unique[i], unique[j]])
    for i in range(len(unique)):
        for j in range(i + 1, len(unique)):
            for k in range(j + 1, len(unique)):
                triple = (unique[i], unique[j], unique[k])
                if len({leg[0] for leg in triple}) != 3:
                    continue
                if any(_is_ordered_three_cycle(*order) for order in permutations(triple)):
                    cycles.append([unique[i], unique[j], unique[k]])
    return cycles


def cycle_key(legs: Sequence[Leg]) -> str:
    """Order-independent cycle identity: entries sorted by participant."""
    return "|".join(f"{p}:{o}:{w}" for p, o, w in sorted(legs))


def is_suppressed(
    status: str,
    ended_at: datetime,
    intent_updated_ats: Sequence[datetime],
    current_content_versions: Sequence[int],
    proposal_content_versions: Sequence[int],
) -> bool:
    """Skip recreating a rejected/cancelled cycle until an intent or garment changes."""
    if status not in _SUPPRESSED_STATUSES:
        return False
    if any(updated_at > ended_at for updated_at in intent_updated_ats):
        return False
    return list(current_content_versions) == list(proposal_content_versions)
