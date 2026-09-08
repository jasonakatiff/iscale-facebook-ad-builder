"""Only external Meta I/O is replaced in the isolated workspace browser run."""

import json
import os
from urllib.parse import urlparse

from facebook_business.api import FacebookAdsApi, FacebookResponse


def install_transport():
    database = urlparse(os.environ["DATABASE_URL"])
    if database.hostname not in (
        "localhost",
        "127.0.0.1",
    ) or not database.path.startswith("/test_"):
        raise RuntimeError("Workspace transport requires a localhost test database.")

    def meta_transport(self, method, path, params=None, **kwargs):
        if method != "GET" or tuple(path)[-1] != "campaigns":
            raise AssertionError("Unexpected Meta operation in workspace fixture")
        after = (params or {}).get("after")
        result = {
            "data": [
                {
                    "id": "test-2" if after else "test-1",
                    "name": "test-Retargeting" if after else "test-Prospecting",
                    "status": "PAUSED",
                    "effective_status": "PAUSED",
                    "objective": "OUTCOME_SALES",
                }
            ]
        }
        if not after:
            result["paging"] = {
                "next": "https://graph.facebook.com/test-fixture-page",
                "cursors": {"after": "test-page-2"},
            }
        return FacebookResponse(body=json.dumps(result), http_status=200, headers={})

    FacebookAdsApi.call = meta_transport


if __name__ == "__main__":
    install_transport()
    from app.sync_worker import main

    main()
