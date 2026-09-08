"""Tests for video upload functionality."""
import pytest
from unittest.mock import MagicMock, patch
from contextlib import nullcontext


class TestFacebookServiceVideo:
    """Tests for FacebookService video methods."""

    def test_upload_video_from_url(self):
        """Test uploading video from URL."""
        from app.services.facebook_service import FacebookService

        with patch.object(FacebookService, 'initialize'):
            service = FacebookService()
            service.api = MagicMock()
            service.access_token = "test_token"
            service.ad_account_id = "123456"
            service.account = MagicMock()
            service.account.get_id_assured.return_value = "act_123456"

            # Mock AdVideo
            mock_video = MagicMock()
            mock_video.__getitem__ = MagicMock(return_value="123456")

            with patch('app.services.facebook_service.download_media', return_value=nullcontext('/test-managed-video.mp4')):
                with patch('app.services.facebook_service.AdVideo', return_value=mock_video):
                    with patch.object(service, 'wait_for_video_ready', return_value={'status': 'ready'}):
                        with patch.object(service, 'get_video_thumbnails', return_value=['thumb1.jpg']):
                            result = service.upload_video(
                                "https://example.com/video.mp4",
                                ad_account_id="123456"
                            )

            assert result['video_id'] == "123456"
            assert result['status'] == 'ready'
            assert 'thumbnails' in result

    def test_upload_video_rejects_local_file(self):
        """Only public URLs are accepted from upload callers."""
        from app.services.facebook_service import FacebookService

        with patch.object(FacebookService, 'initialize'):
            service = FacebookService()
            service.api = MagicMock()
            service.account = MagicMock()
            with patch('app.services.facebook_service.AdVideo') as video:
                with pytest.raises(ValueError, match="public HTTP or HTTPS URL"):
                    service.upload_video("/test-private-video.mp4")
                video.assert_not_called()

    def test_get_video_status_ready(self):
        """Test getting video status when ready."""
        from app.services.facebook_service import FacebookService

        with patch.object(FacebookService, 'initialize'):
            service = FacebookService()
            service.access_token = "test_token"

            mock_response = MagicMock(status_code=200)
            mock_response.json.return_value = {
                'id': '123456',
                'status': {'video_status': 'ready'},
                'length': 30.5
            }

            with patch('requests.get', return_value=mock_response):
                result = service.get_video_status("123456")

            assert result['status'] == 'ready'
            assert result['video_id'] == '123456'
            assert result['length'] == 30.5

    def test_get_video_status_processing(self):
        """Test getting video status when still processing."""
        from app.services.facebook_service import FacebookService

        with patch.object(FacebookService, 'initialize'):
            service = FacebookService()
            service.access_token = "test_token"

            mock_response = MagicMock(status_code=200)
            mock_response.json.return_value = {
                'id': '123456',
                'status': {'video_status': 'processing'}
            }

            with patch('requests.get', return_value=mock_response):
                result = service.get_video_status("123456")

            assert result['status'] == 'processing'

    def test_get_video_status_error(self):
        """Test getting video status with error response."""
        from app.services.facebook_service import FacebookService

        with patch.object(FacebookService, 'initialize'):
            service = FacebookService()
            service.access_token = "test_token"

            mock_response = MagicMock(status_code=200)
            mock_response.json.return_value = {
                'error': {'message': 'Video not found'}
            }

            with patch('requests.get', return_value=mock_response):
                result = service.get_video_status("999999")

            assert result['status'] == 'error'
            assert 'Video not found' in result['error']

    def test_get_video_thumbnails(self):
        """Test fetching video thumbnails."""
        from app.services.facebook_service import FacebookService

        with patch.object(FacebookService, 'initialize'):
            service = FacebookService()
            service.access_token = "test_token"

            mock_response = MagicMock(status_code=200)
            mock_response.json.return_value = {
                'data': [
                    {'uri': 'https://example.com/thumb1.jpg'},
                    {'uri': 'https://example.com/thumb2.jpg'},
                ]
            }

            with patch('requests.get', return_value=mock_response):
                result = service.get_video_thumbnails("123456")

            assert len(result) == 2
            assert 'thumb1.jpg' in result[0]
            assert 'thumb2.jpg' in result[1]

    def test_wait_for_video_ready_success(self):
        """Test waiting for video to be ready."""
        from app.services.facebook_service import FacebookService

        with patch.object(FacebookService, 'initialize'):
            service = FacebookService()

            # First call returns processing, second returns ready
            with patch.object(service, 'get_video_status') as mock_status:
                mock_status.side_effect = [
                    {'status': 'processing'},
                    {'status': 'ready'}
                ]
                with patch('time.sleep'):  # Skip actual sleeping
                    result = service.wait_for_video_ready("123456", timeout=60, interval=1)

            assert result['status'] == 'ready'

    def test_wait_for_video_ready_timeout(self):
        """Test timeout when waiting for video."""
        from app.services.facebook_service import FacebookService

        with patch.object(FacebookService, 'initialize'):
            service = FacebookService()

            with patch.object(service, 'get_video_status', return_value={'status': 'processing'}):
                with patch('time.sleep'):
                    with patch('time.time') as mock_time:
                        # Simulate timeout by returning increasing times
                        mock_time.side_effect = [0, 100, 200]
                        with pytest.raises(Exception, match="timeout"):
                            service.wait_for_video_ready("123456", timeout=1)

    def test_create_creative_with_video(self):
        """Test creating ad creative with video."""
        from app.services.facebook_service import FacebookService

        with patch.object(FacebookService, 'initialize'):
            service = FacebookService()
            service.api = MagicMock()
            service.account = MagicMock()
            service.account.get_id_assured.return_value = "act_123456"
            service.account.create_ad_creative.return_value = {'id': 'creative_123'}

            creative_data = {
                'name': 'Test Video Creative',
                'page_id': 'page_123',
                'video_id': 'video_456',
                'primary_text': 'Check out this video!',
                'headline': 'Amazing Product',
                'website_url': 'https://example.com',
                'cta': 'SHOP_NOW',
                'thumbnail_url': 'https://example.com/thumb.jpg'
            }

            result = service.create_creative(creative_data)

            # Verify create_ad_creative was called
            service.account.create_ad_creative.assert_called_once()
            call_args = service.account.create_ad_creative.call_args
            params = call_args[1]['params']

            # Verify video_data structure
            assert 'object_story_spec' in params
            story_spec = params['object_story_spec']
            assert 'video_data' in story_spec
            assert story_spec['video_data']['video_id'] == 'video_456'
            assert story_spec['video_data']['image_url'] == 'https://example.com/thumb.jpg'

    def test_create_creative_with_image(self):
        """Test creating ad creative with image (existing behavior)."""
        from app.services.facebook_service import FacebookService

        with patch.object(FacebookService, 'initialize'):
            service = FacebookService()
            service.api = MagicMock()
            service.account = MagicMock()
            service.account.get_id_assured.return_value = "act_123456"
            service.account.create_ad_creative.return_value = {'id': 'creative_789'}

            creative_data = {
                'name': 'Test Image Creative',
                'page_id': 'page_123',
                'image_hash': 'abc123hash',
                'primary_text': 'Check this out!',
                'headline': 'Great Deal',
                'website_url': 'https://example.com',
                'cta': 'LEARN_MORE'
            }

            result = service.create_creative(creative_data)

            # Verify link_data structure (not video_data)
            call_args = service.account.create_ad_creative.call_args
            params = call_args[1]['params']
            story_spec = params['object_story_spec']
            assert 'link_data' in story_spec
            assert 'video_data' not in story_spec
            assert story_spec['link_data']['image_hash'] == 'abc123hash'
