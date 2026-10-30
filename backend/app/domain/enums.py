from enum import StrEnum


class EventStatus(StrEnum):
    ACTIVE = "active"
    CLOSED = "closed"


class ClothingStatus(StrEnum):
    AVAILABLE = "available"
    CONFIRMED = "confirmed"
    WITHDRAWN = "withdrawn"


class ClothingCategory(StrEnum):
    TOP = "top"
    OUTER = "outer"
    BOTTOM = "bottom"
    OTHER = "other"


class Ownership(StrEnum):
    MINE = "mine"
    OTHERS = "others"
    ALL = "all"
