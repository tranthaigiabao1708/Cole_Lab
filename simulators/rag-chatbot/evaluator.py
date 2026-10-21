"""Evaluator for cole.rag-chatbot (contract simulator.v1).

Tests enterprise RAG chatbots over business policies & handbooks.
Verifies multimodal inline image support, 8 error scenarios (doc 09 §A.6),
measures latency, token usage, and produces structured chat dialogues for student self-evaluation.
"""
import ast
import json
import os
import time
from typing import Any
import urllib.request
import urllib.error

from cole_sim_sdk import Context, SubjectError, err, main


def describe(ctx: Context) -> None:
    ctx.write_describe({
        "id": "cole.rag-chatbot",
        "version": "1.0.0",
        "renderer": "rag-chat@1",
        "metrics": [
            {"key": "total_questions", "label": "Tổng số câu hỏi", "format": "number"},
            {"key": "success_rate", "label": "Tỷ lệ trả lời", "format": "percent"},
            {"key": "avg_latency_ms", "label": "Độ trễ trung bình", "format": "ms"},
            {"key": "p95_latency_ms", "label": "Độ trễ P95", "format": "ms"},
            {"key": "error_count", "label": "Số câu lỗi", "format": "number"},
        ],
        "case_columns": [
            {"key": "question", "label": "Câu hỏi"},
            {"key": "status", "label": "Trạng thái"},
            {"key": "latency_ms", "label": "Độ trễ"},
            {"key": "sources_count", "label": "Số nguồn dẫn"},
        ],
    })


def validate_profile(ctx: Context) -> None:
    errors = []
    cases = list(ctx.cases())
    if not cases:
        errors.append(err("TESTSET_EMPTY", "Bộ kiểm thử rỗng."))
    for c in cases:
        q = (c.input or {}).get("question") or {}
        if not q.get("text") and not q.get("images"):
            errors.append(err("TESTCASE_INVALID", f"Test case {c.key} phải có ít nhất text hoặc images."))
    ctx.write_validation(errors)


def validate_submission(ctx: Context) -> None:
    entry = (ctx.artifacts.get("entry") or {}).get("entry", "")
    errors, warnings = [], []
    if not entry:
        errors.append(err("ENTRY_MISSING", "Chưa khai báo entrypoint cho RAG HTTP service.", "Khai báo artifact entry (ví dụ: app.main:app) trong manifest.", "entry"))
    ctx.write_validation(errors, warnings)


