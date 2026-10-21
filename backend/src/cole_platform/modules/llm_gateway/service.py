import hashlib
import os
import secrets
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from cole_platform.kernel.errors import AppError
from cole_platform.kernel.ids import new_id
from .models import VirtualKey, LLMUsageLog


# Token pricing per 1M tokens ($0.15 input, $0.60 output standard mock pricing)
INPUT_PRICE_PER_M = 0.15
OUTPUT_PRICE_PER_M = 0.60


def hash_key(key: str) -> str:
    return hashlib.sha256(key.encode("utf-8")).hexdigest()


def create_virtual_key(
    db: Session,
    user_id: str,
    workspace_id: str | None = None,
    run_id: str | None = None,
    budget_usd: float = 0.50,
) -> tuple[str, VirtualKey]:
    raw_secret = secrets.token_hex(16)
    full_key = f"cole_vk_{raw_secret}"
    key_h = hash_key(full_key)
    prefix = full_key[:12]

    vk = VirtualKey(
        id=new_id("vk"),
        key_hash=key_h,
        key_prefix=prefix,
        workspace_id=workspace_id,
        run_id=run_id,
        user_id=user_id,
        budget_usd=budget_usd,
        spent_usd=0.0,
        is_active=True,
    )
    db.add(vk)
    db.commit()
    db.refresh(vk)
    return full_key, vk


def get_key_by_secret(db: Session, raw_key: str) -> VirtualKey | None:
    key_h = hash_key(raw_key.strip())
    stmt = select(VirtualKey).where(VirtualKey.key_hash == key_h, VirtualKey.is_active == True)
    return db.scalar(stmt)


def record_usage(
    db: Session,
    vk: VirtualKey,
    model: str,
    prompt_tokens: int,
    completion_tokens: int,
) -> float:
    cost = (prompt_tokens * INPUT_PRICE_PER_M + completion_tokens * OUTPUT_PRICE_PER_M) / 1_000_000.0
    cost = round(cost, 6)

    vk.spent_usd = round(vk.spent_usd + cost, 6)
    log = LLMUsageLog(
        id=new_id("usg"),
        virtual_key_id=vk.id,
        model=model,
        prompt_tokens=prompt_tokens,
        completion_tokens=completion_tokens,
        cost_usd=cost,
    )
    db.add(log)
    db.commit()
    return cost


def handle_chat_completion(
    db: Session,
    raw_key: str,
    model: str,
    messages: list[dict[str, Any]],
    temperature: float = 0.0,
    max_tokens: int = 1000,
) -> dict[str, Any]:
    vk = get_key_by_secret(db, raw_key)
    if not vk:
        raise AppError(401, "INVALID_VIRTUAL_KEY", "Khóa API ảo không tồn tại hoặc đã hết hiệu lực.")

    if vk.spent_usd >= vk.budget_usd:
        raise AppError(429, "LLM_BUDGET_EXCEEDED", f"Đã vượt hạn mức ngân sách LLM ({vk.budget_usd:.2f} USD).")

    provider = os.environ.get("COLE_LLM_PROVIDER", "mock").lower()

    if provider == "mock":
        last_user_msg = ""
        for m in reversed(messages):
            if m.get("role") == "user":
                c = m.get("content")
                if isinstance(c, str):
                    last_user_msg = c
                elif isinstance(c, list):
                    for part in c:
                        if isinstance(part, dict) and part.get("type") == "text":
                            last_user_msg += part.get("text", "")
                break

        # Deterministic mock response based on queries
        q = last_user_msg.lower()
        if "đổi trả" in q and "vip" in q:
            reply = "Theo mục 3.2 Quy chế nội bộ, khách hàng VIP được hỗ trợ đổi sản phẩm trong 15 ngày kể từ ngày mua. Không áp dụng chính sách hoàn trả bằng tiền mặt ngoài thời hạn 7 ngày đầu tiên."
        elif "đổi trả" in q:
            reply = "Theo quy định tại mục 3.1, sản phẩm được đổi trong vòng 7 ngày nếu còn nguyên tem nhãn và hóa đơn mua hàng hợp lệ."
        elif "bảo mật" in q:
            reply = "Theo quy định bảo mật tại mục 5.1, toàn bộ thông tin cá nhân và dữ liệu giao dịch của khách hàng được bảo mật tuyệt đối, nghiêm cấm chia sẻ hoặc tiết lộ cho bên thứ ba."
        elif "bảo hành" in q:
            reply = "Thời hạn bảo hành tiêu chuẩn cho linh kiện điện tử là 12 tháng kể từ ngày kích hoạt sản phẩm theo mục 4.2."
        elif "thời tiết" in q:
            reply = "Tôi là trợ lý tra cứu quy chế nội bộ doanh nghiệp COLE CORP. Câu hỏi của bạn nằm ngoài phạm vi tài liệu và cẩm nang hỗ trợ."
        elif "bỏ qua" in q or "system prompt" in q or "hướng dẫn trước" in q:
            reply = "Tôi không thể thực hiện yêu cầu này. Tôi tuân thủ nghiêm ngặt quy chế an toàn thông tin của COLE CORP."
        else:
            reply = f"Dựa trên cẩm nang doanh nghiệp, thông tin được ghi nhận liên quan đến: {last_user_msg[:100]}..."

        p_tokens = max(10, len(last_user_msg.split()) * 2)
        c_tokens = max(15, len(reply.split()) * 2)
        cost = record_usage(db, vk, model, p_tokens, c_tokens)

        return {
            "id": f"chatcmpl_{new_id('mock')}",
            "object": "chat.completion",
            "created": 1700000000,
            "model": model,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": reply},
                "finish_reason": "stop",
            }],
            "usage": {
                "prompt_tokens": p_tokens,
                "completion_tokens": c_tokens,
                "total_tokens": p_tokens + c_tokens,
                "cost_usd": cost,
            },
        }

    raise AppError(500, "PROVIDER_NOT_CONFIGURED", f"LLM provider {provider} chưa được cấu hình.")


def close_run_keys(db: Session, run_id: str) -> int:
    """Deactivate every virtual key minted for a run (called when the run ends)."""
    keys = db.scalars(select(VirtualKey).where(VirtualKey.run_id == run_id, VirtualKey.is_active == True)).all()  # noqa: E712
    for k in keys:
        k.is_active = False
    return len(keys)


def usage_for_run(db: Session, run_id: str) -> dict[str, Any]:
    """Aggregate gateway usage of all keys bound to a run."""
    key_ids = list(db.scalars(select(VirtualKey.id).where(VirtualKey.run_id == run_id)))
    if not key_ids:
        return {"requests": 0, "tokens_in": 0, "tokens_out": 0, "cost_usd": 0.0}
    logs = db.scalars(select(LLMUsageLog).where(LLMUsageLog.virtual_key_id.in_(key_ids))).all()
    return {
        "requests": len(logs),
        "tokens_in": sum(l.prompt_tokens for l in logs),
        "tokens_out": sum(l.completion_tokens for l in logs),
        "cost_usd": round(sum(l.cost_usd for l in logs), 6),
    }
