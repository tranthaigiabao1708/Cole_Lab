# BÀI THỰC HÀNH: PHÂN LOẠI LINH KIỆN OK/NG DÂY CHUYỀN SẢN XUẤT

- **Mã bài:** `ai-cv-ok-ng-inspection`
- **Khóa học:** AI Engineer (Buổi 35)
- **Simulator đánh giá:** `cole.cv-ok-ng` (Renderer: `cv-grid@1`)

---

## 1. Bối cảnh bài toán doanh nghiệp

Trong dây chuyền sản xuất linh kiện vi mạch điện tử và cơ khí chính xác, camera quang học tốc độ cao chụp ảnh sản phẩm trước khi đưa vào khâu đóng gói hoàn thiện.

Một sản phẩm được phân loại là:
- **OK**: Đạt tiêu chuẩn chất lượng (bề mặt nhẵn bóng, không nứt rạn, kích thước đúng biên độ dung sai).
- **NG** (No Good): Phế phẩm có khuyết tật (nứt chân chim, vết xước sâu, mẻ góc, bọt khí hoặc biến dạng).

### Ma trận chi phí & Thiệt hại tài chính:
1. **Lọt hàng lỗi (False Negative - FN):** Hệ thống phân loại NG thành OK. Linh kiện lỗi bị chuyển tiếp sang dây chuyền sản xuất bo mạch tiếp theo, dẫn tới hỏng toàn bộ sản phẩm hoàn thiện.
   - **Tổn thất ước tính:** **500.000 VND / sản phẩm lỗi lọt lưới**.
2. **Loại nhầm hàng tốt (False Positive - FP):** Hệ thống phân loại OK thành NG. Hàng tốt bị gạt sang giỏ phế phẩm, cần kỹ thuật viên kiểm tra thủ công lại.
   - **Tổn thất ước tính:** **40.000 VND / sản phẩm loại nhầm**.

> **Mục tiêu ưu tiên:** Do tổn thất khi lọt lỗi gấp 12.5 lần chi phí loại nhầm, mô hình của bạn cần đặc biệt tối ưu hóa **Recall của lớp NG** và điểm số **F1-score**, tránh để xảy ra False Negative.

---

## 2. Yêu cầu sản phẩm nộp

Học viên phát triển giải pháp trong thư mục `solution/predict.py`.

### Hàm dự đoán:
```python
def predict(input_data: dict) -> dict:
    """
    Nhận thông tin/ảnh đầu vào và trả về dự đoán nhãn OK hoặc NG.
    
    Args:
        input_data: dict chứa thông tin sản phẩm hoặc ảnh kiểm tra.
        
    Returns:
        dict dạng:
        {
            "label": "OK" | "NG",       # Nhãn dự đoán
            "confidence": 0.85,         # Độ tin cậy (0.0 đến 1.0)
            "defect_type": "crack"      # Loại khuyết tật (tùy chọn)
        }
    """
```

---

## 3. Tiêu chí đạt

- **Recall lớp NG:** $\ge 85\%$
- **Precision lớp NG:** $\ge 85\%$
- **Thời gian xử lý trung bình (P50 latency):** $\le 100$ ms / mẫu