def run(ctx: Context) -> None:
    profile = ctx.profile or {}
    budget_usd = profile.get("llm_budget_per_run_usd", 0.50)
    per_case_timeout = profile.get("per_case_timeout_seconds", 60)
    max_answer_chars = profile.get("max_answer_chars", 16000)

    subject_host = os.environ.get("COLE_SUBJECT_HOST", "127.0.0.1")
    subject_port = int(os.environ.get("COLE_SUBJECT_PORT", "8000"))
    base_url = (os.environ.get("COLE_SUBJECT_URL") or f"http://{subject_host}:{subject_port}").rstrip("/")

    cases = list(ctx.cases())
    out_cases = []
    latencies = []
    errors_count = 0
    budget_exceeded = False

    for i, c in enumerate(cases, start=1):
        q_data = (c.input or {}).get("question") or {}
        notes = (c.input or {}).get("notes") or []
        reference = (c.expected or {}).get("reference") or {}

        row = {
            "case_key": c.key,
            "status": "needs_review",
            "score": 1.0,
            "latency_ms": 0.0,
            "message": "",
            "detail": {
                "question": q_data,
                "notes": notes,
                "reference": reference,
                "answer": "",
                "sources": [],
                "usage": {},
                "error_code": None,
            },
        }

        if budget_exceeded:
            row.update(status="skipped", score=0.0, message="Bỏ qua do vượt hạn mức ngân sách.")
            row["detail"]["error_code"] = "LLM_BUDGET_EXCEEDED"
            out_cases.append(row)
            continue

        req_payload = {
            "request_id": f"{c.key}-run",
            "question": q_data,
            "conversation": [],
            "locale": "vi-VN",
        }

        t0 = time.perf_counter()
        req = urllib.request.Request(
            f"{base_url}/v1/chat",
            data=json.dumps(req_payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        try:
            with urllib.request.urlopen(req, timeout=per_case_timeout) as resp:
                status_code = resp.status
                body_bytes = resp.read()
                latency_ms = (time.perf_counter() - t0) * 1000
                latencies.append(latency_ms)
                row["latency_ms"] = round(latency_ms, 2)

                try:
                    data = json.loads(body_bytes.decode("utf-8"))
                except Exception:
                    row.update(status="error", score=0.0, message="Phản hồi không phải JSON hợp lệ.")
                    row["detail"]["error_code"] = "INVALID_RESPONSE"
                    errors_count += 1
                    out_cases.append(row)
                    continue

                answer = str(data.get("answer") or "")
                sources = data.get("sources") or []
                usage = data.get("usage") or {}

                row["detail"]["answer"] = answer
                row["detail"]["sources"] = sources
                row["detail"]["usage"] = usage

                # Validate error conditions per doc 09 §A.6
                if not answer.strip():
                    row.update(status="failed", score=0.0, message="Câu trả lời rỗng.")
                    row["detail"]["error_code"] = "EMPTY_ANSWER"
                    errors_count += 1
                elif len(answer) > max_answer_chars:
                    row.update(status="failed", score=0.0, message="Câu trả lời vượt quá giới hạn ký tự cho phép.")
                    row["detail"]["error_code"] = "ANSWER_TOO_LONG"
                    errors_count += 1
                else:
                    row.update(status="needs_review", score=1.0, message="Đã trả lời, chờ học viên đánh giá.")

        except urllib.error.HTTPError as e:
            latency_ms = (time.perf_counter() - t0) * 1000
            row["latency_ms"] = round(latency_ms, 2)
            errors_count += 1
            if e.code == 429:
                row.update(status="error", score=0.0, message="Vượt ngân sách LLM.")
                row["detail"]["error_code"] = "LLM_BUDGET_EXCEEDED"
                budget_exceeded = True
            else:
                row.update(status="error", score=0.0, message=f"HTTP {e.code}: {e.reason}")
                row["detail"]["error_code"] = f"HTTP_{e.code}"

        except urllib.error.URLError as e:
            latency_ms = (time.perf_counter() - t0) * 1000
            row["latency_ms"] = round(latency_ms, 2)
            errors_count += 1
            if "timed out" in str(e).lower():
                row.update(status="error", score=0.0, message="Không phản hồi trong thời gian quy định (Timeout).")
                row["detail"]["error_code"] = "TIMEOUT"
            else:
                row.update(status="error", score=0.0, message="Không thể kết nối tới ứng dụng RAG.")
                row["detail"]["error_code"] = "CONNECTION_FAILED"

        out_cases.append(row)
        ctx.event("case", case_key=c.key, status=row["status"])
        ctx.progress(i, len(cases))

    total = len(cases)
    success = sum(1 for c in out_cases if c["status"] == "needs_review")
    success_rate = (success / total) if total > 0 else 0.0

    latencies.sort()
    avg_lat = round(sum(latencies) / len(latencies), 2) if latencies else 0.0
    p50 = round(latencies[len(latencies) // 2], 2) if latencies else 0.0
    p95 = round(latencies[int(len(latencies) * 0.95)], 2) if latencies else 0.0

    ctx.write_result(
        cases=out_cases,
        headline={
            "score": round(success_rate, 4),
            "total_questions": total,
            "success_rate": round(success_rate, 4),
            "avg_latency_ms": avg_lat,
            "p50_latency_ms": p50,
            "p95_latency_ms": p95,
            "error_count": errors_count,
        },
        metrics={
            "total_questions": total,
            "success_rate": round(success_rate, 4),
            "avg_latency_ms": avg_lat,
            "p50_latency_ms": p50,
            "p95_latency_ms": p95,
            "error_count": errors_count,
        },
        summary={
            "headline": {
                "score": round(success_rate, 4),
                "total_questions": total,
                "success_rate": round(success_rate, 4),
                "avg_latency_ms": avg_lat,
                "p50_latency_ms": p50,
                "p95_latency_ms": p95,
                "error_count": errors_count,
            },
            "cases_evaluated": total,
        },
    )


if __name__ == "__main__":
    main(describe=describe, validate_profile=validate_profile, validate_submission=validate_submission, run=run)
