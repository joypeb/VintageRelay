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


class InternalError(AppError):
    status_code = 500
    code = "INTERNAL_ERROR"
    message = "A temporary error occurred."
