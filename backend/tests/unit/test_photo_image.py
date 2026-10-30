import importlib.util
from io import BytesIO

import pytest

from app.domain.errors import UnsupportedPhotoTypeError
from app.domain.photos import (
    MAX_PHOTO_BYTES,
    extension_for_format,
    normalize_image,
    photo_url,
    verify_image,
)

requires_pillow = pytest.mark.xfail(
    importlib.util.find_spec("PIL") is None,
    reason="Pillow is not installed yet",
)


def test_max_photo_bytes_is_ten_mib() -> None:
    assert MAX_PHOTO_BYTES == 10485760


@requires_pillow
@pytest.mark.parametrize(
    ("image_format", "content_type"),
    [("JPEG", "image/jpeg"), ("PNG", "image/png"), ("WEBP", "image/webp")],
)
def test_verify_image_detects_real_image_format(image_format: str, content_type: str) -> None:
    from PIL import Image

    buffer = BytesIO()
    Image.new("RGB", (2, 3), "red").save(buffer, format=image_format)

    assert verify_image(buffer.getvalue()) == content_type


@pytest.mark.parametrize(
    "raw",
    [
        pytest.param(b"plain text", id="text"),
        pytest.param(b"not an image named photo.jpg", id="renamed-extension"),
        pytest.param(b"\x00\x00\x00\x10ftypheic\x00\x00\x00\x00", id="heic"),
        pytest.param(b"\xff\xd8\xff\xe0\x00\x10JFIF\x00", id="truncated-jpeg"),
        pytest.param(b"\x89PNG\r\n\x1a\ncorrupt", id="corrupt-png"),
    ],
)
def test_verify_image_rejects_invalid_content(raw: bytes) -> None:
    with pytest.raises(UnsupportedPhotoTypeError):
        verify_image(raw)


@requires_pillow
def test_normalize_image_rotates_and_removes_exif_including_gps() -> None:
    from PIL import Image, TiffImagePlugin

    image = Image.new("RGB", (2, 3), "red")
    exif = Image.Exif()
    exif[274] = 6
    exif[34853] = {
        1: "N",
        2: tuple(TiffImagePlugin.IFDRational(value) for value in (37, 30, 0)),
    }
    buffer = BytesIO()
    image.save(buffer, format="JPEG", exif=exif)

    with Image.open(BytesIO(normalize_image(buffer.getvalue()))) as normalized:
        assert normalized.size == (3, 2)
        assert len(normalized.getexif()) == 0


@pytest.mark.parametrize(
    ("content_type", "extension"),
    [("image/jpeg", "jpg"), ("image/png", "png"), ("image/webp", "webp")],
)
def test_extension_for_format_returns_expected_extension(content_type: str, extension: str) -> None:
    assert extension_for_format(content_type) == extension


def test_photo_url_uses_app_base_url_and_photo_id() -> None:
    assert (
        photo_url("https://api.example.test", "abc") == "https://api.example.test/api/v1/photos/abc"
    )
