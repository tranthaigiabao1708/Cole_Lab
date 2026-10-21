from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from cole_platform.kernel.auth import Principal, current_user, require_admin
from cole_platform.kernel.db import get_db

from . import service

router = APIRouter(tags=["plugins"])


class CreateSimulatorIn(BaseModel):
    id: str
    name: str
    description: str = ""
    track: str = "AI_ENGINEER"
    category: str = "custom"
    entry_path: str = "solution/predict.py"
    dataset_config: dict | None = None
    mode: str = "python_impl"
    image: str = "cole/python-cpu:0.1"
    run_command: str = "python solution.py"
    default_code: str = ""
    default_readme: str = ""


@router.get("/teach/simulators")
def get_teach_simulators(p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    if not p.is_teacher:
        from cole_platform.kernel.errors import forbidden
        raise forbidden()
    return service.list_teach_simulators(db)


@router.post("/teach/simulators")
def post_teach_simulator(body: CreateSimulatorIn, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    if not p.is_teacher:
        from cole_platform.kernel.errors import forbidden
        raise forbidden()
    return service.create_teach_simulator(db, p, body.model_dump())


@router.get("/admin/plugins")
def list_plugins(p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    # Teachers and Admins can view simulators
    if not p.is_teacher:
        from cole_platform.kernel.errors import forbidden
        raise forbidden()
    return service.list_plugins(db)



@router.post("/admin/plugins/scan")
def scan_plugins(p: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    registered = service.scan_and_register(db, actor_id=p.id)
    synced = service.sync_images(db)
    return {"registered": registered, "synced_images": synced}


@router.post("/admin/plugins/{pv_id}/build")
def build_plugin_version(pv_id: str, p: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    pv = service.build(db, pv_id, actor_id=p.id)
    return service.pv_out(pv)


class ToggleIn(BaseModel):
    enabled: bool


@router.post("/admin/plugins/{pv_id}/toggle")
def toggle_plugin_version(pv_id: str, body: ToggleIn, p: Principal = Depends(require_admin), db: Session = Depends(get_db)):
    pv = service.set_enabled(db, pv_id, body.enabled, actor_id=p.id)
    return service.pv_out(pv)


@router.get("/admin/runtime/status")
def runtime_status(p: Principal = Depends(require_admin)):
    from cole_platform.kernel import runner_client
    try:
        health = runner_client.call("GET", "/health", timeout=5)
    except Exception as e:
        health = {"ok": False, "error": str(e)}
    try:
        containers = runner_client.call("GET", "/containers", timeout=10)
    except Exception as e:
        containers = {"containers": [], "error": str(e)}
    return {"health": health, "containers": containers.get("containers", [])}


@router.post("/admin/runtime/reap")
def runtime_reap(p: Principal = Depends(require_admin)):
    from cole_platform.kernel import runner_client
    return runner_client.call("POST", "/reap", timeout=30)

