"""Phase 6 hardening tests: router mounting, gateway HTTP errors, rating API, per-run LLM key,
cost/run (AC-17), cancel race, worker-crash recovery, schema sync, LLM forwarder key isolation."""
from __future__ import annotations

import importlib.util
import json
import threading
from datetime import timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest
from sqlalchemy import inspect, select, text

from cole_platform.kernel.auth import hash_password
from cole_platform.kernel.config import REPO_ROOT, settings
from cole_platform.kernel.db import SessionLocal, engine, init_db, utcnow
from cole_platform.kernel.ids import new_id
from cole_platform.modules.assignments.models import Assignment, AssignmentVersion
from cole_platform.modules.identity.models import AuditLog, User
from cole_platform.modules.llm_gateway import service as llm_svc
from cole_platform.modules.llm_gateway.models import VirtualKey
from cole_platform.modules.plugins import service as plug_svc
from cole_platform.modules.plugins.models import PluginVersion
from cole_platform.modules.runs import service as run_svc
from cole_platform.modules.runs.models import Run

PASSWORD = "ColeDev!2026"


# ---------------------------------------------------------------- helpers

def _user(db, email: str) -> User:
    return db.scalar(select(User).where(User.email == email))


def _new_student(db, email: str) -> User:
    org = db.scalar(select(User.org_id).limit(1))
    u = User(id=new_id("usr"), org_id=org, email=email, name=email, role="student", password_hash=hash_password(PASSWORD))
    db.add(u)
    db.commit()
    return u


def _rag_run(db, user_id: str, status: str = "queued", **kw) -> Run:
    plug_svc.scan_and_register(db)
    a = db.scalar(select(Assignment).where(Assignment.slug == "ai-rag-enterprise-chatbot"))
    assert a is not None, "seed must import the RAG assignment package"
    av = db.get(AssignmentVersion, a.current_version_id)
    pv = db.scalar(select(PluginVersion).where(PluginVersion.plugin_id == "cole.rag-chatbot", PluginVersion.version == "1.0.0"))
    assert pv is not None and pv.manifest.get("needs_llm") is True
    r = Run(id=new_id("run"), assignment_id=a.id, assignment_version_id=av.id, plugin_version_id=pv.id,
            user_id=user_id, mode="run", status=status, **kw)
    db.add(r)
    db.commit()
    return r


def _write_output(run_id: str, result: dict | None = None, runner: dict | None = None) -> None:
    out = settings.exchange_dir / run_id / "output"
    out.mkdir(parents=True, exist_ok=True)
    if result is not None:
        (out / "result.json").write_text(json.dumps(result), encoding="utf-8")
    if runner is not None:
        (out / "runner.json").write_text(json.dumps(runner), encoding="utf-8")


def _login(c, email: str) -> None:
    r = c.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------- routing

def test_phase5_routers_are_mounted(client):
    paths = client.get("/openapi.json").json()["paths"]
    assert "/api/llm/v1/chat/completions" in paths
    assert "/api/runs/{run_id}/evaluations" in paths
    assert "/api/admin/runs/cost-summary" in paths


# ---------------------------------------------------------------- gateway HTTP errors

def test_gateway_http_status_codes(client):
    msgs = [{"role": "user", "content": "Chính sách đổi trả?"}]
    r = client.post("/api/llm/v1/chat/completions", json={"messages": msgs})
    assert r.status_code == 401
    r = client.post("/api/llm/v1/chat/completions", json={"messages": msgs}, headers={"Authorization": "Bearer cole_vk_nope"})
    assert r.status_code == 401 and r.json()["detail"]["code"] == "INVALID_VIRTUAL_KEY"

    with SessionLocal() as db:
        uid = _user(db, "student@cole.local").id
        ok_key, _ = llm_svc.create_virtual_key(db, user_id=uid, budget_usd=1.0)
        broke_key, vk = llm_svc.create_virtual_key(db, user_id=uid, budget_usd=0.01)
        vk.spent_usd = 0.01
        db.commit()

    r = client.post("/api/llm/v1/chat/completions", json={"messages": msgs}, headers={"Authorization": f"Bearer {ok_key}"})
    assert r.status_code == 200 and r.json()["choices"][0]["message"]["content"]
    r = client.post("/api/llm/v1/chat/completions", json={"messages": msgs}, headers={"Authorization": f"Bearer {broke_key}"})
    assert r.status_code == 429 and r.json()["detail"]["code"] == "LLM_BUDGET_EXCEEDED"


# ---------------------------------------------------------------- rating API (AC-07)

