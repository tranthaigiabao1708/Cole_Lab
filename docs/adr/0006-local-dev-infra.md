# ADR 0006 — Hạ tầng dev local tối giản

- **Trạng thái:** Accepted cho POC local (2026-10-21)
- **Bối cảnh:** Máy dev không có Postgres/Redis; muốn chạy POC bằng một lệnh.
- **Quyết định:**
  - DB: SQLite (file `var/cole.db`) qua SQLAlchemy; model chỉ dùng kiểu tương thích Postgres (`JSON`, `String`, `DateTime`). Chuyển Postgres = đổi `COLE_DATABASE_URL`.
  - Storage: adapter `LocalStorage` (thư mục `var/storage`), content-addressed sha256, interface giống S3 adapter sau này.
  - Queue: bảng `run` là nguồn sự thật, worker poll DB và claim bằng `UPDATE ... WHERE status='QUEUED'` (pattern Postgres-queue). Valkey/Arq bổ sung khi cần nhiều worker.
- **Hệ quả:** Không mất tính đúng; chỉ khác hiệu năng/đồng thời.
