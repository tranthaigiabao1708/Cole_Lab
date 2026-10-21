"""Run execution: one internal network per run, subject + evaluator containers (docs/design/06 §4)."""
from __future__ import annotations

import json
import threading
import time
from pathlib import Path

from docker.errors import APIError, ImageNotFound, NotFound

from . import engine
from .config import settings
from .engine import LABEL_EXPIRES, LABEL_KIND, LABEL_MANAGED, LABEL_RUN, _hardening, _host, client

MAX_LOG = 1_000_000
_cancelled: set[str] = set()
_active: dict[str, list[str]] = {}
_alock = threading.Lock()


def _labels(run_id: str, kind: str, ttl_s: int) -> dict:
    return {LABEL_MANAGED: "1", LABEL_KIND: kind, LABEL_RUN: run_id, LABEL_EXPIRES: str(int(time.time() + ttl_s))}


def _track(run_id: str, cid: str) -> None:
    with _alock:
        _active.setdefault(run_id, []).append(cid)


def _logs(cont) -> str:
    try:
        b = cont.logs(stdout=True, stderr=True, tail=5000)
        return b[-MAX_LOG:].decode("utf-8", errors="replace")
    except APIError:
        return ""


def _start_subject(run_id: str, spec: dict, net_name: str, ex: Path, ttl: int):
    subj = spec["subject"]
    env = {"HOME": "/tmp", "PYTHONDONTWRITEBYTECODE": "1", "COLE_SUBMISSION_DIR": "/submission"}
    if subj["kind"] == "python_entrypoint":
        command = ["python", "/opt/cole/harness.py"]
        env.update(COLE_ENTRY=subj["entry"], COLE_INPUT_KIND=subj.get("input_kind", "json"), COLE_PORT="8080")
    elif subj["kind"] == "http_service":
        command = subj.get("command")
        if not command:
            entry = subj.get("entry") or "app.main:app"
            command = ["uvicorn", entry, "--host", "0.0.0.0", "--port", "8080"]
        env.update(PORT="8080")
    else:
        raise ValueError(f"unknown subject kind {subj['kind']}")
    env.update(subj.get("env") or {})
    c = client()
    cont = c.containers.create(
        settings.image,
        command=command,
        name=f"cole-run-{run_id}-subject",
        hostname="subject",
        working_dir="/submission",
        environment=env,
        volumes={_host(ex / "input" / "submission"): {"bind": "/submission", "mode": "ro"}},
        read_only=True,
        tmpfs={"/tmp": "rw,nosuid,size=512m"},
        network=net_name,
        labels=_labels(run_id, "run-subject", ttl),
        **_hardening(settings.run_mem, settings.run_cpus, settings.run_pids),
    )
    # network alias "subject" so evaluator can reach http://subject:8080
    c.api.disconnect_container_from_network(cont.id, net_name)
    c.api.connect_container_to_network(cont.id, net_name, aliases=["subject"])
    _track(run_id, cont.id)
    cont.start()
    return cont


def _start_llm_proxy(run_id: str, spec: dict, net_name: str, ttl: int):
    """Forwarder reachable as http://llm:8081 inside the run network; egress only to the gateway."""
    llm = spec.get("llm")
    if not llm:
        return None
    c = client()
    cont = c.containers.create(
        settings.image,
        command=["python", "/opt/cole/llmproxy.py"],
        name=f"cole-run-{run_id}-llm",
        environment={"COLE_LLM_UPSTREAM": llm["upstream"], "COLE_LLM_KEY": llm["key"], "HOME": "/tmp"},
        read_only=True,
        tmpfs={"/tmp": "rw,size=16m"},
        network="bridge",
        labels=_labels(run_id, "run-proxy", ttl),
        extra_hosts={"host.docker.internal": "host-gateway"},
        **_hardening("256m", 0.5, 64),
    )
    c.api.connect_container_to_network(cont.id, net_name, aliases=["llm"])
    _track(run_id, cont.id)
    cont.start()
    return cont