def test_rating_api_roundtrip_and_access(client, seeded):
    from fastapi.testclient import TestClient

    from cole_platform.main_api import app

    with SessionLocal() as db:
        owner = _user(db, "student@cole.local")
        run = _rag_run(db, owner.id, status="succeeded")
        run_id = run.id
        _new_student(db, "outsider_p6@cole.local")

    _login(client, "student@cole.local")
    r = client.post(f"/api/runs/{run_id}/evaluations", json={"case_key": "tc_001", "rating": 4, "feedback": "Đủ ý"})
    assert r.status_code == 200, r.text
    r = client.post(f"/api/runs/{run_id}/evaluations", json={"case_key": "tc_001", "rating": 5})
    assert r.status_code == 200
    data = client.get(f"/api/runs/{run_id}/evaluations").json()
    assert data["summary"]["evaluated_count"] == 1 and data["items"][0]["rating"] == 5
    assert client.post(f"/api/runs/{run_id}/evaluations", json={"case_key": "tc_001", "rating": 6}).status_code == 422

    with TestClient(app) as other:
        _login(other, "outsider_p6@cole.local")
        assert other.get(f"/api/runs/{run_id}/evaluations").status_code == 404
        assert other.post(f"/api/runs/{run_id}/evaluations", json={"case_key": "x", "rating": 1}).status_code == 404


# ---------------------------------------------------------------- per-run key + cost (AC-13, AC-17)

def test_execute_run_mints_scoped_key_and_records_cost(seeded, monkeypatch):
    with SessionLocal() as db:
        run_id = _rag_run(db, _user(db, "student@cole.local").id).id

    seen: dict = {}

    def fake_call(method, path, json=None, timeout=60.0):
        if not path.endswith("/execute"):
            return {}
        key = json["llm"]["key"]
        seen["key"] = key
        # Simulate the subject calling the gateway through the forwarder during the run.
        with SessionLocal() as gw:
            llm_svc.handle_chat_completion(gw, key, "mock", [{"role": "user", "content": "đổi trả VIP"}])
            llm_svc.handle_chat_completion(gw, key, "mock", [{"role": "user", "content": "bảo hành"}])
        resources = {"cpu_seconds": 1.5, "peak_mem_mb": 210.0, "cpu_limit": 1.0, "containers": 2, "method": "test"}
        _write_output(run_id, result={"summary": {"passed": True, "headline": {"score": 1.0}}, "cases": []},
                      runner={"cancelled": False, "timed_out": False, "duration_ms": 4200, "resources": resources})
        return {"exit_code": 0, "duration_ms": 4200, "resources": resources}

    monkeypatch.setattr(run_svc.runner_client, "call", fake_call)
    with SessionLocal() as db:
        run = run_svc.execute_run(db, run_id)
        assert run.status == "succeeded"
        assert seen["key"].startswith("cole_vk_")

        vk = db.scalar(select(VirtualKey).where(VirtualKey.run_id == run_id))
        assert vk is not None and vk.is_active is False, "key must be revoked when the run ends"
        assert llm_svc.get_key_by_secret(db, seen["key"]) is None

        c = run.cost
        assert c["llm_requests"] == 2 and c["llm_tokens_in"] > 0 and c["llm_cost_usd"] > 0
        assert c["duration_ms"] == 4200 and c["cpu_seconds"] == 1.5 and c["reserved_vcpu_seconds"] == 4.2
        assert c["peak_mem_mb"] == 210.0 and c["output_bytes"] > 0
        assert c["compute_cost_usd"] is None and c["pricing_configured"] is False
        assert c["total_cost_usd"] == c["llm_cost_usd"]

        # The raw key must not leak into persisted run data or audit metadata.
        blob = json.dumps([run.runner_info, run.cost, run.error, run.summary], ensure_ascii=False)
        assert seen["key"] not in blob
        metas = json.dumps([a.meta for a in db.scalars(select(AuditLog)).all()], ensure_ascii=False)
        assert seen["key"] not in metas


def test_cost_uses_configured_prices(seeded, monkeypatch):
    monkeypatch.setattr(settings, "price_vcpu_hour_usd", 0.036)
    with SessionLocal() as db:
        run = _rag_run(db, _user(db, "student@cole.local").id, status="succeeded",
                       runner_info={"duration_ms": 100_000, "resources": {"cpu_limit": 1.0, "cpu_seconds": 50.0}})
        c = run_svc.compute_run_cost(db, run)
    assert c["reserved_vcpu_seconds"] == 100.0
    assert c["compute_cost_usd"] == pytest.approx(0.001)
    assert c["pricing_configured"] is True


def test_runner_failure_still_revokes_key_and_records_cost(seeded, monkeypatch):
    with SessionLocal() as db:
        run_id = _rag_run(db, _user(db, "student@cole.local").id).id

    def failing_call(method, path, json=None, timeout=60.0):
        raise RuntimeError("runner down")

    monkeypatch.setattr(run_svc.runner_client, "call", failing_call)
    with SessionLocal() as db:
        run = run_svc.execute_run(db, run_id)
        assert run.status == "error" and run.error["code"] == "RUNNER_EXEC_FAILED"
        assert run.cost is not None and run.cost["llm_requests"] == 0
        assert db.scalar(select(VirtualKey).where(VirtualKey.run_id == run_id)).is_active is False


# ---------------------------------------------------------------- cancel race (doc 14 §4 "Cancel")

