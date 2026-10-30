import logging
from collections.abc import Callable
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy.exc import IntegrityError

from app.core.config import Settings
from app.core.db import Db
from app.domain.enums import ClothingStatus, EventStatus
from app.domain.errors import EventClosedError, NotFoundError, PhotoAlreadyAttachedError
from app.domain.photos import photo_url
from app.models.clothing import Clothing as ClothingModel
from app.models.participant import Participant
from app.repositories import clothing as clothing_repo
from app.repositories import event as event_repo
from app.repositories import photo as photo_repo
from app.schemas.clothing import Clothing as ClothingSchema
from app.schemas.clothing import ClothingCreate, ClothingOwner, ClothingPhoto

logger = logging.getLogger(__name__)


class ClothingService:
    def __init__(
        self,
        db: Db,
        settings: Settings,
        clock: Callable[[], datetime] = lambda: datetime.now(UTC),
        clothing_id_generator: Callable[[], str] = lambda: str(uuid4()),
    ) -> None:
        self.db = db
        self.settings = settings
        self.clock = clock
        self.clothing_id_generator = clothing_id_generator

    def register(
        self, event_id: str, participant: Participant, body: ClothingCreate
    ) -> ClothingSchema:
        with self.db.write() as s:
            event = event_repo.get(s, event_id)
            if event is None:
                raise NotFoundError()
            if event.status == EventStatus.CLOSED:
                raise EventClosedError()
            photo = photo_repo.get_by_id(s, body.photo_id)
            if photo is None or photo.event_id != event.id or photo.uploader_id != participant.id:
                raise NotFoundError()
            if clothing_repo.photo_is_attached(s, body.photo_id):
                raise PhotoAlreadyAttachedError()
            now = self.clock()
            clothing = ClothingModel(
                id=self.clothing_id_generator(),
                event_id=event.id,
                owner_id=participant.id,
                photo_id=photo.id,
                description=body.description,
                status=ClothingStatus.AVAILABLE,
                content_version=1,
                created_at=now,
                updated_at=now,
            )
            try:
                clothing_repo.add(s, clothing)
            except IntegrityError as exc:
                raise PhotoAlreadyAttachedError() from exc
            response = ClothingSchema(
                id=clothing.id,
                event_id=event.id,
                owner=ClothingOwner(
                    participant_id=participant.id,
                    display_name=participant.display_name,
                    is_organizer=participant.id == event.organizer_participant_id,
                ),
                is_mine=clothing.owner_id == participant.id,
                photo=ClothingPhoto(
                    id=photo.id, url=photo_url(self.settings.app_base_url, photo.id)
                ),
                description=clothing.description,
                status=ClothingStatus.AVAILABLE,
                content_version=clothing.content_version,
                analysis=None,
                created_at=clothing.created_at,
                updated_at=clothing.updated_at,
            )
            description_length = len(clothing.description)
        logger.info(
            "clothing_registered",
            extra={
                "clothing_id": clothing.id,
                "event_id": event.id,
                "description_length": description_length,
            },
        )
        return response
