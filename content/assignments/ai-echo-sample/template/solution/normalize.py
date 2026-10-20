"""Chuẩn hóa văn bản — xem README của bài."""


def predict(input: dict) -> dict:
    text = input.get("text", "")
    # TODO: chuẩn hóa NFC, chữ thường, gộp khoảng trắng, bỏ khoảng trắng đầu/cuối
    return {"text": text}
