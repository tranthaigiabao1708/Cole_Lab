from sqlalchemy import select
from sqlalchemy.orm import Session

from cole_platform.kernel.auth import Principal
from cole_platform.kernel.errors import AppError, not_found
from cole_platform.kernel.rbac import course_role

from .models import Assignment, AssignmentVersion, TestCase, TestSetVersion


def list_for_course(db: Session, p: Principal, course_id: str, role: str | None) -> list[dict]:
    q = select(Assignment).where(Assignment.course_id == course_id)
    if role == "student":
        q = q.where(Assignment.status == "published")
    out = []
    for a in db.scalars(q.order_by(Assignment.created_at)).all():
        av = db.get(AssignmentVersion, a.current_version_id) if a.current_version_id else None
        out.append({"id": a.id, "slug": a.slug, "title": a.title, "lesson_id": a.lesson_id,
                    "module_id": _module_of(db, a.lesson_id), "version": av.version if av else None,
                    "simulator": av.plugin_id if av else None, "status": a.status,
                    "assignment_type": a.assignment_type})
    return out


def _module_of(db: Session, lesson_id: str | None) -> str | None:
    from cole_platform.modules.catalog.models import Lesson

    if not lesson_id:
        return None
    ls = db.get(Lesson, lesson_id)
    return ls.module_id if ls else None


def get_for(db: Session, p: Principal, assignment_id: str) -> tuple[Assignment, AssignmentVersion, str]:
    from cole_platform.modules.catalog.models import Course

    a = db.get(Assignment, assignment_id)
    if not a:
        raise not_found("Bài thực hành")
    course = db.get(Course, a.course_id)
    role = course_role(db, p, a.course_id)
    if role is None or course.org_id != p.org_id or (role == "student" and a.status != "published"):
        raise not_found("Bài thực hành")
    if course.execution_status != "active":
        raise AppError(409, "TRACK_NOT_ACTIVE", "Nhóm khóa học này chưa triển khai môi trường thực hành trong POC.")
    av = db.get(AssignmentVersion, a.current_version_id)
    if not av:
        raise not_found("Phiên bản bài thực hành")
    return a, av, role


def visible_case(tc: TestCase, role: str, after_run: bool = False) -> dict:
    """Role-based serializer (docs/design/08 §6). Never rely on the frontend to hide fields."""
    d = {"key": tc.case_key, "tags": tc.tags, "files": tc.files}
    if role != "student":
        return {**d, "input": tc.input, "expected": tc.expected, "notes": tc.notes,
                "field_visibility": tc.field_visibility}
    vis = tc.field_visibility or {}

    def allowed(field: str) -> bool:
        v = vis.get(field, "hidden")
        return v == "visible" or (v == "after_run" and after_run)

    if allowed("input"):
        d["input"] = tc.input
    if allowed("expected"):
        d["expected"] = tc.expected
    if allowed("notes"):
        d["notes"] = tc.notes
    return d


def detail(db: Session, p: Principal, assignment_id: str) -> dict:
    from cole_platform.modules.catalog.models import Course, Lesson, Module

    a, av, role = get_for(db, p, assignment_id)
    course = db.get(Course, a.course_id)
    lesson = db.get(Lesson, a.lesson_id) if a.lesson_id else None
    module = db.get(Module, lesson.module_id) if lesson else None
    ts = db.get(TestSetVersion, av.testset_version_id) if av.testset_version_id else None
    out = {
        "id": a.id, "slug": a.slug, "title": a.title, "assignment_type": a.assignment_type, "role": role,
        "course": {"id": course.id, "title": course.title, "track": course.track},
        "lesson": {"id": lesson.id, "title": lesson.title, "session_numbers": lesson.session_numbers,
                   "module_code": module.code if module else None} if lesson else None,
        "version": {"id": av.id, "version": av.version, "published_at": av.published_at.isoformat() if av.published_at else None},
        "readme": av.readme,
        "docs": [{"name": d["name"], "size": d["size"]} for d in av.docs],
        "dataset": av.dataset_info,
        "contract": av.contract,
        "run_command": av.run_command,
        "simulator": {"plugin_id": av.plugin_id, "version_range": av.plugin_version_range},
        "testset": {"version": ts.version, "count": ts.count} if ts else None,
        "rubric": av.rubric,
    }
    if role != "student":
        out["profile"] = av.profile
    try:
        from cole_platform.modules.workspaces.service import find_workspace

        ws = find_workspace(db, p.id, av.id)
        out["workspace_id"] = ws.id if ws else None
    except ImportError:
        out["workspace_id"] = None
    return out


