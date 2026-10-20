"""Syllabus import service: upload -> parse -> edit draft -> publish into catalog."""
import re

from sqlalchemy import select
from sqlalchemy.orm import Session

from cole_platform.kernel.audit import audit
from cole_platform.kernel.auth import Principal
from cole_platform.kernel.errors import AppError, bad_request, not_found
from cole_platform.kernel.ids import new_id
from cole_platform.kernel.storage import storage
from cole_platform.modules.catalog import service as catalog
from cole_platform.modules.catalog.models import TRACKS

from . import parser
from .models import SyllabusImport

MAX_BYTES = 10 * 1024 * 1024
ROW_TYPES = ("TITLE", "HEADER", "GROUP_L1", "GROUP_L2", "SESSION", "PROJECT", "NOTE", "IGNORE")


def create_import(db: Session, p: Principal, filename: str, data: bytes, preset_name: str | None) -> SyllabusImport:
    if not filename.lower().endswith(".xlsx"):
        raise bad_request("UNSUPPORTED_FILE", "Chỉ hỗ trợ file .xlsx (không nhận .xls, .xlsm).")
    if len(data) > MAX_BYTES:
        raise bad_request("FILE_TOO_LARGE", "File vượt quá 10 MB.")
    if not data.startswith(b"PK"):
        raise bad_request("INVALID_XLSX", "File không phải định dạng .xlsx hợp lệ.")
    try:
        preset_name = preset_name or parser.detect_preset(data) or "ai"
        if preset_name not in parser.PRESETS:
            raise bad_request("UNKNOWN_PRESET", "Bộ ánh xạ không tồn tại.")
        profile = parser.preset(preset_name)
        parsed = parser.parse_workbook(data, profile)
    except AppError:
        raise
    except Exception as e:  # malformed workbook
        raise bad_request("PARSE_FAILED", "Không đọc được file Excel.", {"error": str(e)[:200]})
    key, sha, _ = storage.put_bytes("private", data)
    imp = SyllabusImport(id=new_id("imp"), org_id=p.org_id, created_by=p.id, filename=filename[:300],
                         source_key=key, sha256=sha, sheet=parsed["sheet"], preset=preset_name,
                         profile=profile, parsed=parsed)
    db.add(imp)
    audit(db, "syllabus.import_upload", actor_id=p.id, target_type="syllabus_import", target_id=imp.id,
          meta={"filename": filename[:200], "sha256": sha, "preset": preset_name})
    db.commit()
    return imp


def get_import(db: Session, p: Principal, import_id: str) -> SyllabusImport:
    imp = db.get(SyllabusImport, import_id)
    if not imp or imp.org_id != p.org_id:
        raise not_found("Bản nhập đề cương")
    return imp


def reparse(db: Session, p: Principal, import_id: str, profile: dict, sheet: str | None) -> SyllabusImport:
    imp = get_import(db, p, import_id)
    _ensure_draft(imp)
    for k in ("header_row", "columns"):
        if k not in profile:
            raise bad_request("INVALID_PROFILE", f"Thiếu trường '{k}' trong bộ ánh xạ.")
    data = storage.get_bytes(imp.source_key)
    try:
        imp.parsed = parser.parse_workbook(data, profile, sheet)
    except Exception as e:
        raise bad_request("PARSE_FAILED", "Không áp dụng được bộ ánh xạ.", {"error": str(e)[:200]})
    imp.profile, imp.sheet, imp.preset = profile, imp.parsed["sheet"], None
    db.commit()
    return imp


def update_rows(db: Session, p: Principal, import_id: str, changes: list[dict]) -> SyllabusImport:
    imp = get_import(db, p, import_id)
    _ensure_draft(imp)
    parsed = dict(imp.parsed)
    rows = [dict(r) for r in parsed["rows"]]
    by_row = {r["row"]: r for r in rows}
    for ch in changes:
        r = by_row.get(ch.get("row"))
        if not r:
            raise bad_request("ROW_NOT_FOUND", f"Không có hàng {ch.get('row')}.")
        if "type" in ch:
            if ch["type"] not in ROW_TYPES:
                raise bad_request("INVALID_ROW_TYPE", "Loại hàng không hợp lệ.")
            r["type"] = ch["type"]
            if ch["type"] in ("SESSION", "PROJECT") and not r.get("session_numbers"):
                nums, _ = parser.parse_session_label(r.get("label") or "")
                r["session_numbers"] = nums
        if "title" in ch and isinstance(ch["title"], str):
            r["title"] = ch["title"].strip()[:500]
        r["warnings"] = [w for w in r.get("warnings", []) if w not in ("UNCLASSIFIED", "GROUP_INFERRED")]
    parsed["rows"] = rows
    parsed.update(parser.build_tree(rows, parsed.get("title", "")))
    imp.parsed = parsed
    db.commit()
    return imp


def publish(db: Session, p: Principal, import_id: str, track: str, title: str, slug: str) -> str:
    imp = get_import(db, p, import_id)
    _ensure_draft(imp)
    if track not in TRACKS:
        raise bad_request("INVALID_TRACK", "Nhóm khóa học không hợp lệ.")
    if not re.fullmatch(r"[a-z0-9][a-z0-9-]{1,78}", slug or ""):
        raise bad_request("INVALID_SLUG", "Mã khóa học chỉ gồm chữ thường, số và dấu gạch ngang.")
    tree = imp.parsed
    if not any(m["lessons"] for m in tree["modules"]):
        raise bad_request("EMPTY_TREE", "Chưa có buổi học nào được nhận diện.")
    course = catalog.create_course_from_tree(db, p, track=track, title=title.strip() or tree["course_title"],
                                             slug=slug, tree=tree, source_import_id=imp.id)
    imp.status, imp.course_id = "published", course.id
    audit(db, "syllabus.publish", actor_id=p.id, target_type="course", target_id=course.id,
          meta={"import_id": imp.id, "modules": tree["stats"]["modules"], "lessons": tree["stats"]["lessons"]})
    db.commit()
    return course.id


def list_imports(db: Session, p: Principal) -> list[SyllabusImport]:
    return list(db.scalars(select(SyllabusImport).where(SyllabusImport.org_id == p.org_id)
                           .order_by(SyllabusImport.created_at.desc())).all())


def _ensure_draft(imp: SyllabusImport) -> None:
    if imp.status != "draft":
        raise bad_request("ALREADY_PUBLISHED", "Bản nhập này đã được xuất bản; hãy tải lên lại để tạo bản mới.")
