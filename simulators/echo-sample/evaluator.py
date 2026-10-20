"""Evaluator for cole.echo-sample (contract simulator.v1).

Calls the learner's predict() (in the subject container) on each hidden test case and
compares the output with the expected value. Pure platform-sample logic; no ML.
"""
import ast
import time

from cole_sim_sdk import Context, SubjectError, err, main


def describe(ctx: Context) -> None:
    ctx.write_describe({
        "id": "cole.echo-sample",
        "version": "1.0.0",
        "metrics": [{"key": "accuracy", "label": "Tỉ lệ đạt", "format": "percent"}],
        "case_columns": [
            {"key": "input.text", "label": "Đầu vào"},
            {"key": "expected.text", "label": "Mong đợi"},
            {"key": "output.text", "label": "Kết quả"},
        ],
    })


def validate_profile(ctx: Context) -> None:
    p = ctx.profile
    errors = []
    if p.get("comparison", "exact") not in ("exact", "casefold"):
        errors.append(err("PROFILE_INVALID", "Kiểu so sánh không hợp lệ.", "Dùng exact hoặc casefold."))
    thr = p.get("pass_threshold", 0.8)
    if not isinstance(thr, (int, float)) or not 0 <= thr <= 1:
        errors.append(err("PROFILE_INVALID", "Ngưỡng đạt phải nằm trong [0, 1]."))
    cases = list(ctx.cases())
    if not cases:
        errors.append(err("TESTSET_EMPTY", "Bộ kiểm thử rỗng."))
    for c in cases:
        if not isinstance(c.input.get("text"), str) or not isinstance((c.expected or {}).get("text"), str):
            errors.append(err("TESTCASE_INVALID", f"Test case {c.key} thiếu trường text."))
    ctx.write_validation(errors)


def validate_submission(ctx: Context) -> None:
    """Plugin-specific checks beyond the platform's structural validation."""
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
            errors.append(err("SIGNATURE_MISMATCH", "Hàm phải nhận đúng một tham số (input: dict).",
                              "Ví dụ: def predict(input: dict) -> dict:", "entry"))
        else:
            body = [n for n in f.body if not isinstance(n, ast.Expr)]
            if len(body) == 1 and isinstance(body[0], ast.Raise):
                warnings.append(err("NOT_IMPLEMENTED", "Hàm có vẻ chưa được cài đặt (chỉ raise).", "", "entry"))
    ctx.write_validation(errors, warnings)


def _norm(v, mode: str):
    if isinstance(v, str) and mode == "casefold":
        return v.casefold()
    return v


def run(ctx: Context) -> None:
    assert ctx.subject is not None, "run mode requires a subject"
    mode = ctx.profile.get("comparison", "exact")
    thr = float(ctx.profile.get("pass_threshold", 0.8))
    per_case = float(ctx.profile.get("timeout_per_case_s", 5))
    cases = list(ctx.cases())
    ctx.log(f"Chờ sản phẩm sẵn sàng, {len(cases)} test case")
    ctx.subject.wait_ready(60)
    out_cases, passed, latencies = [], 0, []
    t0 = time.time()
    for i, c in enumerate(cases, 1):
        row = {"case_key": c.key}
        try:
            output, ms = ctx.subject.predict({"input": c.input}, timeout_s=per_case)
            latencies.append(ms)
            ok = isinstance(output, dict) and _norm(output.get("text"), mode) == _norm((c.expected or {}).get("text"), mode)
            row.update(status="pass" if ok else "fail", score=1.0 if ok else 0.0, output=output, latency_ms=ms)
            if not ok:
                row["message"] = "Đầu ra khác kết quả mong đợi." if isinstance(output, dict) else "Hàm phải trả về dict."
            passed += ok
        except SubjectError as e:
            if e.code in ("SUBJECT_UNREACHABLE",):
                raise
            row.update(status="error", score=0.0, message=e.code, detail={"error": e.detail[-800:]})
        out_cases.append(row)
        ctx.event("case", case_key=c.key, status=row["status"])
        ctx.progress(i, len(cases))
    total = len(cases)
    acc = passed / total if total else 0.0
    ctx.write_result(
        cases=out_cases,
        headline={"score": round(acc, 4), "passed_cases": passed, "total_cases": total},
        metrics={"accuracy": round(acc, 4),
                 "latency_p50_ms": round(sorted(latencies)[len(latencies) // 2], 2) if latencies else None,
                 "duration_s": round(time.time() - t0, 2)},
        passed=acc >= thr,
        renderer="generic-table@1",
        extra={"columns": [
            {"key": "input.text", "label": "Đầu vào"},
            {"key": "expected.text", "label": "Mong đợi"},
            {"key": "output.text", "label": "Kết quả"},
        ]},
    )


if __name__ == "__main__":
    main({"describe": describe, "validate-profile": validate_profile,
          "validate-submission": validate_submission, "run": run})