def test_cancel_during_execution_is_not_overwritten(seeded, monkeypatch):
    with SessionLocal() as db:
        run_id = _rag_run(db, _user(db, "student@cole.local").id).id

    def fake_call(method, path, json=None, timeout=60.0):
        if path.endswith("/execute"):
            with SessionLocal() as api_db:  # the API process cancels while the runner is busy
                r = api_db.get(Run, run_id)
                r.status, r.cancel_requested_at = "cancelled", utcnow()
                api_db.commit()
            _write_output(run_id, result={"summary": {"passed": True, "headline": {"score": 1.0}}, "cases": []},
                          runner={"cancelled": False, "timed_out": False, "duration_ms": 10})
        return {}

    monkeypatch.setattr(run_svc.runner_client, "call", fake_call)
    with SessionLocal() as db:
        assert run_svc.execute_run(db, run_id).status == "cancelled"
    with SessionLocal() as db:
        assert db.get(Run, run_id).status == "cancelled"


def test_cancel_audit_is_persisted(client, seeded, monkeypatch):
    monkeypatch.setattr(run_svc.runner_client, "call", lambda *a, **k: {})
    with SessionLocal() as db:
        run_id = _rag_run(db, _user(db, "student@cole.local").id).id
    _login(client, "student@cole.local")
    assert client.post(f"/api/runs/{run_id}/cancel").json()["status"] == "cancelled"
    with SessionLocal() as db:
        assert db.scalar(select(AuditLog).where(AuditLog.action == "run.cancel", AuditLog.target_id == run_id))


# ---------------------------------------------------------------- worker crash (doc 14 §4)

def test_recover_stale_runs(seeded, monkeypatch):
    monkeypatch.setattr(run_svc.runner_client, "call", lambda *a, **k: {})
    now = utcnow()
    with SessionLocal() as db:
        uid = _user(db, "student@cole.local").id
        stale = _rag_run(db, uid, status="running", started_at=now - timedelta(hours=2)).id
        fresh = _rag_run(db, uid, status="running", started_at=now - timedelta(seconds=30)).id
        llm_svc.create_virtual_key(db, user_id=uid, run_id=stale)

    with SessionLocal() as db:
        recovered = run_svc.recover_stale_runs(db, now=now)
        assert stale in recovered and fresh not in recovered

    with SessionLocal() as db:
        s, f = db.get(Run, stale), db.get(Run, fresh)
        assert s.status == "error" and s.error["code"] == "WORKER_LOST" and s.cost is not None
        assert f.status == "running"
        assert db.scalar(select(VirtualKey).where(VirtualKey.run_id == stale)).is_active is False
        assert db.scalar(select(AuditLog).where(AuditLog.action == "run.recovered", AuditLog.target_id == stale))
        f.status = "error"  # leave no active run behind for other tests
        db.commit()


# ---------------------------------------------------------------- cost dashboard API

def test_cost_summary_admin_only(client, seeded):
    _login(client, "admin@cole.local")
    r = client.get("/api/admin/runs/cost-summary")
    assert r.status_code == 200
    body = r.json()
    assert body["totals"]["runs_with_cost"] >= 1
    assert any(i["slug"] == "ai-rag-enterprise-chatbot" for i in body["items"])
    _login(client, "student@cole.local")
    assert client.get("/api/admin/runs/cost-summary").status_code == 403


# ---------------------------------------------------------------- schema sync

def test_init_db_adds_missing_nullable_columns(seeded):
    with engine.begin() as conn:
        conn.execute(text('ALTER TABLE "run" DROP COLUMN "cost"'))
    assert "cost" not in {c["name"] for c in inspect(engine).get_columns("run")}
    init_db()
    assert "cost" in {c["name"] for c in inspect(engine).get_columns("run")}


# ---------------------------------------------------------------- LLM forwarder (runtime image)

def test_llmproxy_replaces_authorization_with_run_key(monkeypatch):
    captured: dict = {}

    class Upstream(BaseHTTPRequestHandler):
        def log_message(self, *a):
            pass

        def do_POST(self):
            captured["auth"] = self.headers.get("Authorization")
            captured["path"] = self.path
            body = b'{"ok":true}'
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    up = ThreadingHTTPServer(("127.0.0.1", 0), Upstream)
    threading.Thread(target=up.serve_forever, daemon=True).start()

    monkeypatch.setenv("COLE_LLM_UPSTREAM", f"http://127.0.0.1:{up.server_address[1]}/api/llm")
    monkeypatch.setenv("COLE_LLM_KEY", "cole_vk_secret_run_key")
    spec = importlib.util.spec_from_file_location("llmproxy", REPO_ROOT / "runtime" / "images" / "python-cpu" / "llmproxy.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    px = ThreadingHTTPServer(("127.0.0.1", 0), mod.Handler)
    threading.Thread(target=px.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{px.server_address[1]}"
    try:
        r = httpx.post(f"{base}/v1/chat/completions", json={"messages": []}, headers={"Authorization": "Bearer learner-guess"})
        assert r.status_code == 200
        assert captured["auth"] == "Bearer cole_vk_secret_run_key"
        assert captured["path"] == "/api/llm/v1/chat/completions"
        assert httpx.post(f"{base}/admin/anything", json={}).status_code == 404
    finally:
        px.shutdown()
        up.shutdown()
