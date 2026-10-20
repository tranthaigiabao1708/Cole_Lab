# 03 — Phạm vi POC và Non-goals

## 1. Mục tiêu của POC

1. Team và stakeholder **hình dung được sản phẩm hoàn chỉnh** qua UI ba nhóm khóa học.
2. **Chứng minh tính khả thi** của bốn rủi ro kỹ thuật lớn nhất:
   - Workspace trên web chạy code Python an toàn.
   - Plugin simulator thêm được mà không sửa lõi.
   - Submission theo contract, không phụ thuộc tên file.
   - Kiểm soát chi phí và bảo mật khi sản phẩm học viên gọi LLM.
3. Có số liệu thực để ước lượng chi phí vận hành mỗi run/assignment.

## 2. Trong phạm vi (In scope)

| Nhóm | Hạng mục POC |
|---|---|
| Danh tính | Đăng nhập email/mật khẩu, 3 vai trò người dùng, RBAC theo course |
| Chương trình | Course / Module / Lesson cho AI, DE, BA; **import Excel cho cả 3 file hiện có**; nháp → xuất bản |
| Bài tập | Assignment + AssignmentVersion bất biến khi xuất bản; README, tài liệu, project template, dataset, test case, submission contract, simulator profile |
| Assignment package | Định dạng thư mục/zip chuẩn để import/export bài tập (seed 2 bài AI qua package) |
| Workspace | Container Python 3.11 CPU; file tree, tab, Monaco, tìm trong file và trong workspace, terminal xterm.js, chạy lệnh, upload/download, `pip install` qua mirror có kiểm soát, autosave, snapshot |
| Submission | Bảng khai báo artifact, sinh manifest, validate schema + validate của plugin, lịch sử phiên bản |
| Runner | Hàng đợi job, container cô lập (gVisor), quota, timeout, cancel, log streaming, cleanup |
| Plugin | SDK Python, contract `simulator.v1`, registry, bật/tắt, pin version theo assignment |
| Simulator | `cole.cv-ok-ng` (ONNX + python entrypoint), `cole.rag-chatbot` (managed app; external endpoint tùy quyết định Q-04), `cole.echo-sample` (chứng minh mở rộng) |
| Đánh giá | Kết quả kỹ thuật theo test case; đánh giá sao 1–5 cho RAG; ghi chú giảng viên |
| Bảo mật | Xem danh sách "bắt buộc POC" ở [11](11-runtime-security-resources.md) |
| UI | Toàn bộ điều hướng AI/DE/BA; DE/BA ở trạng thái "Chưa triển khai" có nội dung đề cương thật |

## 3. Ngoài phạm vi (Non-goals)

| Non-goal | Lý do | Giai đoạn dự kiến |
|---|---|---|
| Nghiệp vụ DE (SQL Server, SSIS, Spark, Kafka, Airflow runtime) | R-03 | Sau POC |
| Nghiệp vụ BA (soạn BRD/SRS, BPMN editor, roleplay stakeholder) | R-03 | Sau POC |
| GPU trong workspace hoặc evaluation | Chi phí, độ phức tạp điều phối | Mở rộng |
| Jupyter notebook trong workspace | Tránh hai trải nghiệm editor song song trong POC | Mở rộng (JupyterLab hoặc renderer `.ipynb`) |
| Chấm điểm tự động bằng LLM-as-judge | Cần kiểm định độ tin cậy | Mở rộng; data model đã sẵn |
| Tự động phát hiện vi phạm quy tắc nghiệp vụ trong câu trả lời RAG | Brief nói rõ | Mở rộng |
| Object detection / segmentation / video trong CV | Metric và UI khác | Mở rộng; contract có chỗ |
| Git tích hợp UI (commit/push/PR) | Terminal đã có `git` local | Mở rộng |
| LSP đầy đủ (autocomplete thông minh, go-to-definition) | Effort lớn, không chứng minh rủi ro chính | Mở rộng |
| Multi-tenant nhiều tổ chức | A-02 | Mở rộng |
| SSO, thanh toán, chứng chỉ, gamification | Không liên quan tính khả thi | Sau POC |
| Mobile app | — | Không dự kiến |
| UI plugin dạng micro-frontend nạp động | POC dùng renderer đăng ký tĩnh | Mở rộng |

## 4. Ranh giới DE/BA trong POC (để tránh "nút giả")

- Có: trang khóa học, cây module/buổi từ Excel, mô tả loại bài tập dự kiến (vd "Pipeline ETL", "Phân tích yêu cầu") với nhãn **Chưa triển khai trong POC**.
- Không có: nút "Mở workspace", "Nộp bài", "Chạy simulator" cho DE/BA. Các vị trí đó hiển thị khối trạng thái tĩnh nêu rõ chức năng thuộc giai đoạn sau.
- Có trong data model: `course.track = DE|BA`, `simulator_plugin.track_compatibility`, `runtime_profile` placeholder (vd `sql-sandbox`, `doc-review`) ở trạng thái `planned` — không có image.
