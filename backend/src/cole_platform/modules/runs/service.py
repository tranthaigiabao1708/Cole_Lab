"""Run orchestration: prepare exchange directory, invoke runner, collect results and test cases."""
from __future__ import annotations

import io
import json
import logging
import shutil
import tarfile
import time
from datetime import datetime, timezone
from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from cole_platform.kernel import runner_client
from cole_platform.kernel.audit import audit
from cole_platform.kernel.auth import Principal
from cole_platform.kernel.config import settings
from cole_platform.kernel.db import utcnow
from cole_platform.kernel.errors import AppError, bad_request, forbidden, not_found
from cole_platform.kernel.ids import new_id
from cole_platform.kernel.rbac import can_manage_course
from cole_platform.kernel.storage import storage
from cole_platform.modules.assignments.models import Assignment, AssignmentVersion, TestCase, TestSetVersion
from cole_platform.modules.llm_gateway import service as llm_svc
from cole_platform.modules.plugins import service as plug_svc
from cole_platform.modules.plugins.models import PluginVersion
from cole_platform.modules.submissions.models import Submission

from .models import Run, TestResult

log = logging.getLogger("cole.runs")

TERMINAL = ("succeeded", "failed", "error", "timeout", "cancelled")
ACTIVE = ("preparing", "running", "evaluating")
DEFAULT_LLM_BUDGET_USD = 0.50


def runs_for_submission(db: Session, submission_id: str) -> list[dict]:
    runs = db.scalars(
        select(Run).where(Run.submission_id == submission_id).order_by(Run.created_at.desc())
    ).all()
    return [
        {
            "id": r.id,
            "mode": r.mode,
            "status": r.status,
            "passed": r.passed,
            "score": r.score,
            "summary": r.summary,
            "created_at": r.created_at.isoformat() if r.created_at else None,
        }
        for r in runs
    ]


def get_run_visible(db: Session, p: Principal, run_id: str) -> Run:
    r = db.get(Run, run_id)
    if not r:
        raise not_found("Lượt chạy")
    if r.user_id == p.id:
        return r
    a = db.get(Assignment, r.assignment_id)
    if a and can_manage_course(db, p, a.course_id):
        return r
    raise not_found("Lượt chạy")


def enqueue_run(db: Session, p: Principal, submission_id: str, mode: str = "run") -> Run:
    sub = db.get(Submission, submission_id)
    if not sub:
        raise not_found("Bài nộp")
    a = db.get(Assignment, sub.assignment_id)
    if not a:
        raise not_found("Đề bài")
    if sub.user_id != p.id and not can_manage_course(db, p, a.course_id):
        raise forbidden()

    av = db.get(AssignmentVersion, sub.assignment_version_id)
    if not av:
        raise not_found("Phiên bản đề bài")

    # Resolve active plugin version
    pv = plug_svc.resolve(db, av.plugin_id, av.plugin_version_range)
    if not pv:
        raise bad_request("PLUGIN_NOT_READY", f"Simulator {av.plugin_id} {av.plugin_version_range} chưa sẵn sàng.")

    run = Run(
        id=new_id("run"),
        submission_id=sub.id,
        assignment_id=sub.assignment_id,
        assignment_version_id=av.id,
        plugin_version_id=pv.id,
        user_id=p.id,
        mode=mode,
        status="queued",
    )
    db.add(run)
    audit(
        db,
        "run.enqueue",
        actor_id=p.id,
        target_type="run",
        target_id=run.id,
        meta={"mode": mode, "submission_id": sub.id, "plugin_version": pv.version},
    )
    db.commit()
    return run


def enqueue_validate_submission(db: Session, p: Principal, sub: Submission) -> Run:
    """Enqueues full evaluation run for new submissions."""
    return enqueue_run(db, p, sub.id, mode="run")


def cancel_run(db: Session, p: Principal, run_id: str) -> Run:
    r = get_run_visible(db, p, run_id)
    if r.status in TERMINAL:
        return r
    r.cancel_requested_at = utcnow()
    r.status = "cancelled"
    db.commit()
    try:
        runner_client.call("POST", f"/runs/{run_id}/cancel", timeout=5)
    except Exception:  # noqa: BLE001
        pass
    audit(db, "run.cancel", actor_id=p.id, target_type="run", target_id=run_id, commit=True)
    return r


# ---------------------------------------------------------------- Exchange & Execution

