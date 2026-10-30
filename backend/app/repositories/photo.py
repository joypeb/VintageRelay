from sqlalchemy.orm import Session

from app.models.photo import Photo


def add(s: Session, photo: Photo) -> None:
    s.add(photo)
    s.flush()


def get_by_id(s: Session, photo_id: str) -> Photo | None:
    return s.get(Photo, photo_id)
