"""Run `python -m app.sync_worker [--once]` with the configured database."""

import argparse
import os
import signal
import threading
from uuid import uuid4

from app.core.workspace_config import SYNC_POLL_SECONDS
from sqlalchemy.exc import SQLAlchemyError
from app.services.installation_health import schema_ready
from app.services.installation import record_worker_heartbeat
from app.database import SessionLocal, engine
from app.telemetry.instrumentation import install_instrumentation
from app.telemetry.runtime import collector, emit, error_attributes, error_message, span
from app.services.account_sync import claim_sync_job, run_sync_job


def main():
    parser = argparse.ArgumentParser(description="Workspace Meta metadata sync worker")
    parser.add_argument(
        "--once", action="store_true", help="Process at most one job and exit"
    )
    args = parser.parse_args()
    stopping = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopping.set())
    signal.signal(signal.SIGINT, lambda *_: stopping.set())
    worker_id = f"sync-{os.getpid()}-{uuid4()}"
    print("Waiting for installation schema", flush=True)
    while not stopping.is_set():
        try:
            with SessionLocal() as db:
                if schema_ready(db):
                    break
        except SQLAlchemyError:
            pass  # Startup readiness retries before claiming any work.
        stopping.wait(SYNC_POLL_SECONDS)
    if stopping.is_set():
        return
    install_instrumentation(engine)
    collector.start()
    emit("lifecycle", "sync_worker.started")
    print("Workspace sync worker started", flush=True)
    try:
        while not stopping.is_set():
            with SessionLocal() as db:
                record_worker_heartbeat(db)
                lease = claim_sync_job(db, worker_id)
            if lease:
                with span("workspace.sync", "job", job_id=lease["id"]) as outcome:
                    result = run_sync_job(SessionLocal, lease)
                    outcome["attributes"]["result"] = str(result)
                    if result == "failed":
                        outcome["level"] = "error"
                print(f"sync job {lease['id']}: {result}", flush=True)
            if args.once:
                break
            if lease is None:
                stopping.wait(SYNC_POLL_SECONDS)
    except Exception as exc:
        emit(
            "lifecycle",
            "sync_worker.failed",
            level="error",
            message=error_message(exc),
            attributes=error_attributes(exc),
        )
        raise
    finally:
        emit("lifecycle", "sync_worker.stopped")
        collector.stop()


if __name__ == "__main__":
    main()
