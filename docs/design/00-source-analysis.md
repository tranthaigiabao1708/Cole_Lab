# 00 — Phân tích nguồn đầu vào

## 1. Ba file đề cương Excel **[KIỂM CHỨNG]**

Đọc bằng `openpyxl` (giá trị đã tính, không công thức). Mỗi file có **một sheet**, nhưng **bố cục cột và cấp bậc hoàn toàn khác nhau**. Đây là phát hiện quan trọng nhất cho module nhập đề cương: không thể dùng một bộ ánh xạ cột cố định.

| Thuộc tính | AI.xlsx | DE.xlsx | BA.xlsx |
|---|---|---|---|
| Sheet | `Khung chương trình` | `Khung chương trình` | `Khung Chương trình chính` |
| Tiêu đề (R1) | CHƯƠNG TRÌNH AI ENGINEER FULLSTACK 2026 | NỘI DUNG CHƯƠNG TRÌNH | KHUNG CHƯƠNG TRÌNH ITBA – 25 BUỔI · ONLINE · 2 TIẾNG / BUỔI |
| Hàng header | R3: `(trống) / Nội dung / Chi tiết / Mục tiêu` | R3: `Học phần / Module / Chi tiết` | R3: `Buổi / Chủ đề & Mục tiêu / Nội dung chi tiết / Thực hành` |
| Cấp bậc | Module → Buổi | Học phần → Module → Buổi / Project | Phần → Module → Buổi; thêm khối "Kiến thức bổ trợ" |
| Cách nhận diện hàng nhóm | Hàng merge `A:D`, text bắt đầu `Module N:` | Cột A có text = Học phần; hàng merge `B:D` với `Module N.` | Hàng merge `A:D`, text `PHẦN N:` hoặc `Module N –` |
| Mục tiêu học tập | Cột D, **merge dọc theo cả module** (vd `D15:D33`) | Không có cột riêng | Nằm trong cột B sau tiền tố `Mục tiêu:` |
| Thực hành | Lẫn trong cột "Chi tiết" (`Thực hành:`, `Bài tập bổ trợ:`) | Hàng `Project nhỏ N`, `Project I/II` | Cột D riêng, có tiền tố `THỰC HÀNH` |
| Đánh số buổi | `Buổi 1`, `Buổi  17` (có khoảng trắng kép) | `Buổi 42,43`, `Buổi 58, 59, 60` (một hàng = nhiều buổi) | `Buổi 1: Tiêu đề…`, `★ Buổi 21 …` (có ký tự đặc biệt) |
| Dữ liệu bẩn | Xuống dòng trong ô, bullet `-` | Hàng `Buổi 49` có tiêu đề `ơ--` (lỗi gõ); Module 14 ghi chú "không bắt buộc" | Hàng bổ trợ `Buổi 1+2` lặp 2 lần |
| Quy mô | 62 buổi, 7 module | 63 buổi, 14 module, 4 học phần | 25 buổi + 12 buổi bổ trợ |

### Hệ quả thiết kế cho chức năng nhập Excel **[ĐỀ XUẤT]**

1. **Import = Wizard 4 bước**, không phải upload-là-xong:
   1. Upload → chọn sheet, chọn hàng header.
   2. **Ánh xạ cột** sang trường chuẩn (`session_label`, `title`, `content`, `objectives`, `practice`) — lưu thành *mapping profile* tái sử dụng cho lần sau.
   3. **Phân loại hàng** bằng các luật cấu hình được (regex + trạng thái merge): `GROUP_L1` (Học phần/Phần), `GROUP_L2` (Module), `SESSION`, `PROJECT`, `IGNORE`. Cho phép giảng viên sửa từng hàng.
   4. **Xem trước dạng cây** + danh sách cảnh báo (buổi trùng, số buổi gộp, ô merge dọc được nhân bản, text nghi lỗi) → chỉnh sửa → lưu **bản nháp** (`SyllabusDraft`) → xuất bản thành Course/Module/Lesson.
2. Ô merge dọc (mục tiêu AI) được gán vào **Module**, không nhân bản vào từng buổi.
3. `Buổi 42,43` → một `Lesson` với `session_numbers=[42,43]`.
4. File gốc được lưu nguyên vẹn (object storage) kèm hash để truy vết bản import.
5. Import **không tự tạo Assignment**. Buổi có dấu hiệu thực hành chỉ được gắn cờ `practice_candidate` để giảng viên quyết định.