def prepare_exchange(db: Session, run: Run) -> Path:
    ex = settings.exchange_dir / run.id
    input_dir = ex / "input"
    out_dir = ex / "output"
    if ex.is_dir():
        shutil.rmtree(ex, ignore_errors=True)
    input_dir.mkdir(parents=True, exist_ok=True)
    out_dir.mkdir(parents=True, exist_ok=True)

    av = db.get(AssignmentVersion, run.assignment_version_id)
    sub = db.get(Submission, run.submission_id) if run.submission_id else None
    pv = db.get(PluginVersion, run.plugin_version_id)

    # 1. run-spec.json
    spec = {
        "contract": "simulator.v1",
        "run_id": run.id,
        "mode": run.mode,
        "plugin": {"id": pv.plugin_id if pv else "", "version": pv.version if pv else ""},
        "assignment": {"id": run.assignment_id, "version_id": av.id if av else None},
        "manifest": sub.manifest if sub else None,
        "profile": av.profile if av else {},
    }
    (input_dir / "run-spec.json").write_text(json.dumps(spec, ensure_ascii=False, indent=2), encoding="utf-8")

    # 2. profile.json
    if av and av.profile:
        (input_dir / "profile.json").write_text(json.dumps(av.profile, ensure_ascii=False, indent=2), encoding="utf-8")

    # 3. Unpack testset tar if present
    if av and av.testset_version_id:
        tsv = db.get(TestSetVersion, av.testset_version_id)
        if tsv and tsv.storage_key:
            ts_dir = input_dir / "testset"
            ts_dir.mkdir(parents=True, exist_ok=True)
            tar_bytes = storage.get_bytes(tsv.storage_key)
            with tarfile.open(fileobj=io.BytesIO(tar_bytes), mode="r:gz") as tar:
                tar.extractall(path=ts_dir, filter="data")

    # 4. Unpack submission tar if present
    if sub and sub.snapshot_key:
        sub_dir = input_dir / "submission"
        sub_dir.mkdir(parents=True, exist_ok=True)
        sub_bytes = storage.get_bytes(sub.snapshot_key)
        with tarfile.open(fileobj=io.BytesIO(sub_bytes), mode="r:gz") as tar:
            tar.extractall(path=sub_dir, filter="data")  # learner-controlled content: block traversal/links

    return ex


def _cancel_requested(db: Session, run: Run) -> bool:
    """Re-read cancel state from DB; the session keeps stale values (expire_on_commit=False)."""
    db.refresh(run, attribute_names=["status", "cancel_requested_at"])
    return run.cancel_requested_at is not None or run.status == "cancelled"


def _as_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)  # SQLite drops tzinfo


def _dir_bytes(path: Path) -> int:
    if not path.is_dir():
        return 0
    return sum(f.stat().st_size for f in path.rglob("*") if f.is_file())


def compute_run_cost(db: Session, run: Run) -> dict:
    """Cost record per docs/design/13 §2. Unit prices come from settings; 0 means "not configured"."""
    info = run.runner_info or {}
    res = info.get("resources") or {}
    started, finished = _as_utc(run.started_at), _as_utc(run.finished_at)
    duration_ms = info.get("duration_ms")
    if duration_ms is None and started and finished:
        duration_ms = int((finished - started).total_seconds() * 1000)
    duration_s = (duration_ms or 0) / 1000.0

    cpu_limit = res.get("cpu_limit")
    reserved_vcpu_s = round(duration_s * cpu_limit, 3) if cpu_limit else None
    peak_mem_mb = res.get("peak_mem_mb")
    llm = llm_svc.usage_for_run(db, run.id)

    compute_usd = None
    if settings.price_vcpu_hour_usd and reserved_vcpu_s is not None:
        compute_usd = reserved_vcpu_s / 3600.0 * settings.price_vcpu_hour_usd
        if settings.price_gb_ram_hour_usd and peak_mem_mb:
            compute_usd += duration_s / 3600.0 * (peak_mem_mb / 1024.0) * settings.price_gb_ram_hour_usd
        compute_usd = round(compute_usd, 6)

    return {
        "duration_ms": duration_ms,
        "cpu_seconds": res.get("cpu_seconds"),
        "reserved_vcpu_seconds": reserved_vcpu_s,
        "peak_mem_mb": peak_mem_mb,
        "llm_requests": llm["requests"],
        "llm_tokens_in": llm["tokens_in"],
        "llm_tokens_out": llm["tokens_out"],
        "llm_cost_usd": llm["cost_usd"],
        "output_bytes": _dir_bytes(settings.exchange_dir / run.id / "output"),
        "compute_cost_usd": compute_usd,
        "total_cost_usd": round((compute_usd or 0.0) + llm["cost_usd"], 6),
        "pricing_configured": bool(settings.price_vcpu_hour_usd),
        "resource_method": res.get("method"),
    }


