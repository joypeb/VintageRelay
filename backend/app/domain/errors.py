class AppError(Exception):
    status_code: int = 400
    code: str = "BAD_REQUEST"
    message: str = "Invalid request."

    def __init__(
        self, message: str | None = None, *, details: dict[str, object] | None = None
    ) -> None:
        super().__init__(message or self.message)
        self.message = message or self.message
        self.details = details or {}


class UnauthenticatedError(AppError):
    status_code = 401
    code = "UNAUTHENTICATED"
    message = "Please join the event again."


class ForbiddenError(AppError):
    status_code = 403
    code = "FORBIDDEN"
    message = "You do not have permission to perform this action."


class NotFoundError(AppError):
    status_code = 404
    code = "NOT_FOUND"
    message = "Resource not found."


class EntryCodeNotFoundError(NotFoundError):
    message = "We couldn't find an event with this code. Check the code and try again."


class ConflictError(AppError):
    status_code = 409


class EventClosedError(ConflictError):
    code = "EVENT_CLOSED"
    message = "This event has ended."


class DisplayNameTakenError(ConflictError):
    code = "DISPLAY_NAME_TAKEN"
    message = "This display name is already taken in this event."


class PhotoTooLargeError(AppError):
    status_code = 413
    code = "FILE_TOO_LARGE"
    message = "The photo exceeds the 10 MB size limit."

    def __init__(
        self, message: str | None = None, *, details: dict[str, object] | None = None
    ) -> None:
        super().__init__(
            message, details=details if details is not None else {"maxBytes": 10485760}
        )


class UnsupportedPhotoTypeError(AppError):
    status_code = 415
    code = "UNSUPPORTED_MEDIA_TYPE"
    message = "This photo type is not supported. Use JPEG, PNG, or WebP."

    def __init__(
        self, message: str | None = None, *, details: dict[str, object] | None = None
    ) -> None:
        super().__init__(
            message,
            details=details
            if details is not None
            else {"allowedTypes": ["image/jpeg", "image/png", "image/webp"]},
        )


class InternalError(AppError):
    status_code = 500
    code = "INTERNAL_ERROR"
    message = "A temporary error occurred."