Ba file này dùng làm **bộ fixture kiểm thử bắt buộc** cho importer (xem [14](14-test-plan-acceptance.md)).

### Liên hệ với hai simulator POC **[KIỂM CHỨNG]**

- RAG: AI.xlsx Module 5, Buổi 48–54 (embedding, FAISS/Chroma, FastAPI bọc RAG pipeline ở Buổi 51, RAG evaluation ở Buổi 52, project ở Buổi 53).
- CV: AI.xlsx Module 3, Buổi 29–39 (classification, error analysis FP/FN ở Buổi 32, ONNX/quantization ở Buổi 39).
- Đề cương AI dùng Colab/notebook ở nhiều buổi → notebook là nhu cầu thật, nhưng nằm ngoài POC (xem [03](03-poc-scope-non-goals.md)).
- DE dùng SQL Server/SSIS/Power BI/AWS/Spark/Kafka/Airflow; BA dùng tài liệu BRD/SRS/BPMN/wireframe. Các runtime này **không** nằm trong POC, nhưng mô hình dữ liệu phải chứa được chúng (xem [08](08-data-model.md)).

---

## 2. Reel tham chiếu thiết kế **[KIỂM CHỨNG]**

Nguồn: `facebook.com/reel/29014973898097099` — "Marcelo Design X", caption *"If your website still looks like this you're cooked #webdesign #Tesla"*. Đã xem bằng trình duyệt, chụp khung hình theo mốc thời gian.

| Mốc | Nội dung |
|---|---|
| 0–2s | Clip xe Tesla chạy trên đường dốc cong trong đêm, chữ "Tesla made a car fly and your website still looks like this." |
| 2–8s | Người nói trước camera, phòng tối, đèn LED cam |
| ~8s | Chữ "Vs how it should look" — điểm chuyển |
| ~10s | Bắt đầu chuyển sang các mẫu web |
| 11s | **Sân khấu tối + vầng sáng cam (ember arc)**: tiêu đề ngắn căn giữa "Operational analytics, forged in real time.", ảnh chụp dashboard thật đặt nổi trên vầng sáng; nền chuyển gradient cam–kem mềm |
| 13s | **Nền sương xám–xanh xô thơm (sage/fog)**, ảnh địa hình hòa vào khung UI, tiêu đề "Down to Every Acre", số liệu lớn (2,148.6 t) |
| 15s | **Ảnh toàn khung kiểu điện ảnh** (xe tải trên đường), tiêu đề căn trái hai dòng "Freight in motion. Decisions ahead of it.", chữ phụ nhỏ, rất ít chrome |
| 17s | **Atlas kỹ thuật biên tập**: bản vẽ lắp ráp tháp Eiffel đỏ trên nền giấy nhạt, nhãn serif nghiêng "Eiffel Tower Assembly Atlas", đường kẻ mảnh, chú dẫn số hiệu kiểu bản vẽ kỹ thuật, ảnh thật mờ phía sau |

### Diễn giải yêu cầu của người dùng

- **Loại bỏ (trước giây 10):** phần này không trưng bày mẫu web cụ thể; nó đại diện cho thứ reel phê phán — kiểu web "mặc định/template": hero căn giữa chung chung, lưới thẻ có icon, gradient tím–xanh phổ thông, ảnh stock, nhiều chrome, không có câu chuyện sản phẩm.
- **Ưu tiên (sau giây 11):** bốn hướng thẩm mỹ ở trên. Điểm chung: *sản phẩm thật là nhân vật chính*, typography lớn và tiết chế chữ, bảng màu hạn chế với một màu nhấn ấm, ảnh/hình kỹ thuật thật thay vì icon, đường kẻ mảnh kiểu bản vẽ, khoảng trắng rộng.

Bản dịch các nguyên tắc này thành design system cho nền tảng nằm ở [10-ui-navigation-screens.md §1](10-ui-navigation-screens.md).

> [!NOTE]
> Không tải xuống hay tái sử dụng hình ảnh từ reel. Reel chỉ là tham chiếu phong cách.
