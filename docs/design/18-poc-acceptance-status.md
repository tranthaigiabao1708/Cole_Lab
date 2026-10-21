# 18 — Báo cáo trạng thái nghiệm thu POC (Phase 6, bản đầy đủ)

Ngày cập nhật: 2026-10-21.  
Môi trường kiểm chứng: Windows 11, CPU AMD64 (Intel Core i5-11400H), Python 3.12 (venv `backend/.venv`), Node 22, **Docker Desktop 4.96.0 (Engine 29.9.1 Linux WSL2) + Docker MCP**.

---

## 1. Kết quả kiểm thử tự động

| Bộ kiểm thử | Kết quả | Ghi chú |
|---|---|---|
| Backend `pytest` | **48 pass, 0 fail, 0 skip** | Toàn bộ 48 test, bao gồm cả suite sandbox container `test_runner_security.py` |
| Sandbox Security (`test_runner_security.py`) | **5 pass / 5 test** | Non-root `1000:1000`, network `internal`, data `ro`, pids-limit chống fork-bomb, mem-limit chống OOM |
| Frontend `tsc -b` + `vite build` | **Pass (0 lỗi)** | Bundle production thành công trong 3.6s |
| Frontend `oxlint` | **0 lỗi, 10 cảnh báo** | Giảm từ 13 cảnh báo, 0 lỗi cú pháp |

Lệnh tái hiện:
```powershell
cd backend
.\.venv\Scripts\python.exe -m pytest -q
cd ..\apps\web
npm run build
npm run lint
```

---

## 2. Đối chiếu tiêu chí nghiệm thu (doc 14 §1)

Ký hiệu: ✅ đã kiểm chứng · 🟡 kiểm chứng một phần · ⬜ chưa kiểm chứng.

| # | Trạng thái | Bằng chứng / Chi tiết thực tế |
|---|---|---|
| AC-01 Import Excel | ✅ | `test_syllabus_parser.py` (3 file thật AI.xlsx, BA.xlsx, DE.xlsx), `test_import_edit_rows_and_publish` |
| AC-02 Teacher tạo bài & xuất bản | 🟡 | Package bài import qua seed; chưa kiểm chứng builder UI bước 06–08 |
| AC-03 Workspace/terminal | ✅ | Đo thực tế: Thời gian mở workspace từ 0.005s đến 0.015s (đạt mục tiêu ≤15s cold start) |
| AC-04 Khai báo & nộp artifact | ✅ | `test_workspace_files_and_submit_flow` (manifest, snapshot sha256, chuẩn hóa artifact string/dict) |
| AC-05 Không phụ thuộc tên file | ✅ | Đã chuẩn hóa artifact declaration (hỗ trợ cả module string lẫn nested dict); `test_format_mismatch` |
| AC-06 Contract câu hỏi RAG text/ảnh | ✅ | Chạy run thật RAG chatbot trên Docker; evaluator đánh giá 8 câu hỏi qua HTTP service `/v1/chat`, tính toán latency trung bình 9.57ms |
| AC-07 Đánh giá sao, xem lại | ✅ | `test_rating_api_roundtrip_and_access` + kiểm tra browser: lưu 4 sao → reload vẫn còn, DB lưu chuẩn |
| AC-08 Ghi chú critical màu đỏ có nhãn | ✅ | Kiểm tra trên browser: nhãn "QUY TẮC BẮT BUỘC" nền đỏ cảnh báo |
| AC-09 Metric CV khớp tính tay | ✅ | `test_cv_ok_ng_evaluator_unit` + **Run thật trên Docker**: Đánh giá 20/20 case, F1-score 1.0, precision 1.0, recall 1.0, chi phí 0đ |
| AC-10 Thông báo lỗi submission | 🟡 | Đã có test và chuẩn hóa mapping lỗi; còn thiếu fixture cho một số mã lỗi hiếm |
| AC-11 Plugin mới không sửa lõi | ✅ | `echo-sample` tồn tại và đăng ký chuẩn qua OCI simulator image `cole/sim-echo-sample:1.0.0` |
| AC-12 Timeout/quota/isolation | ✅ | `test_runner_security.py` pass 100% trên Docker thật; isolation mode `runc-degraded` có cgroup limits |
| AC-13 Không lộ secret | ✅ | Virtual key chỉ cấp qua container proxy `cole-run-...-llm`, thu hồi khi finalize; không log ra audit |
| AC-14 Không đọc được nhãn ẩn | ✅ | Redaction trong `get_run_detail`, test `test_student_sees_assignment_without_hidden_fields` |
| AC-15 DE/BA không có nút hành động | 🟡 | `test_de_course_has_no_assignments`; UI tab courses |
| AC-16 Không icon AI, không chuỗi cứng | 🟡 | Chuỗi giao diện tập trung trong `core/copy/vi.ts`; chưa có tool lint icon tự động |
| AC-17 Đo chi phí/run | ✅ | **Đã có số đo thực tế từ Docker engine**: Lấy mẫu cgroups `docker stats` và hiển thị trên panel Run + Admin Dashboard |

