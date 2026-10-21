"""Mô hình phân loại linh kiện OK/NG dây chuyền sản xuất."""


def predict(input_data: dict) -> dict:
    """
    Dự đoán chất lượng linh kiện dựa trên đặc trưng hình ảnh và độ tương phản bề mặt.

    Học viên cần tinh chỉnh các ngưỡng hoặc tích hợp mô hình học máy (MobileNet ONNX/PyTorch)
    để đạt F1-score >= 85% và giảm tối đa False Negative (lọt hàng lỗi).
    """
    surface = str(input_data.get("surface", "smooth")).lower()
    variance = float(input_data.get("variance", 0.0))
    max_gradient = float(input_data.get("max_gradient", 0.0))

    # Baseline rule: phát hiện khuyết tật dựa trên độ gồ ghề và gradient biên cạnh
    is_ng = (variance > 0.15) or (max_gradient > 50.0) or (surface != "smooth")

    if is_ng:
        conf = min(0.99, 0.5 + variance * 0.8)
        return {
            "label": "NG",
            "confidence": round(conf, 4),
            "score": round(conf, 4),
        }
    else:
        conf = max(0.01, 1.0 - variance * 5.0)
        return {
            "label": "OK",
            "confidence": round(conf, 4),
            "score": round(1.0 - conf, 4),
        }
