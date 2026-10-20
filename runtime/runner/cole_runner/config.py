"""Runner-agent: the ONLY process allowed to talk to the container engine (docs/design/04, 11).

API/worker call it over HTTP with a bearer token. Learner and plugin code never run here;
they run in containers this agent creates with hardened defaults.
"""
from __future__ import annotations

import os
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]


class Settings:
    token: str = os.environ.get("COLE_RUNNER_TOKEN", "dev-runner-token-change-me")
    var_dir: Path = Path(os.environ.get("COLE_VAR_DIR", str(REPO_ROOT / "var"))).resolve()
    image: str = os.environ.get("COLE_RUNTIME_IMAGE", "cole/python-cpu:0.1")
    # Prefer gVisor when present; fall back to runc with an explicit ISOLATION_DEGRADED flag (ADR 0005).
    preferred_runtime: str = os.environ.get("COLE_RUNTIME", "runsc")
    ws_mem: str = os.environ.get("COLE_WS_MEM", "2g")
    ws_cpus: float = float(os.environ.get("COLE_WS_CPUS", "1.0"))
    ws_pids: int = int(os.environ.get("COLE_WS_PIDS", "256"))
    ws_idle_minutes: int = int(os.environ.get("COLE_WS_IDLE_MINUTES", "60"))
    run_mem: str = os.environ.get("COLE_RUN_MEM", "2g")
    run_cpus: float = float(os.environ.get("COLE_RUN_CPUS", "1.0"))
    run_pids: int = int(os.environ.get("COLE_RUN_PIDS", "256"))
    reaper_interval_s: int = int(os.environ.get("COLE_REAPER_INTERVAL", "60"))

    @property
    def workspaces_dir(self) -> Path:
        return self.var_dir / "workspaces"

    @property
    def exchange_dir(self) -> Path:
        return self.var_dir / "exchange"


settings = Settings()
