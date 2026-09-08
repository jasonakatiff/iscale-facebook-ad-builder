"""Local-only browser harness. Meta and LeadRouter are simulated; auth and DB are real."""

from tests.feedback_server import (
    app,
)  # Enforces localhost /test_ database before startup.
from app.services import leadrouter_service as provider
import httpx

CAMPAIGNS = [
    {
        "id": "11111111-1111-4111-8111-111111111111",
        "displayId": 101,
        "name": "test-Solar campaign",
        "offerName": "test-Solar consultation",
        "status": "active",
        "verticalName": "test-Home services",
        "leadCount": 7,
        "postingKey": "pk_test_never_expose",
    },
    {
        "id": "22222222-2222-4222-8222-222222222222",
        "displayId": 102,
        "name": "test-Home campaign",
        "offerName": "test-Home quote",
        "status": "active",
        "verticalName": "test-Home services",
        "leadCount": 3,
    },
]


def transport(request):
    if request.headers.get("authorization") != "Bearer lr_test_native_browser_key":
        return httpx.Response(401, json={"error": "test-invalid-key"})
    if request.url.path == "/api/partner/me":
        return httpx.Response(
            200,
            json={
                "data": {
                    "role": "partner",
                    "partnerName": "test-LeadRouter partner",
                    "partnerId": "33333333-3333-4333-8333-333333333333",
                }
            },
        )
    if request.url.path in {"/api/partner/campaigns", "/api/v1/campaigns"}:
        limit = int(request.url.params.get("limit", "100"))
        offset = int(request.url.params.get("offset", "0"))
        return httpx.Response(
            200,
            json={
                "data": CAMPAIGNS[offset : offset + limit],
                "pagination": {
                    "total": len(CAMPAIGNS),
                    "limit": limit,
                    "offset": offset,
                    "hasMore": offset + limit < len(CAMPAIGNS),
                },
            },
        )
    return httpx.Response(404)


provider.make_client = lambda: httpx.Client(
    transport=httpx.MockTransport(transport), follow_redirects=False
)
