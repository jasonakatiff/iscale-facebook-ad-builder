"""Boundary regressions for the September CodeQL findings; no live providers."""

import signal
import socket
from contextlib import contextmanager
from pathlib import Path
from unittest.mock import MagicMock, Mock

import pytest
import requests

from app.delivery import media
from app.delivery.provider import DeliveryProvider, ProviderError
from app.services.facebook_service import FacebookService
from app.telemetry.runtime import sanitize


@pytest.fixture
def service(monkeypatch):
    value = FacebookService.__new__(FacebookService)
    value.api = MagicMock()
    value.access_token = "test-provider-token"
    value.account = MagicMock()
    value.account.get_id_assured.return_value = "act_123"
    monkeypatch.setattr(
        requests, "get", Mock(side_effect=AssertionError("Unprotected network request"))
    )
    return value


@pytest.mark.parametrize("method", ["upload_image", "upload_video"])
@pytest.mark.parametrize(
    "source",
    [
        "http://127.0.0.1/test",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/test",
        "file:///test-private.txt",
        "/test-private.txt",
        "../test-private.txt",
    ],
)
def test_legacy_upload_rejects_untrusted_sources(service, method, source, monkeypatch):
    provider = MagicMock()
    monkeypatch.setattr("app.services.facebook_service.AdImage", provider)
    monkeypatch.setattr("app.services.facebook_service.AdVideo", provider)
    with pytest.raises(ValueError):
        getattr(service, method)(source)
    provider.assert_not_called()


@pytest.mark.parametrize("kind", ["image", "video"])
def test_upload_api_reports_unsafe_source_as_validation_error(
    client, auth_headers, service, kind
):
    from app.main import app
    from app.api.v1.facebook import get_facebook_service

    app.dependency_overrides[get_facebook_service] = lambda: service
    try:
        result = client.post(
            f"/api/v1/facebook/upload-{kind}",
            headers=auth_headers,
            json={f"{kind}_url": "/test-private.txt"},
        )
        assert result.status_code == 422
        assert "public HTTP or HTTPS URL" in result.json()["detail"]
    finally:
        app.dependency_overrides.pop(get_facebook_service, None)


@pytest.mark.parametrize(
    "method,video", [("upload_image", False), ("upload_video", True)]
)
@pytest.mark.parametrize("fails", [False, True])
def test_legacy_upload_uses_managed_download_and_cleans_up(
    service, monkeypatch, tmp_path, method, video, fails
):
    import app.services.facebook_service as facebook

    path = tmp_path / "test-media"
    download_calls = []

    @contextmanager
    def download(url, video=False):
        download_calls.append((url, video))
        path.write_bytes(b"test-media")
        try:
            yield str(path)
        finally:
            path.unlink()

    monkeypatch.setattr(facebook, "download_media", download, raising=False)
    asset = MagicMock()
    asset.__getitem__.return_value = "123"
    asset.remote_create.side_effect = (
        RuntimeError("test-provider-failure") if fails else None
    )
    monkeypatch.setattr(
        facebook, "AdVideo" if video else "AdImage", Mock(return_value=asset)
    )
    monkeypatch.setattr(service, "get_video_status", lambda _: {"status": "processing"})
    arguments = {"wait_for_ready": False} if video else {}
    if fails:
        with pytest.raises(RuntimeError, match="test-provider-failure"):
            getattr(service, method)("https://media.example/test", **arguments)
    else:
        getattr(service, method)("https://media.example/test", **arguments)
    assert download_calls == [("https://media.example/test", video)]
    assert not path.exists()
    assert str(path) in [call.args[1] for call in asset.__setitem__.call_args_list]


def test_downloader_pins_public_dns_and_preserves_tls_hostname(monkeypatch):
    dns = Mock(
        return_value=[
            (socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))
        ]
    )
    monkeypatch.setattr(media.socket, "getaddrinfo", dns)
    response = Mock(status=200, headers={"Content-Type": "image/png"})
    response.stream.return_value = iter([b"test-image"])
    pool = Mock()
    pool.urlopen.return_value = response
    constructor = Mock(return_value=pool)
    monkeypatch.setattr(media.urllib3, "HTTPSConnectionPool", constructor)
    with media.download_media("https://media.example/test.png") as path:
        assert Path(path).read_bytes() == b"test-image"
    assert not Path(path).exists()
    dns.assert_called_once()
    assert constructor.call_args.args == ("93.184.216.34",)
    assert constructor.call_args.kwargs["assert_hostname"] == "media.example"
    assert constructor.call_args.kwargs["server_hostname"] == "media.example"
    assert pool.urlopen.call_args.kwargs["headers"]["Host"] == "media.example"
    assert pool.urlopen.call_args.kwargs["redirect"] is False
    response.close.assert_called_once()
    pool.close.assert_called_once()


