from io import BytesIO

from PIL import Image, ImageOps

from app.domain.errors import UnsupportedPhotoTypeError

MAX_PHOTO_BYTES = 10 * 1024 * 1024

_FORMAT_TO_CONTENT_TYPE = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}

_CONTENT_TYPE_TO_EXTENSION = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}


def verify_image(raw: bytes) -> str:
    try:
        with Image.open(BytesIO(raw)) as image:
            image.load()
            image_format = image.format
    except (OSError, SyntaxError, ValueError, Image.DecompressionBombError) as exc:
        raise UnsupportedPhotoTypeError() from exc
    content_type = _FORMAT_TO_CONTENT_TYPE.get(image_format or "")
    if content_type is None:
        raise UnsupportedPhotoTypeError()
    return content_type


def normalize_image(raw: bytes) -> bytes:
    """Call after successful verify_image on the same bytes."""
    with Image.open(BytesIO(raw)) as image:
        image_format = image.format or "JPEG"
        transposed = ImageOps.exif_transpose(image)
        buffer = BytesIO()
        transposed.save(buffer, format=image_format)
        return buffer.getvalue()


def extension_for_format(content_type: str) -> str:
    """Call with a content type returned by verify_image (closed input set)."""
    return _CONTENT_TYPE_TO_EXTENSION[content_type]


def photo_url(app_base_url: str, photo_id: str) -> str:
    return f"{app_base_url}/api/v1/photos/{photo_id}"
