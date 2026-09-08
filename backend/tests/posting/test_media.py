import pytest
from app.delivery.media import public_target


@pytest.mark.parametrize(
    "url",
    [
        "file:///etc/passwd",
        "http://127.0.0.1/test",
        "http://169.254.169.254/latest/meta-data",
        "http://[::1]/test",
        "https://user:password@example.com/test",
        "http://example.com:22/test",
    ],
)
def test_media_rejects_private_addresses_and_credentials(url):
    with pytest.raises(ValueError):
        public_target(url)
