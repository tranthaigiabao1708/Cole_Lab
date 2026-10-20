# ADR 0002 — Modular monolith + runner-agent tách biệt

- **Trạng thái:** Accepted (2026-10-21)
- **Quyết định:** `backend/` chứa toàn bộ nghiệp vụ, chạy 2 vai trò: `api` và `worker` (orchestrator). `runtime/runner/` là tiến trình riêng, là thành phần **duy nhất** được nói chuyện với Docker.
- **Lý do tách runner:** ranh giới bảo mật (API không có Docker socket), không phải scale.
- **Quy tắc:** module chỉ gọi nhau qua `service.py`; backend không import `simulators/`.
