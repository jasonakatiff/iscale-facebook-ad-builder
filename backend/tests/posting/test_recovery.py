from concurrent.futures import ThreadPoolExecutor
from datetime import timedelta
from unittest.mock import Mock

import pytest
from facebook_business.exceptions import FacebookRequestError
from app.delivery import queue
from app.delivery.models import DeliveryJob, DeliverySettings
from app.models import User

PAYLOAD = {
    "name": "test-recovery",
    "adset_id": "123",
    "creative_id": "456",
    "status": "PAUSED",
}


def rejected(code=4, status=400):
    return FacebookRequestError(
        "test-private-message",
        {"params": {"access_token": "test-private-token"}},
        status,
        {"Retry-After": "20"},
        {
            "error": {
                "code": code,
                "error_subcode": 2446079,
                "message": "test-private-token",
                "is_transient": True,
            }
        },
    )


def submit(sessions, buyer):
    with sessions() as db:
        return queue.enqueue(db, buyer.id, "test-recovery", "act_789", "ad", PAYLOAD).id


def test_confirmed_rate_limit_retries_and_preserves_each_reservation(
    sessions, engine, buyer, monkeypatch
):
    now = queue.utcnow() + timedelta(seconds=1)
    monkeypatch.setattr(queue, "utcnow", lambda: now)
    job_id = submit(sessions, buyer)
    provider = Mock()
    provider.create_ad.side_effect = [rejected(), rejected(), {"id": "987"}]
    queue.posting_tick(engine, lambda: provider)
    with sessions() as db:
        job = db.get(DeliveryJob, job_id)
        assert job.status == "queued"
        assert job.write_failures == 1
        assert job.available_at >= now + timedelta(seconds=20)
        assert job.error_code == "META_RATE_LIMIT"
        assert "test-private" not in job.error_message
    now += timedelta(seconds=21)
    queue.posting_tick(engine, lambda: provider)
    now += timedelta(seconds=21)
    with sessions() as db:
        db.get(DeliverySettings, 1).max_posts = 2
        db.commit()
    queue.posting_tick(engine, lambda: provider)
    assert provider.create_ad.call_count == 2
    now += timedelta(seconds=20)
    queue.posting_tick(engine, lambda: provider)
    with sessions() as db:
        assert db.get(DeliveryJob, job_id).status == "succeeded"
    assert provider.create_ad.call_count == 3


@pytest.mark.parametrize(
    "code,error_code,can_retry",
    [
        (190, "META_CONNECTION", True),
        (200, "META_PERMISSION", True),
        (100, "META_INPUT", False),
    ],
)
def test_explicit_rejection_stops_with_actionable_reason(
    sessions, engine, buyer, code, error_code, can_retry
):
    job_id = submit(sessions, buyer)
    provider = Mock()
    provider.create_ad.side_effect = rejected(code)
    queue.posting_tick(engine, lambda: provider)
    queue.posting_tick(engine, lambda: provider)
    with sessions() as db:
        job = db.get(DeliveryJob, job_id)
        assert job.status == "failed"
        assert job.error_code == error_code
        assert job.retry_allowed is can_retry
        assert job.failure_id
        assert "test-private" not in job.error_message
        assert job.provider_error_code == code
    assert provider.create_ad.call_count == 1


@pytest.mark.parametrize(
    "error",
    [
        rejected(4, 503),
        TimeoutError("test-private-token"),
        RuntimeError("test-private-token"),
    ],
)
def test_uncertain_write_never_becomes_retryable(sessions, engine, buyer, error):
    job_id = submit(sessions, buyer)
    provider = Mock()
    provider.create_ad.side_effect = error
    queue.posting_tick(engine, lambda: provider)
    queue.posting_tick(engine, lambda: provider)
    with sessions() as db:
        job = db.get(DeliveryJob, job_id)
        assert job.status == "needs_reconciliation"
        assert not job.retry_allowed
        assert job.error_code == "META_WRITE_UNKNOWN"
    assert provider.create_ad.call_count == 1


def test_retry_budget_exhaustion_notifies_once(sessions, engine, buyer, monkeypatch):
    from app.delivery.models import DeliveryNotification

    now = queue.utcnow() + timedelta(seconds=1)
    monkeypatch.setattr(queue, "utcnow", lambda: now)
    job_id = submit(sessions, buyer)
    with sessions() as db:
        db.get(DeliverySettings, 1).max_post_retries = 1
        db.add(
            User(
                id="test-admin",
                email="test-admin@example.com",
                hashed_password="test-unused",
                is_active=True,
                is_superuser=True,
            )
        )
        db.add(
            User(
                id="test-unrelated",
                email="test-unrelated@example.com",
                hashed_password="test-unused",
                is_active=True,
                is_superuser=False,
            )
        )
        db.commit()
    provider = Mock()
    provider.create_ad.side_effect = rejected()
    queue.posting_tick(engine, lambda: provider)
    with sessions() as db:
        assert db.query(DeliveryNotification).count() == 0
    now += timedelta(seconds=21)
    for _ in range(3):
        queue.posting_tick(engine, lambda: provider)
    with sessions() as db:
        job = db.get(DeliveryJob, job_id)
        assert job.status == "failed" and job.retry_allowed
        assert job.write_failures == 2
        assert {n.user_id for n in db.query(DeliveryNotification)} == {
            buyer.id,
            "test-admin",
        }
        assert db.query(DeliveryNotification).count() == 2
    assert provider.create_ad.call_count == 2


