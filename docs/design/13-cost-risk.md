# 13 — Chi phí, rủi ro và giảm thiểu

## 1. Nhóm chi phí

| Nhóm | Thành phần | Động lực chi phí |
|---|---|---|
| Control plane | VM API/worker, Postgres (managed), Redis/Valkey | Gần như cố định ở quy mô POC |
| Sandbox compute | VM chạy workspace + run (CPU/RAM) | **Số workspace đồng thời ở giờ cao điểm**, số run |
| GPU | Không có trong POC | Chỉ khi có bài yêu cầu (train/inference GPU) |
| Lưu trữ | Object storage (dataset, snapshot, model, log), volume workspace, backup DB | Số học viên × số lần nộp × kích thước model |
| Băng thông | Egress từ storage tới trình duyệt (ảnh, tải file), PyPI mirror | Kích thước dataset hiển thị, tải về |
| LLM | Token prompt/completion qua gateway | Số câu hỏi × số run × token/câu + sử dụng trong lúc phát triển |
| Embedding/rerank | Nếu dùng API; nếu CPU trong container → chuyển thành compute | Lựa chọn của bài |
| Observability | Lưu log/metric, retention | Volume log, retention ngày |
| Vận hành | Người trực, cập nhật image, xử lý sự cố | Mức tự động hóa |

## 2. Công thức

Ký hiệu đơn giá (điền theo báo giá cloud thực tế): `P_vcpu_h`, `P_gb_ram_h` (hoặc `P_vm_h` cho một loại VM), `P_storage_gb_month`, `P_egress_gb`, `P_tok_in`, `P_tok_out` (mỗi 1M token).

**Sandbox compute (sizing theo đỉnh):**
```
Workspace_đồng_thời = Học_viên × Tỷ_lệ_online_đỉnh
RAM_cần = (Workspace_đồng_thời × RAM_ws + Run_đồng_thời × (RAM_subject + RAM_eval)) / (1 − dự_phòng)
Số_VM = ceil(RAM_cần / RAM_mỗi_VM)
Chi_phí_sandbox_tháng = Số_VM × P_vm_h × giờ_chạy_tháng
```
(Nếu tự động bật/tắt VM theo lịch học, `giờ_chạy_tháng` giảm đáng kể.)

**LLM (RAG):**
```
Token_run = Số_câu × (token_in_tb + token_out_tb)
Chi_phí_LLM_tháng = (Run_tháng × Token_run + Token_phát_triển_tháng) × đơn_giá_token
Token_phát_triển_tháng ≈ k × Run_tháng × Token_run      (k: hệ số thử nghiệm trong workspace, giả định 2–4)
```

**Lưu trữ:**
```
Storage = Học_viên × (Workspace_tb + Số_lần_nộp × Kích_thước_submission_tb) + Dataset_chung + Log
```

**Chi phí trên mỗi run (đo thực tế ở Phase 6):**
```
Cost_run = vCPU_giây_run × P_vcpu_s + GB_RAM_giây × P_ram_s + Token_gateway × P_tok + Storage_run × P_storage
```
Mỗi `Run` lưu `cost` (jsonb): `cpu_seconds`, `peak_mem_mb`, `llm_tokens_in/out`, `output_bytes` — từ cgroup stats của runner và usage của gateway. Tổng hợp theo assignment/khóa học trong dashboard.

**Đã triển khai (Phase 6):** `Run.cost` gồm `duration_ms`, `cpu_seconds` (lấy mẫu, xấp xỉ — xem [17 D17](17-implementation-deviations.md)), `reserved_vcpu_seconds`, `peak_mem_mb`, `llm_requests`, `llm_tokens_in/out`, `llm_cost_usd`, `output_bytes`, `compute_cost_usd`, `total_cost_usd`. Hiển thị ở tab "Chỉ số" của trang kết quả và trang Admin → Chi phí (`GET /api/admin/runs/cost-summary`). Đơn giá cấu hình qua `COLE_PRICE_VCPU_HOUR_USD`, `COLE_PRICE_GB_RAM_HOUR_USD`; mặc định 0 = chưa cấu hình. **Chưa có số đo thực tế**: cần chạy run CV/RAG trên máy có Docker và ghi kết quả vào §3.

## 3. Kịch bản tài nguyên **[GIẢ ĐỊNH — dùng để sizing, chưa phải báo giá]**

