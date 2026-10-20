# 01 — Executive Summary

## Sản phẩm

Một **nền tảng đào tạo thực hành theo bài toán doanh nghiệp**: học viên nhận một bài toán có dữ liệu, template dự án và tiêu chí nghiệm thu; xây sản phẩm trong workspace trên web; khai báo artifact theo contract; và để **simulator** của bài đó kiểm chứng sản phẩm trong môi trường cô lập.

Thiết kế phục vụ ba nhóm khóa học (AI Engineer, Data Engineer, Business Analyst) trên **một lõi chung**. POC chỉ triển khai luồng thực thi cho **AI Engineer**, với hai simulator: **RAG Chatbot doanh nghiệp** và **Computer Vision OK/NG**.

## Năm quyết định kiến trúc then chốt **[ĐỀ XUẤT]**

1. **Modular monolith + runner tách biệt.** Một backend (Python/FastAPI, PostgreSQL, object storage S3-compatible) chứa toàn bộ nghiệp vụ. Mọi code không tin cậy — code học viên *và* plugin simulator — chạy trên **sandbox host riêng** qua một runner, trong container có gVisor, không bao giờ trong tiến trình backend.
2. **Simulator là plugin dạng container image + manifest**, giao tiếp với lõi qua contract file/JSON-lines có version (`simulator.v1`). Lõi không import code plugin. Thêm simulator mới = thêm image + manifest + (tùy chọn) UI renderer; không sửa lõi.
3. **Submission dựa trên manifest, không dò tên file.** Template của giảng viên có quy ước mặc định; học viên xác nhận/chọn artifact qua UI, hệ thống sinh `submission.manifest.yaml`, kiểm tra bằng JSON Schema và bằng bước `validate-submission` của plugin trước khi chạy.
4. **Web IDE tự lắp ghép từ Monaco + xterm.js**, nối với container workspace qua một workspace-agent. Lý do: cần tích hợp chặt bảng khai báo artifact, simulator và ngôn ngữ thiết kế riêng. OpenVSCode Server là phương án dự phòng, được spike ở Phase 0.
5. **Tách dữ liệu chuẩn khỏi sản phẩm học viên ngay từ POC.** Nhãn chuẩn và tiêu chí chấm chỉ nằm trong container evaluator của plugin; code học viên chạy trong container "subject" riêng, không có internet, chỉ thấy input.

## Phạm vi POC

| Hạng mục | POC |
|---|---|
| UI AI/DE/BA | Đủ điều hướng cho cả ba; DE/BA hiển thị đề cương thật (import từ Excel) và trạng thái "Chưa triển khai" rõ ràng, không có nút giả |
| Workspace | File tree, tab, editor, terminal, chạy Python CPU, lưu workspace |
| Simulator | RAG Chatbot (text + ảnh, đánh giá 1–5 sao thủ công), CV OK/NG (ONNX + Python entrypoint, metric FP/FN/precision/recall/F1) |
| Mở rộng | Một plugin mẫu thứ ba (`echo-sample`) chứng minh thêm simulator không sửa lõi |
| Bảo mật | Sandbox, quota, timeout, chặn mạng, LLM gateway thay cho API key thật, audit log |

## Kế hoạch & effort **[GIẢ ĐỊNH: team 4–5 người]**

7 phase (0–6), tổng **~165–230 người-ngày**, tương đương **11–14 tuần lịch**. Đề xuất đổi thứ tự: làm **CV OK/NG (ONNX) trước RAG**, vì luồng ONNX không cần chạy code học viên hay gọi LLM, nên kiểm chứng plugin lifecycle với rủi ro thấp nhất; RAG theo sau khi đã có LLM gateway và kiểm soát egress. Chi tiết ở [12](12-phased-plan.md).

## Cần team xác nhận trước khi code (chặn Phase 1)

Xem đầy đủ ở [15](15-architecture-decisions.md). Năm mục chặn nhất:

1. Stack backend Python/FastAPI (so với Node/NestJS).
2. Hạ tầng POC: một VM sandbox riêng chạy Docker + gVisor (so với Kubernetes ngay từ đầu).
3. Web IDE: Monaco tự lắp (so với nhúng OpenVSCode Server).
4. RAG: chế độ ứng dụng chạy trong runtime của nền tảng là chính; chế độ endpoint bên ngoài có đưa vào POC hay không.
5. LLM provider và ngân sách token cho POC.
