# ADR 0005 — Sandbox: Docker + gVisor (ngoại lệ cho dev Windows)

- **Trạng thái:** Accepted với ngoại lệ (2026-10-21)
- **Quyết định:** Production/POC server: Docker Engine + `runsc` (gVisor) trên VM sandbox riêng.
- **Ngoại lệ dev:** Máy dev hiện tại là Windows + Docker Desktop, không có `runsc`. Runner tự phát hiện runtime: dùng `runsc` nếu có, nếu không dùng `runc` và **ghi cảnh báo `ISOLATION_DEGRADED`** vào log và vào mỗi Run (`run.isolation`). Mọi kiểm soát khác vẫn áp dụng: non-root, `cap_drop=ALL`, `no-new-privileges`, read-only rootfs, pids/mem/cpu limit, `network_mode=none` cho run.
- **Hệ quả:** Kết quả kiểm thử escape trên dev **không** thay thế kiểm thử trên host gVisor (bắt buộc ở Phase 6).
