# 15 — Các quyết định kiến trúc cần team xác nhận

Mỗi quyết định sẽ thành một ADR trong `docs/adr/` sau khi chốt. **Chặn** = phải chốt trước phase ghi bên cạnh.

| ID | Quyết định | Khuyến nghị | Phương án thay thế | Chặn | Người chốt |
|---|---|---|---|---|---|
| D-01 | Backend stack | Python 3.11 + FastAPI + SQLAlchemy + PostgreSQL | Node/NestJS + Prisma | **P1** | TL |
| D-02 | Kiến trúc triển khai | Modular monolith (api + worker) + runner-agent riêng | Microservices | **P1** | TL |
| D-03 | Frontend | React + TS + Vite SPA, vanilla CSS + tokens | Next.js | **P1** | TL + FE |
| D-04 | Web IDE | Monaco + xterm.js tự lắp (chốt sau spike P0) | Nhúng OpenVSCode Server | **P2** | TL + FE |
| D-05 | Sandbox | 1 VM riêng, Docker + gVisor | K8s + gVisor; sandbox SaaS | **P2** | TL + OPS |
| D-06 | Cloud/hosting | Theo Q-02 | — | **P1** | PO + OPS |
| D-07 | Contract plugin | Container image + file/JSON-lines, `simulator.v1` | Plugin dạng HTTP service thường trực; thư viện Python | **P3** | TL |
| D-08 | UI plugin | Renderer đăng ký tĩnh + generic fallback | Micro-frontend iframe nạp động | P3 | TL + FE |
| D-09 | Submission | Contract (teacher) + template + manifest (UI sinh); không dò tên file | Chỉ quy ước tên file | **P2** | TL + giảng viên |
| D-10 | Thứ tự simulator | CV trước, RAG sau | RAG trước (vì demo) | P3 | PO |
| D-11 | Chế độ RAG | `managed` là chính; `external_endpoint` tắt mặc định | Chỉ external; cả hai ngang nhau | **P5** | PO (Q-04) |
| D-12 | LLM | Gateway + virtual key + ngân sách; provider theo Q-03 | Học viên dùng key riêng | **P5** | PO + TL |
| D-13 | Truyền ảnh RAG | Inline base64, re-encode, ≤ 4 MB | Signed URL ngắn hạn | P5 | TL |
| D-14 | CV chế độ nộp | `onnx_only` + `python_impl` (harness) | Chỉ ONNX | P4 | TL + giảng viên |
| D-15 | Positive class CV | `NG` | Cấu hình theo bài (đã hỗ trợ) | P4 | Giảng viên |
| D-16 | Hiển thị nhãn chuẩn cho học viên | Hidden mặc định; CV cho phép `after_run` theo profile | Luôn hidden | P4 | Giảng viên (Q-14) |
| D-17 | Kết quả simulator vs điểm | Tách `Evaluation`/`Run` khỏi `Grade`; POC không tự tính điểm | Tự quy đổi metric thành điểm | P5 | PO (Q-06) |
| D-18 | Chính sách PyPI | Proxy + blocklist + chặn gói quá mới | Allowlist chặt theo bài | P2 | TL + OPS |
| D-19 | Queue | Valkey + Arq, trạng thái chuẩn trong Postgres | Postgres-only queue | P2 | TL |
| D-20 | Object storage dev | MinIO chỉ cho dev (lưu ý AGPL) | Cloud storage emulator khác | P1 | TL + pháp chế |
| D-21 | Font | Be Vietnam Pro + serif có subset Việt + JetBrains Mono | Font hệ thống | P1 | DS |
| D-22 | Auth | Tự quản (Argon2id, session cookie), interface sẵn cho OIDC | Keycloak ngay | P1 | TL |
| D-23 | Notebook | Ngoài POC | JupyterLab profile trong POC | P0 | PO (A-12) |
