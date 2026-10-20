"""Container engine adapter (Docker API). Hardened defaults per docs/design/11 §3."""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from pathlib import Path

import docker
from docker.errors import APIError, NotFound

from .config import settings

log = logging.getLogger("cole.runner")

LABEL_MANAGED = "cole.managed"
LABEL_KIND = "cole.kind"  # workspace | run-subject | run-evaluator | run-proxy
LABEL_WS = "cole.workspace_id"
LABEL_RUN = "cole.run_id"
LABEL_EXPIRES = "cole.expires_at"

_client: docker.DockerClient | None = None
_lock = threading.Lock()
_ws_last_active: dict[str, float] = {}


def client() -> docker.DockerClient:
    global _client
    with _lock:
        if _client is None:
            _client = docker.from_env(timeout=120)
        return _client


def reset_client() -> None:
    global _client
    with _lock:
        _client = None


@dataclass
class Isolation:
    runtime: str
    level: str  # "gvisor" | "runc-degraded"
    warnings: list[str]


_isolation: Isolation | None = None


def isolation() -> Isolation:
    global _isolation
    if _isolation is None:
        runtimes = client().info().get("Runtimes", {}) or {}
        if settings.preferred_runtime in runtimes:
            _isolation = Isolation(settings.preferred_runtime, "gvisor", [])
        else:
            _isolation = Isolation("runc", "runc-degraded", ["ISOLATION_DEGRADED"])
    return _isolation


def _host(p: Path) -> str:
    return str(p.resolve())


def _hardening(mem: str, cpus: float, pids: int) -> dict:
    iso = isolation()
    kw = dict(
        user="1000:1000",
        cap_drop=["ALL"],
        security_opt=["no-new-privileges"],
        pids_limit=pids,
        mem_limit=mem,
        memswap_limit=mem,  # no swap beyond the memory limit
        nano_cpus=int(cpus * 1e9),
        ipc_mode="private",
        init=False,  # image uses tini
    )
    if iso.runtime != "runc":
        kw["runtime"] = iso.runtime
    return kw


# ---------------------------------------------------------------- workspaces

def ws_name(ws_id: str) -> str:
    return f"cole-ws-{ws_id}"


def ensure_workspace(ws_id: str, data_dir: str | None) -> dict:
    """Create or start the long-lived workspace container. Idempotent."""
    c = client()
    host_dir = settings.workspaces_dir / ws_id
    if not host_dir.is_dir():
        raise FileNotFoundError(f"workspace dir missing: {host_dir}")
    name = ws_name(ws_id)
    try:
        cont = c.containers.get(name)
        if cont.status != "running":
            cont.start()
    except NotFound:
        volumes = {_host(host_dir): {"bind": "/workspace", "mode": "rw"}}
        if data_dir:
            dd = Path(data_dir)
            if dd.is_dir():
                (host_dir / "data").mkdir(exist_ok=True)
                volumes[_host(dd)] = {"bind": "/workspace/data", "mode": "ro"}
        cont = c.containers.run(
            settings.image,
            name=name,
            detach=True,
            hostname="workspace",
            network_mode="none",  # egress proxy is backlog (ADR 0005); local POC has no network in workspace
            volumes=volumes,
            working_dir="/workspace",
            environment={"HOME": "/home/learner", "PYTHONUSERBASE": "/workspace/.local"},
            labels={LABEL_MANAGED: "1", LABEL_KIND: "workspace", LABEL_WS: ws_id},
            tmpfs={"/tmp": "rw,nosuid,size=256m"},
            **_hardening(settings.ws_mem, settings.ws_cpus, settings.ws_pids),
        )
    touch_workspace(ws_id)
    cont.reload()
    return {"container": cont.name, "status": cont.status, "isolation": isolation().__dict__}


def touch_workspace(ws_id: str) -> None:
    _ws_last_active[ws_id] = time.time()


