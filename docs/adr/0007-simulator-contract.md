# ADR 0007 — Simulator contract `simulator.v1`

- **Trạng thái:** Accepted (2026-10-21), contract ở mức `v1-beta` đến hết Phase 5.
- **Quyết định:** Plugin = container image + `plugin.yaml`. Modes: `describe`, `validate-profile`, `validate-submission`, `run`. Input mount `/sim/input` (ro), output `/sim/output`: `events.jsonl`, `result.json`, `validation.json`. Schema trong `sdk/contracts/simulator.v1/`.
- **Subject:** nền tảng khởi chạy sản phẩm học viên theo manifest; plugin không có Docker socket.
- **Dev fallback:** Không có. Plugin luôn chạy trong container; nếu Docker không chạy, run kết thúc `ERROR` với mã `RUNNER_UNAVAILABLE`.
