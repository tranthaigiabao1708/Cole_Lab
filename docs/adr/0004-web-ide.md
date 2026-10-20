# ADR 0004 — Web IDE: Monaco + xterm.js tự lắp

- **Trạng thái:** Accepted (2026-10-21). Spike so sánh OpenVSCode Server **hoãn**, vì PO ủy quyền chọn phương án khuyến nghị; giữ OpenVSCode là phương án dự phòng.
- **Quyết định:** File tree + tabs + Monaco + terminal xterm.js. Terminal nối qua API (WebSocket) → runner-agent → `docker exec` TTY trong workspace container.
- **File I/O:** API đọc/ghi file trong volume workspace trên host (thao tác dữ liệu, không thực thi code). Mọi thực thi đi qua container.
