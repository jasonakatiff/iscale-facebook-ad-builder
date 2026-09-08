"""Persist terminal failures and restart only a confirmed safe failure."""

from datetime import datetime, timezone

from sqlalchemy import or_, select
from sqlalchemy.dialects.postgresql import insert

from app.delivery.models import DeliveryNotification, new_id
from app.models import User, Role


def notify_failure(db, job):
    recipients = db.scalars(
        select(User.id).where(
            User.is_active.is_(True),
            or_(
                User.id == job.owner_id,
                User.is_superuser.is_(True),
                User.roles.any(Role.name == "admin"),
            ),
        )
    ).all()
    for user_id in recipients:
        db.execute(
            insert(DeliveryNotification)
            .values(
                id=new_id(),
                job_id=job.id,
                failure_id=job.failure_id,
                user_id=user_id,
                message=job.error_message,
            )
            .on_conflict_do_nothing(index_elements=["user_id", "failure_id"])
        )


def retry_job(db, job, failure_id):
    if (
        job.status != "failed"
        or not job.retry_allowed
        or not job.failure_id
        or job.failure_id != failure_id
        or job.results.get("ad_id")
    ):
        raise ValueError(
            "This failure cannot be retried. Refresh the job and reconcile any uncertain result."
        )
    job.status = "queued"
    job.available_at = datetime.now(timezone.utc)
    job.finished_at = None
    job.retry_started_at = None
    # Keep video processing's original deadline and every confirmed remote ID.
    if job.stage != "video_ready":
        job.stage_started_at = None
    job.write_failures = 0
    job.read_failures = 0
    job.error_code = job.error_message = None
    job.provider_error_code = job.provider_error_subcode = None
    job.retry_allowed = False
    job.failure_id = None
    db.commit()
    return job