Giả định chung: workspace 1 vCPU/2 GB; run CV ~1 vCPU-phút; run RAG ~3 vCPU-phút + 20 câu × (2.000 in + 300 out) token = **46k token/run**; mỗi học viên 5 run/tuần/bài trong giai đoạn học module; dự phòng RAM 20%; k = 3.

| Chỉ số | Thấp | Vừa | Cao |
|---|---|---|---|
| Học viên hoạt động | 30 | 150 | 500 |
| Tỷ lệ online đỉnh | 50% | 30% | 20% |
| Workspace đồng thời | 15 | 45 | 100 |
| Run đồng thời (đỉnh) | 3 | 8 | 20 |
| RAM sandbox cần | ~53 GB | ~153 GB | ~350 GB |
| Ví dụ số VM 64 GB RAM | 1 | 3 | 6 |
| Run RAG/tháng | ~645 | ~3.200 | ~10.750 |
| Token LLM/tháng (run + phát triển, k=3) | ~120M | ~590M | ~2B |
| Lưu trữ (≈1.5 GB/học viên + 20 GB chung) | ~65 GB | ~245 GB | ~770 GB |

Tiền = các con số trên × đơn giá đã chọn ở Phase 0. **Không** áp đơn giá ở đây vì chưa chốt cloud và LLM provider (Q-02, Q-03). Lưu ý: LLM thường là khoản biến động lớn nhất → ngân sách theo học viên/ngày tại gateway là biện pháp kiểm soát chính; model nhỏ/rẻ cho phát triển, model chuẩn cho run chính thức.

## 4. Rủi ro và giảm thiểu

| # | Rủi ro | Khả năng | Tác động | Giảm thiểu | Phase |
|---|---|---|---|---|---|
| R1 | Sandbox escape / lạm dụng tài nguyên | Thấp–TB | Rất cao | gVisor, host riêng, non-root, quota, egress allowlist, escape suite trong CI | P0–P2 |
| R2 | Chi phí LLM vượt kiểm soát | TB | Cao | Gateway + ngân sách cứng; cảnh báo 80%; cache phản hồi theo câu hỏi trong phát triển | P5 |
| R3 | Lộ nhãn chuẩn/test ẩn | TB | Cao | Bucket answer_key, chỉ evaluator mount; test tự động; serializer theo vai trò | P3–P4 |
| R4 | Contract plugin thay đổi nhiều → plugin vỡ | Cao (giai đoạn đầu) | TB | `v1-beta` đến hết P5; golden tests; compat matrix | P3–P5 |
| R5 | Team xây IDE quá đà | TB | TB | Phạm vi IDE cố định ở [05 §2](05-build-vs-buy-ide-runtime.md); OpenVSCode là phương án dự phòng | P2 |
| R6 | Hiệu năng gVisor kém cho `pip install`/I/O | TB | TB | Đo ở P0; cache wheel; image nền có sẵn gói phổ biến của bài | P0–P2 |
| R7 | Học viên khó export ONNX đúng | Cao | TB | Tài liệu, template script export, mã lỗi cụ thể, chế độ `python_impl` | P4 |
| R8 | Đề cương Excel tương lai khác bố cục | Cao | Thấp | Mapping profile + phân loại hàng chỉnh tay | P1 |
| R9 | Phạm vi DE/BA bị kéo vào POC | TB | Cao | Non-goals văn bản hóa ([03](03-poc-scope-non-goals.md)); StatusBlock không nút | Toàn bộ |
| R10 | Ứng dụng RAG học viên quá nặng (vector DB, model lớn) | TB | TB | Giới hạn image size/RAM; template khuyến nghị FAISS/Chroma nhúng + embedding nhỏ; startup timeout rõ | P5 |
| R11 | Prompt injection từ tài liệu/câu hỏi khiến app học viên gọi ra ngoài | TB | TB | Subject chỉ tới gateway, không internet | P5 |
| R12 | Giấy phép thành phần (MinIO AGPL, Redis, LiteLLM enterprise) | TB | TB | Rà soát pháp chế ở P0; phương án thay thế đã liệt kê | P0 |
| R13 | Nhân sự DevOps 0.5 FTE không đủ | TB | Cao | Hạ tầng tối giản (Compose + 2 VM); runbook; ưu tiên dịch vụ managed (DB, storage) | P0–P2 |
| R14 | Font/thiết kế không hỗ trợ tiếng Việt tốt | Thấp | TB | Kiểm tra subset ở P0; Be Vietnam Pro là lựa chọn an toàn | P0–P1 |
