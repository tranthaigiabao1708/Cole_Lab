"""Runner-agent HTTP/WS API. Start: `python -m cole_runner` (port 8090)."""
from __future__ import annotations

import asyncio
import contextlib
import hmac
import json
import logging
import threading

from fastapi import Depends, FastAPI, Header, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from . import engine, runs
from .config import settings

log = logging.getLogger("cole.runner")
app = FastAPI(title="COLE runner-agent", version="0.1.0")


def _check(token: str | None) -> None:
    if not token or not hmac.compare_digest(token, settings.token):
        raise HTTPException(401, "bad runner token")


def auth(authorization: str | None = Header(None)) -> None:
    _check((authorization or "").removeprefix("Bearer ").strip() or None)


@app.on_event("startup")
async def _startup() -> None:
    async def reaper():
        while True:
            await asyncio.sleep(settings.reaper_interval_s)
            with contextlib.suppress(Exception):
                await run_in_threadpool(engine.reap_once)

    asyncio.create_task(reaper())


@app.get("/health")
def health():
    try:
        v = engine.client().version()
        iso = engine.isolation()
        return {"ok": True, "engine": v.get("Version"), "isolation": iso.__dict__, "image": settings.image}
    except Exception as e:  # noqa: BLE001
        engine.reset_client()
        return {"ok": False, "error": f"{type(e).__name__}: {e}"}


class EnsureIn(BaseModel):
    data_dir: str | None = None


@app.post("/workspaces/{ws_id}/ensure", dependencies=[Depends(auth)])
def ensure(ws_id: str, body: EnsureIn):
    try:
        return engine.ensure_workspace(ws_id, body.data_dir)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.get("/workspaces/{ws_id}", dependencies=[Depends(auth)])
def ws_status(ws_id: str):
    return engine.workspace_status(ws_id)


@app.post("/workspaces/{ws_id}/stop", dependencies=[Depends(auth)])
def ws_stop(ws_id: str):
    engine.stop_workspace(ws_id)
    return {"ok": True}


@app.delete("/workspaces/{ws_id}", dependencies=[Depends(auth)])
def ws_delete(ws_id: str):
    engine.stop_workspace(ws_id, remove=True)
    return {"ok": True}


@app.websocket("/workspaces/{ws_id}/pty")
async def pty(ws: WebSocket, ws_id: str, cols: int = 120, rows: int = 32):
    try:
        _check((ws.headers.get("authorization") or "").removeprefix("Bearer ").strip() or None)
    except HTTPException:
        await ws.close(code=4401)
        return
    await ws.accept()
    loop = asyncio.get_running_loop()
    try:
        stream = await run_in_threadpool(engine.open_pty, ws_id, cols, rows)
    except Exception as e:  # noqa: BLE001
        await ws.send_text(json.dumps({"type": "error", "message": f"{type(e).__name__}"}))
        await ws.close(code=4404)
        return

    q: asyncio.Queue[bytes | None] = asyncio.Queue()

    def reader():
        while not stream.closed:
            try:
                b = stream.read()
            except Exception:  # noqa: BLE001
                b = b""
            if not b:
                loop.call_soon_threadsafe(q.put_nowait, None)
                return
            loop.call_soon_threadsafe(q.put_nowait, b)

    threading.Thread(target=reader, daemon=True).start()

    async def pump_out():
        while True:
            b = await q.get()
            if b is None:
                with contextlib.suppress(Exception):
                    await ws.close(code=1000)
                return
            await ws.send_bytes(b)

    out_task = asyncio.create_task(pump_out())
    try:
        while True:
            msg = await ws.receive()
            if msg["type"] == "websocket.disconnect":
                break
            if msg.get("bytes") is not None:
                await run_in_threadpool(stream.write, msg["bytes"])
            elif msg.get("text") is not None:
                try:
                    m = json.loads(msg["text"])
                except ValueError:
                    continue
                if m.get("type") == "input":
                    await run_in_threadpool(stream.write, m.get("data", "").encode())
                elif m.get("type") == "resize":
                    await run_in_threadpool(stream.resize, int(m.get("cols", 120)), int(m.get("rows", 32)))
                engine.touch_workspace(ws_id)
    except WebSocketDisconnect:
        pass
    finally:
        stream.close()
        out_task.cancel()


@app.post("/runs/{run_id}/execute", dependencies=[Depends(auth)])
async def execute(run_id: str, spec: dict):
    try:
        return await run_in_threadpool(runs.execute, run_id, spec)
    except FileNotFoundError as e:
        raise HTTPException(404, str(e)) from e


@app.post("/runs/{run_id}/cancel", dependencies=[Depends(auth)])
def cancel(run_id: str):
    return {"ok": True, "had_containers": runs.cancel(run_id)}


@app.post("/images/build", dependencies=[Depends(auth)])
def build_image(body: dict):
    """Build a plugin/runtime image from a directory inside the repo (admin-triggered)."""
    from pathlib import Path

    from .config import REPO_ROOT

    ctx = (REPO_ROOT / body["context"]).resolve()
    if REPO_ROOT.resolve() not in ctx.parents or not (ctx / "Dockerfile").is_file():
        raise HTTPException(400, "invalid build context")
    tag = body["tag"]
    img, logs = engine.client().images.build(path=str(ctx), tag=tag, rm=True, pull=False)
    tail = [ln.get("stream", "") for ln in logs if isinstance(ln, dict)][-20:]
    return {"id": img.id, "tags": img.tags, "log": "".join(tail)[-4000:], "context": str(Path(ctx).name)}


@app.post("/reap", dependencies=[Depends(auth)])
def reap():
    return engine.reap_once()


@app.get("/containers", dependencies=[Depends(auth)])
def list_containers():
    c = engine.client()
    items = []
    for cont in c.containers.list(all=True, filters={"label": engine.LABEL_MANAGED + "=1"}):
        items.append({
            "id": cont.short_id,
            "name": cont.name,
            "status": cont.status,
            "image": (cont.image.tags[0] if cont.image and cont.image.tags else cont.image.short_id) if cont.image else "",
            "labels": cont.labels or {},
            "created": cont.attrs.get("Created", ""),
        })
    return {"containers": items}


@app.get("/images", dependencies=[Depends(auth)])
def list_images():
    tags = []
    for img in engine.client().images.list():
        tags.extend(img.tags or [])
    return {"tags": tags}


@app.get("/containers", dependencies=[Depends(auth)])
def containers():
    out = []
    for c in engine.client().containers.list(all=True, filters={"label": engine.LABEL_MANAGED + "=1"}):
        out.append({"name": c.name, "status": c.status, "labels": c.labels, "image": (c.image.tags or [c.image.short_id])[0]})
    return out
