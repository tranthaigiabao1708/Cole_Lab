from fastapi import HTTPException


class AppError(HTTPException):
    """Error with a stable machine code and a user-facing Vietnamese message."""

    def __init__(self, status: int, code: str, message: str, details: dict | None = None):
        super().__init__(status_code=status, detail={"code": code, "message": message, "details": details or {}})


def not_found(what: str = "Đối tượng") -> AppError:
    return AppError(404, "NOT_FOUND", f"{what} không tồn tại hoặc bạn không có quyền xem.")


def forbidden() -> AppError:
    return AppError(403, "FORBIDDEN", "Bạn không có quyền thực hiện thao tác này.")


def bad_request(code: str, message: str, details: dict | None = None) -> AppError:
    return AppError(400, code, message, details)
