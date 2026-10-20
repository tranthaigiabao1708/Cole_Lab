# 14 — Kế hoạch kiểm thử và checklist nghiệm thu POC

## 1. Tiêu chí nghiệm thu POC

| # | Tiêu chí | Cách kiểm chứng | Đạt khi |
|---|---|---|---|
| AC-01 | Teacher import đề cương AI, DE, BA từ Excel, chỉnh sửa và xuất bản | E2E với 3 file thật | Cây khớp golden; cảnh báo hiện đúng (buổi gộp, hàng trùng, text nghi lỗi) |
| AC-02 | Teacher tạo bài tập, cấu hình template, contract, test set, simulator profile và xuất bản | E2E builder | `validate-profile` pass; AssignmentVersion bất biến sau publish |
| AC-03 | Student mở workspace, sửa file, chạy chương trình, dùng terminal | E2E + thao tác tay | Mở ≤ 15s cold / ≤ 5s warm **[mục tiêu giả định]**; stdout/stderr/exit code đúng |
| AC-04 | Student khai báo và nộp artifact | E2E | Manifest sinh đúng; snapshot có sha256 |
| AC-05 | Simulator đọc artifact theo manifest, không phụ thuộc tên file | Test: đổi tên `model.onnx` → `abc_v9.onnx`, chọn lại trong panel | Run thành công, kết quả giống hệt |
| AC-06 | Test case RAG text và ảnh gửi đúng contract | Mock RAG app ghi lại request | Request khớp schema `rag-chat/v1`; ảnh base64 đúng mime, đã re-encode |
| AC-07 | Student đánh giá 1–5 sao và xem lại | E2E | Lưu, sửa (append-only), hiển thị lại sau reload và trong lịch sử |
| AC-08 | Ghi chú nghiệp vụ critical hiển thị đỏ, có nhãn chữ | Review UI | Có nhãn "Quy tắc bắt buộc"; không có logic tự phát hiện |
| AC-09 | CV chạy test có nhãn, báo FP/FN/precision/recall/F1 | Golden fixture | Metric khớp tính tay; lưới lọc theo FP/FN đúng |
| AC-10 | Lỗi submission có thông báo dễ hiểu | Fixture cho từng mã lỗi ở [08 §8.4](08-data-model.md) | Đúng mã, đúng thông điệp copy deck |
| AC-11 | Thêm simulator mới không sửa lõi | PR `echo-sample` | Diff chỉ trong `simulators/echo-sample/**`, `content/assignments/ai-echo-sample/**`; chạy được với `generic-table@1` |
| AC-12 | Runtime có timeout, quota, isolation | Suite §3 | 100% case bị chặn/giới hạn đúng |
| AC-13 | Không lộ secret nền tảng | Quét chuỗi key trong workspace, subject, log, response | 0 kết quả |
| AC-14 | Student không đọc được nhãn chuẩn ẩn | Test API + kiểm tra filesystem workspace/subject | 0 rò rỉ |
| AC-15 | UI AI/DE/BA nhất quán; chỉ AI có luồng hoàn chỉnh | Review UI + test tự động "DE/BA không có nút workspace/nộp/chạy" | Đạt |
| AC-16 | Tuân thủ ngôn ngữ thiết kế: không icon AI, không chú thích tự tiện | Lint icon whitelist + lint chuỗi cứng + design review | 0 vi phạm |
| AC-17 | Đo được chi phí/run | Dashboard | Mỗi run có `cost` đầy đủ |

## 2. Tầng kiểm thử

| Tầng | Công cụ **[ĐỀ XUẤT]** | Phạm vi |
|---|---|---|
| Unit BE | pytest | service, importer, state machine, validators |
| Unit FE | Vitest + Testing Library | component, renderer |
| Integration BE | pytest + testcontainers (Postgres, MinIO) | repo, API, quyền |
| Contract | testkit `sdk/testkit` | mọi plugin × contract; lõi × fixture result |
| Plugin golden | testkit | submission mẫu → expected-result.json |
| E2E | Playwright | luồng Teacher/Student/Admin |
| Visual | Playwright screenshot | design system, màn hình chính |
| Security | pytest + script sandbox | §3 |
| Load | k6 | §4 |
| Chaos | script | kill worker/runner/container giữa run |

## 3. Bộ kiểm thử bảo mật runtime (bắt buộc pass trước P3)

