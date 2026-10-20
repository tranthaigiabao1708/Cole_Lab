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


for r in (identity_router, catalog_router, import_router):
    app.include_router(r, prefix="/api")
