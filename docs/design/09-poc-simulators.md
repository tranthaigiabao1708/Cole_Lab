# 09 — Thiết kế chi tiết hai simulator POC

---

## A. `cole.rag-chatbot` — RAG Chatbot doanh nghiệp

### A.1 Mục tiêu sư phạm
Học viên xây ứng dụng RAG trên bộ tài liệu doanh nghiệp (AI.xlsx Buổi 48–54). Simulator gửi bộ câu hỏi chuẩn của giảng viên, hiển thị hội thoại, đo độ trễ/lỗi, và để **học viên tự đánh giá 1–5 sao** từng câu trả lời dựa trên ghi chú nghiệp vụ. POC **không** chấm tự động nội dung.

### A.2 Chế độ kết nối **[ĐỀ XUẤT — chờ Q-04]**

| Chế độ | Mô tả | Ưu | Rủi ro | POC |
|---|---|---|---|---|
| **managed** (chính) | Ứng dụng học viên chạy trong *subject container* từ snapshot submission; lệnh khởi động khai báo trong manifest; LLM qua gateway với virtual key của run | Tái lập, kiểm soát chi phí, không lộ key, không SSRF | Phải hỗ trợ dependency (vector DB nhúng, embedding CPU) trong image | ✓ |
| **external_endpoint** | Học viên tự host, khai báo URL HTTPS + header auth tùy chọn | Không giới hạn stack | SSRF, không tái lập, dữ liệu test lộ ra ngoài, học viên có thể hardcode đáp án | Tùy chọn, bật theo profile; mặc định tắt |

ONNX **không** được chấp nhận là artifact RAG: một ứng dụng RAG gồm retriever, index, prompt, lời gọi LLM — không đóng gói được thành một đồ thị ONNX. Contract RAG chỉ nhận `http_service`.

### A.3 Contract HTTP với ứng dụng học viên (`rag-chat/v1`) **[MINH HỌA]**

**Healthcheck:** `GET /healthz` → `200` trong `startup_timeout` (mặc định 120s, đủ cho việc nạp index).

**Hỏi đáp:** `POST /v1/chat`
```json
{
  "request_id": "tc_014-run_01J…",
  "question": {
    "text": "Khách hàng VIP đổi trả sau 10 ngày có được hoàn tiền không?",
    "images": [
      { "id": "img1", "mime": "image/png", "data_base64": "iVBORw0K…", "caption": "Ảnh hóa đơn" }
    ]
  },
  "conversation": [],
  "locale": "vi-VN"
}
```
Phản hồi `200`:
```json
{
  "answer": "Theo chính sách đổi trả mục 3.2 …",
  "sources": [
    { "title": "Chinh_sach_doi_tra_2026.pdf", "locator": "trang 4, mục 3.2", "snippet": "…", "score": 0.83 }
  ],
  "usage": { "model": "…", "prompt_tokens": 1820, "completion_tokens": 210 },
  "metadata": {}
}
```
- `answer` bắt buộc, chuỗi ≤ 16 KB. `sources`, `usage`, `metadata` tùy chọn.
- **Ảnh:** mặc định truyền **inline base64** (≤ 4 MB/ảnh, ≤ 4 ảnh/câu, chỉ PNG/JPEG/WebP, đã re-encode bởi nền tảng để loại metadata/payload lạ). Không truyền URL nội bộ cho subject. Chế độ external: chỉ inline base64, không bao giờ gửi signed URL storage ra ngoài.
- `conversation` để trống trong POC; giữ chỗ cho test hội thoại nhiều lượt.

### A.4 Test case RAG (`testcase.schema.json`) **[MINH HỌA]**
```yaml
case_key: tc_014
question:
  text: "Khách hàng VIP đổi trả sau 10 ngày có được hoàn tiền không?"
  images: [ { file: images/hoa_don_014.png, caption: "Ảnh hóa đơn" } ]
reference:                       # chỉ teacher thấy; dùng cho chấm tự động sau này
  answer_outline: "Không hoàn tiền mặt; được đổi sản phẩm nếu còn tem…"
  source_documents: ["Chinh_sach_doi_tra_2026.pdf#3.2"]
notes:                           # hiển thị cho học viên khi đánh giá
  - { severity: critical, text: "Không được hứa hoàn tiền mặt ngoài 7 ngày." }
  - { severity: critical, text: "Không tiết lộ thông tin cá nhân của khách hàng khác." }
  - { severity: info,     text: "Nên dẫn nguồn mục chính sách." }
criteria: [overall]              # tham chiếu RubricCriterion
tags: [doi-tra, vip, multimodal]
field_visibility: { question: public, reference: hidden, notes: public }
```
`severity: critical` → hiển thị **khối cảnh báo đỏ** trong UI kèm nhãn chữ "Quy tắc bắt buộc" (không chỉ dựa vào màu, đảm bảo accessibility). Hệ thống **không** kiểm tra tự động; chỉ hiển thị.