| Case | Kỳ vọng |
|---|---|
| Fork bomb (shell và Python `os.fork` vòng lặp) | Bị giới hạn pids; container khác không ảnh hưởng |
| Cấp phát RAM vượt hạn mức | OOM-kill trong container; trạng thái báo rõ |
| Ghi file đến khi đầy | Dừng ở quota volume/tmpfs |
| In log vô hạn | Bị cắt ở giới hạn, `truncated=true` |
| `curl 169.254.169.254` (metadata) | Bị chặn |
| Kết nối IP control plane / RFC1918 | Bị chặn |
| Kết nối internet tùy ý từ subject/evaluator (`network: none`) | Bị chặn |
| `pip install` gói trong blocklist | Bị từ chối bởi proxy |
| Đọc `/var/run/docker.sock`, `/proc/1/root` host | Không tồn tại / không truy cập |
| Leo quyền `sudo`, setuid binary | Không có tác dụng (`no-new-privileges`) |
| Zip slip (`../../etc/passwd`) trong upload | Bị từ chối |
| Zip bomb | Dừng ở giới hạn giải nén |
| ONNX custom op / external data traversal | `validate-submission` từ chối |
| Excel `.xlsm`, ô chứa `=HYPERLINK`/HTML | Từ chối / render dạng text đã escape |
| RAG external endpoint trỏ `http://10.x`, DNS rebinding | Bị chặn (nếu bật chế độ external) |
| Student gọi API test case với `expected` hidden | Trường không có trong response |
| Workspace học viên A truy cập workspace/preview của B | 403 |

## 4. Kiểm thử mở rộng và độ tin cậy

| Kiểm thử | Mô tả | Mục tiêu **[GIẢ ĐỊNH]** |
|---|---|---|
| Đồng thời workspace | k6 mở N workspace + terminal | N = kịch bản "Thấp" (15) không lỗi; p95 độ trễ phím terminal < 150 ms |
| Đồng thời run | 10 run CV + 3 run RAG cùng lúc | Không mất run; hàng đợi đúng thứ tự; không vượt RAM host |
| Worker crash | Kill worker giữa RUNNING | Run → ERROR sau timeout giám sát; reaper dọn container ≤ 10' |
| Runner mất kết nối | Ngắt mạng control↔sandbox | Run không treo vô hạn; khôi phục được |
| Cancel | Hủy ở mỗi trạng thái | Kết thúc CANCELLED, cleanup sạch |
| Tái lập | Chạy lại run cũ với cùng submission + version | Metric CV giống hệt (deterministic) |
| Nâng cấp plugin | Đăng ký `cv-ok-ng@1.3.0` khi bài đang pin 1.2.0 | Bài cũ vẫn chạy 1.2.0; báo cáo compat cho Admin |
| Plugin thứ 3 | Thêm `echo-sample` | AC-11 |
| Contract v2 giả lập | Lõi chạy plugin v1 khi đã hỗ trợ v2 | Không vỡ |

## 5. Checklist nghiệm thu (dùng trong buổi demo)

- [ ] Đăng nhập 3 vai trò; menu khác nhau theo vai trò
- [ ] Import AI.xlsx, DE.xlsx, BA.xlsx; xem cảnh báo; xuất bản
- [ ] Danh sách khóa học 3 track; DE/BA có StatusBlock, không nút hành động
- [ ] Teacher tạo bài CV: template, test set ảnh có nhãn, contract, profile; kiểm tra; xuất bản
- [ ] Student mở workspace CV; chạy script; đổi tên file model; khai báo lại; nộp
- [ ] Chạy simulator CV; xem metric, confusion matrix, lọc FN; khối lưu ý môi trường test
- [ ] Nộp model sai shape → thông báo `ONNX_INPUT_SHAPE` dễ hiểu
- [ ] Student mở workspace RAG; chạy app; preview; nộp
- [ ] Chạy simulator RAG; câu hỏi có ảnh; một câu timeout được hiển thị đúng
- [ ] Đánh giá sao từng câu; reload; xem lại trong lịch sử
- [ ] Ghi chú critical hiển thị đỏ có nhãn chữ
- [ ] Hủy một run đang chạy; container được dọn
- [ ] Admin: bật/tắt plugin; xem audit log các hành động trên
- [ ] Demo PR `echo-sample`: diff chỉ trong thư mục plugin + package bài
- [ ] Trình bày kết quả security suite và chi phí/run đo được
- [ ] Design review: không icon AI, mọi chuỗi từ copy deck
