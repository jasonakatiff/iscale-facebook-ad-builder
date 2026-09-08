"""Example Ad Studio service worker. Reads process environment; never saves credentials."""

import argparse
import json
import os
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from uuid import UUID


class NoRedirects(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


class ApiError(Exception):
    def __init__(self, status):
        self.status = status
        super().__init__(f"Ad workspace request failed (HTTP {status}).")


def process_job(job):
    """Replace with your processing logic. This example only confirms connectivity."""
    return {
        "kind": "connection-test",
        "algorithmVersion": "example-1",
        "message": "Service connection verified",
        "received": job["inputs"],
    }


def run_once(origin, key):
    opener = build_opener(NoRedirects())

    def api(path, body=None):
        payload = (
            json.dumps(body, allow_nan=False).encode() if body is not None else None
        )
        req = Request(
            origin + "/api/v1/plugin-worker" + path,
            data=payload,
            headers={
                "Authorization": "Bearer " + key,
                "Content-Type": "application/json",
            },
        )
        try:
            with opener.open(req, timeout=20) as response:
                raw = response.read(262145)
                if len(raw) > 262144:
                    raise RuntimeError(
                        "Service response exceeds the example worker limit"
                    )
                return json.loads(raw)
        except HTTPError as error:
            raise ApiError(error.code) from None
        except URLError:
            raise RuntimeError("Unable to reach the ad workspace") from None

    jobs = api("/jobs?limit=1")["data"]
    if not jobs:
        return False
    job_id = str(UUID(jobs[0]["id"]))
    try:
        claim = api(f"/jobs/{job_id}/claim", {})
    except ApiError as error:
        if error.status == 409:
            return False
        raise
    try:
        result = {
            "leaseToken": claim["leaseToken"],
            "output": process_job(claim["data"]),
        }
    except Exception:
        result = {"leaseToken": claim["leaseToken"], "failed": True}
    for attempt in range(3):
        try:
            api(f"/jobs/{job_id}/result", result)
            print("Completed one plugin job.")
            return True
        except ApiError as error:
            if error.status < 500 or attempt == 2:
                raise
        except RuntimeError:
            if attempt == 2:
                raise
        time.sleep(2**attempt)
    return False


def main():
    parser = argparse.ArgumentParser(
        description="Ad Studio plugin connection demonstration"
    )
    parser.add_argument(
        "--once", action="store_true", help="Process at most one queued job"
    )
    args = parser.parse_args()
    origin = os.environ.get(
        "BREADWINNER_API_ORIGIN", "https://ad-builder-backend-production.up.railway.app"
    ).rstrip("/")
    key = os.environ.get("BREADWINNER_PLUGIN_WORKER_KEY", "")
    parsed = urlsplit(origin)
    if (
        not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path
        or parsed.query
        or parsed.fragment
        or (
            parsed.scheme != "https"
            and not (
                parsed.scheme == "http"
                and parsed.hostname in {"127.0.0.1", "localhost", "::1"}
            )
        )
    ):
        parser.error(
            "BREADWINNER_API_ORIGIN must be an HTTPS origin (HTTP loopback is allowed for local development)."
        )
    if (
        not key.startswith("bwp_worker_")
        or len(key) > 128
        or any(char.isspace() for char in key)
    ):
        parser.error("Set BREADWINNER_PLUGIN_WORKER_KEY in this process environment.")
    try:
        while True:
            processed = run_once(origin, key)
            if args.once:
                if not processed:
                    print("No queued jobs.")
                return
            time.sleep(15)
    except (ApiError, RuntimeError) as error:
        raise SystemExit(str(error)) from None
    except KeyboardInterrupt:
        print("Worker stopped.")


if __name__ == "__main__":
    main()
