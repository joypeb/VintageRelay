from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.models.photo import Photo


def add(s: Session, photo: Photo) -> None:
    s.add(photo)
    s.flush()


def get_by_id(s: Session, photo_id: str) -> Photo | None:
    return s.get(Photo, photo_id)


def attach(s: Session, photo_id: str, clothing_id: str, position: int) -> bool:
    result = s.connection().execute(
        update(Photo)
        .where(Photo.id == photo_id, Photo.clothing_id.is_(None))
        .values(clothing_id=clothing_id, position=position)
    )
    return result.rowcount == 1


def photos_for(s: Session, clothing_ids: list[str]) -> dict[str, list[Photo]]:
    grouped: dict[str, list[Photo]] = {clothing_id: [] for clothing_id in clothing_ids}
    if clothing_ids:
        rows = s.scalars(
            select(Photo).where(Photo.clothing_id.in_(clothing_ids)).order_by(Photo.position)
        ).all()
        for photo in rows:
            if photo.clothing_id is not None:
                grouped.setdefault(photo.clothing_id, []).append(photo)
    return grouped
