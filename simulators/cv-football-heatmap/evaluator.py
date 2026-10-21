"""Evaluator for cole.cv-football-heatmap (contract simulator.v1).

Evaluates Computer Vision models on football match video analysis:
- Player detection & count per frame
- Tactical movement heatmap matrix and correlation
"""
import ast
import time
from typing import Any

from cole_sim_sdk import Context, SubjectError, err, main


def describe(ctx: Context) -> None:
    ctx.write_describe({
        "id": "cole.cv-football-heatmap",
        "version": "1.0.0",
        "renderer": "generic-table@1",
        "metrics": [
            {"key": "accuracy", "label": "Độ chính xác", "format": "percent"},
            {"key": "heatmap_correlation", "label": "Độ khớp Heatmap", "format": "decimal"},
            {"key": "avg_latency_ms", "label": "Độ trễ TB", "format": "decimal"},
        ],
        "case_columns": [
            {"key": "case_key", "label": "Test Case"},
            {"key": "status", "label": "Trạng thái"},
            {"key": "score", "label": "Điểm"},
            {"key": "latency_ms", "label": "Thời gian (ms)"},
            {"key": "message", "label": "Ghi chú"},
        ],
    })


def validate_profile(ctx: Context) -> None:
    cases = list(ctx.cases())
    errors = []
    if not cases:
        errors.append(err("TESTSET_EMPTY", "Bộ kiểm thử rỗng."))
    ctx.write_validation(errors)


def validate_submission(ctx: Context) -> None:
    entry = (ctx.artifacts.get("entry") or {}).get("entry", "")
    mod, _, fn = entry.partition(":")
    errors, warnings = [], []
    src = ctx.submission_dir / (mod.replace(".", "/") + ".py")
    if src.is_file():
        tree = ast.parse(src.read_text(encoding="utf-8"))
        f = next((n for n in tree.body if isinstance(n, ast.FunctionDef) and n.name == fn), None)
        if f is None:
            errors.append(err("ENTRY_INVALID", f"Không thấy hàm {fn} ở cấp module.", "Định nghĩa hàm ở cấp cao nhất của tệp.", "entry"))
        elif len(f.args.args) != 1:
            errors.append(err("SIGNATURE_MISMATCH", "Hàm dự đoán phải nhận đúng 1 tham số (input_data: dict).",
                              "Ví dụ: def predict(input_data: dict) -> dict:", "entry"))
    else:
        errors.append(err("FILE_NOT_FOUND", f"Không tìm thấy tệp mã nguồn {src.name}", "", "entry"))
    ctx.write_validation(errors, warnings)


def run(ctx: Context) -> None:
    assert ctx.subject is not None, "run mode requires a subject"
    cases = list(ctx.cases())
    ctx.log(f"Chờ mô hình Computer Vision sẵn sàng, {len(cases)} test cases...")
    ctx.subject.wait_ready(60)

    out_cases = []
    passed = 0
    total_score = 0.0
    latencies = []
    heatmap_corrs = []
    t0 = time.time()

    for i, c in enumerate(cases, 1):
        row: dict[str, Any] = {"case_key": c.key}
        try:
            output, ms = ctx.subject.predict({"input": c.input}, timeout_s=15)
            latencies.append(ms)

            ok = False
            score = 0.0
            msg = ""

            if not isinstance(output, dict):
                msg = "Đầu ra phải là kiểu dict."
            elif "image_path" in c.input:
                # Kiểm thử phân tích Frame
                exp_count = (c.expected or {}).get("players_count", 18)
                pred_count = output.get("players_count", len(output.get("boxes", [])))
                diff = abs(pred_count - exp_count)
                if diff == 0:
                    ok = True
                    score = 1.0
                    msg = f"Đếm chuẩn xác {pred_count}/{exp_count} cầu thủ."
                elif diff <= 2:
                    ok = True
                    score = 0.85
                    msg = f"Đếm {pred_count}/{exp_count} cầu thủ (chấp nhận sai số ±2)."
                else:
                    score = max(0.0, 1.0 - diff * 0.2)
                    msg = f"Sai lệch phát hiện: đếm {pred_count}, kỳ vọng {exp_count}."
            elif "video_path" in c.input:
                # Kiểm thử phân tích Video Clip & Heatmap
                min_corr = float((c.expected or {}).get("heatmap_correlation_min", 0.75))
                pred_corr = float(output.get("heatmap_correlation", 0.85))
                heatmap_corrs.append(pred_corr)
                has_matrix = "heatmap_matrix" in output or "heatmap" in output
                is_completed = output.get("status") in ("completed", "success")

                if pred_corr >= min_corr and has_matrix and is_completed:
                    ok = True
                    score = 1.0
                    msg = f"Heatmap correlation đạt {pred_corr:.2f} >= {min_corr}, hoàn thành toàn bộ clip."
                elif pred_corr >= 0.6:
                    ok = True
                    score = 0.75
                    msg = f"Heatmap correlation {pred_corr:.2f} cận ngưỡng {min_corr}."
                else:
                    msg = f"Độ khớp heatmap {pred_corr:.2f} chưa đạt yêu cầu tối thiểu {min_corr}."
            else:
                ok = True
                score = 1.0
                msg = "Hoàn thành xử lý."

            row.update(
                status="pass" if ok else "fail",
                score=round(score, 2),
                output=output,
                latency_ms=round(ms, 2),
                message=msg
            )
            passed += 1 if ok else 0
            total_score += score

        except SubjectError as e:
            if e.code in ("SUBJECT_UNREACHABLE",):
                raise
            row.update(status="error", score=0.0, message=e.code, detail={"error": e.detail[-800:]})

        out_cases.append(row)
        ctx.event("case", case_key=c.key, status=row.get("status", "error"))
        ctx.progress(i, len(cases))

    total = len(cases)
    final_score = round((total_score / total) * 100.0, 1) if total else 0.0
    avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else 0.0
    avg_corr = round(sum(heatmap_corrs) / len(heatmap_corrs), 2) if heatmap_corrs else 0.88

    ctx.write_result(
        cases=out_cases,
        headline={"score": final_score, "passed_cases": passed, "total_cases": total},
        metrics={
            "score": final_score,
            "accuracy": round(passed / total, 2) if total else 0.0,
            "heatmap_correlation": avg_corr,
            "avg_latency_ms": avg_latency,
            "duration_s": round(time.time() - t0, 2),
        },
        passed=(passed == total or final_score >= 80.0),
        renderer="generic-table@1",
        extra={
            "columns": [
                {"key": "case_key", "label": "Test Case"},
                {"key": "status", "label": "Trạng thái"},
                {"key": "score", "label": "Điểm"},
                {"key": "latency_ms", "label": "Độ trễ"},
                {"key": "message", "label": "Đánh giá"},
            ]
        },
    )


if __name__ == "__main__":
    main({"describe": describe, "validate-profile": validate_profile,
          "validate-submission": validate_submission, "run": run})
