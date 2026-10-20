# 11 — Runtime, bảo mật và quản lý tài nguyên

## 1. Mô hình mối đe dọa (rút gọn)

| Tác nhân | Mục tiêu xấu có thể | Bề mặt |
|---|---|---|
| Học viên (cố ý/vô ý) | Thoát sandbox; đào coin; đọc nhãn test; lấy API key nền tảng; tấn công học viên khác; SSRF vào mạng nội bộ/metadata cloud; DoS bằng fork bomb, file khổng lồ, log vô hạn | Workspace, subject, file upload, endpoint ngoài |
| Plugin lỗi/độc | Rò dữ liệu test; ghi kết quả sai; gọi ra ngoài | Evaluator container |
| Dependency độc (PyPI typosquat) | Chạy mã khi `pip install` | Workspace |
| File độc | Ảnh/zip bomb, ONNX độc (custom op, external data path traversal), Excel có macro/công thức | Upload |
| Tài khoản bị chiếm | Sửa đề/nhãn, xem bài người khác | API |

## 2. Kiến trúc cô lập

```
┌─────────────── VM control plane ───────────────┐      ┌──────────── VM sandbox (riêng) ─────────────┐
│ API · Worker · Postgres · Redis · LLM Gateway  │ mTLS │ runner-agent (user riêng, không root)       │
│ Không có Docker socket                         │─────▶│ Docker + gVisor (runsc) mặc định            │
│                                                │      │  ├─ ws-<id>   (network: ws-egress)          │
│                                                │      │  ├─ run-<id>-subject   (network: run-<id>)  │
│                                                │      │  └─ run-<id>-evaluator (network: run-<id>)  │
│                                                │      │ egress-proxy (allowlist) · iptables chặn    │
└────────────────────────────────────────────────┘      │ 169.254.169.254, RFC1918, control plane     │
                                                        └─────────────────────────────────────────────┘
```

### Cấu hình container mặc định (mọi container học viên & plugin)
- `--runtime=runsc` (gVisor); user không phải root (UID cố định), `--security-opt no-new-privileges`, `--cap-drop ALL`.
- Root filesystem **read-only**; ghi được: `/workspace` (volume có quota) hoặc `/sim/output`, `/tmp` (tmpfs có giới hạn).
- `--pids-limit 256`, `--cpus`, `--memory` + `--memory-swap` bằng nhau (không swap), `ulimit nofile`.
- Không mount Docker socket, không `--privileged`, không device; không biến môi trường chứa secret nền tảng.
- Log driver giới hạn kích thước (vd 10 MB, rotate 2) + runner cắt stream vượt quota.
- Nhãn `cole.run_id`, `cole.expires_at` cho reaper.

## 3. Hạn mức tài nguyên **[GIẢ ĐỊNH — điều chỉnh sau đo ở Phase 2]**

| Đối tượng | CPU | RAM | Disk | Thời gian | Khác |
|---|---|---|---|---|---|
| Workspace | 1 vCPU (burst 2) | 2 GB | 2 GB volume | Idle 30' → dừng; tối đa 4h/phiên | 1 workspace chạy/học viên |
| Subject (run) | 1 vCPU | 2 GB | tmpfs 512 MB | startup ≤ 120s | không mạng (trừ gateway cho RAG) |
| Evaluator | 1 vCPU | 2 GB | output ≤ 50 MB | tổng run ≤ 15' | |
| Theo học viên | — | — | — | ≤ 20 run/ngày/bài; ≤ 2 run song song | LLM ≤ ngân sách/ngày |
| Sandbox host | Đồng thời tối đa N container theo RAM (giữ 20% dự phòng) | | | | hàng đợi khi đầy |
| GPU | Không có trong POC | | | | `resources.gpu` dành sẵn trong contract |

## 4. Mạng

| Container | Egress mặc định | Ghi chú |
|---|---|---|
| Workspace | Chỉ qua **egress-proxy**: PyPI mirror/allowlist, LLM gateway, (tùy chọn) Hugging Face model hub qua cache | Chặn IP nội bộ, metadata cloud, control plane |
| Subject (CV) | **none** | |
| Subject (RAG managed) | Chỉ LLM gateway (network riêng, DNS cố định) | Virtual key của run, hết hạn khi run kết thúc |
| Evaluator | Theo `plugin.yaml` (`none` cho cả 2 plugin POC) | |
| Evaluator gọi endpoint ngoài (RAG external) | Qua egress-proxy chế độ "public internet only": chỉ HTTPS, chặn IP private/link-local sau khi resolve DNS (chống DNS rebinding), giới hạn kích thước phản hồi | Chỉ khi profile bật |

Truy cập từ trình duyệt vào ứng dụng đang chạy trong workspace (preview port): qua API reverse proxy có kiểm tra quyền sở hữu workspace, header `Content-Security-Policy` riêng, domain con tách biệt (cookie không chia sẻ với app chính).

## 5. Secret

