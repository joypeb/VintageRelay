from pathlib import Path

from fastapi import APIRouter
from fastapi.responses import Response

from app.api.deps import DbDep, SettingsDep
from app.api.errors import error_responses
from app.domain.errors import NotFoundError
from app.repositories import photo as photo_repo

router = APIRouter(prefix="/photos", tags=["photos"])


@router.get(
    "/{photo_id}",
    operation_id="viewPhoto",
    summary="View stored photo bytes",
    response_class=Response,
    responses={
        200: {
            "description": "Image bytes with stored content type.",
            "headers": {
                "X-Request-ID": {"description": "Request ID", "schema": {"type": "string"}}
            },
            "content": {
                "image/jpeg": {"schema": {"type": "string", "format": "binary"}},
                "image/png": {"schema": {"type": "string", "format": "binary"}},
                "image/webp": {"schema": {"type": "string", "format": "binary"}},
            },
        },
        **error_responses(404, 500),
    },
)
def view_photo(photo_id: str, db: DbDep, settings: SettingsDep) -> Response:
    with db.read() as s:
        photo = photo_repo.get_by_id(s, photo_id)
    if photo is None:
        raise NotFoundError()
    data = (Path(settings.photo_dir) / photo.storage_location).read_bytes()
    return Response(content=data, media_type=photo.content_type)
