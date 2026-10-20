"""Run orchestration: prepare exchange directory, invoke runner, collect results and test cases."""
from __future__ import annotations

import io
import json
import logging
import shutil
import tarfile
import time
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
from cole_platform.modules.plugins import service as plug_svc
from cole_platform.modules.plugins.models import PluginVersion
from cole_platform.modules.submissions.models import Submission

from .models import Run, TestResult

log = logging.getLogger("cole.runs")


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
    if r.status in ("succeeded", "failed", "error", "timeout", "cancelled"):
        return r
    r.cancel_requested_at = utcnow()
    r.status = "cancelled"
    db.commit()
    try:
        runner_client.call("POST", f"/runs/{run_id}/cancel", timeout=5)
    except Exception:  # noqa: BLE001
        pass
    audit(db, "run.cancel", actor_id=p.id, target_type="run", target_id=run_id)
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
                tar.extractall(path=ts_dir)

    # 4. Unpack submission tar if present
    if sub and sub.snapshot_key:
        sub_dir = input_dir / "submission"
        sub_dir.mkdir(parents=True, exist_ok=True)
        sub_bytes = storage.get_bytes(sub.snapshot_key)
        with tarfile.open(fileobj=io.BytesIO(sub_bytes), mode="r:gz") as tar:
            tar.extractall(path=sub_dir)

    return ex


def execute_run(db: Session, run_id: str) -> Run:
    run = db.get(Run, run_id)
    if not run or run.status not in ("queued", "preparing"):
        return run

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
        return run

    try:
        prepare_exchange(db, run)
    except Exception as e:
        log.exception("prepare_exchange failed for run %s", run.id)
        run.status = "error"
        run.error = {"code": "EXCHANGE_PREPARE_FAILED", "message_vi": f"Lỗi chuẩn bị dữ liệu: {e}"}
        run.finished_at = utcnow()
        db.commit()
        return run

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

    if pv.manifest.get("needs_llm"):
        runner_spec["llm"] = {
            "upstream": settings.llm_upstream_for_containers,
            "key": f"run_{run.id}",
        }

    run.status = "running"
    db.commit()

    try:
        res = runner_client.call("POST", f"/runs/{run.id}/execute", json=runner_spec, timeout=timeout_s + 60)
        run.runner_info = res
    except Exception as e:
        log.exception("Runner execution failed for run %s", run.id)
        run.status = "error"
        run.error = {"code": "RUNNER_EXEC_FAILED", "message_vi": f"Lỗi kết nối runner: {e}"}
        run.finished_at = utcnow()
        db.commit()
        return run

    # Parse output directory
    out_dir = settings.exchange_dir / run.id / "output"
    runner_doc = {}
    if (out_dir / "runner.json").is_file():
        try:
            runner_doc = json.loads((out_dir / "runner.json").read_text(encoding="utf-8"))
        except Exception:
            pass

    if runner_doc.get("cancelled") or run.status == "cancelled":
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
    return run


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
        "columns": extra_cols,
        "cases": clean_cases,
        "events": events,
        "logs": logs,
        "started_at": run.started_at.isoformat() if run.started_at else None,
        "finished_at": run.finished_at.isoformat() if run.finished_at else None,
        "created_at": run.created_at.isoformat() if run.created_at else None,
    }
