from app.schemas.common import ApiModel, UtcDatetime


class Photo(ApiModel):
    id: str
    url: str
    content_type: str
    size_bytes: int
    created_at: UtcDatetime
