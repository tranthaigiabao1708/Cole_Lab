"""COLE simulator SDK — contract `simulator.v1` (docs/design/06, sdk/contracts/simulator.v1).

A simulator plugin is a container image whose entrypoint calls `cole_sim_sdk.main({...})`.
The platform mounts:

  /cole/input   (read-only)  run-spec.json, profile.json, testset/ (run, validate-profile),
                             submission/ (validate-submission, run)
  /cole/output  (writable)   events.jsonl, validation.json | result.json | describe.json

Learner code is NEVER imported here: it runs in the separate "subject" container and is
reached over the run-private network via `ctx.subject` (http://subject:8080).
"""
from __future__ import annotations

import json
import os
import sys
import time
import traceback
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Callable, Iterator

import httpx

CONTRACT = "simulator.v1"
RESULT_SCHEMA = "cole.result/v1"
MODES = ("describe", "validate-profile", "validate-submission", "run")


class SubjectError(Exception):
    def __init__(self, code: str, detail: str = ""):
        super().__init__(f"{code}: {detail}")
        self.code = code
        self.detail = detail


class Subject:
    """HTTP client for the learner's product running in the subject container."""

    def __init__(self, base_url: str):
        self.base_url = base_url.rstrip("/")
        self._http = httpx.Client(timeout=30)

    def wait_ready(self, timeout_s: float = 60) -> None:
        deadline = time.time() + timeout_s
        last = ""
        while time.time() < deadline:
            try:
                r = self._http.get(f"{self.base_url}/healthz", timeout=3)
                if r.status_code == 200:
                    return
                body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
                if body.get("error") == "ENTRYPOINT_LOAD_FAILED":
                    raise SubjectError("ENTRYPOINT_LOAD_FAILED", (body.get("detail") or "")[-1500:])
                last = f"HTTP {r.status_code}"
            except httpx.HTTPError as e:
                last = type(e).__name__
            time.sleep(0.5)
        raise SubjectError("SUBJECT_NOT_READY", last)

    def predict(self, payload: dict, timeout_s: float = 10) -> tuple[Any, float]:
        """Returns (output, latency_ms). Raises SubjectError on learner-side failure or timeout."""
        try:
            r = self._http.post(f"{self.base_url}/predict", json=payload, timeout=timeout_s)
        except httpx.TimeoutException as e:
            raise SubjectError("CASE_TIMEOUT", f"> {timeout_s}s") from e
        except httpx.HTTPError as e:
            raise SubjectError("SUBJECT_UNREACHABLE", type(e).__name__) from e
        body = r.json()
        if r.status_code != 200:
            raise SubjectError(body.get("error", f"HTTP_{r.status_code}"), body.get("detail", ""))
        return body.get("output"), float(body.get("latency_ms", 0.0))

    def request(self, method: str, path: str, **kw) -> httpx.Response:
        return self._http.request(method, f"{self.base_url}{path}", **kw)


@dataclass
class Case:
    key: str
    input: dict
    expected: Any = None
    tags: list = field(default_factory=list)
    notes: Any = None
    raw: dict = field(default_factory=dict)


