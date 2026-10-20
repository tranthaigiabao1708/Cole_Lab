"""Integration tests for Phase 3: Plugin registry, range resolution, run queueing & execution lifecycle."""
import json
from pathlib import Path

import pytest
from sqlalchemy import select

from cole_platform.kernel.auth import Principal
from cole_platform.kernel.db import SessionLocal
from cole_platform.kernel.errors import AppError
from cole_platform.modules.assignments.models import Assignment, AssignmentVersion
from cole_platform.modules.identity.models import User
from cole_platform.modules.plugins import service as plug_svc
from cole_platform.modules.plugins.models import PluginVersion, SimulatorPlugin
from cole_platform.modules.runs import service as run_svc
from cole_platform.modules.runs.models import Run, TestResult
from cole_platform.modules.submissions import service as sub_svc
from cole_platform.modules.submissions.models import Submission
from cole_platform.modules.workspaces import service as ws_svc


def test_semver_satisfies():
    assert plug_svc.satisfies("1.0.0", "^1.0")
    assert plug_svc.satisfies("1.2.3", "^1.0.0")
    assert not plug_svc.satisfies("2.0.0", "^1.0")
    assert plug_svc.satisfies("1.0.5", "~1.0.0")
    assert not plug_svc.satisfies("1.1.0", "~1.0.0")
    assert plug_svc.satisfies("1.0.0", "*")


def test_plugin_scan_and_sync(seeded):
    with SessionLocal() as db:
        res = plug_svc.scan_and_register(db)
        assert any(r["plugin"] == "cole.echo-sample" for r in res)

        pv = db.scalar(
            select(PluginVersion).where(
                PluginVersion.plugin_id == "cole.echo-sample",
                PluginVersion.version == "1.0.0",
            )
        )
        assert pv is not None
        assert pv.renderer == "generic-table@1"
        assert pv.contract == "simulator.v1"


def test_run_lifecycle_and_field_visibility(client, seeded):
    with SessionLocal() as db:
        from cole_platform.kernel.auth import hash_password
        from cole_platform.kernel.ids import new_id
        from cole_platform.modules.identity.models import CourseMembership

        existing_org = db.scalar(select(User.org_id).limit(1))
        student = User(
            id=new_id("usr"),
            org_id=existing_org or "org_default",
            email="student_p3@cole.local",
            name="Student P3",
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

        asg = db.scalar(select(Assignment).where(Assignment.slug == "ai-echo-sample"))
        assert asg is not None
        db.add(CourseMembership(id=new_id("mem"), user_id=student.id, course_id=asg.course_id, role_in_course="student"))
        db.commit()
        av = db.get(AssignmentVersion, asg.current_version_id)

        # Ensure plugin version is marked ready for testing
        pv = db.scalar(
            select(PluginVersion).where(
                PluginVersion.plugin_id == av.plugin_id,
                PluginVersion.version == "1.0.0",
            )
        )
        pv.status = "ready"
        db.commit()

        # Open workspace and write a working predict function
        ws = ws_svc.open_workspace(db, p, asg.id)
        code = (
            "def predict(payload):\n"
            "    text = payload.get('text', '')\n"
            "    return {'text': ' '.join(text.split()).lower()}\n"
        )
        ws_svc.write_text(db, ws, "solution/normalize.py", code)

        # Submit
        manifest = {
            "manifest": "submission/v1",
            "artifacts": {
                "entry": {"entry": "solution.normalize:predict"},
                "report": {"path": "REPORT.md"},
            },
        }
        sub = sub_svc.submit(db, p, ws.id, manifest)
        assert sub.validation_status == "valid"

        # Enqueue run
        run = run_svc.enqueue_run(db, p, sub.id, mode="run")
        assert run.status == "queued"
        assert run.submission_id == sub.id

        # Verify get_run_visible
        r_vis = run_svc.get_run_visible(db, p, run.id)
        assert r_vis.id == run.id

        # Other random student cannot view this run
        other_p = Principal(id="usr_other", org_id="org_default", email="other@cole.local", name="Other", role="student")
        with pytest.raises(AppError):
            run_svc.get_run_visible(db, other_p, run.id)


def test_admin_plugin_api(client, seeded):
    from tests.conftest import login

    login(client, "admin")
    r = client.get("/api/admin/plugins")
    assert r.status_code == 200
    data = r.json()
    assert any(p["id"] == "cole.echo-sample" for p in data)

    # Scan endpoint
    r = client.post("/api/admin/plugins/scan")
    assert r.status_code == 200
    assert "registered" in r.json()
