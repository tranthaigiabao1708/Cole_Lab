# 02 — Yêu cầu đã xác nhận, giả định, câu hỏi mở

## 1. Yêu cầu đã xác nhận (từ brief)

### Sản phẩm & phạm vi
| ID | Yêu cầu |
|---|---|
| R-01 | UI và kiến trúc điều hướng thể hiện đủ ba nhóm khóa học AI, DE, BA |
| R-02 | POC chỉ triển khai chức năng thực thi cho AI Engineer |
| R-03 | DE/BA: UI khung, navigation, cấu trúc dữ liệu, extension point; không có nghiệp vụ thực |
| R-04 | Một nền tảng dùng chung lõi; mở rộng theo loại bài tập; không xây ba hệ thống |
| R-05 | Thêm bài toán mới bằng cấu hình + template + test case + plugin, không sửa lõi |
| R-06 | Đề cương nhập từ Excel; giảng viên kiểm tra/chỉnh sửa trước khi xuất bản |

### Vai trò
| ID | Yêu cầu |
|---|---|
| R-10 | Bốn vai trò: Platform Admin, Teacher, Student, Simulator/Runtime (tác nhân hệ thống) |
| R-11 | Phân quyền, ranh giới trách nhiệm và luồng nghiệp vụ rõ ràng cho từng vai trò |

### Workspace / IDE
| ID | Yêu cầu |
|---|---|
| R-20 | Trải nghiệm gần IDE: file explorer, nhiều tab, syntax highlight, tìm kiếm, terminal, chạy chương trình, stdout/stderr, trạng thái tiến trình |
| R-21 | Upload/download file, quản lý dependency, lưu workspace, quản lý session |
| R-22 | Tách biệt editor trên trình duyệt với môi trường thực thi; không giả định trình duyệt có GPU |
| R-23 | Có thể mở rộng cho Python, ML/DL |

### Simulator
| ID | Yêu cầu |
|---|---|
| R-30 | Nền tảng plugin với contract chuẩn; không simulator đơn khối |
| R-31 | Plugin không thực thi code tùy ý trong tiến trình backend chính |
| R-32 | Lifecycle chuẩn: khởi tạo, kiểm tra submission, chạy test, thu kết quả, cleanup; có timeout, retry, cancel |
| R-33 | Kết quả theo schema chuẩn, cho phép dữ liệu đặc thù |
| R-34 | Versioning, đăng ký, bật/tắt plugin; kiểm thử tương thích nền tảng–SDK–plugin |
| R-35 | RAG: câu hỏi text và ảnh; giao diện chat; đánh giá 1–5 sao; latency, lỗi, nguồn tham chiếu; ghi chú nghiệp vụ cảnh báo đỏ, không tự phát hiện vi phạm |
| R-36 | RAG: không mặc định ONNX là gói hoàn chỉnh của ứng dụng RAG |
| R-37 | CV: ảnh/video có nhãn; artifact/entry point/định dạng model/API; kiểm tra ONNX; FP/FN/precision/recall/F1; phân biệt kết quả test với hiệu năng production |

### Submission
| ID | Yêu cầu |
|---|---|
| R-40 | Template thư mục, tài liệu hướng dẫn theo từng bài |
| R-41 | Khai báo artifact tường minh; không dò tên file theo heuristic làm cơ chế chính |
| R-42 | Manifest/schema, validation, versioning, thông báo lỗi dễ hiểu |

### Bảo mật
| ID | Yêu cầu |
|---|---|
| R-50 | Sandbox, quota CPU/RAM/GPU, timeout, giới hạn file/tiến trình/log, kiểm soát outbound |
| R-51 | Không lộ secret; tách đáp án chuẩn khỏi workspace; audit log; cleanup |
| R-52 | Bảo mật cơ bản bắt buộc ngay trong POC |

### Giao diện
| ID | Yêu cầu |
|---|---|
| R-60 | Không dùng icon mang tính AI; không chú thích tự tiện |
| R-61 | Ngôn ngữ thiết kế theo các mẫu sau giây 11 của reel tham chiếu; loại bỏ phong cách trước giây 10 |
| R-62 | DE/BA trạng thái "planned/not implemented" rõ ràng, không nút giả |