### A.5 Simulator profile **[MINH HỌA]**
```yaml
plugin: cole.rag-chatbot
version_range: "~1.0"
config:
  connection_modes_allowed: [managed]       # thêm external_endpoint nếu Q-04 = có
  per_case_timeout_seconds: 60
  startup_timeout_seconds: 120
  retries_on_connection_error: 1
  concurrency: 1                             # tuần tự để đo latency ổn định
  llm_budget_per_run_usd: 0.50               # gateway chặn khi vượt [GIẢ ĐỊNH]
  max_answer_chars: 16000
  show_sources: true
  rating:
    criteria: [overall]
    required_before_resubmit: false
```

### A.6 Xử lý lỗi theo từng câu

| Tình huống | `TestResult.status` | `data.error_code` | Hiển thị |
|---|---|---|---|
| 200, `answer` hợp lệ | `needs_review` | — | Bong bóng trả lời + nguồn + latency |
| Timeout | `error` | `TIMEOUT` | "Không phản hồi trong 60s" |
| Lỗi kết nối (sau retry) | `error` | `CONNECTION_FAILED` | + log subject 50 dòng cuối |
| HTTP 4xx/5xx | `error` | `HTTP_<code>` | Mã + 2 KB body đầu (đã escape) |
| JSON sai schema | `error` | `INVALID_RESPONSE` | Trường sai |
| `answer` rỗng/chỉ khoảng trắng | `failed` | `EMPTY_ANSWER` | "Câu trả lời rỗng" |
| Vượt độ dài | `failed` | `ANSWER_TOO_LONG` | Cắt hiển thị |
| Gateway hết hạn mức | `error` | `LLM_BUDGET_EXCEEDED` | Dừng các câu còn lại, `skipped` |

Đo: `latency_ms` (từ gửi đến nhận đủ body), `usage` từ **gateway** (đáng tin) đối chiếu `usage` tự khai của học viên. Chi phí chỉ hiển thị khi gateway có số liệu (đáp ứng "chi phí chỉ tính khi có số liệu đo phù hợp").

### A.7 Luồng UI (renderer `rag-chat@1`)
1. Trước run: danh sách câu hỏi (text + thumbnail ảnh), trạng thái subject.
2. Trong run: các bong bóng xuất hiện tuần tự theo event `test_result`.
3. Sau run: mỗi cặp hỏi–đáp có khối ghi chú nghiệp vụ (đỏ cho `critical`), danh sách nguồn có thể mở rộng, latency, và `<RatingControl>` 1–5 (component lõi) + ô nhận xét.
4. Tổng hợp: số câu đã đánh giá / tổng, điểm trung bình, phân bố sao, latency p50/p95, số lỗi; so sánh với submission trước.

### A.8 Mở rộng sang chấm tự động (sau POC)
`reference.answer_outline`, `source_documents` và `criteria` đã có trong dữ liệu; thêm evaluator `auto` (LLM-as-judge qua gateway hoặc metric như faithfulness) ghi vào bảng `evaluation` cùng schema. Quy trình hiệu chỉnh: so sánh tương quan với đánh giá giảng viên trước khi cho phép tính điểm.

---

## B. `cole.cv-ok-ng` — Computer Vision kiểm tra OK/NG

### B.1 Mục tiêu sư phạm
Học viên huấn luyện model phân loại ảnh sản phẩm OK/NG (AI.xlsx Buổi 29–39), nộp theo contract; simulator chạy trên bộ test có nhãn chuẩn và báo cáo lỗi theo góc nhìn nghiệp vụ (lọt lỗi vs loại nhầm).

### B.2 Chế độ nộp

| Chế độ | Học viên nộp | Ai chạy inference | Code học viên có chạy? | POC |
|---|---|---|---|---|
| **onnx_only** | `model.onnx` + `preprocess.yaml` + `labels.yaml` | Evaluator (onnxruntime) | **Không** — an toàn nhất | ✓ (làm trước) |
| **python_impl** | `inference.py:predict` + model tùy định dạng (onnx/pt CPU) | Subject container chạy server bọc hàm `predict` (do nền tảng cung cấp), evaluator gọi qua HTTP nội bộ | Có, trong sandbox không mạng | ✓ |
| http_service | Học viên tự viết API | Subject | Có | Sau POC |

Trong `python_impl`, nền tảng cung cấp **harness server** cố định (không phải học viên viết) nạp `module:function` theo manifest và phơi `POST /predict` → học viên chỉ viết hàm, nền tảng kiểm soát giao thức.

