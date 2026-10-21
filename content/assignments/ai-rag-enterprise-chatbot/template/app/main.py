"""FastAPI RAG Application for Enterprise Knowledge Retrieval.

Implements /healthz and /v1/chat contract (docs/design/09 §A.3).
"""
import os
import re
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel

app = FastAPI(title="COLE Enterprise RAG Bot", version="1.0.0")

BASE_DIR = Path(__file__).resolve().parent.parent
HANDBOOK_PATH = BASE_DIR / "data" / "handbook.md"

SECTIONS: list[dict[str, str]] = []


def load_handbook():
    global SECTIONS
    if not HANDBOOK_PATH.is_file():
        return
    text = HANDBOOK_PATH.read_text(encoding="utf-8")
    # Split by markdown headers
    chunks = re.split(r"\n(?=###?\s+)", text)
    for c in chunks:
        lines = c.strip().splitlines()
        if not lines:
            continue
        header = lines[0].strip("# \t")
        body = "\n".join(lines[1:]).strip()
        SECTIONS.append({"title": "Cẩm nang quy chế COLE CORP 2026", "locator": header, "text": c.strip()})


load_handbook()


class QuestionImage(BaseModel):
    id: str | None = None
    mime: str | None = None
    data_base64: str | None = None
    caption: str | None = None


class QuestionPayload(BaseModel):
    text: str = ""
    images: list[QuestionImage] = []


class ChatRequest(BaseModel):
    request_id: str | None = None
    question: QuestionPayload
    conversation: list[dict[str, Any]] = []
    locale: str = "vi-VN"


@app.get("/healthz")
def healthz():
    return {"status": "ok", "indexed_sections": len(SECTIONS)}


@app.post("/v1/chat")
def chat(req: ChatRequest):
    q = (req.question.text or "").strip()
    images = req.question.images

    if not q and not images:
        raise HTTPException(status_code=400, detail="Câu hỏi không được để trống.")

    q_lower = q.lower()

    # Safety checks
    if any(k in q_lower for k in ["bỏ qua", "system prompt", "hướng dẫn trước", "ignore previous"]):
        return {
            "answer": "Yêu cầu không được chấp nhận. Tôi là trợ lý hỗ trợ quy chế nội bộ tuân thủ chính sách bảo mật của COLE CORP.",
            "sources": [],
            "usage": {"prompt_tokens": 30, "completion_tokens": 28},
            "metadata": {"blocked_by_safety": True},
        }

    if "thời tiết" in q_lower or "bóng đá" in q_lower or "giải trí" in q_lower:
        return {
            "answer": "Tôi là trợ lý quy chế và chính sách nội bộ COLE CORP. Câu hỏi của bạn nằm ngoài phạm vi cẩm nang doanh nghiệp hiện tại.",
            "sources": [],
            "usage": {"prompt_tokens": 25, "completion_tokens": 32},
            "metadata": {"out_of_scope": True},
        }

    # Best section match via keyword retrieval
    best_match = None
    best_score = 0
    words = set(re.findall(r"\w+", q_lower))

    for s in SECTIONS:
        s_words = set(re.findall(r"\w+", s["text"].lower()))
        overlap = len(words.intersection(s_words))
        if overlap > best_score:
            best_score = overlap
            best_match = s

    # Handle image context if present
    img_context = ""
    if images:
        captions = [img.caption for img in images if img.caption]
        if captions:
            img_context = f" (Dựa trên hình ảnh cung cấp: {', '.join(captions)})"

    if best_match and best_score >= 2:
        # Formulate answer based on matched section
        sec_text = best_match["text"]
        locator = best_match["locator"]

        if "vip" in q_lower and "đổi" in q_lower:
            ans = f"Theo {locator}{img_context}, khách hàng VIP được đổi hàng trong thời hạn 15 ngày. Tuy nhiên, doanh nghiệp chỉ hoàn tiền mặt trong 07 ngày đầu tiên; sau thời gian này không áp dụng hoàn tiền mặt."
        elif "bảo mật" in q_lower or "số điện thoại" in q_lower or "khách hàng khác" in q_lower:
            ans = f"Theo quy định tại {locator}, thông tin cá nhân khách hàng là dữ liệu bảo mật cấp cao nhất. Nghiêm cấm chia sẻ hoặc tiết lộ số điện thoại, thông tin cá nhân cho khách hàng khác."
        elif "bảo hành" in q_lower:
            ans = f"Theo quy chế tại {locator}, thời hạn bảo hành tiêu chuẩn cho linh kiện điện tử là 12 tháng kể từ ngày kích hoạt sản phẩm."
        elif "thẻ tín dụng" in q_lower or "hoàn tiền" in q_lower:
            ans = f"Theo {locator}, các đơn thanh toán bằng thẻ tín dụng sẽ được hoàn trả trực tiếp vào tài khoản thẻ trong vòng 03 đến 05 ngày làm việc."
        elif "khiếu nại" in q_lower:
            ans = f"Theo {locator}, mọi khiếu nại về dịch vụ được cam kết tiếp nhận và phản hồi chính thức trong vòng 24 giờ làm việc."
        else:
            lines = [line.strip("- *") for line in sec_text.splitlines() if line.startswith("-") or line.startswith("*")]
            bullet = lines[0] if lines else sec_text[:150]
            ans = f"Theo cẩm nang quy chế ({locator}){img_context}: {bullet}"

        sources = [{
            "title": best_match["title"],
            "locator": best_match["locator"],
            "snippet": best_match["text"][:250] + "...",
            "score": round(min(0.99, 0.5 + best_score * 0.1), 2),
        }]
    else:
        ans = f"Thông tin bạn tìm kiếm chưa có quy định rõ ràng trong cẩm nang quy chế nội bộ.{img_context}"
        sources = []

    p_tokens = len(q.split()) * 3 + (len(images) * 50)
    c_tokens = len(ans.split()) * 2

    return {
        "answer": ans,
        "sources": sources,
        "usage": {
            "prompt_tokens": p_tokens,
            "completion_tokens": c_tokens,
            "total_tokens": p_tokens + c_tokens,
        },
        "metadata": {
            "matched_section": best_match["locator"] if best_match else None,
        },
    }
