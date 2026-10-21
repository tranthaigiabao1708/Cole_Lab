"""COLE background worker: polls DB for queued runs and executes them sequentially."""
import logging
import signal
import sys
import time

from sqlalchemy import select

from cole_platform import models_registry  # noqa: F401
from cole_platform.kernel.config import settings
from cole_platform.kernel.db import SessionLocal, init_db
from cole_platform.modules.runs.models import Run
from cole_platform.modules.runs.service import execute_run, recover_stale_runs

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
log = logging.getLogger("cole.worker")

_stop = False


def _sig_handler(_sig, _frame):
    global _stop
    log.info("Shutdown requested, stopping worker...")
    _stop = True


signal.signal(signal.SIGINT, _sig_handler)
signal.signal(signal.SIGTERM, _sig_handler)


def poll_and_run_once() -> bool:
    with SessionLocal() as db:
        # Find oldest queued run
        run = db.scalar(
            select(Run)
            .where(Run.status == "queued")
            .order_by(Run.created_at.asc())
            .limit(1)
        )
        if not run:
            return False
        run_id = run.id
        log.info("Found queued run: %s (mode=%s)", run_id, run.mode)

    # Execute in a fresh session to avoid long-lived transaction issues
    with SessionLocal() as db:
        try:
            executed = execute_run(db, run_id)
            log.info("Finished run %s: status=%s, score=%s", run_id, executed.status, executed.score)
        except Exception:
            log.exception("Error processing run %s", run_id)
    return True


def recover_once() -> list[str]:
    with SessionLocal() as db:
        ids = recover_stale_runs(db)
    if ids:
        log.warning("Recovered %d stale run(s) as WORKER_LOST: %s", len(ids), ", ".join(ids))
    return ids


def run_loop():
    init_db()
    log.info("COLE worker started. Polling every %.1fs", settings.worker_poll_s)
    last_scan = float("-inf")
    while not _stop:
        try:
            if time.monotonic() - last_scan >= settings.stale_scan_interval_s:
                last_scan = time.monotonic()
                recover_once()
            had_work = poll_and_run_once()
            if not had_work:
                time.sleep(settings.worker_poll_s)
        except Exception:
            log.exception("Worker polling loop exception")
            time.sleep(settings.worker_poll_s)
    log.info("COLE worker stopped cleanly.")


if __name__ == "__main__":
    run_loop()
