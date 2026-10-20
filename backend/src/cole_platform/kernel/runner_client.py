"""HTTP client for the runner-agent. API/worker never import the docker SDK."""
from __future__ import annotations

import httpx

from .config import settings
from .errors import AppError


class RunnerUnavailable(AppError):
    def __init__(self, detail: str = ""):
        super().__init__(503, "RUNNER_UNAVAILABLE",
                         "Môi trường chạy đang không khả dụng. Vui lòng thử lại sau.", {"detail": detail[:300]})


def _headers() -> dict:
    return {"Authorization": f"Bearer {settings.runner_token}"}


def call(method: str, path: str, json: dict | None = None, timeout: float = 60.0) -> dict:
    try:
        r = httpx.request(method, f"{settings.runner_url}{path}", json=json, headers=_headers(), timeout=timeout)
    except httpx.HTTPError as e:
        raise RunnerUnavailable(f"{type(e).__name__}: {e}") from e
    if r.status_code >= 500:
        raise RunnerUnavailable(r.text)
    if r.status_code >= 400:
        raise AppError(r.status_code, "RUNNER_REJECTED", "Môi trường chạy từ chối yêu cầu.", {"detail": r.text[:300]})
    return r.json()


def health() -> dict:
    try:
        r = httpx.get(f"{settings.runner_url}/health", timeout=5)
        return r.json()
    except httpx.HTTPError as e:
        return {"ok": False, "error": f"{type(e).__name__}"}


def ws_url(path: str) -> str:
    return settings.runner_url.replace("http://", "ws://").replace("https://", "wss://") + path
