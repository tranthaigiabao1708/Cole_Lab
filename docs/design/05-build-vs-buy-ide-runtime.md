# 05 — Build-vs-Buy: Web IDE, Runtime và lựa chọn công nghệ

> Thông tin giấy phép dưới đây là hiểu biết tại thời điểm viết; **phải được pháp chế/tech lead kiểm tra lại** trước khi chốt (đánh dấu ⚠ ở những chỗ dễ thay đổi).

## 1. Tách bạch hai bài toán

| Bài toán | Câu hỏi | Ví dụ công nghệ |
|---|---|---|
| **Editor/IDE UI** (trình duyệt) | Học viên nhìn và sửa code thế nào? | Monaco, CodeMirror, VS Code web, JupyterLab |
| **Môi trường thực thi** (server) | Code chạy ở đâu, an toàn ra sao? | Container + gVisor, Kata, Firecracker, sandbox SaaS |

Một editor tốt **không** cho ta runtime. Pyodide/WebAssembly chạy Python trong trình duyệt nhưng không chạy được PyTorch đầy đủ, không có GPU, không kiểm soát được tài nguyên và không dùng được cho evaluation đáng tin cậy → **loại khỏi vai trò runtime chính**; có thể dùng sau này cho bài tập nhập môn Python.

## 2. Phương án Web IDE

| Phương án | Mô tả | Ưu | Nhược | Giấy phép | Effort tích hợp POC |
|---|---|---|---|---|---|
| **A. Tự lắp: Monaco + xterm.js + workspace-agent** | React shell tự xây: file tree, tabs, Monaco, terminal xterm.js qua WebSocket tới PTY trong container | Tích hợp chặt với bảng artifact, simulator, design system; kiểm soát tính năng (không extension tùy ý); container nhẹ | Phải tự làm tìm kiếm toàn workspace, quản lý tab, xung đột lưu; không có LSP sẵn | Monaco MIT, xterm.js MIT | **18–25 người-ngày** (FE 12–16, agent 6–9) |
| **B. Nhúng OpenVSCode Server / code-server** | Mỗi workspace container chạy VS Code server, nhúng qua iframe sau reverse proxy có auth | IDE đầy đủ ngay (search, git UI, debugger); quen thuộc với học viên | Nặng (thường vài trăm MB RAM/phiên ⚠ cần đo); khó đồng bộ ngôn ngữ thiết kế; extension là bề mặt tấn công; tích hợp artifact/simulator qua panel ngoài iframe; không dùng được VS Code Marketplace (điều khoản chỉ cho sản phẩm Microsoft) → phải dùng Open VSX | OpenVSCode Server MIT, code-server MIT | **10–15 người-ngày** (proxy, auth, cấu hình, khóa extension) |
| C. Eclipse Theia | Framework IDE có thể tùy biến sâu | Tùy biến được như sản phẩm riêng | Đường cong học lớn, build phức tạp | EPL-2.0 | 30+ |
| D. JupyterLab | Notebook-first | Khớp đề cương dùng Colab | Không phải trải nghiệm "IDE dự án"; không hợp bài RAG chạy app | BSD-3 | 8–12 (riêng notebook) |
| E. Nền tảng CDE (Coder, Daytona, Gitpod self-host) | Hệ thống workspace hoàn chỉnh | Quản lý vòng đời workspace sẵn | Thêm một hệ thống lớn để vận hành; AGPL ⚠ với một số sản phẩm; chồng lấn với lõi ta cần làm | Coder AGPL-3.0 ⚠, Daytona ⚠ | 15–25 + chi phí vận hành |
| F. Sandbox SaaS (E2B, Codespaces…) | Gọi API để có sandbox | Không phải vận hành hạ tầng sandbox | Phụ thuộc nhà cung cấp, dữ liệu học viên rời hệ thống, chi phí theo phút ⚠ | Thương mại | 8–12 |

### Khuyến nghị **[ĐỀ XUẤT]**
- **Phương án chính: A.** Lý do quyết định: workspace là nơi học viên khai báo artifact và chạy simulator — cần là *một phần* của sản phẩm, không phải iframe ngoại lai. Phạm vi tính năng IDE trong POC (cây, tab, tìm kiếm, terminal) nằm trong khả năng của Monaco + xterm.js.
- **Phương án thay thế: B**, giữ sẵn như *runtime profile* `vscode` (cùng container image, thêm tiến trình server). Phase 0 làm spike 2 ngày cho cả A và B, đo RAM/phiên và thời gian khởi động, rồi chốt.
- **Mở rộng sau:** D cho bài notebook (profile `jupyter`), LSP qua `monaco-languageclient` + pyright chạy trong container.

### Phạm vi tính năng IDE theo giai đoạn

| Tính năng | POC | Sau POC |
|---|---|---|
| File tree: tạo/đổi tên/xóa/kéo thả, upload/download (zip) | ✓ | |
| Tab nhiều file, dirty state, autosave (debounce) + lưu thủ công | ✓ | |
| Syntax highlight (Python, YAML, JSON, Markdown, SQL…) | ✓ | |
| Tìm trong file (Monaco) / toàn workspace (ripgrep qua agent) | ✓ | Thay thế toàn workspace |
| Terminal nhiều phiên (PTY), resize, reconnect | ✓ | |
| Nút Run theo `run_command` của template, stdout/stderr, exit code, kill | ✓ | |
| Hiển thị lỗi: parse traceback Python → link tới file:dòng | ✓ | Diagnostics LSP |
| Dependencies: `requirements.txt` + `pip install` qua mirror | ✓ | Lock file, cache image theo bài |
| Git: CLI trong terminal | ✓ | UI commit/diff, push remote |
| Preview port (ứng dụng RAG đang chạy trong workspace) | ✓ (qua proxy có auth) | |
| LSP, debugger, notebook, cộng tác thời gian thực | | ✓ |