def workspace_status(ws_id: str) -> dict:
    try:
        cont = client().containers.get(ws_name(ws_id))
    except NotFound:
        return {"status": "absent"}
    out = {"status": cont.status}
    if cont.status == "running":
        try:
            s = cont.stats(stream=False)
            mem = s.get("memory_stats", {})
            cpu = s.get("cpu_stats", {})
            pre = s.get("precpu_stats", {})
            cpu_delta = cpu.get("cpu_usage", {}).get("total_usage", 0) - pre.get("cpu_usage", {}).get("total_usage", 0)
            sys_delta = cpu.get("system_cpu_usage", 0) - pre.get("system_cpu_usage", 0)
            ncpu = cpu.get("online_cpus") or 1
            out.update(
                mem_used=mem.get("usage", 0) - (mem.get("stats", {}) or {}).get("inactive_file", 0),
                mem_limit=mem.get("limit", 0),
                cpu_percent=round((cpu_delta / sys_delta) * ncpu * 100 / settings.ws_cpus, 1) if sys_delta > 0 else 0.0,
                pids=s.get("pids_stats", {}).get("current"),
            )
        except APIError:
            pass
    return out


def stop_workspace(ws_id: str, remove: bool = False) -> None:
    try:
        cont = client().containers.get(ws_name(ws_id))
    except NotFound:
        return
    if remove:
        cont.remove(force=True)
    else:
        cont.stop(timeout=5)
    _ws_last_active.pop(ws_id, None)


# ---------------------------------------------------------------- PTY

class PtyStream:
    """Bidirectional raw stream for a `docker exec` with TTY (unix socket or Windows npipe)."""

    def __init__(self, exec_id: str, sock):
        self.exec_id = exec_id
        self._sock = getattr(sock, "_sock", sock)
        self._npipe = type(self._sock).__name__ == "NpipeSocket"
        if self._npipe:
            self._sock.settimeout(None)
        self._buf = bytearray(16384)
        self.closed = False

    def read(self) -> bytes:
        if self._npipe:
            n = self._sock.recv_into(self._buf)
            return bytes(self._buf[:n])
        return self._sock.recv(16384)

    def write(self, data: bytes) -> None:
        if self._npipe:
            self._sock.send(data)
        else:
            self._sock.sendall(data)

    def resize(self, cols: int, rows: int) -> None:
        try:
            client().api.exec_resize(self.exec_id, height=max(rows, 2), width=max(cols, 10))
        except APIError:
            pass

    def close(self) -> None:
        if not self.closed:
            self.closed = True
            try:
                self._sock.close()
            except Exception:  # noqa: BLE001
                pass


def open_pty(ws_id: str, cols: int = 120, rows: int = 32) -> PtyStream:
    c = client()
    cont = c.containers.get(ws_name(ws_id))
    ex = c.api.exec_create(
        cont.id,
        ["/bin/bash", "-l"],
        stdin=True,
        tty=True,
        user="1000:1000",
        workdir="/workspace",
        environment={"TERM": "xterm-256color", "COLUMNS": str(cols), "LINES": str(rows)},
    )
    sock = c.api.exec_start(ex["Id"], tty=True, socket=True)
    stream = PtyStream(ex["Id"], sock)
    stream.resize(cols, rows)
    touch_workspace(ws_id)
    return stream


# ---------------------------------------------------------------- reaper

def reap_once() -> dict:
    """Remove expired run containers/networks; stop idle workspaces."""
    c = client()
    now = time.time()
    removed, stopped = 0, 0
    for cont in c.containers.list(all=True, filters={"label": LABEL_MANAGED + "=1"}):
        labels = cont.labels or {}
        kind = labels.get(LABEL_KIND)
        if kind == "workspace":
            ws_id = labels.get(LABEL_WS, "")
            last = _ws_last_active.get(ws_id)
            if cont.status == "running" and (last is None or now - last > settings.ws_idle_minutes * 60):
                if last is None:
                    _ws_last_active[ws_id] = now  # first sighting after restart: start the idle clock
                    continue
                cont.stop(timeout=5)
                stopped += 1
        else:
            exp = float(labels.get(LABEL_EXPIRES, "0") or 0)
            if exp and exp < now:
                cont.remove(force=True)
                removed += 1
    for net in c.networks.list(filters={"label": LABEL_MANAGED + "=1"}):
        exp = float((net.attrs.get("Labels") or {}).get(LABEL_EXPIRES, "0") or 0)
        if exp and exp < now:
            try:
                net.remove()
            except APIError:
                pass
    return {"removed": removed, "stopped": stopped}
