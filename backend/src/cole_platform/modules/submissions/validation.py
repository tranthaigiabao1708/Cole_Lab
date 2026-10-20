"""Core (tier-1) submission validation — docs/design/08 §8.4.

Checks existence, size, format by content (not extension), path containment, symlinks,
mode requirements. Semantic checks (ONNX loads, shapes match…) belong to the plugin's
`validate-submission` (tier 2).
"""
from __future__ import annotations

import ast
import json
import re
from pathlib import Path

import jsonschema
import yaml

MESSAGES = {
    "ARTIFACT_MISSING": ("Thiếu sản phẩm bắt buộc {key}.", "Chọn tệp trong panel Sản phẩm nộp."),
    "PATH_NOT_FOUND": ("Không tìm thấy {path} trong workspace.", "Tệp đã bị đổi tên hoặc di chuyển? Chọn lại tệp."),
    "FORMAT_MISMATCH": ("{path} không đúng định dạng yêu cầu ({formats}).", "Kiểm tra lại định dạng tệp đã xuất."),
    "SIZE_EXCEEDED": ("{path} có dung lượng {size_mb} MB, vượt giới hạn {max_mb} MB.", "Giảm kích thước tệp."),
    "PATH_OUTSIDE_WORKSPACE": ("Đường dẫn {path} nằm ngoài thư mục bài.", "Dùng đường dẫn tương đối trong workspace."),
    "SYMLINK_NOT_ALLOWED": ("{path} là liên kết tượng trưng.", "Sao chép tệp thật vào workspace."),
    "MODE_INVALID": ("Chế độ nộp {mode} không có trong yêu cầu của bài.", "Chọn một chế độ nộp hợp lệ."),
    "CONFIG_SCHEMA": ("{path} không khớp cấu trúc yêu cầu: {detail}", "Xem mẫu cấu hình trong đề bài."),
    "ENTRY_INVALID": ("Điểm vào {entry} không hợp lệ: {detail}", "Định dạng: thư_mục.module:tên_hàm"),
    "COMMAND_MISSING": ("Chưa khai báo lệnh khởi động cho {key}.", "Ví dụ: uvicorn app.main:app --host 0.0.0.0 --port 8080"),
    "CONTRACT_VERSION_MISMATCH": ("Bản khai báo thuộc phiên bản bài {got}, bài hiện tại là {want}.",
                                  "Khai báo lại sản phẩm theo phiên bản hiện tại."),
    "UNKNOWN_ARTIFACT": ("Sản phẩm {key} không có trong yêu cầu của bài.", "Xóa khai báo này."),
}


def _err(code: str, key: str | None = None, **kw) -> dict:
    msg, hint = MESSAGES[code]
    fmt = {"key": key or "", **{k: v for k, v in kw.items()}}
    return {"code": code, "artifact_key": key, "message_vi": msg.format(**fmt), "hint_vi": hint.format(**fmt),
            **({"path": kw["path"]} if "path" in kw else {})}


def _detect(data: bytes, fmt: str) -> bool:
    try:
        if fmt == "onnx":
            # ModelProto: field 1 (ir_version, varint) => first byte 0x08. Full load is the plugin's job.
            return len(data) > 16 and data[0] == 0x08
        if fmt in ("yaml", "yml"):
            return isinstance(yaml.safe_load(data.decode("utf-8")), (dict, list))
        if fmt == "json":
            json.loads(data.decode("utf-8"))
            return True
        if fmt in ("md", "txt", "csv"):
            data.decode("utf-8")
            return b"\0" not in data[:8192]
        if fmt == "pdf":
            return data.startswith(b"%PDF-")
        if fmt == "py":
            compile(data.decode("utf-8"), "<artifact>", "exec")
            return True
        if fmt in ("png",):
            return data.startswith(b"\x89PNG\r\n\x1a\n")
        if fmt in ("jpg", "jpeg"):
            return data.startswith(b"\xff\xd8\xff")
    except (UnicodeDecodeError, ValueError, SyntaxError, yaml.YAMLError):
        return False
    return False


def _safe_path(root: Path, rel: str) -> tuple[Path | None, str | None]:
    rel = (rel or "").replace("\\", "/").strip()
    if not rel or rel.startswith("/") or ":" in rel or ".." in rel.split("/"):
        return None, "PATH_OUTSIDE_WORKSPACE"
    p = root
    for part in [x for x in rel.split("/") if x and x != "."]:
        p = p / part
        if p.is_symlink():
            return None, "SYMLINK_NOT_ALLOWED"
    rr, rp = root.resolve(), p.resolve()
    if rr not in rp.parents:
        return None, "PATH_OUTSIDE_WORKSPACE"
    return p, None


_ENTRY = re.compile(r"^[A-Za-z_][\w.]*:[A-Za-z_]\w*$")


