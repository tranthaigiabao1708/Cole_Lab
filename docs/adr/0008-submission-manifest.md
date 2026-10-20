# ADR 0008 — Submission: contract + template + manifest

- **Trạng thái:** Accepted (2026-10-21)
- **Quyết định:** Teacher định nghĩa `submission-contract` (artifact key, kind, format, required, modes). Template cung cấp `default_manifest`. Student xác nhận/chọn file trong panel "Sản phẩm nộp" → `submission.manifest`. Lõi validate theo contract; plugin `validate-submission` kiểm tra ngữ nghĩa. Không dò tên file.