def _finalize(db: Session, run: Run) -> None:
    """Always runs at the end of execution: revoke the run's LLM keys and record cost."""
    try:
        llm_svc.close_run_keys(db, run.id)
        run.cost = compute_run_cost(db, run)
        db.commit()
    except Exception:  # noqa: BLE001 — accounting must never change the run outcome
        log.exception("finalize failed for run %s", run.id)
        db.rollback()


def execute_run(db: Session, run_id: str) -> Run:
    run = db.get(Run, run_id)
    if not run or run.status not in ("queued", "preparing"):
        return run
    try:
        _execute(db, run)
    finally:
        _finalize(db, run)
    return run


def _execute(db: Session, run: Run) -> None:
    run.status = "preparing"
    run.started_at = utcnow()
    db.commit()

    av = db.get(AssignmentVersion, run.assignment_version_id)
    sub = db.get(Submission, run.submission_id) if run.submission_id else None
    pv = db.get(PluginVersion, run.plugin_version_id)

    if not pv:
        run.status = "error"
        run.error = {"code": "PLUGIN_MISSING", "message_vi": "Simulator plugin không tồn tại."}
        run.finished_at = utcnow()
        db.commit()
        return

    try:
        prepare_exchange(db, run)
    except Exception as e:
        log.exception("prepare_exchange failed for run %s", run.id)
        run.status = "error"
        run.error = {"code": "EXCHANGE_PREPARE_FAILED", "message_vi": f"Lỗi chuẩn bị dữ liệu: {e}"}
        run.finished_at = utcnow()
        db.commit()
        return

    # Build runner execution spec
    subj_cfg = pv.manifest.get("subject") or {}
    art_entry = (sub.manifest.get("artifacts") or {}).get("entry") if sub and sub.manifest else None
    entry_val = art_entry.get("entry") if art_entry else None

    timeout_s = (av.limits or {}).get("timeout_s", 600) if av else 600

    runner_spec = {
        "evaluator_image": pv.image,
        "mode": run.mode,
        "timeout_s": timeout_s,
    }

    if run.mode == "run" and subj_cfg:
        runner_spec["subject"] = {
            "kind": subj_cfg.get("kind", "python_entrypoint"),
            "entry": entry_val or "",
            "input_kind": subj_cfg.get("input_kind", "json"),
        }

    if _cancel_requested(db, run):
        run.status = "cancelled"
        run.finished_at = utcnow()
        db.commit()
        return

    if pv.manifest.get("needs_llm"):
        # Real per-run virtual key with a hard budget (docs/design/09 §A.5). Only the LLM forwarder container
        # receives it; it is revoked in _finalize. Never written to logs, audit or runner_info.
        budget = float(((av.profile or {}) if av else {}).get("llm_budget_per_run_usd", DEFAULT_LLM_BUDGET_USD))
        raw_key, _vk = llm_svc.create_virtual_key(db, user_id=run.user_id, run_id=run.id, budget_usd=budget)
        runner_spec["llm"] = {
            "upstream": settings.llm_upstream_for_containers,
            "key": raw_key,
        }

    run.status = "running"
    db.commit()

    try:
        res = runner_client.call("POST", f"/runs/{run.id}/execute", json=runner_spec, timeout=timeout_s + 60)
        run.runner_info = res
    except Exception as e:
        log.exception("Runner execution failed for run %s", run.id)
        run.status = "cancelled" if _cancel_requested(db, run) else "error"
        if run.status == "error":
            run.error = {"code": "RUNNER_EXEC_FAILED", "message_vi": f"Lỗi kết nối runner: {e}"}
        run.finished_at = utcnow()
        db.commit()
        return

    # Parse output directory
    out_dir = settings.exchange_dir / run.id / "output"
    runner_doc = {}
    if (out_dir / "runner.json").is_file():
        try:
            runner_doc = json.loads((out_dir / "runner.json").read_text(encoding="utf-8"))
        except Exception:
            pass
    if runner_doc.get("resources") and not (run.runner_info or {}).get("resources"):
        run.runner_info = {**(run.runner_info or {}), "resources": runner_doc["resources"]}

    cancelled = bool(runner_doc.get("cancelled")) or _cancel_requested(db, run)
    if cancelled:
        run.status = "cancelled"
    elif runner_doc.get("timed_out"):
        run.status = "timeout"
        run.error = {"code": "RUN_TIMEOUT", "message_vi": f"Thời gian chạy vượt quá {timeout_s}s."}
    elif (out_dir / "error.json").is_file():
        try:
            err_doc = json.loads((out_dir / "error.json").read_text(encoding="utf-8"))
            run.error = err_doc
            run.status = "failed" if err_doc.get("code") in ("ENTRYPOINT_LOAD_FAILED", "SUBJECT_NOT_READY") else "error"
        except Exception:
            run.status = "error"
    elif (out_dir / "validation.json").is_file():
        try:
            val_doc = json.loads((out_dir / "validation.json").read_text(encoding="utf-8"))
            run.validation_report = val_doc
            run.status = "succeeded" if val_doc.get("status") == "valid" else "failed"
        except Exception:
            run.status = "error"
    elif (out_dir / "result.json").is_file():
        try:
            res_doc = json.loads((out_dir / "result.json").read_text(encoding="utf-8"))
            run.summary = res_doc.get("summary")
            run.passed = (run.summary or {}).get("passed")
            run.score = (run.summary or {}).get("headline", {}).get("score")
            run.status = "succeeded" if run.passed else "failed"

            # Save individual testcase results
            cases = res_doc.get("cases", [])
            for i, c in enumerate(cases):
                tr = TestResult(
                    id=new_id("tr"),
                    run_id=run.id,
                    case_key=c.get("case_key", f"case_{i}"),
                    order=i,
                    status=c.get("status", "error"),
                    score=float(c.get("score", 0.0)),
                    latency_ms=c.get("latency_ms"),
                    output=c.get("output"),
                    message=c.get("message"),
                    detail=c.get("detail"),
                )
                db.add(tr)
        except Exception as e:
            log.exception("Failed to parse result.json: %s", e)
            run.status = "error"
            run.error = {"code": "RESULT_PARSE_FAILED", "message_vi": f"Không thể đọc kết quả: {e}"}
    else:
        run.status = "error"
        run.error = {"code": "NO_OUTPUT", "message_vi": "Plugin kết thúc nhưng không tạo tệp kết quả."}

    run.finished_at = utcnow()
    db.commit()


