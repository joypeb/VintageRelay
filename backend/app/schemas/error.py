from app.schemas.common import ApiModel


class ValidationFieldError(ApiModel):
    field: str
    reason: str


class ErrorBody(ApiModel):
    code: str
    message: str
    details: dict[str, object] | None
    request_id: str


class ErrorResponse(ApiModel):
    error: ErrorBody
