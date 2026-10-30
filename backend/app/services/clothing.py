import logging
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select

from app.core.config import Settings
from app.core.db import Db
from app.domain.enums import ClothingCategory, ClothingStatus, EventStatus, Ownership
from app.domain.errors import EventClosedError, NotFoundError, PhotoAlreadyAttachedError
from app.domain.photos import photo_url
from app.models.clothing import Clothing as ClothingModel
from app.models.participant import Participant
from app.models.photo import Photo as PhotoModel
from app.repositories import clothing as clothing_repo
from app.repositories import event as event_repo
from app.repositories import photo as photo_repo
from app.schemas.clothing import Clothing as ClothingSchema
from app.schemas.clothing import (
    ClothingCreate,
    ClothingList,
    ClothingOwner,
    ClothingPhoto,
    Measurements,
)

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
            photos = s.scalars(select(PhotoModel).where(PhotoModel.id.in_(body.photo_ids))).all()
            by_id = {photo.id: photo for photo in photos}
            ordered: list[PhotoModel] = []
            for photo_id in body.photo_ids:
                photo = by_id.get(photo_id)
                if (
                    photo is None
                    or photo.event_id != event.id
                    or photo.uploader_id != participant.id
                ):
                    raise NotFoundError()
                if photo.clothing_id is not None:
                    raise PhotoAlreadyAttachedError()
                ordered.append(photo)
            now = self.clock()
            measurements = body.measurements
            clothing = ClothingModel(
                id=self.clothing_id_generator(),
                event_id=event.id,
                owner_id=participant.id,
                title=body.title,
                category=body.category,
                description=body.description,
                status=ClothingStatus.AVAILABLE,
                content_version=1,
                measure_total_length=measurements.total_length if measurements else None,
                measure_chest=measurements.chest if measurements else None,
                measure_shoulder=measurements.shoulder if measurements else None,
                measure_sleeve=measurements.sleeve if measurements else None,
                measure_waist=measurements.waist if measurements else None,
                measure_hem=measurements.hem if measurements else None,
                measure_inseam=measurements.inseam if measurements else None,
                measure_thigh=measurements.thigh if measurements else None,
                created_at=now,
                updated_at=now,
            )
            clothing_repo.add(s, clothing)
            for position, photo in enumerate(ordered):
                if not photo_repo.attach(s, photo.id, clothing.id, position):
                    raise PhotoAlreadyAttachedError()
            response = self._build_response(
                clothing,
                owner_display_name=participant.display_name,
                organizer_participant_id=event.organizer_participant_id,
                viewer_id=participant.id,
                photos=ordered,
            )
            description_length = len(clothing.description)
            title_length = len(clothing.title)
        logger.info(
            "clothing_registered",
            extra={
                "clothing_id": clothing.id,
                "event_id": event.id,
                "description_length": description_length,
                "title_length": title_length,
                "category": clothing.category,
            },
        )
        return response

    def list(
        self,
        event_id: str,
        participant: Participant,
        ownership: Ownership,
        statuses: list[ClothingStatus] | None,
    ) -> ClothingList:
        with self.db.read() as s:
            event = event_repo.get(s, event_id)
            if event is None or participant.event_id != event.id:
                raise NotFoundError()
            rows = clothing_repo.list_visible(s, event.id, participant.id, ownership, statuses)
            photo_map = photo_repo.photos_for(s, [clothing.id for clothing, _, _ in rows])
            items = [
                self._build_response(
                    clothing,
                    owner_display_name=display_name,
                    organizer_participant_id=organizer_id,
                    viewer_id=participant.id,
                    photos=photo_map.get(clothing.id, []),
                )
                for clothing, display_name, organizer_id in rows
            ]
        return ClothingList(items=items)

    def get(self, participant: Participant, clothing_id: str) -> ClothingSchema:
        with self.db.read() as s:
            row = clothing_repo.get_visible(s, clothing_id, participant.event_id)
            if row is None:
                raise NotFoundError()
            clothing, display_name, organizer_id = row
            return self._build_response(
                clothing,
                owner_display_name=display_name,
                organizer_participant_id=organizer_id,
                viewer_id=participant.id,
                photos=photo_repo.photos_for(s, [clothing.id]).get(clothing.id, []),
            )

    def _build_response(
        self,
        clothing: ClothingModel,
        *,
        owner_display_name: str,
        organizer_participant_id: str | None,
        viewer_id: str,
        photos: Sequence[PhotoModel],
    ) -> ClothingSchema:
        measure_values = (
            clothing.measure_total_length,
            clothing.measure_chest,
            clothing.measure_shoulder,
            clothing.measure_sleeve,
            clothing.measure_waist,
            clothing.measure_hem,
            clothing.measure_inseam,
            clothing.measure_thigh,
        )
        return ClothingSchema(
            id=clothing.id,
            event_id=clothing.event_id,
            owner=ClothingOwner(
                participant_id=clothing.owner_id,
                display_name=owner_display_name,
                is_organizer=clothing.owner_id == organizer_participant_id,
            ),
            is_mine=clothing.owner_id == viewer_id,
            photos=[
                ClothingPhoto(
                    id=photo.id,
                    url=photo_url(self.settings.app_base_url, photo.id),
                )
                for photo in photos
            ],
            description=clothing.description,
            category=ClothingCategory(clothing.category),
            title=clothing.title,
            measurements=(
                Measurements(
                    total_length=clothing.measure_total_length,
                    chest=clothing.measure_chest,
                    shoulder=clothing.measure_shoulder,
                    sleeve=clothing.measure_sleeve,
                    waist=clothing.measure_waist,
                    hem=clothing.measure_hem,
                    inseam=clothing.measure_inseam,
                    thigh=clothing.measure_thigh,
                )
                if any(value is not None for value in measure_values)
                else None
            ),
            status=ClothingStatus(clothing.status),
            content_version=clothing.content_version,
            analysis=None,
            created_at=clothing.created_at,
            updated_at=clothing.updated_at,
        )