def execute(run_id: str, spec: dict) -> dict:
    """Blocking. Returns exit status; evaluator writes results into exchange/<run>/output."""
    c = client()
    ex = settings.exchange_dir / run_id
    out_dir = ex / "output"
    if not (ex / "input").is_dir():
        raise FileNotFoundError(f"exchange input missing for {run_id}")
    out_dir.mkdir(parents=True, exist_ok=True)
    timeout_s = int(spec.get("timeout_s", 600))
    ttl = timeout_s + 300
    iso = engine.isolation()
    net_name = f"cole-run-{run_id}"
    started = time.time()
    subject = proxy = evaluator = None
    result: dict = {"isolation": iso.__dict__, "timed_out": False, "cancelled": False}
    try:
        try:
            c.images.get(spec["evaluator_image"])
        except ImageNotFound:
            return {**result, "exit_code": None, "error": "EVALUATOR_IMAGE_MISSING"}
        c.networks.create(net_name, driver="bridge", internal=True, labels=_labels(run_id, "run-network", ttl))
        if spec.get("subject"):
            subject = _start_subject(run_id, spec, net_name, ex, ttl)
        proxy = _start_llm_proxy(run_id, spec, net_name, ttl)
        env = {
            "COLE_MODE": spec.get("mode", "run"),
            "COLE_INPUT_DIR": "/cole/input",
            "COLE_OUTPUT_DIR": "/cole/output",
            "COLE_SUBJECT_URL": "http://subject:8080" if subject else "",
            "COLE_LLM_URL": "http://llm:8081/v1" if proxy else "",
            "COLE_RUN_ID": run_id,
            "HOME": "/tmp",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
        evaluator = c.containers.create(
            spec["evaluator_image"],
            name=f"cole-run-{run_id}-evaluator",
            environment=env,
            volumes={
                _host(ex / "input"): {"bind": "/cole/input", "mode": "ro"},
                _host(out_dir): {"bind": "/cole/output", "mode": "rw"},
            },
            read_only=True,
            tmpfs={"/tmp": "rw,nosuid,size=512m"},
            network=net_name,
            labels=_labels(run_id, "run-evaluator", ttl),
            **_hardening(settings.run_mem, settings.run_cpus, settings.run_pids),
        )
        _track(run_id, evaluator.id)
        evaluator.start()
        deadline = started + timeout_s
        exit_code = None
        while True:
            if run_id in _cancelled:
                result["cancelled"] = True
                break
            if time.time() > deadline:
                result["timed_out"] = True
                break
            try:
                r = evaluator.wait(timeout=2)
                exit_code = r.get("StatusCode")
                break
            except Exception:  # noqa: BLE001 — wait timeout (requests ReadTimeout / ConnectionError)
                continue
        result["exit_code"] = exit_code
        (out_dir / "evaluator.log").write_text(_logs(evaluator), encoding="utf-8")
        if subject:
            (out_dir / "subject.log").write_text(_logs(subject), encoding="utf-8")
        if proxy:
            (out_dir / "llm-proxy.log").write_text(_logs(proxy), encoding="utf-8")
    finally:
        _cleanup(run_id, net_name)
        _cancelled.discard(run_id)
        result["duration_ms"] = int((time.time() - started) * 1000)
        (out_dir / "runner.json").write_text(json.dumps(result), encoding="utf-8")
    return result


def _cleanup(run_id: str, net_name: str) -> None:
    c = client()
    with _alock:
        ids = _active.pop(run_id, [])
    for cid in ids:
        try:
            c.containers.get(cid).remove(force=True)
        except (NotFound, APIError):
            pass
    try:
        c.networks.get(net_name).remove()
    except (NotFound, APIError):
        pass


def cancel(run_id: str) -> bool:
    _cancelled.add(run_id)
    with _alock:
        ids = list(_active.get(run_id, []))
    for cid in ids:
        try:
            client().containers.get(cid).kill()
        except (NotFound, APIError):
            pass
    return bool(ids)
