"""LLM forwarder for one run (docs/design/09 §A.5, 11).

Started by the runner as `cole-run-<id>-llm`, reachable inside the run's internal
network as http://llm:8081. Subject and evaluator containers have no Internet; this
process is their only path to the platform LLM gateway.

- Replaces any Authorization header with the run's virtual key (COLE_LLM_KEY),
  so the key never enters learner-controlled containers.
- Only forwards /v1/* paths; caps request body size; stdlib only.
"""
from __future__ import annotations

import os
import sys
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

UPSTREAM = os.environ.get("COLE_LLM_UPSTREAM", "").rstrip("/")
KEY = os.environ.get("COLE_LLM_KEY", "")
PORT = int(os.environ.get("COLE_LLM_PROXY_PORT", "8081"))
MAX_BODY = int(os.environ.get("COLE_LLM_MAX_BODY", str(8 * 1024 * 1024)))
TIMEOUT_S = float(os.environ.get("COLE_LLM_TIMEOUT_S", "120"))


class Handler(BaseHTTPRequestHandler):
    server_version = "cole-llmproxy/1"

    def log_message(self, fmt: str, *args) -> None:  # never log headers (key)
        sys.stderr.write("llmproxy %s %s\n" % (self.command, fmt % args))

    def _reply(self, status: int, body: bytes, ctype: str = "application/json") -> None:
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _forward(self) -> None:
        if self.path == "/healthz":
            self._reply(200, b'{"ok":true}')
            return
        if not self.path.startswith("/v1/"):
            self._reply(404, b'{"detail":{"code":"NOT_FOUND"}}')
            return
        length = int(self.headers.get("Content-Length") or 0)
        if length > MAX_BODY:
            self._reply(413, b'{"detail":{"code":"PAYLOAD_TOO_LARGE"}}')
            return
        body = self.rfile.read(length) if length else None
        req = urllib.request.Request(
            UPSTREAM + self.path,
            data=body,
            method=self.command,
            headers={
                "Content-Type": self.headers.get("Content-Type", "application/json"),
                "Authorization": f"Bearer {KEY}",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT_S) as resp:
                self._reply(resp.status, resp.read(), resp.headers.get("Content-Type", "application/json"))
        except urllib.error.HTTPError as e:
            self._reply(e.code, e.read() or b"{}", e.headers.get("Content-Type", "application/json"))
        except Exception:  # noqa: BLE001 — upstream unreachable / timeout
            self._reply(502, b'{"detail":{"code":"LLM_UPSTREAM_UNAVAILABLE"}}')

    do_GET = _forward
    do_POST = _forward


def main() -> None:
    if not UPSTREAM or not KEY:
        sys.stderr.write("llmproxy: COLE_LLM_UPSTREAM and COLE_LLM_KEY are required\n")
        sys.exit(2)
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()


if __name__ == "__main__":
    main()
