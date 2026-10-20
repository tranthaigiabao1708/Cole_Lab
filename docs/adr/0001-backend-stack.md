# ADR 0001 — Backend: Python 3.11 + FastAPI + SQLAlchemy 2

- **Trạng thái:** Accepted (2026-10-21)
- **Bối cảnh:** Đội AI quen Python; SDK plugin, xử lý ONNX, đọc Excel (openpyxl) đều là Python.
- **Quyết định:** FastAPI + Pydantic v2 + SQLAlchemy 2 (ORM, typed). Alembic cho migration khi chuyển Postgres.
- **Hệ quả:** WebSocket proxy hiệu năng thấp hơn Go/Node — chấp nhận ở quy mô POC. Một ngôn ngữ cho lõi, SDK và plugin.
- **Thay thế đã cân nhắc:** Node/NestJS.
