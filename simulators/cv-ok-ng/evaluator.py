"""Evaluator for cole.cv-ok-ng (contract simulator.v1).

Evaluates vision classification models for industrial defect inspection.
Computes confusion matrix (TP, TN, FP, FN), precision, recall, F1-score,
and estimated financial business loss caused by defect escapes (FN) and false alarms (FP).
"""
import ast
import time
from typing import Any

from cole_sim_sdk import Context, SubjectError, err, main


def describe(ctx: Context) -> None:
    ctx.write_describe({
        "id": "cole.cv-ok-ng",
        "version": "1.0.0",
        "renderer": "cv-grid@1",
        "metrics": [
            {"key": "f1_score", "label": "Điểm F1", "format": "decimal"},
            {"key": "recall", "label": "Recall (NG)", "format": "percent"},
            {"key": "precision", "label": "Precision (NG)", "format": "percent"},
            {"key": "accuracy", "label": "Độ chính xác", "format": "percent"},
            {"key": "business_cost_vnd", "label": "Tổn thất tài chính (VND)", "format": "currency"},
        ],
        "case_columns": [
            {"key": "classification", "label": "Phân loại"},
            {"key": "confidence", "label": "Độ tin cậy"},
            {"key": "latency_ms", "label": "Độ trễ"},
        ],
    })


def validate_profile(ctx: Context) -> None:
    p = ctx.profile
    errors = []
    thresh = p.get("decision_threshold", 0.5)
    if not isinstance(thresh, (int, float)) or not 0 <= thresh <= 1:
        errors.append(err("PROFILE_INVALID", "Ngưỡng quyết định phải nằm trong [0, 1].", "Ví dụ: decision_threshold: 0.5"))
    cases = list(ctx.cases())
    if not cases:
        errors.append(err("TESTSET_EMPTY", "Bộ kiểm thử rỗng."))
    for c in cases:
        label = (c.expected or {}).get("label")
        if label not in ("OK", "NG"):
            errors.append(err("TESTCASE_INVALID", f"Test case {c.key} nhãn kỳ vọng phải là OK hoặc NG, nhận được: {label}"))
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
    cfg = ctx.profile or {}
    thresh = float(cfg.get("decision_threshold", 0.5))
    costs_cfg = cfg.get("business_costs") or {}
    fn_cost = float(costs_cfg.get("false_negative", {}).get("unit_cost", 500000))
    fp_cost = float(costs_cfg.get("false_positive", {}).get("unit_cost", 40000))

    pass_criteria = cfg.get("pass_criteria") or {}
    min_recall = float(pass_criteria.get("recall_min", 0.85))
    min_precision = float(pass_criteria.get("precision_min", 0.85))

    cases = list(ctx.cases())
    ctx.log(f"Chờ sản phẩm sẵn sàng, {len(cases)} test case CV OK/NG")
    ctx.subject.wait_ready(60)

    tp, fp, tn, fn = 0, 0, 0, 0
    latencies = []
    out_cases = []
    t0 = time.time()

    for i, c in enumerate(cases, 1):
        expected_label = str((c.expected or {}).get("label", "OK")).strip().upper()
        row: dict[str, Any] = {"case_key": c.key}

        try:
            output, ms = ctx.subject.predict({"input": c.input}, timeout_s=10)
            latencies.append(ms)

            # Extract predicted label and confidence
            if isinstance(output, dict):
                confidence = float(output.get("confidence", output.get("score", 0.5)))
                if "label" in output:
                    pred_label = str(output["label"]).strip().upper()
                else:
                    pred_label = "NG" if confidence >= thresh else "OK"
            else:
                pred_label = str(output).strip().upper()
                confidence = 1.0

            # Classification
            if expected_label == "NG" and pred_label == "NG":
                tp += 1
                cls = "TP"
                ok = True
                msg = "Phát hiện khuyết tật chính xác (NG)"
            elif expected_label == "OK" and pred_label == "OK":
                tn += 1
                cls = "TN"
                ok = True
                msg = "Nhận diện hàng tốt chính xác (OK)"
            elif expected_label == "NG" and pred_label == "OK":
                fn += 1
                cls = "FN"
                ok = False
                msg = "Lọt hàng lỗi nghiêm trọng (NG đoán OK)"
            else:
                fp += 1
                cls = "FP"
                ok = False
                msg = "Loại nhầm hàng tốt (OK đoán NG)"

            out_data = {
                "label": pred_label,
                "confidence": round(confidence, 4),
                "classification": cls,
            }

            row.update(
                status="pass" if ok else "fail",
                score=1.0 if ok else 0.0,
                output=out_data,
                latency_ms=round(ms, 2),
                message=msg,
                detail={"classification": cls, "confidence": confidence, "expected": expected_label},
            )

        except SubjectError as e:
            if e.code in ("SUBJECT_UNREACHABLE",):
                raise
            row.update(status="error", score=0.0, message=e.code, detail={"error": e.detail[-800:]})

        out_cases.append(row)
        ctx.event("case", case_key=c.key, status=row["status"])
        ctx.progress(i, len(cases))

    total = len(cases)
    pos_pred = tp + fp
    pos_true = tp + fn
    precision = tp / pos_pred if pos_pred > 0 else 0.0
    recall = tp / pos_true if pos_true > 0 else 0.0
    f1 = 2 * precision * recall / (precision + recall) if (precision + recall) > 0 else 0.0
    accuracy = (tp + tn) / total if total > 0 else 0.0
    total_cost = fn * fn_cost + fp * fp_cost

    latencies.sort()
    p50 = latencies[len(latencies) // 2] if latencies else 0.0
    p95 = latencies[int(len(latencies) * 0.95)] if latencies else 0.0

    passed = (recall >= min_recall and precision >= min_precision)

    ctx.write_result(
        cases=out_cases,
        headline={
            "score": round(accuracy, 4),
            "f1_score": round(f1, 4),
            "recall": round(recall, 4),
            "precision": round(precision, 4),
            "accuracy": round(accuracy, 4),
            "business_cost_vnd": total_cost,
            "passed_cases": tp + tn,
            "total_cases": total,
        },
        metrics={
            "f1_score": round(f1, 4),
            "recall": round(recall, 4),
            "precision": round(precision, 4),
            "accuracy": round(accuracy, 4),
            "true_positives": tp,
            "false_positives": fp,
            "true_negatives": tn,
            "false_negatives": fn,
            "business_cost_vnd": total_cost,
            "latency_p50_ms": round(p50, 2),
            "latency_p95_ms": round(p95, 2),
            "duration_s": round(time.time() - t0, 2),
        },
        passed=passed,
        renderer="cv-grid@1",
        extra={
            "confusion_matrix": {
                "tp": tp,
                "fn": fn,
                "fp": fp,
                "tn": tn,
            },
            "columns": [
                {"key": "classification", "label": "Phân loại"},
                {"key": "confidence", "label": "Độ tin cậy"},
            ],
        },
    )


if __name__ == "__main__":
    main({
        "describe": describe,
        "validate-profile": validate_profile,
        "validate-submission": validate_submission,
        "run": run,
    })
