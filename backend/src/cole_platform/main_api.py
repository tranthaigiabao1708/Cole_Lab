"""API entrypoint: `uvicorn cole_platform.main_api:app`."""
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from cole_platform.kernel.config import settings
from cole_platform.kernel.db import init_db
from cole_platform.modules.catalog.api import router as catalog_router
from cole_platform.modules.identity.api import router as identity_router
from cole_platform.modules.syllabus_import.api import router as import_router
from cole_platform.modules.assignments.api import router as assignments_router
from cole_platform.modules.workspaces.api import router as workspaces_router
from cole_platform.modules.submissions.api import router as submissions_router

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title="Cole Platform API", version="0.1.0", lifespan=lifespan)

app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])


@app.exception_handler(RequestValidationError)
async def _validation_handler(_: Request, exc: RequestValidationError):
    return JSONResponse(status_code=422, content={"detail": {
        "code": "VALIDATION_ERROR", "message": "Dữ liệu gửi lên không hợp lệ.",
        "details": {"errors": [{"loc": list(e["loc"]), "msg": e["msg"]} for e in exc.errors()]}}})


@app.get("/api/health")
def health():
    return {"ok": True, "env": settings.env}


ROUTERS = [identity_router, catalog_router, import_router, assignments_router, workspaces_router, submissions_router]
try:  # Phase 3+ routers
    from cole_platform.modules.runs.api import router as runs_router
    from cole_platform.modules.plugins.api import router as plugins_router

    ROUTERS += [runs_router, plugins_router]
    from cole_platform.modules.evaluations.api import router as evaluations_router
    from cole_platform.modules.llm_gateway.api import router as llm_router

    ROUTERS += [evaluations_router, llm_router]
except ImportError:
    pass

for r in ROUTERS:
    app.include_router(r, prefix="/api")