def recover_stale_runs(db: Session, now: datetime | None = None) -> list[str]:
    """Mark runs orphaned by a crashed worker as error (docs/design/14 §4 "Worker crash").

    A live worker always finishes within timeout_s + 60 (runner HTTP timeout), so anything active for longer than
    timeout_s + 60 + grace is lost. Containers are cleaned by a best-effort runner cancel plus the runner reaper (TTL).
    """
    now = now or utcnow()
    recovered: list[str] = []
    for r in db.scalars(select(Run).where(Run.status.in_(ACTIVE))).all():
        av = db.get(AssignmentVersion, r.assignment_version_id)
        timeout_s = int((av.limits or {}).get("timeout_s", 600)) if av else 600
        since = _as_utc(r.started_at or r.created_at)
        if since is None or (now - since).total_seconds() <= timeout_s + 60 + settings.stale_run_grace_s:
            continue
        r.status = "error"
        r.error = {"code": "WORKER_LOST", "message_vi": "Lượt chạy bị gián đoạn do tiến trình xử lý dừng đột ngột. Vui lòng chạy lại."}
        r.finished_at = now
        llm_svc.close_run_keys(db, r.id)
        audit(db, "run.recovered", actor_type="system", target_type="run", target_id=r.id, meta={"reason": "WORKER_LOST"})
        recovered.append(r.id)
        try:
            runner_client.call("POST", f"/runs/{r.id}/cancel", timeout=5)
        except Exception:  # noqa: BLE001 — runner may be down too; its reaper removes expired containers
            pass
    if recovered:
        db.commit()
        for rid in recovered:
            run = db.get(Run, rid)
            if run is not None:
                run.cost = compute_run_cost(db, run)
        db.commit()
    return recovered


# ---------------------------------------------------------------- Filtering & Detail

