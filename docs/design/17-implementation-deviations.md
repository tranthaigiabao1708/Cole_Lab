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

## Kiểm chứng bảo mật đã chạy (Phase 2)

`backend/tests/integration/test_runner_security.py` chạy trên Docker thật (tự bỏ qua nếu không có Docker):

- Chạy với uid 1000, `CapEff = 0`.
- Không mở được kết nối mạng ra ngoài; `NetworkMode = none`.
- `/workspace/data` chỉ đọc; `/workspace` ghi được.
- Fork bomb bị giới hạn bởi `pids_limit`; container hồi phục sau đó.
- Cấp phát 600 MB khi giới hạn 256 MB → tiến trình bị kill, container vẫn sống.