def test_retry_after_exceeding_deadline_stops_without_early_retry(
    sessions, engine, buyer
):
    job_id = submit(sessions, buyer)
    error = rejected()
    error._http_headers = {"Retry-After": "3600"}
    provider = Mock()
    provider.create_ad.side_effect = error
    queue.posting_tick(engine, lambda: provider)
    with sessions() as db:
        assert db.get(DeliveryJob, job_id).status == "failed"
    provider.create_ad.assert_called_once()


def test_video_multipart_rejection_is_uncertain(sessions, engine, buyer):
    job_id = submit(sessions, buyer)
    with sessions() as db:
        job = db.get(DeliveryJob, job_id)
        job.stage = "video_upload"
        job.payload = {**job.payload, "media_url": "https://example.com/test.mp4"}
        db.commit()
    provider = Mock()
    provider.upload_video.side_effect = rejected()
    queue.posting_tick(engine, lambda: provider)
    with sessions() as db:
        job = db.get(DeliveryJob, job_id)
        assert job.status == "needs_reconciliation" and not job.retry_allowed


def test_manual_retry_is_atomic_and_rejects_old_failure(sessions, engine, buyer):
    from app.delivery.recovery import retry_job

    job_id = submit(sessions, buyer)
    provider = Mock()
    provider.create_ad.side_effect = rejected(190)
    queue.posting_tick(engine, lambda: provider)
    with sessions() as db:
        failure_id = db.get(DeliveryJob, job_id).failure_id

    def retry(_):
        with sessions() as db:
            job = db.query(DeliveryJob).filter_by(id=job_id).with_for_update().one()
            try:
                retry_job(db, job, failure_id)
                return True
            except ValueError:
                return False

    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(retry, range(2))) == [False, True]
    with sessions() as db:
        job = db.get(DeliveryJob, job_id)
        assert job.status == "queued" and job.payload == PAYLOAD
        assert job.write_failures == 0 and job.post_started_at is not None


def test_media_download_failure_is_known_before_meta_write(monkeypatch):
    from contextlib import contextmanager
    from app.delivery.provider import DeliveryProvider
    from app.delivery.errors import PostingError

    @contextmanager
    def unavailable(*args, **kwargs):
        raise OSError("test-private-token")
        yield

    monkeypatch.setattr("app.delivery.media.download_media", unavailable)
    provider = DeliveryProvider.__new__(DeliveryProvider)
    provider.api = Mock()
    with pytest.raises(PostingError) as error:
        provider.upload_image("https://example.com/test.png", "act_789")
    assert error.value.safe_to_retry
    assert error.value.code == "MEDIA_DOWNLOAD"
    assert "test-private" not in str(error.value)


def test_zero_post_retries_stops_first_confirmed_rejection(sessions, engine, buyer):
    job_id = submit(sessions, buyer)
    with sessions() as db:
        db.get(DeliverySettings, 1).max_post_retries = 0
        db.commit()
    provider = Mock()
    provider.create_ad.side_effect = rejected()
    queue.posting_tick(engine, lambda: provider)
    queue.posting_tick(engine, lambda: provider)
    with sessions() as db:
        assert db.get(DeliveryJob, job_id).status == "failed"
    provider.create_ad.assert_called_once()


def test_queued_retry_expires_without_another_meta_write(sessions, engine, buyer):
    job_id = submit(sessions, buyer)
    with sessions() as db:
        job = db.get(DeliveryJob, job_id)
        job.write_failures = 1
        job.retry_started_at = queue.utcnow() - timedelta(minutes=16)
        db.commit()
    provider = Mock()
    queue.posting_tick(engine, lambda: provider)
    with sessions() as db:
        job = db.get(DeliveryJob, job_id)
        assert job.status == "failed" and job.error_code == "POST_RETRY_EXHAUSTED"
    provider.create_ad.assert_not_called()


def test_malformed_ad_success_never_marks_posted_or_retries(sessions, engine, buyer):
    job_id = submit(sessions, buyer)
    provider = Mock()
    provider.create_ad.return_value = {"id": None}
    queue.posting_tick(engine, lambda: provider)
    queue.posting_tick(engine, lambda: provider)
    with sessions() as db:
        job = db.get(DeliveryJob, job_id)
        assert job.status == "needs_reconciliation"
        assert not job.results.get("ad_id") and not job.retry_allowed
    provider.create_ad.assert_called_once()
