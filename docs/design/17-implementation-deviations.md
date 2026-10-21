# 17. Nhật ký sai lệch khi triển khai POC

Tài liệu này ghi lại **trung thực** những điểm mà mã nguồn POC khác với thiết kế ở `00–16`. Mỗi mục có lý do và hướng xử lý. Cập nhật sau mỗi phase.

| # | Phase | Thiết kế | Thực tế trong POC | Lý do | Hướng xử lý |
|---|---|---|---|---|---|
| D1 | 0 | Package backend `app/` (doc 07) | Package `cole_platform` trong `backend/src/` | Tránh trùng tên chung chung khi cài editable | Giữ nguyên; doc 07 coi như đổi tên |
| D2 | 0 | PostgreSQL (doc 08, ADR 0006) | SQLite (`var/cole.db`) qua SQLAlchemy | Máy dev không có Docker Compose Postgres ổn định khi khởi động lại; schema giữ trung lập để chuyển sang Postgres | Chuyển sang Postgres khi dựng môi trường dùng chung |
| D3 | 2 | Bảng `DatasetVersion` (doc 08) | Dataset lưu thành thư mục content-addressed `var/datasets/<sha>`; metadata nằm ở `AssignmentVersion.dataset_sha/dataset_info` | Đơn giản hơn cho POC; vẫn bất biến theo sha | Tách bảng khi cần chia sẻ một dataset cho nhiều bài |
| D4 | 2 | gVisor (`runsc`) cho mọi container (ADR 0005) | Docker Desktop Windows không có `runsc` → chạy `runc`, runner trả cờ `ISOLATION_DEGRADED`, IDE hiện nhãn cảnh báo | Hạn chế của môi trường dev | Bắt buộc `runsc` trên máy chủ Linux; runner tự chọn khi có |
| D5 | 2 | Workspace ra Internet qua egress proxy có allowlist (doc 11) | Workspace `network_mode=none`, không có mạng | Egress proxy chưa làm; chặn hoàn toàn là phương án an toàn hơn | Backlog: proxy allowlist (PyPI mirror) |
| D6 | 2 | — | Thư viện cần cho bài được cài sẵn trong image `cole/python-cpu` (numpy, pillow, onnx, onnxruntime, scikit-learn, fastapi, rank-bm25…) | Hệ quả của D5 | Như D5 |
| D7 | 5 | Gateway LLM gọi nhà cung cấp thật | Provider mặc định là `mock` (tất định); cấu hình OpenAI-compatible qua biến môi trường | Không có khóa API trong môi trường dev | Bật bằng `COLE_LLM_PROVIDER=openai` |
| D8 | 2 | Monaco/xterm | Monaco được đóng gói cục bộ (không CDN), worker build bằng Vite; chunk IDE ~1,6 MB + editor.api ~2,7 MB (chỉ tải khi mở workspace) | Chạy offline được | Có thể cắt bớt ngôn ngữ Monaco sau |
| D9 | 2 | Trình soạn thảo đồng bộ với tệp | Tab "sạch" được đọc lại từ đĩa mỗi 6 giây và khi cửa sổ được focus; tab đang sửa dở không bị ghi đè | Không có file-watcher đẩy sự kiện | Backlog: đẩy sự kiện thay đổi tệp qua WebSocket |
| D10 | 3 | Hàng đợi tác vụ (doc 02, doc 08) | Queue chạy qua DB-polling loop trong `main_worker.py` (SELECT queued → claim → execute → UPDATE) | Giảm thiểu phụ thuộc hạ tầng ngoài (Redis/Valkey/RabbitMQ) cho môi trường POC local | Chuyển sang Arq/Valkey khi scale nhiều worker |
| D11 | 3 | Giao vận container chấm bài | Simulator container và Subject container giao tiếp qua mạng nội bộ Docker không Internet (`network_mode=none`), trao đổi dữ liệu qua thư mục exchange `var/exchange/<run_id>` | Bảo mật tuyệt đối, ngăn rò rỉ đề/kết quả bài thi | Giữ nguyên kiến trúc chuẩn |
| D12 | 3 | Quản lý container runtime | Runner agent trên Windows kết nối Docker daemon qua named pipe nội bộ của Docker Desktop | Tránh mở cổng TCP Docker không an toàn trên host | Trên Linux server production dùng unix socket `/var/run/docker.sock` |
| D13 | 4 | Simulator CV OK/NG | Evaluator tính toán ma trận nhầm lẫn 2x2 (TN/FP/FN/TP) và quy đổi rủi ro tài chính trực tiếp: `total_cost = fn * 500.000 + fp * 40.000` VNĐ | Đảm bảo tính ứng dụng doanh nghiệp thực tế theo đề bài đào tạo | Giữ nguyên cho mọi simulator sản xuất |
| D14 | 4 | Frontend Renderer `cv-grid@1` | Banner rủi ro tài chính nổi bật, ma trận nhầm lẫn tương tác lọc test case khi click | Nâng cao trải nghiệm học viên khi phân tích kết quả mô hình | Chuẩn hóa vào Design System cho các bài toán phân loại |
| D15 | 5 | LLM Gateway & Virtual Keys | Triển khai virtual API key tự sinh theo run/workspace kèm hard budget ($0.50); hỗ trợ mock provider tất định cho dev local không cần internet/key ngoài | Đảm bảo hệ thống POC chạy offline/local ổn định | Bật provider ngoài qua `COLE_LLM_PROVIDER=openai` |
| D16 | 5 | Đánh giá RAG Chatbot | Cơ chế kết hợp: Simulator chạy tự động 8 tình huống kiểm tra (đo latency, guardrails, ảnh multimodal inline base64) và UI hỗ trợ `<RatingControl>` 1–5 sao cho học viên tự đánh giá lưu DB | Tối ưu sư phạm theo tài liệu doc 09 §A | Sẵn sàng mở rộng LLM-as-judge sau POC |
| D17 | 6 | `Run.cost` jsonb với `cpu_seconds`, `peak_mem_mb` từ cgroup (doc 13 §2) | Runner lấy mẫu `docker stats` mỗi ~2s khi chờ evaluator → `cpu_seconds` là **xấp xỉ** (thiếu phần sau mẫu cuối). Có thêm `reserved_vcpu_seconds = thời gian × giới hạn CPU` làm cơ sở tính tiền | Docker không trả stats cho container đã dừng | Production: đọc trực tiếp `cpu.stat` của cgroup trước khi xóa container |
| D18 | 6 | Chi phí quy ra tiền theo đơn giá cloud | Đơn giá mặc định = 0 (`COLE_PRICE_VCPU_HOUR_USD`, `COLE_PRICE_GB_RAM_HOUR_USD`); khi chưa cấu hình, `compute_cost_usd = null` và UI ghi rõ "chưa cấu hình đơn giá". Đơn giá token LLM là hằng số mock trong gateway | Doc 13 §3 cấm áp đơn giá trước khi chốt Q-02/Q-03 | Điền đơn giá sau khi chọn cloud/LLM provider |
| D19 | 6 | Migration bằng Alembic (doc 08) | `init_db()` tự `ADD COLUMN` cho cột nullable mới trên SQLite dev; không xóa/sửa cột | Không có Alembic trong POC; tránh phải reset DB dev khi thêm cột | Bắt buộc Alembic khi chuyển Postgres (D2) |
| D20 | 6 | Worker crash → run ERROR sau "timeout giám sát" (doc 14 §4) | Worker quét mỗi 30s: run ở `preparing/running/evaluating` quá `timeout_s + 60 + 180s` → `error/WORKER_LOST`, thu hồi virtual key, gọi runner cancel (best-effort), ghi audit `run.recovered` | Queue DB-polling (D10) không có lease/heartbeat | Khi chuyển Arq/Valkey: dùng lease + heartbeat thay cho ngưỡng thời gian |

