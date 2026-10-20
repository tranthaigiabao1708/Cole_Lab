# 10 — Ngôn ngữ thiết kế, điều hướng và màn hình

## 1. Ngôn ngữ thiết kế: "Atlas kỹ thuật"

Dịch từ các mẫu sau giây 11 của reel tham chiếu ([00 §2](00-source-analysis.md)). Mục tiêu: nền tảng trông như **một bộ hồ sơ kỹ thuật của một xưởng thực hành**, không như một template SaaS.

### 1.1 Bốn nguyên tắc rút ra từ reel

| Mẫu trong reel | Nguyên tắc | Áp dụng vào nền tảng |
|---|---|---|
| 11s — sân khấu tối, vầng sáng ember, dashboard thật làm hero | **Sản phẩm thật là nhân vật chính** | Trang khóa học/bài tập dùng ảnh chụp workspace và kết quả simulator *thật* (từ run demo), không minh họa vector |
| 13s — sương sage, địa hình hòa vào UI, số liệu lớn | **Số liệu là typography** | Metric (Recall 0.874, 352/400) hiển thị cỡ lớn, font mono, thay cho thẻ có icon |
| 15s — ảnh toàn khung, tiêu đề căn trái hai dòng, ít chrome | **Tiết chế chữ, căn trái, khoảng trắng rộng** | Tiêu đề ngắn, căn trái; không hero căn giữa kèm ba nút |
| 17s — atlas kỹ thuật, nhãn serif nghiêng, đường kẻ mảnh, số hiệu bản vẽ | **Cấu trúc kiểu bản vẽ kỹ thuật** | Lưới đường kẻ 1px, mã hiệu mục (`AI-M5-B53`), chú dẫn đánh số, serif nghiêng cho nhãn biên tập |

### 1.2 Danh sách loại bỏ (phong cách trước giây 10 / template)

- Hero căn giữa + tagline chung chung + hai nút CTA.
- Lưới 3–4 thẻ mỗi thẻ một icon tròn.
- Gradient tím–xanh dương phổ thông, glassmorphism mờ đục làm nền chính, blob trang trí.
- Ảnh stock người cười trước laptop, minh họa isometric.
- **Icon mang tính AI**: sparkles/lấp lánh, đũa phép, robot, não, chip có tia sáng, bong bóng chat có sao, quả cầu phát sáng. Áp dụng cả cho bài AI Engineer.
- **Chú thích tự tiện**: tagline marketing không có nguồn ("Học nhanh gấp 10 lần"), số liệu bịa, badge "AI-powered", tooltip suy đoán, lorem ipsum, chữ trang trí không mang thông tin.

### 1.3 Quy tắc về chữ (chống "chú thích tự tiện")
1. Mọi chuỗi UI nằm trong **copy deck** `docs/copy/vi.yaml`, có người duyệt. Component không được chứa chuỗi cứng.
2. Mỗi con số hiển thị phải truy được về một trường dữ liệu (run, testset, course). Không số "trang trí".
3. Trạng thái "Chưa triển khai" dùng đúng một câu đã duyệt, không giải thích suy đoán về tương lai.
4. Nhãn nghiệp vụ trong simulator (vd "Lọt hàng lỗi") lấy từ profile của giảng viên.

### 1.4 Token **[ĐỀ XUẤT — designer tinh chỉnh]**

| Nhóm | Token | Giá trị | Dùng cho |
|---|---|---|---|
| Nền tối | `--ink-950` | `#0D0E10` | Workspace, sân khấu hero |
| | `--ink-800` | `#1A1C20` | Panel IDE |
| | `--ink-600` | `#2B2E34` | Đường kẻ trên nền tối |
| Nền sáng | `--paper-50` | `#F3F1EC` | Trang nội dung (catalog, đề bài) |
| | `--paper-200` | `#E3DFD6` | Đường kẻ trên nền sáng |
| Chữ | `--graphite-900` / `--bone-100` | `#17181B` / `#ECE9E2` | Chữ chính trên sáng / tối |
| Nhấn | `--ember-500` | `#E06A3B` | Hành động chính, trạng thái đang chạy, vầng sáng |
| Track | `--track-ai` | `#E06A3B` (ember) | Mã màu AI Engineer |
| | `--track-de` | `#7F9A8C` (sage) | Mã màu Data Engineer |
| | `--track-ba` | `#B59A6A` (ochre) | Mã màu Business Analyst |
| Tín hiệu | `--signal-critical` | `#C8372D` | Quy tắc bắt buộc, lỗi — **khác hẳn ember** về sắc độ, luôn kèm nhãn chữ |
| | `--signal-pass` | `#4F8A5B` | Đạt |
| | `--signal-warn` | `#C9962E` | Cảnh báo |
| Hình học | radius | 2px (gần vuông, kiểu bản vẽ) | Toàn hệ thống |
| | hairline | 1px | Lưới, viền bảng |
| Chuyển động | duration | 180ms UI / 600ms reveal | `prefers-reduced-motion` tắt reveal |

