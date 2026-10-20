# Contract `simulator.v1`

Hợp đồng giữa nền tảng và một simulator plugin (thiết kế chi tiết: `docs/design/06`). SDK tham chiếu: `sdk/python/cole_sim_sdk`.

## 1. Gói plugin

```
simulators/<name>/
  plugin.yaml        # mô tả, phiên bản, image, renderer, chế độ hỗ trợ
  Dockerfile         # FROM cole/sim-base:1
  evaluator.py       # gọi cole_sim_sdk.main({...})
```

`plugin.yaml` tối thiểu:

```yaml
id: cole.echo-sample
version: 1.0.0
contract: simulator.v1
name: Bài mẫu nền tảng
image: cole/sim-echo-sample:1.0.0
renderer: generic-table@1
modes: [describe, validate-profile, validate-submission, run]
subject: {kind: python_entrypoint, artifact: entry, input_kind: json}
needs_llm: false
```

## 2. Chế độ chạy (`COLE_MODE`)

| Chế độ | Đầu vào trong `/cole/input` | Đầu ra bắt buộc trong `/cole/output` | Có subject? |
|---|---|---|---|
| `describe` | `run-spec.json` | `describe.json` | không |
| `validate-profile` | `run-spec.json`, `profile.json`, `testset/` | `validation.json` | không |
| `validate-submission` | `run-spec.json`, `profile.json`, `submission/` | `validation.json` | không |
| `run` | tất cả ở trên | `result.json` | có |

Mọi chế độ đều ghi `events.jsonl` (mỗi dòng một JSON: `{ts, type, ...}`; `type` ∈ `start|progress|case|log|warning|error|end`).

## 3. Biến môi trường

`COLE_MODE`, `COLE_RUN_ID`, `COLE_INPUT_DIR=/cole/input`, `COLE_OUTPUT_DIR=/cole/output`, `COLE_SUBJECT_URL` (vd `http://subject:8080`, chỉ ở chế độ `run`), `COLE_LLM_URL` (chỉ khi `needs_llm: true`).

## 4. Subject

Sản phẩm của học viên chạy trong container riêng, chỉ đọc `/submission`, không có Internet. Với `python_entrypoint`, harness của nền tảng mở:

- `GET /healthz` → 200 khi nạp được hàm; 503 `ENTRYPOINT_LOAD_FAILED` kèm traceback.
- `POST /predict` body `{"input": {...}}` (hoặc `{"image_b64": "..."}` khi `input_kind: image`) → `{"output": ..., "latency_ms": ...}`; lỗi của học viên → 500 `PREDICT_FAILED`.

Evaluator **không bao giờ** import mã học viên.

## 5. `validation.json`

```json
{"contract": "simulator.v1", "status": "valid|invalid",
 "errors": [{"code": "...", "message_vi": "...", "hint_vi": "...", "artifact_key": "entry|null"}],
 "warnings": []}
```

## 6. `result.json` (`cole.result/v1`)

```json
{"schema": "cole.result/v1", "status": "completed", "renderer": "generic-table@1",
 "summary": {"headline": {"score": 0.9, "passed_cases": 9, "total_cases": 10},
             "metrics": {"accuracy": 0.9}, "passed": true},
 "cases": [{"case_key": "tc_001", "status": "pass|fail|error", "score": 1.0,
            "output": {...}, "latency_ms": 1.2, "message": "...", "detail": {...}}]}
```

Nền tảng lọc trường hiển thị theo `field_visibility` của test case (`visible|after_run|hidden`) trước khi trả cho học viên; plugin không cần tự ẩn.

## 7. Mã thoát

`0` thành công · `2` lỗi plugin (`error.json`) · `3` chế độ không hỗ trợ · `4` lỗi subject (`ENTRYPOINT_LOAD_FAILED`, `SUBJECT_NOT_READY`…). Hết thời gian do runner xử lý (`timeout`).