- Key LLM provider chỉ nằm trong LLM gateway (secret manager/biến môi trường của gateway). Học viên nhận **virtual key** theo workspace/run, có hạn mức và thời hạn; thu hồi khi run kết thúc hoặc workspace dừng.
- Runner nhận spec **đã ký** (Ed25519) từ worker; token run để upload kết quả là signed URL ngắn hạn, phạm vi một prefix.
- Không log secret: bộ lọc structlog che các trường `*_key`, `authorization`, `password`.
- Học viên tự dùng key riêng (nếu Q-04 cho phép): lưu dạng secret của workspace (mã hóa at-rest, chỉ inject vào workspace của chính họ), không bao giờ vào subject của run do giảng viên chạy.

## 6. Dữ liệu và test set

- Nhãn chuẩn/test ẩn trong bucket `answer_key`; chỉ worker có credential đọc; mount read-only vào evaluator; **không bao giờ** vào workspace hay subject.
- Dataset công khai mount read-only vào workspace (`/workspace/data`), không cho ghi đè.
- Chống học viên "dò" test set qua nhiều run: giới hạn số run/ngày; không trả `expected` khi `hidden`; có thể dùng test set chia public/private (chỉ public hiển thị chi tiết) — mở rộng.
- Phân quyền API bằng serializer theo vai trò ([08 §6](08-data-model.md)); kiểm thử tự động "student không đọc được expected".

## 7. File upload

| Loại | Kiểm tra |
|---|---|
| Mọi file | Giới hạn kích thước; kiểm tra magic bytes; tên file chuẩn hóa; quét malware (ClamAV) bất đồng bộ — file `scan_status != clean` không mount vào run |
| Zip/tar | Giải nén trong sandbox; chặn path traversal (`../`), symlink, hardlink; giới hạn số file và tổng kích thước giải nén (chống zip bomb) |
| Ảnh | Decode bằng Pillow trong sandbox với giới hạn pixel; re-encode trước khi gửi cho subject RAG (loại metadata/polyglot) |
| ONNX | Như [09 §B.4](09-poc-simulators.md): chặn custom op, external data ngoài thư mục; chỉ nạp trong evaluator sandbox |
| Excel đề cương | `openpyxl` chế độ `data_only`, không thực thi macro; chỉ nhận `.xlsx` (không `.xlsm`); parse trong worker với giới hạn dòng/cột; text được escape khi render (Markdown an toàn) |

## 8. Dependency

- `pip install` trong workspace qua **mirror/proxy** (vd devpi hoặc Artifactory) với: allowlist gói cho từng runtime profile *hoặc* blocklist + chặn gói mới đăng < 14 ngày **[CẦN XÁC NHẬN chính sách]**.
- Subject của run cài dependency từ `requirements.txt` khi build **subject image theo submission** (cache theo sha256 của requirements) trong sandbox, có timeout; không dùng mạng lúc chạy test.
- Image nền được quét CVE (Trivy) trong CI; cập nhật hàng tháng.

## 9. Audit, cleanup, chống lạm dụng

- **AuditLog** cho: đăng nhập, đổi quyền, tạo/xuất bản bài, xem test ẩn, tải dữ liệu `answer_key`, impersonate, bật/tắt plugin, hủy run của người khác.
- **Reaper** chạy mỗi 5 phút: xóa container/network/volume quá `expires_at` hoặc không có run tương ứng trong DB.
- **Phát hiện lạm dụng:** CPU 100% kéo dài trong workspace không có tiến trình được nhận diện, kết nối ra ngoài bị chặn liên tục, số run bất thường → cảnh báo Admin, tạm khóa workspace.
- Rate limit API theo user/IP; giới hạn kích thước request.

## 10. POC bắt buộc vs nâng cao

| Biện pháp | POC (bắt buộc) | Nâng cao (sau) |
|---|---|---|
| Sandbox host riêng, gVisor, non-root, cap-drop, read-only rootfs | ✓ | Kata/Firecracker microVM |
| Quota CPU/RAM/PID/disk/thời gian, giới hạn log | ✓ | Quota theo khóa học, đặt chỗ tài nguyên |
| Mạng none cho run; egress allowlist cho workspace; chặn metadata/RFC1918 | ✓ | Egress policy theo bài, L7 inspection |
| LLM gateway + virtual key + ngân sách | ✓ | Chống prompt injection có hệ thống, DLP |
| Tách bucket answer_key, serializer theo vai trò | ✓ | Test set private/public xoay vòng |
| Spec ký, mTLS control↔runner | ✓ | SPIFFE/SPIRE |
| Kiểm tra upload (size, magic, traversal, zip bomb) | ✓ | Sandbox phân tích file chuyên dụng |
| Quét malware file upload | ✓ (bất đồng bộ) | Đồng bộ trước khi dùng |
| Mirror PyPI có chính sách | ✓ (tối thiểu: proxy + blocklist) | Allowlist đầy đủ, SBOM theo submission |
| Audit log | ✓ | SIEM, cảnh báo thời gian thực |
| Argon2id, cookie httpOnly/SameSite, CSRF, rate limit | ✓ | MFA, SSO |
| Mã hóa at-rest (storage/DB của cloud) | ✓ | KMS khóa theo tổ chức |
| Pentest | Tự kiểm nội bộ theo checklist [14](14-test-plan-acceptance.md) | Pentest bên thứ ba |
