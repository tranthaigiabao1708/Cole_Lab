"""COLE subject harness (platform-owned, runs inside the subject container).

Loads the learner's entrypoint declared in the submission manifest and exposes it
over HTTP on the run-private network, so evaluators never import learner code.

Env:
  COLE_ENTRY       "package.module:function" (relative to COLE_SUBMISSION_DIR)
  COLE_INPUT_KIND  "json" (default) | "image"  -> image: body {"image_b64": "..."} decoded to RGB uint8 ndarray
  COLE_SUBMISSION_DIR  default /submission
  COLE_PORT        default 8080

Endpoints: GET /healthz, POST /predict
"""
from __future__ import annotations

import base64
import importlib
import io
import json
import os
import sys
import time
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

SUB = os.environ.get("COLE_SUBMISSION_DIR", "/submission")
ENTRY = os.environ.get("COLE_ENTRY", "")
KIND = os.environ.get("COLE_INPUT_KIND", "json")
PORT = int(os.environ.get("COLE_PORT", "8080"))
MAX_BODY = 16 * 1024 * 1024

_fn = None
_load_error: str | None = None


def _load():
    global _fn, _load_error
    try:
        sys.path.insert(0, SUB)
        os.chdir(SUB)
        mod_name, _, fn_name = ENTRY.partition(":")
        if not mod_name or not fn_name:
            raise ValueError(f"COLE_ENTRY must be 'module:function', got {ENTRY!r}")
        mod = importlib.import_module(mod_name)
        _fn = getattr(mod, fn_name)
    except Exception:  # noqa: BLE001 — reported via /healthz
        _load_error = traceback.format_exc(limit=5)
        print(_load_error, file=sys.stderr, flush=True)


def _decode_image(b64: str):
    import numpy as np
    from PIL import Image

    img = Image.open(io.BytesIO(base64.b64decode(b64))).convert("RGB")
    return np.asarray(img, dtype="uint8")


def _jsonable(x):
    try:
        import numpy as np

        if isinstance(x, np.generic):
            return x.item()
        if isinstance(x, np.ndarray):
            return x.tolist()
    except ImportError:
        pass
    if isinstance(x, dict):
        return {str(k): _jsonable(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_jsonable(v) for v in x]
    return x


class Handler(BaseHTTPRequestHandler):
    server_version = "cole-harness/1"

    def log_message(self, fmt, *args):  # keep stdout for learner prints
        sys.stderr.write("harness: " + (fmt % args) + "\n")

    def _send(self, code: int, obj):
        body = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/healthz":
            if _fn is not None:
                return self._send(200, {"ok": True})
            return self._send(503, {"ok": False, "error": "ENTRYPOINT_LOAD_FAILED", "detail": _load_error})
        self._send(404, {"error": "NOT_FOUND"})

    def do_POST(self):
        if self.path != "/predict":
            return self._send(404, {"error": "NOT_FOUND"})
        if _fn is None:
            return self._send(503, {"error": "ENTRYPOINT_LOAD_FAILED", "detail": _load_error})
        n = int(self.headers.get("Content-Length") or 0)
        if n > MAX_BODY:
            return self._send(413, {"error": "BODY_TOO_LARGE"})
        try:
            payload = json.loads(self.rfile.read(n) or b"{}")
            arg = _decode_image(payload["image_b64"]) if KIND == "image" else payload.get("input", payload)
            t0 = time.perf_counter()
            out = _fn(arg)
            ms = (time.perf_counter() - t0) * 1000
            self._send(200, {"output": _jsonable(out), "latency_ms": round(ms, 2)})
        except Exception as e:  # noqa: BLE001 — learner code error is a result, not a crash
            self._send(500, {"error": "PREDICT_FAILED", "detail": f"{type(e).__name__}: {e}",
                             "trace": traceback.format_exc(limit=4)})


if __name__ == "__main__":
    _load()
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
