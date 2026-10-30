import contextlib
import logging
from collections.abc import Callable
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

from starlette.datastructures import UploadFile

from app.core.config import Settings
from app.core.db import Db
from app.domain.enums import EventStatus
from app.domain.errors import (
    EventClosedError,
    NotFoundError,
    PhotoTooLargeError,
    UnsupportedPhotoTypeError,
)
from app.domain.photos import (
    MAX_PHOTO_BYTES,
    extension_for_format,
    normalize_image,
    photo_url,
    verify_image,
)
from app.models.participant import Participant
from app.models.photo import Photo as PhotoModel
from app.repositories import event as event_repo
from app.repositories import photo as photo_repo
from app.schemas.photo import Photo as PhotoSchema

logger = logging.getLogger(__name__)

_CHUNK_SIZE = 1024 * 1024


class PhotoService:
    def __init__(
        self,
        db: Db,
        settings: Settings,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
        photo_id_generator: Callable[[], str] = lambda: str(uuid4()),
    ) -> None:
        self.db = db
        self.settings = settings
        self.clock = clock
        self.photo_id_generator = photo_id_generator

    def upload(self, event_id: str, participant: Participant, upload: UploadFile) -> PhotoSchema:
        with self.db.write() as s:
            event = event_repo.get(s, event_id)
            if event is None:
                raise NotFoundError()
            if event.status == EventStatus.CLOSED:
                raise EventClosedError()
            declared_size = upload.size
            if declared_size is not None and declared_size > MAX_PHOTO_BYTES:
                raise PhotoTooLargeError(details={"maxBytes": MAX_PHOTO_BYTES})
            upload.file.seek(0)
            chunks: list[bytes] = []
            total = 0
            while True:
                piece = upload.file.read(_CHUNK_SIZE)
                if not piece:
                    break
                total += len(piece)
                if total > MAX_PHOTO_BYTES:
                    raise PhotoTooLargeError(details={"maxBytes": MAX_PHOTO_BYTES})
                chunks.append(piece)
            raw = b"".join(chunks)
            try:
                content_type = verify_image(raw)
            except UnsupportedPhotoTypeError:
                raise
            except Exception as exc:
                raise UnsupportedPhotoTypeError() from exc
            try:
                processed = normalize_image(raw)
            except UnsupportedPhotoTypeError:
                raise
            except Exception as exc:
                raise UnsupportedPhotoTypeError() from exc
            photo_id = self.photo_id_generator()
            key = f"{photo_id}.{extension_for_format(content_type)}"
            dest = Path(self.settings.photo_dir) / key
            dest.parent.mkdir(parents=True, exist_ok=True)
            photo = PhotoModel(
                id=photo_id,
                event_id=event.id,
                uploader_id=participant.id,
                storage_location=key,
                content_type=content_type,
                size_bytes=len(processed),
                created_at=self.clock(),
            )
            try:
                dest.write_bytes(processed)
                photo_repo.add(s, photo)
            except Exception:
                with contextlib.suppress(OSError):
                    dest.unlink(missing_ok=True)
                raise
        logger.info(
            "photo_uploaded",
            extra={
                "event_id": event.id,
                "participant_id": participant.id,
                "photo_id": photo.id,
                "size_bytes": photo.size_bytes,
                "content_type": photo.content_type,
            },
        )
        return PhotoSchema(
            id=photo.id,
            url=photo_url(self.settings.app_base_url, photo.id),
            content_type=photo.content_type,
            size_bytes=photo.size_bytes,
            created_at=photo.created_at,
        )