def get_run_detail(db: Session, p: Principal, run_id: str) -> dict:
    run = get_run_visible(db, p, run_id)
    a = db.get(Assignment, run.assignment_id)
    av = db.get(AssignmentVersion, run.assignment_version_id)
    pv = db.get(PluginVersion, run.plugin_version_id)
    can_manage = a and can_manage_course(db, p, a.course_id)

    # Fetch test cases & visibility rules
    cases_meta = {}
    if av and av.testset_version_id:
        for tc in db.scalars(select(TestCase).where(TestCase.testset_version_id == av.testset_version_id)):
            cases_meta[tc.case_key] = tc

    results = db.scalars(
        select(TestResult).where(TestResult.run_id == run.id).order_by(TestResult.order.asc())
    ).all()

    # Redact sensitive fields for students
    clean_cases = []
    for r in results:
        tc = cases_meta.get(r.case_key)
        vis = tc.field_visibility if tc else {}
        item = {
            "id": r.id,
            "case_key": r.case_key,
            "order": r.order,
            "status": r.status,
            "score": r.score,
            "latency_ms": r.latency_ms,
            "output": r.output,
            "message": r.message,
            "detail": r.detail,
        }

        if tc:
            # Check input visibility
            inp_vis = vis.get("input", "after_run")
            if can_manage or inp_vis == "visible" or (inp_vis == "after_run" and run.status in ("succeeded", "failed")):
                item["input"] = tc.input
            else:
                item["input"] = None

            # Check expected visibility
            exp_vis = vis.get("expected", "hidden")
            if can_manage or exp_vis == "visible" or (exp_vis == "after_run" and run.status in ("succeeded", "failed")):
                item["expected"] = tc.expected
            else:
                item["expected"] = None

            item["notes"] = tc.notes
            item["tags"] = tc.tags

        clean_cases.append(item)

    # Read events and logs
    ex = settings.exchange_dir / run.id / "output"
    events = []
    if (ex / "events.jsonl").is_file():
        for ln in (ex / "events.jsonl").read_text(encoding="utf-8").splitlines()[-200:]:
            if ln.strip():
                try:
                    events.append(json.loads(ln))
                except Exception:
                    pass

    logs = {
        "evaluator": (ex / "evaluator.log").read_text(encoding="utf-8")[-8000:] if (ex / "evaluator.log").is_file() else "",
        "subject": (ex / "subject.log").read_text(encoding="utf-8")[-8000:] if (ex / "subject.log").is_file() else "",
    }

    # Fetch extra column config from result.json if available
    extra_cols = None
    if (ex / "result.json").is_file():
        try:
            extra_cols = json.loads((ex / "result.json").read_text(encoding="utf-8")).get("columns")
        except Exception:
            pass

    return {
        "id": run.id,
        "submission_id": run.submission_id,
        "assignment": {"id": a.id, "slug": a.slug, "title": a.title} if a else None,
        "plugin": {"id": pv.plugin_id, "version": pv.version, "renderer": pv.renderer} if pv else None,
        "mode": run.mode,
        "status": run.status,
        "passed": run.passed,
        "score": run.score,
        "summary": run.summary,
        "validation_report": run.validation_report,
        "error": run.error,
        "runner_info": run.runner_info,
        "cost": run.cost,
        "columns": extra_cols,
        "cases": clean_cases,
        "events": events,
        "logs": logs,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }


def cost_summary(db: Session) -> dict:
    """Cost aggregates per assignment over finished runs (docs/design/13 §2, AC-17)."""
    rows = db.scalars(select(Run).where(Run.status.in_(TERMINAL))).all()
    groups: dict[str, dict] = {}
    for r in rows:
        g = groups.setdefault(r.assignment_id, {
            "assignment_id": r.assignment_id, "runs": 0, "runs_with_cost": 0,
            "duration_ms_total": 0, "llm_tokens_in": 0, "llm_tokens_out": 0,
            "llm_cost_usd": 0.0, "total_cost_usd": 0.0,
        })
        g["runs"] += 1
        c = r.cost or {}
        if not c:
            continue
        g["runs_with_cost"] += 1
        g["duration_ms_total"] += int(c.get("duration_ms") or 0)
        g["llm_tokens_in"] += int(c.get("llm_tokens_in") or 0)
        g["llm_tokens_out"] += int(c.get("llm_tokens_out") or 0)
        g["llm_cost_usd"] += float(c.get("llm_cost_usd") or 0.0)
        g["total_cost_usd"] += float(c.get("total_cost_usd") or 0.0)

    items = []
    for g in groups.values():
        a = db.get(Assignment, g["assignment_id"])
        n = g["runs_with_cost"] or 1
        items.append({
            **g,
            "slug": a.slug if a else None,
            "title": a.title if a else None,
            "avg_duration_ms": round(g["duration_ms_total"] / n),
            "avg_cost_usd": round(g["total_cost_usd"] / n, 6),
            "llm_cost_usd": round(g["llm_cost_usd"], 6),
            "total_cost_usd": round(g["total_cost_usd"], 6),
        })
    items.sort(key=lambda x: x["total_cost_usd"], reverse=True)
    return {
        "items": items,
        "totals": {
            "runs": sum(i["runs"] for i in items),
            "runs_with_cost": sum(i["runs_with_cost"] for i in items),
            "total_cost_usd": round(sum(i["total_cost_usd"] for i in items), 6),
        },
        "pricing_configured": bool(settings.price_vcpu_hour_usd),
    }
