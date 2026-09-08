"""Fetch public media with pinned DNS, bounded redirects, size and elapsed time."""

import ipaddress
import socket
import tempfile
import time
from contextlib import contextmanager
from urllib.parse import urlsplit, urljoin

import urllib3

MAX_REDIRECTS = 4
MAX_IMAGE_BYTES = 10 * 1024 * 1024
MAX_VIDEO_BYTES = 500 * 1024 * 1024
MEDIA_DEADLINE_SECONDS = 180


def public_target(url):
    parsed = urlsplit(url)
    if (
        parsed.scheme not in {"http", "https"}
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.port not in {None, 80, 443}
    ):
        raise ValueError("Media must use a public HTTP or HTTPS URL")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    ips = [entry[4][0] for entry in addresses]
    if not ips or any(not ipaddress.ip_address(ip).is_global for ip in ips):
        raise ValueError("Media URL must resolve to public addresses")
    return parsed, port, ips[0]


@contextmanager
def download_media(url, video=False):
    deadline = time.monotonic() + MEDIA_DEADLINE_SECONDS
    maximum = MAX_VIDEO_BYTES if video else MAX_IMAGE_BYTES
    for _ in range(MAX_REDIRECTS + 1):
        parsed, port, address = public_target(url)
        if time.monotonic() >= deadline:
            raise ValueError("Media download exceeded its time limit")
        timeout = urllib3.Timeout(connect=5, read=30)
        if parsed.scheme == "https":
            pool = urllib3.HTTPSConnectionPool(
                address,
                port=port,
                assert_hostname=parsed.hostname,
                server_hostname=parsed.hostname,
                cert_reqs="CERT_REQUIRED",
                timeout=timeout,
            )
        else:
            pool = urllib3.HTTPConnectionPool(address, port=port, timeout=timeout)
        path = (parsed.path or "/") + ("?" + parsed.query if parsed.query else "")
        response = None
        try:
            response = pool.urlopen(
                "GET",
                path,
                headers={"Host": parsed.netloc, "Accept-Encoding": "identity"},
                preload_content=False,
                redirect=False,
                retries=False,
            )
            if response.status in {301, 302, 303, 307, 308}:
                location = response.headers.get("Location")
                if not location:
                    raise ValueError("Media redirect has no destination")
                url = urljoin(url, location)
                continue
            if response.status != 200:
                raise ValueError("Media download failed")
            content_type = (
                response.headers.get("Content-Type", "").split(";")[0].lower()
            )
            if not content_type.startswith("video/" if video else "image/"):
                raise ValueError(
                    "Media content type does not match the selected format"
                )
            with tempfile.NamedTemporaryFile(
                suffix=".mp4" if video else ".jpg"
            ) as output:
                size = 0
                for chunk in response.stream(65536, decode_content=False):
                    size += len(chunk)
                    if size > maximum or time.monotonic() >= deadline:
                        raise ValueError("Media exceeds its size or time limit")
                    output.write(chunk)
                output.flush()
                if not size:
                    raise ValueError("Media file is empty")
                yield output.name
                return
        finally:
            if response is not None:
                response.close()
            pool.close()
    raise ValueError("Media exceeded the redirect limit")