**Typography** (phải hỗ trợ đầy đủ dấu tiếng Việt — kiểm tra subset `vietnamese` trước khi chốt):
- Sans UI: **Be Vietnam Pro** (thiết kế cho tiếng Việt).
- Serif biên tập (tiêu đề lớn, nhãn nghiêng kiểu atlas): **Newsreader** hoặc **Source Serif 4** ⚠ xác minh subset.
- Mono (code, metric, mã hiệu): **JetBrains Mono**.

### 1.5 Icon
- Chỉ icon **chức năng** từ một bộ trung tính nét mảnh (vd tập con Lucide): file, folder, play, stop, terminal, upload, download, chevron, search, close.
- Danh sách cấm ở §1.2 được kiểm bằng lint: whitelist tên icon trong `design-system/icons.ts`.
- Đánh giá sao dùng glyph sao viền đơn sắc + số (1–5) bên cạnh; không hiệu ứng lấp lánh.

### 1.6 Hình ảnh
- Ảnh từ dữ liệu thật của bài (ảnh test CV, ảnh chụp màn hình run demo) hoặc ảnh chụp nhà xưởng/văn phòng có bản quyền rõ ràng.
- Nếu cần hình minh họa: dạng **bản vẽ kỹ thuật** đường mảnh (sơ đồ pipeline, sơ đồ khối), không minh họa nhân vật.

### 1.7 Kiểm chứng
- Design review checklist mỗi màn hình: không có mục nào trong §1.2; mọi chuỗi có key copy deck; tương phản WCAG AA; hoạt động bằng bàn phím.
- Visual regression (Playwright screenshot) cho design-system.

## 2. Kiến trúc điều hướng

```
Thanh trên (cố định): [Logo chữ] · Tổng quan · Khóa học · Workspace · Kết quả      [vai trò ▾] [người dùng]
                                                       (Teacher thêm: Soạn bài · Dữ liệu)  (Admin thêm: Quản trị)

/                              Tổng quan (theo vai trò)
/courses                       Danh sách khóa học — 3 track: AI · DE · BA
/courses/:track/:courseId      Chi tiết khóa học — cây Module/Buổi
/courses/:track/:courseId/m/:moduleId
/assignments/:id               Chi tiết bài tập (đề bài, dữ liệu, contract, lịch sử)
/workspace/:workspaceId        Workspace/IDE (toàn màn hình, nền tối)
/runs/:runId                   Simulator & kết quả run
/submissions?assignment=…      Lịch sử nộp & kết quả
/teach/import                  Nhập đề cương Excel (wizard)
/teach/assignments/:id/edit    Assignment builder
/teach/assignments/:id/testsets  Dataset & test case
/teach/assignments/:id/simulator Cấu hình simulator
/admin/users · /admin/roles · /admin/plugins · /admin/runtime · /admin/audit
```

Track là **thuộc tính của khóa học**, không phải ba ứng dụng: cùng route, cùng component; khác biệt nằm ở `src/tracks/<track>/config.ts` (mã màu, loại bài tập hỗ trợ, `execution_status`).

## 3. Wireframe các màn hình chính

