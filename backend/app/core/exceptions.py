from fastapi import HTTPException, status


class AppException(HTTPException):
    """Базовое исключение приложения."""

    code: str = "app_error"

    def __init__(
        self,
        status_code: int,
        message: str,
        code: str | None = None,
        details: object | None = None,
    ):
        super().__init__(status_code=status_code, detail=message)
        self.code = code or self.code
        self.message = message
        self.details = details


class NotFoundError(AppException):
    code = "not_found"

    def __init__(self, message: str = "Resource not found"):
        super().__init__(status.HTTP_404_NOT_FOUND, message)


class BadRequestError(AppException):
    code = "bad_request"

    def __init__(self, message: str = "Bad request", details: object | None = None):
        super().__init__(status.HTTP_400_BAD_REQUEST, message, details=details)


class ConflictError(AppException):
    code = "conflict"

    def __init__(self, message: str = "Conflict"):
        super().__init__(status.HTTP_409_CONFLICT, message)