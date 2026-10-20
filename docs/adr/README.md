# ADR index

Trạng thái: các quyết định khuyến nghị trong [15-architecture-decisions.md](../design/15-architecture-decisions.md) được **chấp thuận tự động** theo ủy quyền của product owner (2026-10-21). Các câu hỏi Q-01…Q-06 chưa có câu trả lời → dùng giả định mặc định, ghi rõ bên dưới.

| ADR | Quyết định | Trạng thái |
|---|---|---|
| [0001](0001-backend-stack.md) | Python 3.11 + FastAPI + SQLAlchemy 2 | Accepted |
| [0002](0002-modular-monolith.md) | Modular monolith (api + worker) + runner-agent riêng | Accepted |
| [0003](0003-frontend.md) | React + TypeScript + Vite, vanilla CSS tokens | Accepted |
| [0004](0004-web-ide.md) | Monaco + xterm.js tự lắp | Accepted (spike OpenVSCode hoãn) |
| [0005](0005-sandbox.md) | Docker + gVisor; dev Windows dùng runc có cảnh báo | Accepted với ngoại lệ dev |
| [0006](0006-local-dev-infra.md) | Dev local: SQLite + filesystem storage + DB-backed queue | Accepted (POC local) |
| [0007](0007-simulator-contract.md) | Plugin = container image + file/JSON-lines `simulator.v1` | Accepted |
| [0008](0008-submission-manifest.md) | Contract + template + manifest, không dò tên file | Accepted |