def _check_entry(root: Path, entry: str) -> str | None:
    if not entry or not _ENTRY.match(entry):
        return "định dạng không đúng"
    mod, fn = entry.split(":")
    rel = mod.replace(".", "/")
    for cand in (f"{rel}.py", f"{rel}/__init__.py"):
        p, err = _safe_path(root, cand)
        if p and p.is_file():
            try:
                tree = ast.parse(p.read_text(encoding="utf-8"))
            except (SyntaxError, UnicodeDecodeError) as e:
                return f"lỗi cú pháp trong {cand}: {e}"
            names = {n.name for n in tree.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))}
            names |= {t.id for n in tree.body if isinstance(n, ast.Assign) for t in n.targets if isinstance(t, ast.Name)}
            return None if fn in names else f"không tìm thấy hàm {fn} trong {cand}"
    return f"không tìm thấy tệp {rel}.py"


def validate(contract: dict, manifest: dict, root: Path, expected_assignment: str | None = None) -> dict:
    errors: list[dict] = []
    warnings: list[dict] = []
    resolved: dict[str, dict] = {}
    arts = (contract or {}).get("artifacts") or {}
    decl = (manifest or {}).get("artifacts") or {}
    modes = (contract or {}).get("modes") or {}

    if expected_assignment and manifest.get("assignment") and manifest["assignment"] != expected_assignment:
        errors.append(_err("CONTRACT_VERSION_MISMATCH", got=manifest["assignment"], want=expected_assignment))

    mode = manifest.get("mode")
    if modes:
        if mode not in modes:
            errors.append(_err("MODE_INVALID", mode=mode or "—"))
            required = set()
        else:
            required = set(modes[mode].get("requires") or [])
    else:
        required = {k for k, a in arts.items() if a.get("required")}
    allowed = set(arts)

    for key in decl:
        if key not in arts:
            warnings.append(_err("UNKNOWN_ARTIFACT", key))

    for key, spec in arts.items():
        d = decl.get(key) or {}
        kind = spec.get("kind", "file")
        is_req = key in required
        if key not in allowed and not d:
            continue
        if kind in ("file", "config"):
            rel = d.get("path")
            if not rel:
                if is_req:
                    errors.append(_err("ARTIFACT_MISSING", key))
                continue
            p, perr = _safe_path(root, rel)
            if perr:
                errors.append(_err(perr, key, path=rel))
                continue
            if not p.is_file():
                (errors if is_req else warnings).append(_err("PATH_NOT_FOUND", key, path=rel))
                continue
            size = p.stat().st_size
            max_mb = spec.get("max_size_mb")
            if max_mb and size > max_mb * 1024 * 1024:
                errors.append(_err("SIZE_EXCEEDED", key, path=rel, size_mb=round(size / 1048576, 1), max_mb=max_mb))
                continue
            formats = spec.get("accepted_formats") or ([rel.rsplit(".", 1)[-1].lower()] if "." in rel else [])
            data = p.read_bytes() if size <= 300 * 1024 * 1024 else b""
            fmt = next((f for f in formats if _detect(data, f)), None)
            if formats and not fmt:
                errors.append(_err("FORMAT_MISMATCH", key, path=rel, formats=", ".join(formats)))
                continue
            if kind == "config" and spec.get("schema") and fmt in ("yaml", "yml", "json"):
                obj = yaml.safe_load(data.decode("utf-8")) if fmt != "json" else json.loads(data)
                try:
                    jsonschema.validate(obj, spec["schema"])
                except jsonschema.ValidationError as e:
                    loc = "/".join(str(x) for x in e.absolute_path) or "(gốc)"
                    errors.append(_err("CONFIG_SCHEMA", key, path=rel, detail=f"{loc}: {e.message}"))
                    continue
            resolved[key] = {"kind": kind, "path": rel, "format": fmt, "size": size}
        elif kind == "python_entrypoint":
            entry = d.get("entry")
            if not entry:
                if is_req:
                    errors.append(_err("ARTIFACT_MISSING", key))
                continue
            problem = _check_entry(root, entry)
            if problem:
                errors.append(_err("ENTRY_INVALID", key, entry=entry, detail=problem))
                continue
            resolved[key] = {"kind": kind, "entry": entry}
        elif kind == "http_service":
            cmd = (d.get("command") or "").strip()
            if not cmd:
                if is_req:
                    errors.append(_err("COMMAND_MISSING", key))
                continue
            if d.get("path"):
                p, perr = _safe_path(root, d["path"])
                if perr or not p.is_file():
                    errors.append(_err(perr or "PATH_NOT_FOUND", key, path=d["path"]))
                    continue
            resolved[key] = {"kind": kind, "command": cmd, "path": d.get("path"),
                             "healthcheck": spec.get("healthcheck", "/healthz")}
    return {"status": "invalid" if errors else "valid", "errors": errors, "warnings": warnings,
            "mode": mode, "artifacts": resolved}
