import logging
from collections.abc import Callable, Sequence
from datetime import UTC, datetime
from uuid import uuid4

from fastapi.exceptions import RequestValidationError
from sqlalchemy import select, update

from app.core.config import Settings
from app.core.db import Db
from app.domain.enums import ClothingCategory, ClothingStatus, EventStatus, Ownership
from app.domain.errors import (
    ClothingAlreadyConfirmedError,
    ClothingNotAvailableError,
    EventClosedError,
    ForbiddenError,
    NotFoundError,
    PhotoAlreadyAttachedError,
)
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
    ClothingUpdate,
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

    def edit(
        self, participant: Participant, clothing_id: str, body: ClothingUpdate
    ) -> ClothingSchema:
        with self.db.write() as s:
            clothing = s.get(ClothingModel, clothing_id)
            if clothing is None or clothing.event_id != participant.event_id:
                raise NotFoundError()
            if clothing.owner_id != participant.id:
                raise ForbiddenError()
            event = event_repo.get(s, clothing.event_id)
            if event is None:
                raise NotFoundError()
            current_photos = photo_repo.photos_for(s, [clothing.id]).get(clothing.id, [])
            current_photo_ids = [photo.id for photo in current_photos]
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
            current_measurements = (
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
            )
            provided = body.model_fields_set
            has_photos = "photoIds" in provided or "photo_ids" in provided
            has_category = "category" in provided
            has_title = "title" in provided
            has_description = "description" in provided
            has_measurements = "measurements" in provided
            new_photo_ids = (
                list(body.photo_ids)
                if has_photos and body.photo_ids is not None
                else current_photo_ids
            )
            new_category = (
                body.category
                if has_category and body.category is not None
                else ClothingCategory(clothing.category)
            )
            new_title = body.title if has_title else clothing.title
            new_description = body.description if has_description else clothing.description
            new_measurements = body.measurements if has_measurements else current_measurements
            photos_same = (not has_photos) or (new_photo_ids == current_photo_ids)
            category_same = (not has_category) or (
                ClothingCategory(clothing.category) == body.category
            )
            title_same = (not has_title) or (new_title == clothing.title)
            description_same = (not has_description) or (new_description == clothing.description)
            measurements_same = (not has_measurements) or (new_measurements == current_measurements)
            if (
                photos_same
                and category_same
                and title_same
                and description_same
                and measurements_same
            ):
                return self._build_response(
                    clothing,
                    owner_display_name=participant.display_name,
                    organizer_participant_id=event.organizer_participant_id,
                    viewer_id=participant.id,
                    photos=current_photos,
                )
            if event.status == EventStatus.CLOSED:
                raise EventClosedError()
            if clothing.status == ClothingStatus.CONFIRMED:
                raise ClothingAlreadyConfirmedError(
                    "Cancel the confirmed exchange before editing this garment."
                )
            if clothing.status == ClothingStatus.WITHDRAWN:
                raise ClothingNotAvailableError()
            self._validate_resulting_measurements(new_category, new_measurements)
            changed_fields: list[str] = []
            if has_title and body.title is not None and body.title != clothing.title:
                clothing.title = body.title
                changed_fields.append("title")
            if (
                has_description
                and body.description is not None
                and body.description != clothing.description
            ):
                clothing.description = body.description
                changed_fields.append("description")
            if has_category and ClothingCategory(clothing.category) != body.category:
                clothing.category = (
                    body.category.value
                    if isinstance(body.category, ClothingCategory)
                    else str(body.category)
                )
                changed_fields.append("category")
            if has_measurements and new_measurements != current_measurements:
                clothing.measure_total_length = (
                    new_measurements.total_length if new_measurements else None
                )
                clothing.measure_chest = new_measurements.chest if new_measurements else None
                clothing.measure_shoulder = new_measurements.shoulder if new_measurements else None
                clothing.measure_sleeve = new_measurements.sleeve if new_measurements else None
                clothing.measure_waist = new_measurements.waist if new_measurements else None
                clothing.measure_hem = new_measurements.hem if new_measurements else None
                clothing.measure_inseam = new_measurements.inseam if new_measurements else None
                clothing.measure_thigh = new_measurements.thigh if new_measurements else None
                changed_fields.append("measurements")
            if has_photos and new_photo_ids != current_photo_ids:
                by_id: dict[str, PhotoModel] = {}
                for photo_id in new_photo_ids:
                    photo = s.get(PhotoModel, photo_id)
                    if (
                        photo is None
                        or photo.event_id != clothing.event_id
                        or photo.uploader_id != clothing.owner_id
                    ):
                        raise NotFoundError()
                    if photo.clothing_id is not None and photo.clothing_id != clothing.id:
                        raise PhotoAlreadyAttachedError()
                    by_id[photo_id] = photo
                current_set = set(current_photo_ids)
                new_set = set(new_photo_ids)
                dropped = current_set - new_set
                if dropped:
                    s.execute(
                        update(PhotoModel)
                        .where(PhotoModel.id.in_(dropped))
                        .values(clothing_id=None, position=None)
                    )
                for photo_id in new_photo_ids:
                    photo = by_id[photo_id]
                    if photo.clothing_id is None:
                        result = s.connection().execute(
                            update(PhotoModel)
                            .where(PhotoModel.id == photo_id, PhotoModel.clothing_id.is_(None))
                            .values(clothing_id=clothing.id, position=None)
                        )
                        if result.rowcount != 1:
                            raise PhotoAlreadyAttachedError()
                    else:
                        s.execute(
                            update(PhotoModel)
                            .where(PhotoModel.id == photo_id)
                            .values(position=None)
                        )
                for index, photo_id in enumerate(new_photo_ids):
                    s.execute(
                        update(PhotoModel).where(PhotoModel.id == photo_id).values(position=index)
                    )
                ordered_photos: Sequence[PhotoModel] = [
                    by_id[photo_id] for photo_id in new_photo_ids
                ]
                changed_fields.append("photoIds")
            else:
                ordered_photos = current_photos
            now = self.clock()
            clothing.content_version += 1
            clothing.updated_at = now
            s.flush()
            response = self._build_response(
                clothing,
                owner_display_name=participant.display_name,
                organizer_participant_id=event.organizer_participant_id,
                viewer_id=participant.id,
                photos=ordered_photos,
            )
        logger.info(
            "clothing_updated",
            extra={
                "clothing_id": clothing.id,
                "content_version": clothing.content_version,
                "changed_fields": changed_fields,
                "photo_count": len(ordered_photos),
                "invalidated_proposal_count": 0,
            },
        )
        return response

    def withdraw(self, participant: Participant, clothing_id: str) -> None:
        with self.db.write() as s:
            clothing = s.get(ClothingModel, clothing_id)
            if clothing is None or clothing.event_id != participant.event_id:
                raise NotFoundError()
            if clothing.owner_id != participant.id:
                raise ForbiddenError()
            if clothing.status == ClothingStatus.WITHDRAWN:
                return
            event = event_repo.get(s, clothing.event_id)
            if event is None:
                raise NotFoundError()
            if event.status == EventStatus.CLOSED:
                raise EventClosedError()
            if clothing.status == ClothingStatus.CONFIRMED:
                raise ClothingAlreadyConfirmedError(
                    "Cancel the confirmed exchange before withdrawing this garment."
                )
            clothing.status = ClothingStatus.WITHDRAWN
            clothing.updated_at = self.clock()
            s.flush()
        logger.info(
            "clothing_withdrawn",
            extra={
                "clothing_id": clothing.id,
                "invalidated_intent_count": 0,
                "invalidated_proposal_count": 0,
            },
        )

    @staticmethod
    def _validate_resulting_measurements(
        category: ClothingCategory, measurements: Measurements | None
    ) -> None:
        if measurements is None:
            return
        if category == ClothingCategory.OTHER:
            raise RequestValidationError(
                [
                    {
                        "loc": ("measurements",),
                        "msg": "Measurements are not allowed for this category.",
                        "type": "value_error",
                        "input": measurements.model_dump(),
                    }
                ]
            )
        allowed = (
            {"total_length", "waist", "hem", "inseam", "thigh"}
            if category == ClothingCategory.BOTTOM
            else {"total_length", "chest", "shoulder", "sleeve"}
        )
        details = []
        values = measurements.model_dump()
        for field_name, value in values.items():
            if value is not None and field_name not in allowed:
                details.append(
                    {
                        "loc": (f"measurements.{field_name}",),
                        "msg": "Measurement does not belong to this category.",
                        "type": "value_error",
                        "input": value,
                    }
                )
        if details:
            raise RequestValidationError(details)

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