## 3. Phương án runtime / sandbox

| Phương án | Cô lập | Khởi động | Vận hành | Phù hợp |
|---|---|---|---|---|
| Docker (runc) thuần | Yếu: chung kernel host | Nhanh | Dễ | **Không đủ** cho code không tin cậy |
| **Docker + gVisor (`runsc`)** | Kernel người dùng chặn syscall; tốt cho Python CPU | Nhanh (overhead I/O vừa phải ⚠ cần đo) | Dễ trên 1–n VM | **POC** |
| Kubernetes + gVisor RuntimeClass | Như trên + điều phối | Nhanh | Cần năng lực K8s | Giai đoạn mở rộng |
| Kata Containers / Firecracker microVM | Mạnh (VM nhẹ) | Chậm hơn | Cần nested virt / bare metal | Mở rộng, multi-tenant, GPU passthrough |
| Sandbox SaaS | Theo nhà cung cấp | Nhanh | Không vận hành | Phương án dự phòng nếu không có VM |

**Khuyến nghị [ĐỀ XUẤT]:** POC dùng **1 VM sandbox riêng** (tách khỏi VM chạy API/DB) với Docker + gVisor, rootless nếu khả thi, do `runner-agent` điều khiển. API **không bao giờ** được mount Docker socket. Lộ trình: (1) thêm VM runner theo chiều ngang → (2) K8s + gVisor RuntimeClass + node pool GPU riêng → (3) Kata/Firecracker nếu cần cô lập mạnh hơn cho multi-tenant.

## 4. Lựa chọn công nghệ (stack POC)

| Lớp | Khuyến nghị | Phương án thay thế | Lý do / trade-off |
|---|---|---|---|
| Frontend | **React + TypeScript + Vite**, React Router, TanStack Query, CSS Modules + design tokens (vanilla CSS) | Next.js | SPA đủ cho portal sau đăng nhập; không cần SSR/SEO cho phần ứng dụng. Next.js hợp nếu cần landing page công khai SEO — có thể là app riêng |
| Editor/Terminal | Monaco (`@monaco-editor/react`), xterm.js | CodeMirror 6 | Monaco gần trải nghiệm VS Code nhất; CodeMirror nhẹ hơn nhưng phải lắp nhiều hơn |
| Backend | **Python 3.11 + FastAPI + Pydantic v2 + SQLAlchemy 2 + Alembic** | Node/NestJS; Go | Đội AI quen Python; cùng ngôn ngữ với SDK plugin và tooling ONNX/Excel (openpyxl); Pydantic sinh JSON Schema. Trade-off: hiệu năng WebSocket proxy kém Go/Node — chấp nhận ở quy mô POC |
| Database | **PostgreSQL 16** (JSONB cho dữ liệu đặc thù plugin) | MySQL | Ràng buộc quan hệ + JSONB + transactional outbox trong một hệ |
| Object storage | **S3-compatible**: S3/GCS/Azure Blob ở cloud; MinIO cho dev local | Filesystem | Signed URL, content-addressed. ⚠ MinIO server là AGPL-3.0 — chỉ dùng dev hoặc xin ý kiến pháp chế |
| Queue | **Redis-compatible (Valkey) + Arq** hoặc Dramatiq; trạng thái chuẩn trong Postgres | Postgres-only queue (procrastinate); Celery | Queue chỉ là cơ chế đánh thức; nguồn sự thật là bảng `run`. ⚠ Redis đổi giấy phép từ 2024 → khuyến nghị Valkey (BSD) |
| Realtime | SSE cho tiến độ run; WebSocket cho terminal/FS | — | SSE đơn giản, tự reconnect |
| Sandbox | Docker Engine + gVisor | K8s + gVisor | Xem §3 |
| Model inference (CV) | **onnxruntime CPU** trong evaluator | OpenVINO, TensorRT (GPU) | Phổ biến, giấy phép MIT, hỗ trợ opset rộng |
| LLM access | **LLM Gateway** (vd LiteLLM proxy ⚠ lõi MIT, tính năng enterprise giấy phép riêng) | Tự viết proxy mỏng | Virtual key theo học viên, hạn mức chi phí, log usage, đổi provider không ảnh hưởng học viên |
| Auth | Session cookie httpOnly + CSRF (hoặc JWT ngắn hạn + refresh), Argon2id, RBAC tự quản trong DB | Keycloak / OIDC | POC ít người dùng; chuẩn bị interface để gắn OIDC sau |
| Observability | **structlog (JSON) + OpenTelemetry**; Prometheus + Grafana; Loki cho log | Cloud-native logging | Correlation `run_id`, `submission_id` xuyên suốt |
| Đóng gói/triển khai | Docker Compose (dev + POC), GitHub Actions CI | K8s + Helm (sau) | Ít thành phần vận hành |
| Codegen contract | JSON Schema → `datamodel-code-generator` (Python), `json-schema-to-typescript` (TS) | Viết tay | Một nguồn sự thật cho contract |

### Những gì *không* chọn và lý do
- **Microservices ngay từ đầu:** chi phí vận hành, debug phân tán, không có nhu cầu scale độc lập ở POC.
- **Judge0 / runner chấm code kiểu competitive programming:** thiết kế cho snippet stateless, không phù hợp workspace dự án và ứng dụng chạy lâu (RAG). ⚠ GPL-3.0.
- **Chạy plugin như thư viện Python import vào worker:** vi phạm R-31 và làm regression plugin này ảnh hưởng plugin khác.
