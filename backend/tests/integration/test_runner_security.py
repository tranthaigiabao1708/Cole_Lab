"""Sandbox hardening checks against a real container engine (docs/design/11 Â§3, doc 14 security rows).

Skipped automatically when Docker or the runtime image is unavailable â€” there is no
in-process fallback by design.
"""
import sys
import uuid
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[3] / "runtime" / "runner"))

docker = pytest.importorskip("docker")


def _engine():
    from cole_runner import engine
    from cole_runner.config import settings

    try:
        engine.client().ping()
        engine.client().images.get(settings.image)
    except Exception as e:  # noqa: BLE001
        pytest.skip(f"container engine/image unavailable: {e}")
    return engine, settings


@pytest.fixture(scope="module")
def ws():
    engine, settings = _engine()
    settings.ws_mem = "256m"
    settings.ws_pids = 64
    ws_id = "sec-" + uuid.uuid4().hex[:8]
    d = settings.workspaces_dir / ws_id
    d.mkdir(parents=True, exist_ok=True)
    data = settings.var_dir / "secdata" / ws_id
    data.mkdir(parents=True, exist_ok=True)
    (data / "a.txt").write_text("x")
    engine.ensure_workspace(ws_id, str(data))
    cont = engine.client().containers.get(engine.ws_name(ws_id))
    yield cont
    engine.stop_workspace(ws_id, remove=True)


def _run(cont, argv: list[str], timeout: int = 30):
    r = cont.exec_run(["timeout", str(timeout), *argv], user="1000:1000")
    return r.exit_code, r.output.decode(errors="replace")


def _sh(cont, cmd: str, timeout: int = 30):
    return _run(cont, ["sh", "-c", cmd], timeout)


def _py(cont, code: str, timeout: int = 30):
    return _run(cont, ["python", "-c", code], timeout)


def test_runs_as_unprivileged_user(ws):
    _, out = _sh(ws, "id -u")
    assert out.strip() == "1000"
    _, out = _sh(ws, "grep CapEff /proc/self/status")
    assert out.split()[-1] == "0000000000000000"


def test_no_network(ws):
    code, _ = _py(ws, "import socket; socket.create_connection(('1.1.1.1', 80), timeout=3)")
    assert code != 0
    assert ws.attrs["HostConfig"]["NetworkMode"] == "none"


def test_data_mount_read_only(ws):
    code, _ = _sh(ws, "echo y > /workspace/data/a.txt")
    assert code != 0
    code, out = _sh(ws, "echo ok > /workspace/mine.txt && cat /workspace/mine.txt")
    assert code == 0 and "ok" in out


FORK = """
import os, time
for i in range(500):
    try:
        pid = os.fork()
    except OSError:
        print("BLOCKED", i, flush=True)
        break
    if pid == 0:
        time.sleep(5)
        os._exit(0)
"""


def test_pids_limit_contains_fork_bomb(ws):
    assert ws.attrs["HostConfig"]["PidsLimit"] == 64
    _, out = _py(ws, FORK, timeout=20)
    assert "BLOCKED" in out
    import time

    deadline = time.time() + 20
    out = ""
    while time.time() < deadline:
        _, out = _sh(ws, "echo alive")
        if "alive" in out:
            break
        time.sleep(1)
    assert "alive" in out


def test_memory_limit_kills_hog_not_container(ws):
    assert ws.attrs["HostConfig"]["Memory"] == 256 * 1024 * 1024
    code, _ = _py(ws, "b = bytearray(600 * 1024 * 1024); b[::4096] = b'x' * len(b[::4096]); print(len(b))")
    assert code != 0
    _, out = _sh(ws, "echo alive")
    assert "alive" in out