class Context:
    def __init__(self) -> None:
        self.mode = os.environ.get("COLE_MODE", "run")
        self.input_dir = Path(os.environ.get("COLE_INPUT_DIR", "/cole/input"))
        self.output_dir = Path(os.environ.get("COLE_OUTPUT_DIR", "/cole/output"))
        self.output_dir.mkdir(parents=True, exist_ok=True)
        self.spec: dict = self._json("run-spec.json", {})
        self.profile: dict = self._json("profile.json", {}) or self.spec.get("profile", {})
        self.submission_dir = self.input_dir / "submission"
        self.testset_dir = self.input_dir / "testset"
        url = os.environ.get("COLE_SUBJECT_URL", "")
        self.subject: Subject | None = Subject(url) if url else None
        self.llm_url = os.environ.get("COLE_LLM_URL", "")
        self._events = (self.output_dir / "events.jsonl").open("a", encoding="utf-8")

    def _json(self, name: str, default):
        p = self.input_dir / name
        return json.loads(p.read_text(encoding="utf-8")) if p.is_file() else default

    # ---- events (streamed to the UI by the worker)
    def event(self, type_: str, **data) -> None:
        self._events.write(json.dumps({"ts": time.time(), "type": type_, **data}, ensure_ascii=False) + "\n")
        self._events.flush()

    def progress(self, done: int, total: int, label: str = "") -> None:
        self.event("progress", done=done, total=total, label=label)

    def log(self, message: str) -> None:
        self.event("log", message=message)

    # ---- inputs
    def cases(self) -> Iterator[Case]:
        p = self.testset_dir / "cases.jsonl"
        if not p.is_file():
            return iter(())
        out = []
        for ln in p.read_text(encoding="utf-8").splitlines():
            if ln.strip():
                c = json.loads(ln)
                out.append(Case(key=c["key"], input=c.get("input", {}), expected=c.get("expected"),
                                tags=c.get("tags", []), notes=c.get("notes"), raw=c))
        return iter(out)

    def testset_file(self, rel: str) -> Path:
        p = (self.testset_dir / "files" / rel).resolve()
        if self.testset_dir.resolve() not in p.parents:
            raise ValueError("path outside testset")
        return p

    @property
    def artifacts(self) -> dict:
        return (self.spec.get("manifest") or {}).get("artifacts", {})

    def artifact_path(self, key: str) -> Path | None:
        rel = (self.artifacts.get(key) or {}).get("path")
        if not rel:
            return None
        p = (self.submission_dir / rel).resolve()
        if self.submission_dir.resolve() not in p.parents:
            return None
        return p

    # ---- outputs
    def write_validation(self, errors: list[dict], warnings: list[dict] | None = None) -> dict:
        doc = {"contract": CONTRACT, "status": "invalid" if errors else "valid",
               "errors": errors, "warnings": warnings or []}
        self._write("validation.json", doc)
        return doc

    def write_result(self, *, cases: list[dict], headline: dict | None = None, metrics: dict | None = None,
                     passed: bool | None = None, renderer: str = "generic-table@1",
                     summary: dict | None = None, extra: dict | None = None) -> dict:
        if summary is None:
            summary = {"headline": headline or {}, "metrics": metrics or {}, "passed": passed}
        else:
            if headline and "headline" not in summary:
                summary["headline"] = headline
            if metrics and "metrics" not in summary:
                summary["metrics"] = metrics
            if passed is not None and "passed" not in summary:
                summary["passed"] = passed
        doc = {"schema": RESULT_SCHEMA, "status": "completed", "renderer": renderer,
               "summary": summary,
               "cases": cases, **(extra or {})}
        self._write("result.json", doc)
        return doc

    def write_describe(self, doc: dict) -> None:
        self._write("describe.json", {"contract": CONTRACT, **doc})

    def _write(self, name: str, doc: dict) -> None:
        tmp = self.output_dir / (name + ".tmp")
        tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=1), encoding="utf-8")
        tmp.replace(self.output_dir / name)


def err(code: str, message_vi: str, hint_vi: str = "", artifact_key: str | None = None) -> dict:
    return {"code": code, "message_vi": message_vi, "hint_vi": hint_vi, "artifact_key": artifact_key}


Handler = Callable[[Context], Any]


def main(handlers: dict[str, Handler] | None = None, **kwargs) -> None:
    """Dispatch on COLE_MODE. Uncaught exceptions become a structured PLUGIN_ERROR, exit code 2."""
    dispatch = dict(handlers or {})
    for k, v in kwargs.items():
        dispatch[k] = v
        dispatch[k.replace("_", "-")] = v
    ctx = Context()
    fn = dispatch.get(ctx.mode)
    if fn is None:
        ctx.event("error", code="MODE_UNSUPPORTED", mode=ctx.mode)
        ctx._write("error.json", {"code": "MODE_UNSUPPORTED", "mode": ctx.mode})
        sys.exit(3)
    ctx.event("start", mode=ctx.mode, run_id=os.environ.get("COLE_RUN_ID"))
    try:
        fn(ctx)
    except SubjectError as e:
        ctx.event("error", code=e.code, detail=e.detail[-2000:])
        ctx._write("error.json", {"code": e.code, "detail": e.detail[-4000:]})
        sys.exit(4)
    except Exception as e:  # noqa: BLE001
        tb = traceback.format_exc(limit=8)
        print(tb, file=sys.stderr, flush=True)
        ctx.event("error", code="PLUGIN_ERROR", detail=f"{type(e).__name__}: {e}")
        ctx._write("error.json", {"code": "PLUGIN_ERROR", "detail": tb[-4000:]})
        sys.exit(2)
    ctx.event("end", mode=ctx.mode)