## Lỗi phát hiện và sửa trong Phase 6

Các lỗi dưới đây có từ Phase 3–5 nhưng không bị test phát hiện vì test Phase 5 chỉ gọi tầng service, không đi qua HTTP.

| # | Lỗi | Hậu quả | Sửa |
|---|---|---|---|
| F1 | `evaluations/api.py` import `get_current_user`, `UserAccount` (không tồn tại); `main_api.py` bọc import trong `try/except ImportError: pass` | **Router đánh giá sao và LLM gateway không được mount** → UI lưu đánh giá nhận 404 (lỗi chỉ ghi `console.error`), container không gọi được gateway | Sửa import; bỏ `try/except` để lỗi import làm API dừng ngay khi khởi động; UI hiển thị lỗi lưu đánh giá |
| F2 | Gateway/evaluations gọi `AppError("CODE", msg, status_code=…)` sai chữ ký `AppError(status, code, message)`; API đọc `e.code`/`e.message` không tồn tại | Khóa sai / vượt ngân sách / sao ngoài 1–5 → HTTP 500 thay vì 401/429/400 | Sửa chữ ký; để `AppError` (là `HTTPException`) tự trả lỗi |
| F3 | Orchestrator truyền `key = "run_<id>"` cho LLM proxy, không tạo virtual key | Mọi lời gọi LLM trong run thật bị 401; ngân sách/run không có hiệu lực | Tạo virtual key thật theo run, ngân sách lấy từ `profile.llm_budget_per_run_usd`; thu hồi khi run kết thúc (kể cả khi lỗi) |
| F4 | Runner chạy `/opt/cole/llmproxy.py` nhưng file không tồn tại trong image | Container proxy thoát ngay | Thêm `runtime/images/python-cpu/llmproxy.py` (stdlib), thay header Authorization bằng key của run; chỉ chuyển tiếp `/v1/*`. **Cần build lại image `cole/python-cpu`** |
| F5 | Subject không được biết địa chỉ LLM | App học viên không có đường gọi LLM | Runner đặt `COLE_LLM_URL`/`OPENAI_BASE_URL=http://llm:8081/v1` cho subject; key thật chỉ nằm ở container proxy |
| F6 | Session `expire_on_commit=False` → `execute_run` đọc trạng thái cũ; hủy run lúc đang chạy có thể bị ghi đè thành `succeeded` | Hủy không có tác dụng trên kết quả | Đọc lại `status/cancel_requested_at` từ DB trước khi gọi runner và khi xử lý kết quả |
| F7 | `audit("run.cancel")` gọi sau `commit` cuối, không commit | Mất nhật ký hủy run | `commit=True` |
| F8 | `tarfile.extractall` không filter với snapshot bài nộp (nội dung do học viên kiểm soát) | Rủi ro path traversal/symlink (doc 14 §3 zip slip) | `filter="data"` |

## Kiểm chứng bảo mật đã chạy (Phase 2)

`backend/tests/integration/test_runner_security.py` chạy trên Docker thật (tự bỏ qua nếu không có Docker):

- Chạy với uid 1000, `CapEff = 0`.
- Không mở được kết nối mạng ra ngoài; `NetworkMode = none`.
- `/workspace/data` chỉ đọc; `/workspace` ghi được.
- Fork bomb bị giới hạn bởi `pids_limit`; container hồi phục sau đó.
- Cấp phát 600 MB khi giới hạn 256 MB → tiến trình bị kill, container vẫn sống.