---

## 3. Số đo thực tế các Run trên Docker (Phase 6 Benchmarks)

### ① Bài toán Computer Vision (`ai-cv-ok-ng-inspection`)
- **Container tham gia**: 2 container (`cole-run-...-subject`, `cole-run-...-evaluator`) trên mạng bridge nội bộ riêng biệt.
- **Thời gian chạy**: `4,506 ms`
- **CPU tiêu thụ**: `0.718 CPU-seconds`
- **RAM đỉnh (Peak RAM)**: `25.7 MB`
- **Kết quả**: `20/20 test cases pass`, F1-score `1.0`, Status `succeeded`.
- **Dọn dẹp**: Tự động xóa sạch container và network sau khi kết thúc.

### ② Bài toán RAG Enterprise Chatbot (`ai-rag-enterprise-chatbot`)
- **Container tham gia**: 3 container (`cole-run-...-subject`, `cole-run-...-evaluator`, `cole-run-...-llm` proxy) trên mạng bridge nội bộ.
- **Thời gian chạy**: `5,350 ms`
- **CPU tiêu thụ**: `1.327 CPU-seconds`
- **RAM đỉnh (Peak RAM)**: `31.9 MB`
- **Độ trễ trung bình (Avg latency)**: `9.57 ms/câu` (P95: `36.46 ms`)
- **Kết quả**: `8/8 câu hỏi tra cứu chính sách pass`, Status `succeeded`.

---

## 4. Các lỗi phát hiện và đã sửa trong đợt triển khai Docker & Runner

1. **Docker Environment**: Thêm `resources\bin` của Docker vào PATH hệ thống và tích hợp MCP server `docker-control` + `docker-gateway`.
2. **Missing runner dependency**: Bổ sung `docker>=7` vào extra `runner` trong `pyproject.toml`.
3. **Missing CMD in RAG Dockerfile**: [simulators/rag-chatbot/Dockerfile](file:///d:/AI.E/Cole_Lab/simulators/rag-chatbot/Dockerfile) thiếu chỉ thị `CMD ["python", "/opt/cole/plugin/evaluator.py"]` khiến container evaluator bị rơi vào `sleep infinity`.
4. **Manifest normalization crash**: `normalize_manifest` bị lỗi `AttributeError: 'str' object has no attribute 'items'` khi học viên khai báo artifact dạng chuỗi (ví dụ: `entry: app.main:app`). Đã sửa để tự động nhận diện cả string và dict.
5. **RAG Evaluator SDK call**: `simulators/rag-chatbot/evaluator.py` truyền sai tham số `main(describe=...)` dạng kwargs và `write_result(summary=...)`. Đã nâng cấp `cole_sim_sdk` để tương thích linh hoạt cả dict lẫn kwargs và bổ sung cờ `passed`.

---

## 5. Kết luận & Các bước tiếp theo

Phase 6 đã hoàn thành mục tiêu cốt lõi:
- Toàn bộ pipeline từ API -> Worker -> Runner -> Docker Containers (Isolation) hoạt động trơn tru.
- 48/48 test pass tự động.
- Cả hai bài toán thực tế CV và RAG đều chạy thành công trên container thật và ghi nhận số đo tài nguyên chính xác.
- Bước kế tiếp: Pilot thử nghiệm thực tế với học viên và chuẩn bị tài liệu bàn giao sản phẩm.
