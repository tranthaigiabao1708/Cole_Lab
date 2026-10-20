# Chuẩn hóa văn bản đầu vào

Bài mẫu dùng để kiểm tra toàn bộ luồng của nền tảng: workspace → khai báo sản phẩm → nộp bài → simulator → kết quả.

## Yêu cầu

Viết hàm `predict(input: dict) -> dict` trong `solution/normalize.py`.

- Đầu vào: `{"text": "<chuỗi bất kỳ>"}`
- Đầu ra: `{"text": "<chuỗi đã chuẩn hóa>"}`

Quy tắc chuẩn hóa:

1. Chuẩn hóa Unicode về dạng NFC (tiếng Việt có dấu tổ hợp phải về dạng dựng sẵn).
2. Chuyển về chữ thường.
3. Gộp mọi chuỗi khoảng trắng liên tiếp (dấu cách, tab, xuống dòng) thành một dấu cách.
4. Bỏ khoảng trắng ở đầu và cuối.

## Chạy thử trong workspace

```bash
python run_local.py
```

Script đọc `data/samples.jsonl` (chỉ đọc) và so sánh kết quả của bạn với đáp án mẫu.

## Sản phẩm cần nộp

| Khóa | Loại | Bắt buộc |
|---|---|---|
| `entry` | Hàm Python `solution.normalize:predict` | Có |
| `report` | Tệp `REPORT.md` | Không |

Bộ kiểm thử ẩn có nhiều trường hợp hơn bộ mẫu.
