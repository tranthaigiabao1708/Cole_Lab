# Bộ tài liệu thiết kế — Nền tảng đào tạo thực hành theo bài toán doanh nghiệp

Trạng thái: **DRAFT v0.1 — chờ team xác nhận** · Ngày lập: 2026-10-21

Bộ tài liệu này chỉ gồm thiết kế và kế hoạch. Chưa có code production nào được tạo.
Việc triển khai bắt đầu sau khi các quyết định trong [15-architecture-decisions.md](15-architecture-decisions.md) được chốt.

## Quy ước đánh dấu

| Nhãn | Ý nghĩa |
|---|---|
| **[KIỂM CHỨNG]** | Đã kiểm tra trực tiếp trên dữ liệu/repo (file Excel, reel tham chiếu) |
| **[ĐỀ XUẤT]** | Phương án kiến trúc khuyến nghị, cần team review |
| **[GIẢ ĐỊNH]** | Giả định làm việc khi chưa có thông tin; phải kiểm chứng ở Phase 0 |
| **[CẦN XÁC NHẬN]** | Quyết định chặn, cần product owner / tech lead chốt |
| **[MINH HỌA]** | Ví dụ để giải thích ý tưởng, chưa phải thiết kế đã chốt |

## Mục lục (theo thứ tự yêu cầu)

| # | Tài liệu | Nội dung |
|---|---|---|
| 00 | [00-source-analysis.md](00-source-analysis.md) | Phân tích nguồn: 3 file đề cương Excel và reel tham chiếu thiết kế |
| 01 | [01-executive-summary.md](01-executive-summary.md) | Tóm tắt điều hành |
| 02 | [02-requirements-assumptions-questions.md](02-requirements-assumptions-questions.md) | Yêu cầu đã xác nhận, giả định, câu hỏi mở |
| 03 | [03-poc-scope-non-goals.md](03-poc-scope-non-goals.md) | Phạm vi POC và non-goals |
| 04 | [04-architecture-overview.md](04-architecture-overview.md) | Kiến trúc tổng thể, thành phần, luồng dữ liệu, vai trò & quyền |
| 05 | [05-build-vs-buy-ide-runtime.md](05-build-vs-buy-ide-runtime.md) | Build-vs-buy cho web IDE và runtime; lựa chọn công nghệ |
| 06 | [06-simulator-plugin-architecture.md](06-simulator-plugin-architecture.md) | Kiến trúc plugin simulator, lifecycle, contract mẫu |
| 07 | [07-repository-structure.md](07-repository-structure.md) | Cây thư mục repository, trách nhiệm, quy tắc đặt tên |
| 08 | [08-data-model.md](08-data-model.md) | Mô hình dữ liệu, schema mẫu, versioning, quyền xem |
| 09 | [09-poc-simulators.md](09-poc-simulators.md) | Thiết kế chi tiết RAG Chatbot và CV OK/NG |
| 10 | [10-ui-navigation-screens.md](10-ui-navigation-screens.md) | Ngôn ngữ thiết kế, điều hướng, wireframe AI/DE/BA |
| 11 | [11-runtime-security-resources.md](11-runtime-security-resources.md) | Runtime, sandbox, bảo mật, quota |
| 12 | [12-phased-plan.md](12-phased-plan.md) | Kế hoạch theo phase, acceptance criteria, effort |
| 13 | [13-cost-risk.md](13-cost-risk.md) | Mô hình chi phí, rủi ro, giảm thiểu |
| 14 | [14-test-plan-acceptance.md](14-test-plan-acceptance.md) | Kế hoạch kiểm thử và checklist nghiệm thu POC |
| 15 | [15-architecture-decisions.md](15-architecture-decisions.md) | Danh sách quyết định kiến trúc cần xác nhận |
| 16 | [16-initial-implementation-plan.md](16-initial-implementation-plan.md) | Kế hoạch triển khai bước đầu, file/thư mục dự kiến |

## Hiện trạng repository **[KIỂM CHỨNG]**

```
cole_lab/
├── AI.xlsx      # Đề cương AI Engineer Fullstack 2026 (62 buổi, 7 module)
├── BA.xlsx      # Đề cương ITBA (25 buổi, 4 phần, 8 module + phần bổ trợ nghiệp vụ)
├── DE.xlsx      # Đề cương Data Engineer (63 buổi, 4 học phần, 14 module)
└── docs/design/ # (mới) bộ tài liệu này
```

Không có code, không có cấu hình build, không có git history. Không file hiện có nào bị sửa hoặc di chuyển.

- [17. Nhật ký sai lệch khi triển khai POC](17-implementation-deviations.md)
- [18. Trạng thái nghiệm thu POC (Phase 6)](18-poc-acceptance-status.md)