def test_downloader_revalidates_redirect_before_connecting(monkeypatch):
    def resolve(host, port, **kwargs):
        address = "93.184.216.34" if host == "media.example" else "127.0.0.1"
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (address, port))]

    monkeypatch.setattr(media.socket, "getaddrinfo", resolve)
    response = Mock(status=302, headers={"Location": "http://private.example/test"})
    pool = Mock()
    pool.urlopen.return_value = response
    constructor = Mock(return_value=pool)
    monkeypatch.setattr(media.urllib3, "HTTPSConnectionPool", constructor)
    insecure_pool = Mock(side_effect=AssertionError("Private connection attempted"))
    monkeypatch.setattr(media.urllib3, "HTTPConnectionPool", insecure_pool)
    with pytest.raises(ValueError, match="public addresses"):
        with media.download_media("https://media.example/test.png"):
            pytest.fail("Unsafe redirect accepted")
    insecure_pool.assert_not_called()


@pytest.mark.parametrize("method", ["get_video_status", "get_video_thumbnails"])
@pytest.mark.parametrize(
    "video_id",
    [
        "../123/picture",
        "123?redirect=true",
        "123#ignored",
        "https://evil.example",
        "%2e%2e%2f123",
        "１２３",
    ],
)
def test_graph_video_ids_reject_path_and_query_injection(service, method, video_id):
    with pytest.raises(ValueError):
        getattr(service, method)(video_id)


@pytest.mark.parametrize("method", ["get_video_status", "get_video_thumbnails"])
def test_graph_video_reads_disable_redirects(service, method, monkeypatch):
    response = Mock(status_code=302, headers={"Location": "http://127.0.0.1/private"})
    response.json.return_value = {}
    request = Mock(return_value=response)
    monkeypatch.setattr(requests, "get", request)
    with pytest.raises(ValueError, match="redirect"):
        getattr(service, method)("123")
    assert request.call_args.kwargs["allow_redirects"] is False
    assert "access_token" not in request.call_args.kwargs.get("params", {})
    assert (
        request.call_args.kwargs["headers"]["Authorization"]
        == "Bearer test-provider-token"
    )


@pytest.mark.parametrize(
    "path",
    [
        "../123",
        "123/picture",
        "123?fields=secret",
        "123#other",
        "//evil.example",
        "act_123/../../me",
    ],
)
def test_delivery_rejects_unapproved_graph_paths(path, monkeypatch):
    provider = DeliveryProvider.__new__(DeliveryProvider)
    provider.access_token = "test-private-token"
    request = Mock(side_effect=AssertionError("Invalid path reached transport"))
    monkeypatch.setattr(requests, "get", request)
    with pytest.raises(ProviderError):
        provider.read(path)
    request.assert_not_called()


def test_delivery_rejects_graph_redirect(monkeypatch):
    provider = DeliveryProvider.__new__(DeliveryProvider)
    provider.access_token = "test-private-token"
    response = Mock(
        status_code=302, ok=True, headers={"Location": "http://127.0.0.1/private"}
    )
    response.json.return_value = {}
    request = Mock(return_value=response)
    monkeypatch.setattr(requests, "get", request)
    with pytest.raises(ProviderError) as error:
        provider.read("act_123/insights")
    assert error.value.retryable is False
    assert request.call_args.kwargs["allow_redirects"] is False


@pytest.mark.skipif(not hasattr(signal, "setitimer"), reason="POSIX deadline")
def test_redaction_hostile_inputs_have_bounded_cpu_cost():
    def expired(*_):
        raise AssertionError("Redaction exceeded its CPU deadline")

    previous = signal.signal(signal.SIGALRM, expired)
    signal.setitimer(signal.ITIMER_REAL, 0.5)
    try:
        for _ in range(8):
            sanitize("a" * 8000)
            sanitize("https://" * 1000)
    finally:
        signal.setitimer(signal.ITIMER_REAL, 0)
        signal.signal(signal.SIGALRM, previous)


@pytest.mark.parametrize(
    "text,secret",
    [
        ("Contact test-owner+tag@example.com now", "test-owner+tag@example.com"),
        ("https://user:pass@host.test/path?token=test-private#fragment", "user:pass"),
        ("https://test-owner:test-password@host.test/path", "test-owner"),
        ("https://host.test/path?token=test-private#fragment", "test-private"),
        ("https://host.test/path#test-private", "test-private"),
    ],
)
def test_redaction_keeps_email_credentials_and_queries_private(text, secret):
    assert secret not in sanitize(text)
