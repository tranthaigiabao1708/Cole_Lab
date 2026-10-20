"""Simulator plugin registry: scan `simulators/*/plugin.yaml`, build images via the runner, resolve ranges."""
from __future__ import annotations

import hashlib
import re
from pathlib import Path

import yaml
from sqlalchemy import select
from sqlalchemy.orm import Session

from cole_platform.kernel import runner_client
from cole_platform.kernel.audit import audit
from cole_platform.kernel.config import REPO_ROOT, settings
from cole_platform.kernel.db import utcnow
from cole_platform.kernel.errors import AppError, not_found
from cole_platform.kernel.ids import new_id

from .models import PluginVersion, SimulatorPlugin

SIM_BASE = {"context": "sdk/python", "tag": "cole/sim-base:1"}
CONTRACTS = {"simulator.v1"}


# ---------------------------------------------------------------- semver

def parse_ver(v: str) -> tuple[int, int, int]:
    m = re.fullmatch(r"(\d+)\.(\d+)(?:\.(\d+))?", v.strip())
    if not m:
        raise ValueError(f"bad version {v!r}")
    return int(m[1]), int(m[2]), int(m[3] or 0)


def satisfies(version: str, rng: str) -> bool:
    """Supports `^X.Y[.Z]`, `~X.Y[.Z]`, exact `X.Y.Z`, and `*`."""
    v = parse_ver(version)
    rng = rng.strip()
    if rng in ("*", ""):
        return True
    if rng.startswith("^"):
        lo = parse_ver(rng[1:])
        hi = (lo[0] + 1, 0, 0) if lo[0] > 0 else (0, lo[1] + 1, 0)
        return lo <= v < hi
    if rng.startswith("~"):
        lo = parse_ver(rng[1:])
        return lo <= v < (lo[0], lo[1] + 1, 0)
    return v == parse_ver(rng)


# ---------------------------------------------------------------- registry

def _dir_sha(d: Path) -> str:
    h = hashlib.sha256()
    for p in sorted(x for x in d.rglob("*") if x.is_file() and "__pycache__" not in x.parts):
        h.update(p.relative_to(d).as_posix().encode())
        h.update(p.read_bytes())
    return h.hexdigest()


def scan_and_register(db: Session, actor_id: str | None = None) -> list[dict]:
    out = []
    root = settings.simulators_dir
    for y in sorted(root.glob("*/plugin.yaml")):
        d = y.parent
        m = yaml.safe_load(y.read_text(encoding="utf-8")) or {}
        pid, ver = m["id"], str(m["version"])
        if m.get("contract") not in CONTRACTS:
            out.append({"plugin": pid, "version": ver, "result": "skipped: unsupported contract"})
            continue
        sha = _dir_sha(d)
        plug = db.get(SimulatorPlugin, pid)
        if not plug:
            plug = SimulatorPlugin(id=pid, name=m.get("name", pid), description=m.get("description", ""))
            db.add(plug)
            db.flush()
        else:
            plug.name, plug.description = m.get("name", pid), m.get("description", "")
        pv = db.scalar(select(PluginVersion).where(PluginVersion.plugin_id == pid, PluginVersion.version == ver))
        if pv and pv.source_sha != sha:
            # Released versions are immutable: changed sources must bump `version`.
            out.append({"plugin": pid, "version": ver, "result": "conflict: sources changed without version bump"})
            continue
        if not pv:
            pv = PluginVersion(id=new_id("plv"), plugin_id=pid, version=ver, contract=m["contract"], image=m["image"],
                               renderer=m.get("renderer", "generic-table@1"), manifest=m,
                               source_dir=d.relative_to(REPO_ROOT).as_posix(), source_sha=sha)
            db.add(pv)
            audit(db, "plugin.register", actor_id=actor_id, actor_type="user" if actor_id else "system",
                  target_type="plugin_version", target_id=pv.id, meta={"plugin": pid, "version": ver})
            out.append({"plugin": pid, "version": ver, "result": "registered"})
        else:
            out.append({"plugin": pid, "version": ver, "result": "unchanged"})
    db.commit()
    return out


def sync_images(db: Session) -> int:
    """Mark versions `ready` when their image already exists on the engine (e.g. after a re-seed)."""
    try:
        tags = set(runner_client.call("GET", "/images", timeout=10).get("tags", []))
    except AppError:
        return 0
    n = 0
    for pv in db.scalars(select(PluginVersion).where(PluginVersion.status.in_(("registered", "failed")))):
        if pv.image in tags:
            pv.status, pv.built_at = "ready", pv.built_at or utcnow()
            n += 1
    db.commit()
    return n


def build(db: Session, pv_id: str, actor_id: str) -> PluginVersion:
    pv = db.get(PluginVersion, pv_id)
    if not pv:
        raise not_found("Phiên bản simulator")
    pv.status = "building"
    db.commit()
    try:
        runner_client.call("POST", "/images/build", json=SIM_BASE, timeout=900)
        r = runner_client.call("POST", "/images/build", json={"context": pv.source_dir, "tag": pv.image}, timeout=900)
        pv.status, pv.image_id, pv.build_log, pv.built_at = "ready", r.get("id"), r.get("log", ""), utcnow()
    except AppError as e:
        pv.status = "failed"
        pv.build_log = str(e.detail)[:4000]
    audit(db, "plugin.build", actor_id=actor_id, target_type="plugin_version", target_id=pv.id,
          meta={"status": pv.status, "image": pv.image})
    db.commit()
    return pv


def set_enabled(db: Session, pv_id: str, enabled: bool, actor_id: str) -> PluginVersion:
    pv = db.get(PluginVersion, pv_id)
    if not pv:
        raise not_found("Phiên bản simulator")
    if enabled and pv.status == "disabled":
        pv.status = "ready" if pv.built_at else "registered"
    elif not enabled:
        pv.status = "disabled"
    audit(db, "plugin.enable" if enabled else "plugin.disable", actor_id=actor_id,
          target_type="plugin_version", target_id=pv.id)
    db.commit()
    return pv


def resolve(db: Session, plugin_id: str, rng: str) -> PluginVersion | None:
    best = None
    for pv in db.scalars(select(PluginVersion).where(PluginVersion.plugin_id == plugin_id,
                                                     PluginVersion.status == "ready")):
        try:
            if satisfies(pv.version, rng) and (best is None or parse_ver(pv.version) > parse_ver(best.version)):
                best = pv
        except ValueError:
            continue
    return best


def pv_out(pv: PluginVersion) -> dict:
    return {"id": pv.id, "plugin_id": pv.plugin_id, "version": pv.version, "contract": pv.contract,
            "image": pv.image, "renderer": pv.renderer, "status": pv.status, "modes": pv.manifest.get("modes", []),
            "needs_llm": bool(pv.manifest.get("needs_llm")), "subject": pv.manifest.get("subject"),
            "source_dir": pv.source_dir, "source_sha": pv.source_sha[:12],
            "built_at": pv.built_at.isoformat() if pv.built_at else None, "build_log": pv.build_log,
            "created_at": pv.created_at.isoformat() if pv.created_at else None}


def list_plugins(db: Session) -> list[dict]:
    out = []
    for p in db.scalars(select(SimulatorPlugin).order_by(SimulatorPlugin.id)):
        vers = db.scalars(select(PluginVersion).where(PluginVersion.plugin_id == p.id)).all()
        vers = sorted(vers, key=lambda v: parse_ver(v.version), reverse=True)
        out.append({"id": p.id, "name": p.name, "description": p.description, "versions": [pv_out(v) for v in vers]})
    return out
