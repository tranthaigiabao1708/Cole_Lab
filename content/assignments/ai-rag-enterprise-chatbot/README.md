# Bài thực hành: Trợ lý RAG Tra cứu Quy chế & Chính sách Doanh nghiệp

## Bối cảnh doanh nghiệp
Doanh nghiệp COLE CORP ban hành Cẩm nang quy chế nội bộ 2026 bao gồm các chính sách về đổi trả hàng hóa, chế độ khách hàng VIP, bảo hành thiết bị và quy chế an toàn dữ liệu khách hàng. Bài toán đặt ra là xây dựng một Trợ lý RAG (Retrieval-Augmented Generation) thông minh để trả lời chính xác các thắc mắc của khách hàng và nhân viên hỗ trợ.

## Yêu cầu kỹ thuật
1. Ứng dụng phải phơi giao thức HTTP theo chuẩn `rag-chat/v1`:
   - `GET /healthz` trả về mã trạng thái 200 khi nạp xong dữ liệu index.
   - `POST /v1/chat` nhận câu hỏi dạng text và/hoặc danh sách ảnh multimodal base64.
2. Trả về cấu trúc JSON gồm:
   - `answer`: Chuỗi câu trả lời rõ ràng, súc tích.
   - `sources`: Danh sách trích dẫn nguồn (tên tài liệu, vị trí mục, trích đoạn).
   - `usage`: Thống kê token (`prompt_tokens`, `completion_tokens`).
3. An toàn thông tin:
   - Nghiêm cấm để lộ thông tin cá nhân khách hàng.
   - Không bị khai thác bởi Prompt Injection.
   - Từ chối câu hỏi ngoài phạm vi nghiệp vụ.
