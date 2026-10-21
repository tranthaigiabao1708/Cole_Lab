"""Integration tests for Phase 4: CV OK/NG simulator, assignment package, and business cost evaluation."""
import importlib.util
from pathlib import Path
from unittest.mock import MagicMock
from sqlalchemy import func, select

from cole_platform.kernel.auth import Principal, hash_password
from cole_platform.kernel.config import REPO_ROOT
from cole_platform.kernel.db import SessionLocal
from cole_platform.kernel.ids import new_id
from cole_platform.modules.assignments.models import Assignment, AssignmentVersion, TestCase
from cole_platform.modules.identity.models import CourseMembership, User
from cole_platform.modules.plugins import service as plug_svc
from cole_platform.modules.plugins.models import PluginVersion, SimulatorPlugin
from cole_platform.modules.runs import service as run_svc
from cole_platform.modules.runs.models import Run, TestResult
from cole_platform.modules.submissions import service as sub_svc
from cole_platform.modules.workspaces import service as ws_svc


def _load_cv_evaluator():
    eval_path = REPO_ROOT / "simulators" / "cv-ok-ng" / "evaluator.py"
    spec = importlib.util.spec_from_file_location("cv_evaluator", eval_path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def test_cv_ok_ng_plugin_registered(seeded):
    with SessionLocal() as db:
        plug_svc.scan_and_register(db)
        p = db.scalar(select(SimulatorPlugin).where(SimulatorPlugin.id == "cole.cv-ok-ng"))
        assert p is not None
        assert p.name == "Phân loại linh kiện OK/NG sản xuất"

        pv = db.scalar(
            select(PluginVersion).where(
                PluginVersion.plugin_id == p.id,
                PluginVersion.version == "1.0.0",
            )
        )
        assert pv is not None
        assert pv.renderer == "cv-grid@1"
        assert pv.contract == "simulator.v1"


def test_cv_ok_ng_assignment_imported(seeded):
    with SessionLocal() as db:
        asg = db.scalar(select(Assignment).where(Assignment.slug == "ai-cv-ok-ng-inspection"))
        assert asg is not None
        assert asg.current_version_id is not None
        av = db.get(AssignmentVersion, asg.current_version_id)
        assert av.plugin_id == "cole.cv-ok-ng"
        tc_count = db.scalar(select(func.count(TestCase.id)).where(TestCase.testset_version_id == av.testset_version_id))
        assert tc_count == 20


def test_cv_ok_ng_evaluator_unit():
    ev = _load_cv_evaluator()
    from cole_sim_sdk import Case, Context

    # describe
    ctx_desc = MagicMock(spec=Context)
    ev.describe(ctx_desc)
    ctx_desc.write_describe.assert_called_once()
    desc_call = ctx_desc.write_describe.call_args[0][0]
    assert desc_call["id"] == "cole.cv-ok-ng"
    assert desc_call["renderer"] == "cv-grid@1"

    # validate_profile
    ctx_prof = MagicMock(spec=Context)
    ctx_prof.profile = {"decision_threshold": 0.5}
    ctx_prof.cases.return_value = [Case(key="c1", input={}, expected={"label": "OK"})]
    ev.validate_profile(ctx_prof)
    ctx_prof.write_validation.assert_called_once_with([])

    # run with mock subject
    cases = [
        Case(key="c1", input={"variance": 0.01}, expected={"label": "OK"}, tags=["normal"]),
        Case(key="c2", input={"variance": 0.50}, expected={"label": "NG"}, tags=["crack"]),
        Case(key="c3", input={"variance": 0.02}, expected={"label": "OK"}, tags=["normal"]),
        Case(key="c4", input={"variance": 0.60}, expected={"label": "NG"}, tags=["scratch"]),
    ]

    class MockSubject:
        def wait_ready(self, timeout):
            pass

        def predict(self, payload, timeout_s=10):
            inp = payload.get("input", {})
            v = inp.get("variance", 0)
            if v == 0.01:
                return ({"label": "OK", "confidence": 0.9}, 12.0)
            elif v == 0.50:
                return ({"label": "NG", "confidence": 0.95}, 15.0)
            elif v == 0.02:
                return ({"label": "NG", "confidence": 0.8}, 11.0)
            else:
                return ({"label": "OK", "confidence": 0.7}, 14.0)

    ctx_run = MagicMock(spec=Context)
    ctx_run.cases.return_value = cases
    ctx_run.subject = MockSubject()
    ctx_run.profile = {
        "decision_threshold": 0.5,
        "business_costs": {
            "false_negative": {"unit_cost": 500000},
            "false_positive": {"unit_cost": 40000},
        },
        "pass_criteria": {"recall_min": 0.8, "precision_min": 0.8},
    }

    ev.run(ctx_run)
    ctx_run.write_result.assert_called_once()
    kw = ctx_run.write_result.call_args[1]
    assert kw["passed"] is False  # recall 0.5 < 0.8
    assert kw["renderer"] == "cv-grid@1"
    assert kw["headline"]["business_cost_vnd"] == 540000
    assert kw["metrics"]["recall"] == 0.5
    assert kw["metrics"]["precision"] == 0.5
    cm = kw["extra"]["confusion_matrix"]
    assert cm["tp"] == 1
    assert cm["tn"] == 1
    assert cm["fp"] == 1
    assert cm["fn"] == 1



def test_cv_ok_ng_queue_lifecycle(seeded):
    with SessionLocal() as db:
        existing_org = db.scalar(select(User.org_id).limit(1))
        student = User(
            id=new_id("usr"),
            org_id=existing_org or "org_default",
            email="student_cv@cole.local",
            name="Student CV",
            role="student",
            password_hash=hash_password("ColeDev!2026"),
        )
        db.add(student)
        db.commit()

        p = Principal(
            id=student.id,
            org_id=student.org_id,
            email=student.email,
            name=student.name,
            role=student.role,
        )

        asg = db.scalar(select(Assignment).where(Assignment.slug == "ai-cv-ok-ng-inspection"))
        assert asg is not None
        db.add(CourseMembership(id=new_id("mem"), user_id=student.id, course_id=asg.course_id, role_in_course="student"))
        db.commit()
        av = db.get(AssignmentVersion, asg.current_version_id)

        # Mark plugin ready
        pv = db.scalar(
            select(PluginVersion).where(
                PluginVersion.plugin_id == av.plugin_id,
                PluginVersion.version == "1.0.0",
            )
        )
        if pv:
            pv.status = "ready"
            db.commit()

        # Provision workspace & submit
        ws = ws_svc.open_workspace(db, p, asg.id)
        sub = sub_svc.submit(db, p, ws.id, manifest=av.default_manifest)
        assert sub.validation_status == "valid"

        # Enqueue run
        run = run_svc.enqueue_run(db, p, sub.id, mode="run")
        assert run.status == "queued"

        # Visible to student
        visible = run_svc.get_run_visible(db, p, run.id)
        assert visible.id == run.id