### 3.1 Tổng quan (Student)
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▌Tổng quan                                                       21.10.2026  │
│                                                                              │
│  Đang làm                                                                    │
│  ┌──────────────────────────────────────────────┬──────────────────────────┐ │
│  │ AI-M5-B53  RAG Chatbot doanh nghiệp          │  Lần chạy gần nhất       │ │
│  │ [ảnh chụp hội thoại từ run gần nhất]         │  18/20 đã phản hồi       │ │
│  │                                              │  ★ TB 3.6 · p95 2.4s     │ │
│  │ Mở workspace →                               │  Xem kết quả →           │ │
│  └──────────────────────────────────────────────┴──────────────────────────┘ │
│  Khóa học                                                                    │
│  ── AI Engineer Fullstack 2026 ── 62 buổi · 7 module · 2 bài thực hành ──── │
│  ── Data Engineer ─────────────── 63 buổi · Chưa triển khai trong POC ───── │
│  ── Business Analyst ──────────── 25 buổi · Chưa triển khai trong POC ───── │
└──────────────────────────────────────────────────────────────────────────────┘
```
Số liệu (62 buổi, 7 module…) lấy trực tiếp từ dữ liệu import, không viết tay.

### 3.2 Danh sách khóa học
Ba khối toàn chiều ngang, xếp dọc, mỗi khối một nền (AI: sân khấu tối + viền ember; DE: sương sage; BA: giấy ochre). Mỗi khối: mã track, tên khóa học (serif lớn, căn trái), số buổi/module, danh sách module dạng chỉ mục đánh số. Khối DE/BA hiển thị `StatusBlock: Chưa triển khai trong POC` thay vì nút hành động.

### 3.3 Chi tiết khóa học / module
```
┌───────────────┬──────────────────────────────────────────────────────────────┐
│ MỤC LỤC       │  Module 5 — LLMs & RAG trong xây dựng Chatbot                │
│ 01 Python…    │  ─────────────────────────────────────────────────────────── │
│ 02 ML cơ bản  │  Mục tiêu (từ Excel, cột D)                                  │
│ 03 CV         │  · Hiểu nguyên lý LLM và embeddings …                        │
│ 04 NLP        │                                                              │
│ 05 LLM & RAG ◀│  B48  Giới thiệu LLMs, Embeddings & Vector Search            │
│ 06 RL         │  B49  RAG patterns & Retrieval pipeline                      │
│ 07 XAI        │  …                                                           │
│               │  B53  Project RAG Chatbot  ─── Bài thực hành: RAG Chatbot →  │
└───────────────┴──────────────────────────────────────────────────────────────┘
```
DE/BA: cùng bố cục; buổi có `practice_candidate` hiển thị "Bài thực hành dự kiến — chưa triển khai", không có liên kết.

### 3.4 Chi tiết bài tập
Tab: **Đề bài** (README render) · **Tài liệu** · **Dữ liệu** (dataset công khai, kích thước, giấy phép) · **Sản phẩm cần nộp** (bảng từ contract: key, định dạng, bắt buộc) · **Lịch sử**. Cột phải: phiên bản bài (v3), simulator (tên + version), nút **Mở workspace** (chỉ AI).

### 3.5 Workspace / IDE (nền tối)
```
┌─────────────────────────────────────────────────────────────────────────────────────┐
│ AI-M3  CV OK/NG · v3      [▶ Chạy  python train.py]  [Khai báo sản phẩm]  [Nộp bài] │
├──────────────┬──────────────────────────────────────────────────┬───────────────────┤
│ EXPLORER     │ preprocess.yaml │ infer.py ● │ README.md           │ SẢN PHẨM NỘP      │
│ ▾ configs    │──────────────────────────────────────────────────│ model       ✓     │
│   labels.yaml│  1  import onnxruntime as ort                    │  weights/…onnx    │
│   preprocess…│  2  …                                            │ preprocessing ✓   │
│ ▾ weights    │                                                  │ labels      ✓     │
│   resnet18…  │                                                  │ report      —     │
│ ▸ data (ro)  │                                                  │ ───────────────── │
│ README.md    │                                                  │ Kiểm tra: hợp lệ  │
│ REPORT.md    │                                                  │ [Chạy simulator]  │
├──────────────┴──────────────────────────────────────────────────┴───────────────────┤
│ TERMINAL 1 │ TERMINAL 2 │ OUTPUT │ VẤN ĐỀ (2)                       CPU 34% · RAM 1.1/2G│
│ $ python train.py --epochs 3                                                        │
│ epoch 1/3 loss 0.412 …                                                              │
└─────────────────────────────────────────────────────────────────────────────────────┘
```
Panel phải "Sản phẩm nộp" là nơi duy nhất khai báo artifact (chọn file từ cây). Trạng thái tài nguyên lấy từ cgroup thật.

### 3.6 Simulator — RAG (`rag-chat@1`)
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Run #12 · RAG Chatbot · submission 7 · Hoàn tất         18/20 phản hồi · p95 2.4s │
├──────────────────────────────────────────────────────────────────────────────┤
│ tc_014                                                                       │
│   Hỏi  Khách hàng VIP đổi trả sau 10 ngày có được hoàn tiền không?  [ảnh]    │
│   Đáp  Theo chính sách đổi trả mục 3.2 …                       1.9s          │
│        Nguồn ▸ Chinh_sach_doi_tra_2026.pdf · trang 4                         │
│   ┃ QUY TẮC BẮT BUỘC  Không được hứa hoàn tiền mặt ngoài 7 ngày.  (đỏ)       │
│   ┃ QUY TẮC BẮT BUỘC  Không tiết lộ thông tin cá nhân khách khác.  (đỏ)      │
│     Lưu ý  Nên dẫn nguồn mục chính sách.                                     │
│   Đánh giá  ☆ ☆ ☆ ☆ ☆  (1–5)   Nhận xét [                              ]    │
│ ──────────────────────────────────────────────────────────────────────────── │
│ tc_015  … TIMEOUT — Không phản hồi trong 60s  [log subject ▸]               │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.7 Simulator — CV (`cv-grid@1`)
```
┌──────────────────────────────────────────────────────────────────────────────┐
│ Run #4 · CV OK/NG · submission 3 · Hoàn tất                                  │
│   PRECISION   RECALL    F1      LỌT LỖI (FN)   LOẠI NHẦM (FP)                 │
│   0.912       0.874     0.893   26             17            (mono, cỡ lớn)  │
│   Tiêu chí bài: recall ≥ 0.90 — chưa đạt                                     │
│ ┌──────── Confusion ────────┐  Lọc: [Tất cả] [FN 26] [FP 17] [TP] [TN]       │
│ │        đoán NG   đoán OK  │  ┌────┐┌────┐┌────┐┌────┐┌────┐┌────┐           │
│ │ thật NG  180       26     │  │img ││img ││img ││img ││img ││img │           │
│ │ thật OK   17      177     │  │OK  ││OK  ││NG  ││…   ││    ││    │           │
│ └───────────────────────────┘  └────┘└────┘└────┘└────┘└────┘└────┘           │
│ Lưu ý: Kết quả đo trên bộ test 400 ảnh, môi trường 1 vCPU dùng chung …       │
└──────────────────────────────────────────────────────────────────────────────┘
```

### 3.8 Lịch sử nộp & kết quả
Bảng theo thời gian: submission seq, thời điểm, trạng thái validate, run gần nhất, metric chính (theo `summary.metrics` đã khai báo), delta so với lần trước. Chọn hai submission để so sánh.

### 3.9 Teacher — Assignment builder
Các bước dọc bên trái (kiểu mục lục bản vẽ): `01 Thông tin` · `02 Đề bài & tài liệu` · `03 Project template` · `04 Dữ liệu` · `05 Test set` · `06 Sản phẩm cần nộp (contract)` · `07 Simulator` · `08 Kiểm tra & xuất bản`. Bước 08 chạy `validate-profile`, liệt kê lỗi theo bước; chỉ cho xuất bản khi sạch lỗi. Bước 06 chỉ cho chọn artifact kind mà plugin đã chọn hỗ trợ.

### 3.10 Teacher — Dataset & test case
Bảng test case (key, loại input, có ảnh, tags, visibility) + trình soạn một test case (form sinh từ `testcase.schema.json` của plugin) + import hàng loạt (CSV/JSONL + thư mục ảnh zip). Mỗi lần lưu tạo TestSetVersion nháp; khóa khi gắn vào AssignmentVersion xuất bản.

### 3.11 Teacher — Nhập đề cương Excel
Wizard 4 bước ([00 §1](00-source-analysis.md)): bảng xem trước với cột "Loại hàng" chỉnh được, cây kết quả bên phải, danh sách cảnh báo có thể nhấn để nhảy tới hàng.

### 3.12 Cấu hình simulator
Chọn plugin (chỉ plugin `enabled` có `tracks` khớp) → version range → form sinh từ `profile.schema.json` → nút "Kiểm tra cấu hình" (chạy `validate-profile`).

### 3.13 Admin
- **Người dùng & vai trò:** bảng, mời, khóa, gán vào course.
- **Plugin:** danh sách plugin/version, trạng thái, digest, kết quả contract test, số assignment đang dùng; bật/tắt/deprecate.
- **Runtime:** container đang chạy, tài nguyên sandbox host, hàng đợi, nút dọn container treo.
- **Audit:** lọc theo actor/hành động/đối tượng.

## 4. Trạng thái "Chưa triển khai" cho DE/BA

Component `StatusBlock` duy nhất, không có nút:
```
┌─────────────────────────────────────────────────────────────┐
│ CHƯA TRIỂN KHAI TRONG POC                                   │
│ Môi trường thực hành cho Data Engineer thuộc giai đoạn sau. │
│ Loại bài dự kiến: Pipeline ETL · Data Quality               │
└─────────────────────────────────────────────────────────────┘
```
"Loại bài dự kiến" lấy từ `tracks/de/config.ts` (đã duyệt), không sinh tự do. Không hiển thị nút disabled giả vờ.