def doc_bytes(db: Session, p: Principal, assignment_id: str, name: str) -> tuple[str, bytes]:
    from cole_platform.kernel.storage import storage

    _, av, _ = get_for(db, p, assignment_id)
    for d in av.docs:
        if d["name"] == name:
            return d["name"], storage.get_bytes(d["key"])
    raise not_found("Tài liệu")


def list_cases(db: Session, p: Principal, assignment_id: str) -> list[dict]:
    _, av, role = get_for(db, p, assignment_id)
    if not av.testset_version_id:
        return []
    cases = db.scalars(select(TestCase).where(TestCase.testset_version_id == av.testset_version_id)
                       .order_by(TestCase.order)).all()
    return [visible_case(tc, role) for tc in cases]


def create_assignment(db: Session, p: Principal, data: dict) -> dict:
    import io
    import tarfile

    from cole_platform.kernel.db import utcnow
    from cole_platform.kernel.errors import AppError
    from cole_platform.kernel.ids import new_id
    from cole_platform.kernel.rbac import ensure_manage_course
    from cole_platform.kernel.storage import storage
    from cole_platform.modules.catalog.models import Course, Lesson

    course_id = data["course_id"]
    ensure_manage_course(db, p, course_id)

    course = db.get(Course, course_id)
    if not course:
        raise not_found("Khóa học")

    slug = data["slug"].strip().lower()
    existing = db.scalar(select(Assignment).where(Assignment.slug == slug))
    if existing:
        raise AppError(400, "SLUG_EXISTS", f"Mã bài lab '{slug}' đã tồn tại.")

    plugin_id = data.get("plugin_id") or "cole.cv-ok-ng"
    readme_text = data.get("readme") or f"# {data['title']}\n\nĐề bài thực hành cho buổi học."
    starter_code = data.get("starter_code")

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        rm_bytes = readme_text.encode("utf-8")
        ti_rm = tarfile.TarInfo(name="README.md")
        ti_rm.size = len(rm_bytes)
        ti_rm.mtime = 1700000000
        tar.addfile(ti_rm, io.BytesIO(rm_bytes))

        if plugin_id == "cole.rag-chatbot":
            code = (starter_code or (
                "from fastapi import FastAPI\n\n"
                "app = FastAPI()\n\n"
                "@app.post('/query')\n"
                "def query(payload: dict):\n"
                "    return {'answer': 'Xin chào, tôi là trợ lý RAG.', 'citations': []}\n"
            )).encode("utf-8")
            ti_code = tarfile.TarInfo(name="app/main.py")
            ti_code.size = len(code)
            ti_code.mtime = 1700000000
            tar.addfile(ti_code, io.BytesIO(code))
        elif plugin_id.startswith("cole.cv"):
            code = (starter_code or (
                "def predict(input_data: dict) -> dict:\n"
                "    # Trả về phân loại OK hoặc NG kèm điểm tin cậy\n"
                "    return {'label': 'OK', 'confidence': 0.99}\n"
            )).encode("utf-8")
            ti_code = tarfile.TarInfo(name="solution/predict.py")
            ti_code.size = len(code)
            ti_code.mtime = 1700000000
            tar.addfile(ti_code, io.BytesIO(code))
        else:
            code = (starter_code or (
                "def predict(input_data: dict) -> dict:\n"
                "    return {'output': input_data.get('text', '')}\n"
            )).encode("utf-8")
            ti_code = tarfile.TarInfo(name="solution.py")
            ti_code.size = len(code)
            ti_code.mtime = 1700000000
            tar.addfile(ti_code, io.BytesIO(code))

    tpl_bytes = buf.getvalue()
    tpl_key, tpl_sha, _ = storage.put_bytes("private", tpl_bytes)

    if plugin_id == "cole.rag-chatbot":
        contract = {
            "contract_version": "1.0",
            "modes": ["http_service"],
            "artifacts": {
                "entry": {
                    "kind": "python_entrypoint",
                    "format": "module:variable",
                    "required": True,
                    "description": "FastAPI ASGI application (app.main:app)"
                },
                "report": {
                    "kind": "file",
                    "format": "markdown",
                    "required": False,
                    "description": "Báo cáo thiết kế giải pháp RAG"
                }
            }
        }
        manifest = {
            "mode": "http_service",
            "artifacts": {
                "entry": "app.main:app",
                "report": "REPORT.md"
            }
        }
        run_command = data.get("run_command") or "python -m uvicorn app.main:app --host 0.0.0.0 --port 8000"
    elif plugin_id.startswith("cole.cv"):
        contract = {
            "contract": "submission/v1",
            "plugin": plugin_id,
            "artifacts": {
                "entry": {
                    "required": True,
                    "kind": "python_entrypoint",
                    "signature": "predict(input_data: dict) -> dict",
                    "label": "Hàm xử lý / VideoAnalyzer"
                },
                "report": {
                    "required": False,
                    "kind": "file",
                    "accepted_formats": ["md"],
                    "max_size_mb": 2,
                    "label": "Báo cáo kỹ thuật"
                }
            }
        }
        manifest = {
            "mode": "python_impl",
            "artifacts": {
                "entry": {
                    "entry": "solution.predict:predict",
                    "path": "solution/predict.py"
                }
            }
        }
        run_command = data.get("run_command") or "python -m solution.predict"
    else:
        contract = {
            "contract": "submission/v1",
            "plugin": plugin_id,
            "artifacts": {
                "entry": {
                    "required": True,
                    "kind": "python_entrypoint",
                    "signature": "predict(input: dict) -> dict",
                    "label": "Hàm xử lý"
                }
            }
        }
        manifest = {
            "mode": "python_impl",
            "artifacts": {
                "entry": {
                    "entry": "solution:predict",
                    "path": "solution.py"
                }
            }
        }
        run_command = data.get("run_command") or "python solution.py"

    a = Assignment(
        id=new_id("asg"),
        course_id=course.id,
        lesson_id=data.get("lesson_id") or None,
        slug=slug,
        title=data["title"],
        assignment_type=data.get("assignment_type") or "lab",
        status="published"
    )
    db.add(a)
    db.flush()

    av = AssignmentVersion(
        id=new_id("asv"),
        assignment_id=a.id,
        version=1,
        status="published",
        content_sha=tpl_sha,
        readme=readme_text,
        docs=[],
        template_key=tpl_key,
        template_sha=tpl_sha,
        run_command=run_command,
        contract=contract,
        default_manifest=manifest,
        plugin_id=plugin_id,
        plugin_version_range="^1.0",
        profile={},
        rubric=data.get("rubric") or [],
        testset_version_id=None,
        dataset_sha=None,
        dataset_info=None,
        limits={"timeout_s": int(data.get("timeout_s") or 180)},
        published_at=utcnow(),
    )
    db.add(av)
    db.flush()

    a.current_version_id = av.id

    if data.get("lesson_id"):
        ls = db.get(Lesson, data["lesson_id"])
        if ls:
            ls.practice_candidate = True

    db.commit()
    return detail(db, p, a.id)

