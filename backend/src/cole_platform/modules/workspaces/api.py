import asyncio
import contextlib
import mimetypes

from fastapi import APIRouter, Depends, File, Form, UploadFile, WebSocket
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from cole_platform.kernel import runner_client
from cole_platform.kernel.auth import COOKIE_NAME, Principal, current_user, principal_from_token
from cole_platform.kernel.config import settings
from cole_platform.kernel.db import SessionLocal, get_db

from . import service

router = APIRouter(tags=["workspaces"])


def _ws_out(db: Session, ws, p: Principal) -> dict:
    from cole_platform.modules.assignments.models import Assignment, AssignmentVersion

    a = db.get(Assignment, ws.assignment_id)
    av = db.get(AssignmentVersion, ws.assignment_version_id)
    return {
        "id": ws.id,
        "assignment": {"id": a.id, "slug": a.slug, "title": a.title},
        "version": av.version,
        "run_command": av.run_command,
        "contract": av.contract,
        "manifest": ws.manifest,
        "owner": ws.user_id == p.id,
        "dataset": av.dataset_info,
        "plugin_id": av.plugin_id,
        "rubric": av.rubric or [],
    }



@router.post("/assignments/{assignment_id}/workspace")
def open_ws(assignment_id: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    ws = service.open_workspace(db, p, assignment_id)
    return _ws_out(db, ws, p)


@router.get("/workspaces/{ws_id}")
def get_ws(ws_id: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    return _ws_out(db, service.get_owned(db, p, ws_id), p)


@router.post("/workspaces/{ws_id}/start")
def start_ws(ws_id: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    ws = service.get_owned(db, p, ws_id, write=True)
    return service.ensure_container(db, ws)


@router.get("/workspaces/{ws_id}/status")
def status_ws(ws_id: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    service.get_owned(db, p, ws_id)
    return runner_client.call("GET", f"/workspaces/{ws_id}", timeout=15)


@router.get("/workspaces/{ws_id}/files/tree")
def files_tree(ws_id: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    return service.tree(db, service.get_owned(db, p, ws_id))


@router.get("/workspaces/{ws_id}/files/content")
def files_read(ws_id: str, path: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    return service.read_text(db, service.get_owned(db, p, ws_id), path)


class WriteIn(BaseModel):
    path: str
    content: str


@router.put("/workspaces/{ws_id}/files/content")
def files_write(ws_id: str, body: WriteIn, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    return service.write_text(db, service.get_owned(db, p, ws_id, write=True), body.path, body.content)


@router.post("/workspaces/{ws_id}/files/upload")
async def files_upload(ws_id: str, path: str = Form(...), file: UploadFile = File(...),
                       p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    ws = service.get_owned(db, p, ws_id, write=True)
    data = await file.read(service.MAX_UPLOAD + 1)
    return service.write_bytes(db, ws, path, data)


class PathIn(BaseModel):
    path: str


@router.post("/workspaces/{ws_id}/files/mkdir")
def files_mkdir(ws_id: str, body: PathIn, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    return service.mkdir(db, service.get_owned(db, p, ws_id, write=True), body.path)


class RenameIn(BaseModel):
    src: str
    dst: str


@router.post("/workspaces/{ws_id}/files/rename")
def files_rename(ws_id: str, body: RenameIn, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    return service.rename(db, service.get_owned(db, p, ws_id, write=True), body.src, body.dst)


@router.delete("/workspaces/{ws_id}/files")
def files_delete(ws_id: str, path: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    return service.delete(db, service.get_owned(db, p, ws_id, write=True), path)


@router.get("/workspaces/{ws_id}/files/download")
def files_download(ws_id: str, path: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    ws = service.get_owned(db, p, ws_id)
    f = service.resolve(db, ws, path)
    if not f.is_file():
        from cole_platform.kernel.errors import not_found

        raise not_found("Tệp")
    return FileResponse(f, filename=f.name, media_type=mimetypes.guess_type(f.name)[0] or "application/octet-stream")


@router.websocket("/workspaces/{ws_id}/pty")
async def pty_proxy(ws: WebSocket, ws_id: str, cols: int = 120, rows: int = 32):
    """Browser <-> API <-> runner. Auth by session cookie; only the owner gets a shell."""
    from websockets.asyncio.client import connect

    with SessionLocal() as db:
        p = principal_from_token(db, ws.cookies.get(COOKIE_NAME))
        if not p:
            await ws.close(code=4401)
            return
        try:
            w = service.get_owned(db, p, ws_id, write=True)
            service.ensure_container(db, w)
        except Exception as e:  # noqa: BLE001
            await ws.accept()
            code = getattr(e, "detail", {}) or {}
            await ws.send_json({"type": "error", "code": code.get("code", "RUNNER_UNAVAILABLE") if isinstance(code, dict) else "ERROR"})
            await ws.close(code=4503)
            return
    await ws.accept()
    url = runner_client.ws_url(f"/workspaces/{ws_id}/pty?cols={cols}&rows={rows}")
    try:
        async with connect(url, additional_headers={"Authorization": f"Bearer {settings.runner_token}"},
                           max_size=2**22) as up:
            async def down():
                async for m in up:
                    if isinstance(m, bytes):
                        await ws.send_bytes(m)
                    else:
                        await ws.send_text(m)

            async def upstream():
                while True:
                    msg = await ws.receive()
                    if msg["type"] == "websocket.disconnect":
                        return
                    if msg.get("text") is not None:
                        await up.send(msg["text"])
                    elif msg.get("bytes") is not None:
                        await up.send(msg["bytes"])

            t1, t2 = asyncio.create_task(down()), asyncio.create_task(upstream())
            done, pending = await asyncio.wait({t1, t2}, return_when=asyncio.FIRST_COMPLETED)
            for t in pending:
                t.cancel()
    except Exception:  # noqa: BLE001
        with contextlib.suppress(Exception):
            await ws.send_json({"type": "error", "code": "RUNNER_UNAVAILABLE"})
    finally:
        with contextlib.suppress(Exception):
            await ws.close()


class StepProgressIn(BaseModel):
    status: str
    time_spent_seconds: int | None = None
    meta: dict | None = None


class StepUnlockHintIn(BaseModel):
    level: int


@router.get("/workspaces/{ws_id}/steps")
def get_steps(ws_id: str, p: Principal = Depends(current_user), db: Session = Depends(get_db)):
    ws_item = service.get_owned(db, p, ws_id)
    return service.get_steps_progress(db, ws_item)


@router.post("/workspaces/{ws_id}/steps/{step_id}/progress")
def set_step_progress(
    ws_id: str,
    step_id: str,
    body: StepProgressIn,
    p: Principal = Depends(current_user),
    db: Session = Depends(get_db),
):
    ws_item = service.get_owned(db, p, ws_id, write=True)
    return service.update_step_progress(
        db,
        ws_item,
        step_id,
        status=body.status,
        time_spent_seconds=body.time_spent_seconds,
        meta=body.meta,
    )


@router.post("/workspaces/{ws_id}/steps/{step_id}/unlock-hint")
def unlock_hint(
    ws_id: str,
    step_id: str,
    body: StepUnlockHintIn,
    p: Principal = Depends(current_user),
    db: Session = Depends(get_db),
):
    ws_item = service.get_owned(db, p, ws_id, write=True)
    return service.unlock_step_hint(db, ws_item, step_id, level=body.level)


@router.get("/teach/assignments/{assignment_id}/class-progress")
def teach_class_progress(
    assignment_id: str,
    p: Principal = Depends(current_user),
    db: Session = Depends(get_db),
):
    return service.get_class_progress(db, p, assignment_id)


class ScaffoldIn(BaseModel):
    files: list[str]


@router.post("/workspaces/{ws_id}/scaffold")
def workspace_scaffold(
    ws_id: str,
    body: ScaffoldIn,
    p: Principal = Depends(current_user),
    db: Session = Depends(get_db),
):
    ws_item = service.get_owned(db, p, ws_id, write=True)
    return service.scaffold_workspace(db, ws_item, body.files)


class AiTutorConsultIn(BaseModel):
    step_id: str
    question: str
    active_file: str | None = None
    current_code: str | None = None
    tree_files: list[str] | None = None


@router.post("/workspaces/{ws_id}/ai-tutor")
def workspace_ai_tutor(
    ws_id: str,
    body: AiTutorConsultIn,
    p: Principal = Depends(current_user),
    db: Session = Depends(get_db),
):
    ws_item = service.get_owned(db, p, ws_id)
    return service.ai_tutor_consult(
        db,
        ws_item,
        step_id=body.step_id,
        question=body.question,
        active_file=body.active_file,
        current_code=body.current_code,
        tree_files=body.tree_files,
    )


