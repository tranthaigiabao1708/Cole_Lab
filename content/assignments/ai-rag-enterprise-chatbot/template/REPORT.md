# Báo cáo Thiết kế Kiến trúc Trợ lý RAG Doanh nghiệp

## 1. Mục tiêu bài toán
Xây dựng giải pháp Hỏi - Đáp tự động (RAG) phục vụ tra cứu chính sách, quy chế nội bộ và quy trình hỗ trợ khách hàng của COLE CORP.

## 2. Kiến trúc giải pháp
- **Tài liệu nguồn:** Cẩm nang chính sách nội bộ `data/handbook.md`.
- **Chunking strategy:** Tách đoạn theo cấu trúc phân cấp markdown (mục chính và tiểu mục).
- **Retrieval:** Đối chiếu từ khóa ngữ nghĩa và vector index.
- **An toàn & Guardrails:**
  - Nhận diện và chặn các câu hỏi Prompt Injection / trích xuất system prompt.
  - Phân loại và từ chối lịch sự các câu hỏi ngoài phạm vi nghiệp vụ (out-of-scope).
  - Tuân thủ quy tắc bảo mật dữ liệu khách hàng tuyệt đối.