## 2. Giả định làm việc **[GIẢ ĐỊNH]**

| ID | Giả định | Ảnh hưởng nếu sai | Cách kiểm chứng |
|---|---|---|---|
| A-01 | POC dùng nội bộ, ≤ 30 học viên dùng đồng thời, ≤ 5 giảng viên | Sizing runner, chi phí | Hỏi PO ở Phase 0 |
| A-02 | Một tổ chức (trung tâm) trong POC; multi-tenant để sau, nhưng mọi bảng có `organization_id` | Phải refactor nếu cần multi-tenant sớm | PO xác nhận |
| A-03 | Ngôn ngữ chính trong workspace: Python 3.11, CPU-only | Cần GPU → hạ tầng khác hẳn | Review đề bài CV của giảng viên |
| A-04 | CV POC là **phân loại ảnh nhị phân** OK/NG; video là mở rộng | Detection/segmentation cần metric khác (mAP, IoU) | Giảng viên xác nhận đề bài |
| A-05 | Học viên huấn luyện model nặng ở Colab/máy riêng, upload ONNX vào workspace; workspace POC chỉ đủ train model nhỏ | Kỳ vọng train trong workspace → cần GPU | PO xác nhận |
| A-06 | RAG của học viên gọi LLM qua LLM gateway của nền tảng (virtual key, có hạn mức) | Nếu học viên dùng key riêng → chế độ endpoint ngoài là chính | PO + giảng viên |
| A-07 | Embedding model nhỏ chạy CPU trong container (vd sentence-transformers) chấp nhận được về latency | RAG run chậm | Spike Phase 0 |
| A-08 | Team: 1 tech lead, 2 backend, 1 frontend, 0.5 DevOps/Sec, 0.5 designer | Effort/timeline | Lead xác nhận |
| A-09 | Hosting: một cloud provider bất kỳ có VM hỗ trợ nested-virt hoặc gVisor; không ràng buộc on-prem | Lựa chọn sandbox | DevOps |
| A-10 | Đăng nhập email + mật khẩu do admin tạo tài khoản; SSO để sau | Auth effort | PO |
| A-11 | Giao diện tiếng Việt là chính, chuẩn bị i18n key cho tiếng Anh | Font, copy | Designer |
| A-12 | Notebook (Jupyter) không có trong POC | Đề cương AI dùng Colab nhiều | PO xác nhận non-goal |

## 3. Câu hỏi mở

### Chặn quyết định kỹ thuật **[CẦN XÁC NHẬN]**
| ID | Câu hỏi | Chặn |
|---|---|---|
| Q-01 | Có chấp nhận backend Python/FastAPI không? Team có kinh nghiệm stack nào? | Phase 1 |
| Q-02 | Hạ tầng POC: cloud nào, có được cấp VM riêng cho sandbox không? | Phase 1–2 |
| Q-03 | LLM provider nào được phép (OpenAI/Azure/Gemini/model tự host)? Ngân sách token POC? | Phase 5 (RAG) |
| Q-04 | RAG: học viên có được dùng API key riêng và endpoint tự host bên ngoài không? | Thiết kế contract RAG |
| Q-05 | Đề bài CV cụ thể: kích thước ảnh, số lượng test, có video không, positive class là NG? | Phase 4 (CV) |
| Q-06 | Kết quả test của học viên có tính vào điểm học tập trong POC không? | Mô hình Evaluation/Grade |

### Không chặn, cần trả lời trước Phase 6
| ID | Câu hỏi |
|---|---|
| Q-10 | Có yêu cầu lưu trữ dữ liệu trong nước / tuân thủ nào (dữ liệu cá nhân học viên)? |
| Q-11 | Giảng viên có cần xem workspace học viên trực tiếp (read-only) không? |
| Q-12 | Thời gian giữ workspace và submission sau khóa học? |
| Q-13 | Có cần tích hợp LMS hiện có (Moodle, Google Classroom…) không? |
| Q-14 | Học viên có được thấy nhãn chuẩn của từng mẫu test sau khi chạy không, hay chỉ thấy đúng/sai? |
