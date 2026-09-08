"""Classify posting failures without retaining provider payloads or credentials."""

from datetime import datetime, timezone
from email.utils import parsedate_to_datetime

from facebook_business.exceptions import FacebookRequestError


class PostingError(Exception):
    def __init__(
        self,
        code,
        message,
        *,
        safe_to_retry=False,
        automatic=False,
        retry_allowed=False,
        retry_after=0,
        provider_code=None,
        provider_subcode=None
    ):
        super().__init__(message)
        self.code = code
        self.safe_to_retry = safe_to_retry
        self.automatic = automatic
        self.retry_allowed = retry_allowed
        self.retry_after = retry_after
        self.provider_code = provider_code
        self.provider_subcode = provider_subcode


def retry_after_seconds(headers):
    value = next(
        (v for k, v in (headers or {}).items() if k.lower() == "retry-after"), "0"
    )
    try:
        return max(0, int(value))
    except (ValueError, TypeError):
        try:
            return max(
                0,
                (
                    parsedate_to_datetime(value) - datetime.now(timezone.utc)
                ).total_seconds(),
            )
        except (ValueError, TypeError, OverflowError):
            return 0


def classify_write_error(error, stage):
    if isinstance(error, PostingError):
        return error
    unknown = PostingError(
        "META_WRITE_UNKNOWN",
        "Meta did not confirm the result. Reconcile this job before posting again.",
    )
    # A later chunk/finish rejection does not prove a multipart video was not created.
    if stage == "video_upload" or not isinstance(error, FacebookRequestError):
        return unknown
    status, code, subcode = (
        error.http_status(),
        error.api_error_code(),
        error.api_error_subcode(),
    )
    if status not in {400, 401, 403, 429} or not isinstance(code, int):
        return unknown
    details = dict(
        safe_to_retry=True,
        provider_code=code,
        provider_subcode=subcode if isinstance(subcode, int) else None,
    )
    if code in {102, 190} or status == 401:
        return PostingError(
            "META_CONNECTION",
            "Reconnect the buyer’s Meta account, then retry this ad.",
            retry_allowed=True,
            **details
        )
    if code in {10, 200, 294} or status == 403:
        return PostingError(
            "META_PERMISSION",
            "Restore the buyer’s access to the Meta account, page and ad set, then retry this ad.",
            retry_allowed=True,
            **details
        )
    if code == 100:
        return PostingError(
            "META_INPUT",
            "Meta rejected the ad settings. Correct the creative, destination or ad set in a new draft.",
            **details
        )
    if status == 429 or code in {4, 17, 32, 613, 80004}:
        return PostingError(
            "META_RATE_LIMIT",
            "Meta rejected this attempt because of a rate limit.",
            automatic=True,
            retry_allowed=True,
            retry_after=retry_after_seconds(error.http_headers()),
            **details
        )
    return PostingError(
        "META_REJECTED",
        "Meta rejected this request. Review the ad account and settings using the Meta error code before creating a corrected draft.",
        **details
    )
