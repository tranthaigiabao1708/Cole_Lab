from typing import Any
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from cole_platform.kernel.db import get_db
from cole_platform.kernel.errors import AppError
from . import service

router = APIRouter(prefix="/llm", tags=["llm-gateway"])


class ChatCompletionRequest(BaseModel):
    model: str = "cole-gpt-4o-mini"
    messages: list[dict[str, Any]]
    temperature: float = 0.0
    max_tokens: int = 1000


@router.post("/v1/chat/completions")
def chat_completions(
    req: ChatCompletionRequest,
    authorization: str | None = Header(None),
    db: Session = Depends(get_db),
):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail={"code": "MISSING_KEY", "message": "Yêu cầu Bearer token."})

    raw_key = authorization.removeprefix("Bearer ").strip()
    try:
        return service.handle_chat_completion(
            db=db,
            raw_key=raw_key,
            model=req.model,
            messages=req.messages,
            temperature=req.temperature,
            max_tokens=req.max_tokens,
        )
    except AppError as e:
        raise HTTPException(status_code=e.status_code, detail={"code": e.code, "message": e.message})
