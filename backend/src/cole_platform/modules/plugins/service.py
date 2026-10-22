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
            image_tag = m.get("image") or f"cole/sim-{pid.split('.')[-1]}:{ver}"
            pv = PluginVersion(id=new_id("plv"), plugin_id=pid, version=ver, contract=m["contract"], image=image_tag,
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


KNOWN_METADATA = {
    "cole.cv-ok-ng": {
        "track": "AI_ENGINEER",
        "category": "cv",
        "category_name": "Thị giác máy tính (Computer Vision)",
        "entry_path": "solution/predict.py",
        "dataset_config": {
            "train_images_dir": "data/train/",
            "test_images_dir": "data/test/",
            "test_videos_dir": "data/test_videos/",
        },
        "mode": "python_impl",
        "run_command": "python -m solution.predict",
        "default_code": (
            "def predict(input_data: dict) -> dict:\n"
            "    \"\"\"\n"
            "    Hàm dự đoán kiểm định chất lượng linh kiện (OK hoặc NG).\n"
            "    input_data: { 'image_path': str, 'features': dict }\n"
            "    \"\"\"\n"
            "    return {\n"
            "        'label': 'OK',\n"
            "        'confidence': 0.98,\n"
            "        'details': 'Linh kiện đạt chuẩn ngoại quan'\n"
            "    }\n"
        ),
        "default_readme": (
            "# Đề bài Thực hành: Phân loại linh kiện OK/NG\n\n"
            "## 1. Mục tiêu\n"
            "Xây dựng mô hình phân loại tự động linh kiện trên dây chuyền sản xuất thành 2 nhóm:\n"
            "- **OK**: Linh kiện nguyên vẹn, bề mặt đạt tiêu chuẩn.\n"
            "- **NG**: Linh kiện bị lỗi (xước, móp, nứt, sai lệch kích thước).\n\n"
            "## 2. Đầu vào & Đầu ra\n"
            "- **Đầu vào**: `{'image_path': '...', 'features': {...}}`\n"
            "- **Đầu ra**: `{'label': 'OK', 'confidence': 0.95}`\n\n"
            "## 3. Tiêu chí đánh giá\n"
            "- **F1-Score**: Tối thiểu 85% trên tập dữ liệu kiểm thử ẩn.\n"
            "- **Thời gian xử lý**: < 200ms / mẫu.\n"
        ),
    },
    "cole.cv-football-heatmap": {
        "track": "AI_ENGINEER",
        "category": "cv",
        "category_name": "Thị giác máy tính (Computer Vision)",
        "entry_path": "solution/predict.py",
        "dataset_config": {
            "train_images_dir": "data/train/",
            "test_images_dir": "data/test/",
            "test_videos_dir": "data/test_videos/",
        },
        "mode": "python_impl",
        "run_command": "python -m solution.predict",
        "default_code": (
            "import cv2\n"
            "import numpy as np\n\n"
            "class VideoAnalyzer:\n"
            "    def __init__(self):\n"
            "        self.pitch_length = 105.0\n"
            "        self.pitch_width = 68.0\n\n"
            "    def process_frame(self, frame: np.ndarray) -> dict:\n"
            "        h, w, _ = frame.shape\n"
            "        dummy_boxes = [[int(w*0.4), int(h*0.5), int(w*0.45), int(h*0.65)]]\n"
            "        return {'players_count': len(dummy_boxes), 'boxes': dummy_boxes, 'labels': ['player_red']}\n\n"
            "    def analyze_video(self, video_path: str) -> dict:\n"
            "        heatmap_grid = np.zeros((14, 21), dtype=float)\n"
            "        heatmap_grid[6:8, 9:12] = 1.0\n"
            "        return {'total_frames': 750, 'heatmap_matrix': heatmap_grid.tolist(), 'status': 'completed'}\n\n"
            "def predict(input_data: dict) -> dict:\n"
            "    analyzer = VideoAnalyzer()\n"
            "    return analyzer.process_frame(input_data.get('frame'))\n"
        ),
        "default_readme": (
            "# Đề bài: Phân tích Video trận đấu & Lập Heatmap nhiệt sân bóng đá\n\n"
            "## 1. Dữ liệu thực hành\n"
            "- 15 frames ảnh train Full HD: `data/train/`\n"
            "- 5 frames ảnh test ẩn: `data/test/`\n"
            "- Video clip trận đấu thực tế (750 frames): `data/test_videos/bundesliga_match_clip.mp4`\n\n"
            "## 2. Tiêu chuẩn bài nộp (Contract Interface)\n"
            "Học viên hoàn thiện lớp `VideoAnalyzer` trong `solution/predict.py`. Hệ thống chấm điểm tự động sẽ gọi `process_frame()` và `analyze_video()` trên tập test ẩn."
        ),
    },
    "cole.rag-chatbot": {
        "track": "AI_ENGINEER",
        "category": "rag",
        "category_name": "Trợ lý Chatbot RAG (Enterprise RAG)",
        "entry_path": "app/main.py",
        "mode": "http_service",
        "run_command": "python -m uvicorn app.main:app --host 0.0.0.0 --port 8000",
        "default_code": (
            "from fastapi import FastAPI\n"
            "from pydantic import BaseModel\n\n"
            "app = FastAPI(title='Enterprise RAG Assistant')\n\n"
            "class QueryRequest(BaseModel):\n"
            "    query: str\n"
            "    top_k: int = 3\n\n"
            "class QueryResponse(BaseModel):\n"
            "    answer: str\n"
            "    citations: list[str] = []\n\n"
            "@app.post('/query', response_model=QueryResponse)\n"
            "def query_rag(req: QueryRequest):\n"
            "    return QueryResponse(\n"
            "        answer=f'Câu trả lời tổng hợp cho câu hỏi: {req.query}',\n"
            "        citations=['Tai_lieu_noi_bo.pdf:Trang 4']\n"
            "    )\n"
        ),
        "default_readme": (
            "# Đề bài Thực hành: Xây dựng Trợ lý Chatbot RAG Doanh nghiệp\n\n"
            "## 1. Yêu cầu hệ thống\n"
            "Triển khai một dịch vụ HTTP dựa trên FastAPI cung cấp endpoint `POST /query` để trả lời câu hỏi dựa trên kho tri thức tài liệu doanh nghiệp.\n\n"
            "## 2. Tiêu chí đánh giá\n"
            "- Đánh giá tự động bộ 3 chỉ số RAG Triad: Context Relevance, Groundedness, Answer Relevance.\n"
        ),
    },
    "cole.echo-sample": {
        "track": "AI_ENGINEER",
        "category": "nlp",
        "category_name": "Xử lý văn bản & Pipeline dữ liệu",
        "entry_path": "solution.py",
        "mode": "python_impl",
        "run_command": "python solution.py",
        "default_code": (
            "def predict(input_data: dict) -> dict:\n"
            "    text = input_data.get('text', '')\n"
            "    normalized = ' '.join(text.strip().split())\n"
            "    return {'output': normalized}\n"
        ),
        "default_readme": (
            "# Đề bài Thực hành: Chuẩn hóa dữ liệu văn bản\n\n"
            "Xây dựng hàm chuẩn hóa chuỗi dữ liệu đầu vào, loại bỏ ký tự rác và khoảng trắng dư thừa.\n"
        ),
    },
}


def list_teach_simulators(db: Session) -> list[dict]:
    out = []
    for p in db.scalars(select(SimulatorPlugin).order_by(SimulatorPlugin.id)):
        vers = db.scalars(select(PluginVersion).where(PluginVersion.plugin_id == p.id)).all()
        vers = sorted(vers, key=lambda v: parse_ver(v.version), reverse=True)
        latest = vers[0] if vers else None
        known = KNOWN_METADATA.get(p.id, {})
        manifest = latest.manifest if latest and latest.manifest else {}

        track = manifest.get("track") or known.get("track") or "AI_ENGINEER"
        category = manifest.get("category") or known.get("category") or "custom"
        entry_path = manifest.get("entry_path") or known.get("entry_path") or "solution/predict.py"
        dataset_config = manifest.get("dataset_config") or known.get("dataset_config")
        mode = manifest.get("mode") or known.get("mode") or ("http_service" if "http_service" in manifest.get("modes", []) else "python_impl")
        run_command = manifest.get("run_command") or known.get("run_command") or "python solution.py"
        default_code = manifest.get("default_code") or known.get("default_code") or "# Viet giai thuat tai day\n"
        default_readme = manifest.get("default_readme") or known.get("default_readme") or f"# {p.name}\n\nĐề bài thực hành."
        image = latest.image if latest else "cole/python-cpu:0.1"

        out.append({
            "id": p.id,
            "name": p.name,
            "description": p.description,
            "track": track,
            "category": category,
            "category_name": known.get("category_name") or category.upper(),
            "entry_path": entry_path,
            "dataset_config": dataset_config,
            "mode": mode,
            "image": image,
            "version": latest.version if latest else "1.0.0",
            "status": latest.status if latest else "registered",
            "run_command": run_command,
            "default_code": default_code,
            "default_readme": default_readme,
            "versions_count": len(vers),
        })
    return out


def create_teach_simulator(db: Session, p: Principal, data: dict) -> dict:
    from cole_platform.kernel.audit import audit

    sim_id = data["id"].strip().lower()
    if not sim_id.startswith("cole."):
        sim_id = f"cole.{sim_id}"

    existing = db.get(SimulatorPlugin, sim_id)
    if existing:
        raise AppError(400, "SIMULATOR_EXISTS", f"Bộ simulator có mã '{sim_id}' đã tồn tại.")

    plug = SimulatorPlugin(id=sim_id, name=data["name"].strip(), description=data.get("description", "").strip())
    db.add(plug)
    db.flush()

    manifest = {
        "id": sim_id,
        "version": "1.0.0",
        "contract": "simulator.v1",
        "name": plug.name,
        "description": plug.description,
        "track": data.get("track", "AI_ENGINEER"),
        "category": data.get("category", "custom"),
        "entry_path": data.get("entry_path", "solution/predict.py"),
        "dataset_config": data.get("dataset_config"),
        "mode": data.get("mode", "python_impl"),
        "run_command": data.get("run_command", "python solution.py"),
        "default_code": data.get("default_code", "# Code mau\n"),
        "default_readme": data.get("default_readme", f"# {plug.name}\n\nDe bai thuc hanh."),
        "image": data.get("image", "cole/python-cpu:0.1"),
    }

    pv = PluginVersion(
        id=new_id("plv"),
        plugin_id=plug.id,
        version="1.0.0",
        contract="simulator.v1",
        image=data.get("image", "cole/python-cpu:0.1"),
        renderer=data.get("renderer", "generic-table@1"),
        manifest=manifest,
        source_dir="custom",
        source_sha="custom-sha",
        status="ready",
        built_at=utcnow(),
    )
    db.add(pv)
    audit(db, "simulator.create", actor_id=p.id, target_type="simulator_plugin", target_id=plug.id,
          meta={"name": plug.name, "category": manifest["category"], "track": manifest["track"]})
    db.commit()

    return {
        "id": plug.id,
        "name": plug.name,
        "description": plug.description,
        "track": manifest["track"],
        "category": manifest["category"],
        "category_name": manifest["category"].upper(),
        "entry_path": manifest["entry_path"],
        "dataset_config": manifest.get("dataset_config"),
        "mode": manifest["mode"],
        "image": pv.image,
        "version": pv.version,
        "status": pv.status,
        "run_command": manifest["run_command"],
        "default_code": manifest["default_code"],
        "default_readme": manifest["default_readme"],
        "versions_count": 1,
    }