### B.3 Preprocessing & labels (khai báo, không phải code) **[MINH HỌA]**
```yaml
# configs/preprocess.yaml — theo preprocessing.schema.json của plugin
input_name: input            # tên input trong đồ thị ONNX
color: RGB                   # RGB | BGR | GRAY
resize: { width: 224, height: 224, mode: letterbox }   # stretch | letterbox | center_crop
scale: 1/255
normalize: { mean: [0.485, 0.456, 0.406], std: [0.229, 0.224, 0.225] }
layout: NCHW
dtype: float32
output: { name: logits, type: logits }  # logits | probabilities | single_score
```
```yaml
# configs/labels.yaml
classes: [OK, NG]            # theo thứ tự output index
positive_class: NG           # lớp "dương tính" khi tính precision/recall
```

### B.4 Kiểm tra ONNX (`validate-submission`)
1. Kích thước ≤ giới hạn; magic/protobuf parse được; `onnx.checker.check_model`.
2. Opset trong dải onnxruntime của image hỗ trợ; **chặn custom op domain** ngoài `ai.onnx`/`ai.onnx.ml`; chặn external data trỏ ra ngoài thư mục.
3. Đúng 1 input khớp `input_name`; shape `[N|dynamic, C, H, W]` khớp `layout`, `resize`, `color` (C=1 hoặc 3).
4. Output khớp `output.type` và số lớp = `len(classes)` (hoặc 1 với `single_score`).
5. Dry-run 1 ảnh giả trong ≤ 10s; output hữu hạn (không NaN/Inf).
Mỗi bước sai → mã lỗi ở [08 §8.4](08-data-model.md).

### B.5 Test set và profile **[MINH HỌA]**
```yaml
# test-cases/testset.yaml (index; file ảnh và nhãn ở bucket answer_key)
format: cv-classification/v1
classes: [OK, NG]
items_index: storage://answer_key/ts_cv_okng/v2/index.jsonl   # {case_key, file, label, tags}
counts: { OK: 220, NG: 180 }
```
```yaml
plugin: cole.cv-ok-ng
version_range: "~1.2"
config:
  decision_threshold: 0.5         # trên xác suất lớp dương (NG)
  allow_student_threshold: false
  per_case_timeout_seconds: 5
  warmup_cases: 5                 # loại khỏi đo latency
  business_costs:                 # tùy chọn — tác động nghiệp vụ
    false_negative: { label: "Lọt hàng lỗi", unit_cost: 500000, currency: VND }
    false_positive: { label: "Loại nhầm hàng tốt", unit_cost: 40000, currency: VND }
  reveal_expected_after_run: true
  pass_criteria:                  # hiển thị "đạt tiêu chí bài", không phải điểm
    recall_min: 0.90
    precision_min: 0.85
```

### B.6 Metric
Với `positive_class = NG`:
- **TP**: NG đoán NG · **FN**: NG đoán OK (*lọt lỗi*) · **FP**: OK đoán NG (*loại nhầm*) · **TN**: OK đoán OK.
- Precision = TP/(TP+FP); Recall = TP/(TP+FN); F1; Accuracy; Specificity; confusion matrix.
- Latency p50/p95/max (bỏ warm-up), throughput ảnh/giây **trong môi trường evaluation**.
- Chi phí nghiệp vụ ước tính = FN×cost_FN + FP×cost_FP (nếu cấu hình).
- Tùy chọn mở rộng: đường cong PR theo ngưỡng (khi output là xác suất), phân tích theo `tags` (loại lỗi: trầy, móp, thiếu linh kiện).

### B.7 Hiển thị (renderer `cv-grid@1`)
- Dải số liệu lớn: Precision · Recall · F1 · FN · FP; đánh dấu đạt/chưa đạt tiêu chí bài.
- Confusion matrix 2×2 với nhãn nghiệp vụ.
- Lưới ảnh lọc theo TP/FP/FN/TN và tag; mỗi ô: ảnh, dự đoán, score, nhãn chuẩn (nếu được phép).
- So sánh với submission trước (delta từng metric).
- **Khối lưu ý cố định:** "Kết quả đo trên bộ test N ảnh trong môi trường 1 vCPU dùng chung. Không phản ánh độ chính xác hay tốc độ trong dây chuyền thực tế (ánh sáng, camera, phân bố lỗi, phần cứng khác)." — câu chữ lấy từ copy deck đã duyệt.

### B.8 Video (mở rộng)
Testset `cv-video/v1`: video + nhãn theo khung/đoạn; evaluator tách khung theo `fps_sample`; metric theo đoạn và throughput thời gian thực. Contract và renderer riêng (`cv-video@1`), không ảnh hưởng `cv-grid@1`.
