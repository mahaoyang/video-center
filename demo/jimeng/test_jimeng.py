"""
Unit Tests for Jimeng Video API Client

Tests cover:
- Request creation and validation
- Serialization (to_dict, to_json)
- Helper functions
- Parameter validation
- Edge cases
"""

import unittest
import json
from jimeng import (
    JimengClient,
    JimengVideoRequest,
    AspectRatio,
    VideoSize,
    create_simple_video_request,
    create_video_with_images
)


class TestJimengVideoRequest(unittest.TestCase):
    """Test JimengVideoRequest dataclass"""

    def test_basic_request_creation(self):
        """Test creating a basic request"""
        request = JimengVideoRequest(
            model="jimeng-video-3.0",
            prompt="cat fish"
        )
        self.assertEqual(request.model, "jimeng-video-3.0")
        self.assertEqual(request.prompt, "cat fish")
        self.assertEqual(request.aspect_ratio, "16:9")
        self.assertEqual(request.size, "1080P")
        self.assertEqual(request.images, [])

    def test_request_with_all_parameters(self):
        """Test request with all parameters specified"""
        request = JimengVideoRequest(
            model="jimeng-video-3.0",
            prompt="beautiful sunset",
            aspect_ratio="9:16",
            size="720P",
            images=["https://example.com/image.jpg"]
        )
        self.assertEqual(request.aspect_ratio, "9:16")
        self.assertEqual(request.size, "720P")
        self.assertEqual(len(request.images), 1)

    def test_request_to_dict(self):
        """Test converting request to dictionary"""
        request = JimengVideoRequest(
            model="jimeng-video-3.0",
            prompt="test prompt",
            aspect_ratio="16:9",
            size="1080P"
        )
        data = request.to_dict()

        self.assertIsInstance(data, dict)
        self.assertEqual(data["model"], "jimeng-video-3.0")
        self.assertEqual(data["prompt"], "test prompt")
        self.assertEqual(data["aspect_ratio"], "16:9")
        self.assertEqual(data["size"], "1080P")
        self.assertEqual(data["images"], [])

    def test_request_to_json(self):
        """Test converting request to JSON string"""
        request = JimengVideoRequest(
            model="jimeng-video-3.0",
            prompt="test prompt"
        )
        json_str = request.to_json()

        self.assertIsInstance(json_str, str)
        data = json.loads(json_str)
        self.assertEqual(data["model"], "jimeng-video-3.0")
        self.assertEqual(data["prompt"], "test prompt")

    def test_request_with_multiple_images(self):
        """Test request with multiple reference images"""
        images = [
            "https://example.com/image1.jpg",
            "https://example.com/image2.jpg",
            "https://example.com/image3.jpg"
        ]
        request = JimengVideoRequest(
            model="jimeng-video-3.0",
            prompt="animate images",
            images=images
        )
        self.assertEqual(len(request.images), 3)
        self.assertEqual(request.images, images)


class TestJimengClient(unittest.TestCase):
    """Test JimengClient class"""

    def setUp(self):
        """Set up test client"""
        self.client = JimengClient(api_token="test-token")

    def test_client_initialization(self):
        """Test client initialization"""
        self.assertEqual(self.client.api_token, "test-token")
        self.assertEqual(self.client.base_url, "https://yunwu.ai")
        self.assertEqual(self.client.endpoint, "/v1/video/create")
        self.assertEqual(self.client.query_endpoint, "/v1/video/query")

    def test_client_custom_base_url(self):
        """Test client with custom base URL"""
        client = JimengClient(
            api_token="test-token",
            base_url="https://custom.api.com"
        )
        self.assertEqual(client.base_url, "https://custom.api.com")

    def test_validate_valid_request(self):
        """Test validation of valid request"""
        request = JimengVideoRequest(
            model="jimeng-video-3.0",
            prompt="test prompt",
            aspect_ratio="16:9",
            size="1080P"
        )
        is_valid, error = self.client.validate_request(request)
        self.assertTrue(is_valid)
        self.assertIsNone(error)

    def test_validate_missing_model(self):
        """Test validation fails with missing model"""
        request = JimengVideoRequest(
            model="",
            prompt="test prompt"
        )
        is_valid, error = self.client.validate_request(request)
        self.assertFalse(is_valid)
        self.assertEqual(error, "model is required")

    def test_validate_missing_prompt(self):
        """Test validation fails with missing prompt"""
        request = JimengVideoRequest(
            model="jimeng-video-3.0",
            prompt=""
        )
        is_valid, error = self.client.validate_request(request)
        self.assertFalse(is_valid)
        self.assertEqual(error, "prompt is required")

    def test_validate_invalid_aspect_ratio(self):
        """Test validation fails with invalid aspect ratio"""
        request = JimengVideoRequest(
            model="jimeng-video-3.0",
            prompt="test prompt",
            aspect_ratio="21:9"
        )
        is_valid, error = self.client.validate_request(request)
        self.assertFalse(is_valid)
        self.assertIn("aspect_ratio must be one of", error)

    def test_validate_invalid_size(self):
        """Test validation fails with invalid size"""
        request = JimengVideoRequest(
            model="jimeng-video-3.0",
            prompt="test prompt",
            size="4K"
        )
        is_valid, error = self.client.validate_request(request)
        self.assertFalse(is_valid)
        self.assertIn("size must be one of", error)

    def test_validate_all_aspect_ratios(self):
        """Test all valid aspect ratios"""
        valid_ratios = ["16:9", "9:16", "1:1", "4:3"]
        for ratio in valid_ratios:
            request = JimengVideoRequest(
                model="jimeng-video-3.0",
                prompt="test",
                aspect_ratio=ratio
            )
            is_valid, error = self.client.validate_request(request)
            self.assertTrue(is_valid, f"Ratio {ratio} should be valid")

    def test_validate_all_sizes(self):
        """Test all valid sizes"""
        valid_sizes = ["720P", "1080P"]
        for size in valid_sizes:
            request = JimengVideoRequest(
                model="jimeng-video-3.0",
                prompt="test",
                size=size
            )
            is_valid, error = self.client.validate_request(request)
            self.assertTrue(is_valid, f"Size {size} should be valid")


class TestHelperFunctions(unittest.TestCase):
    """Test helper functions"""

    def test_create_simple_video_request(self):
        """Test create_simple_video_request helper"""
        request = create_simple_video_request(
            model="jimeng-video-3.0",
            prompt="cat playing"
        )
        self.assertIsInstance(request, JimengVideoRequest)
        self.assertEqual(request.model, "jimeng-video-3.0")
        self.assertEqual(request.prompt, "cat playing")
        self.assertEqual(request.aspect_ratio, "16:9")
        self.assertEqual(request.size, "1080P")
        self.assertEqual(request.images, [])

    def test_create_simple_video_request_custom_params(self):
        """Test create_simple_video_request with custom parameters"""
        request = create_simple_video_request(
            model="jimeng-video-3.0",
            prompt="test",
            aspect_ratio="9:16",
            size="720P"
        )
        self.assertEqual(request.aspect_ratio, "9:16")
        self.assertEqual(request.size, "720P")

    def test_create_video_with_images(self):
        """Test create_video_with_images helper"""
        images = [
            "https://example.com/image1.jpg",
            "https://example.com/image2.jpg"
        ]
        request = create_video_with_images(
            model="jimeng-video-3.0",
            prompt="animate images",
            image_urls=images
        )
        self.assertIsInstance(request, JimengVideoRequest)
        self.assertEqual(request.images, images)
        self.assertEqual(len(request.images), 2)

    def test_create_video_with_images_custom_params(self):
        """Test create_video_with_images with custom parameters"""
        request = create_video_with_images(
            model="jimeng-video-3.0",
            prompt="test",
            image_urls=["https://example.com/image.jpg"],
            aspect_ratio="1:1",
            size="720P"
        )
        self.assertEqual(request.aspect_ratio, "1:1")
        self.assertEqual(request.size, "720P")


class TestEnums(unittest.TestCase):
    """Test enum classes"""

    def test_aspect_ratio_enum(self):
        """Test AspectRatio enum values"""
        self.assertEqual(AspectRatio.RATIO_16_9.value, "16:9")
        self.assertEqual(AspectRatio.RATIO_9_16.value, "9:16")
        self.assertEqual(AspectRatio.RATIO_1_1.value, "1:1")
        self.assertEqual(AspectRatio.RATIO_4_3.value, "4:3")

    def test_video_size_enum(self):
        """Test VideoSize enum values"""
        self.assertEqual(VideoSize.SIZE_720P.value, "720P")
        self.assertEqual(VideoSize.SIZE_1080P.value, "1080P")


class TestPayloadFormat(unittest.TestCase):
    """Test payload format matches API expectations"""

    def test_simple_payload_format(self):
        """Test simple request payload format"""
        request = create_simple_video_request(
            model="jimeng-video-3.0",
            prompt="cat fish",
            aspect_ratio="16:9",
            size="1080P"
        )
        payload = request.to_dict()

        # Verify all required fields present
        self.assertIn("model", payload)
        self.assertIn("prompt", payload)
        self.assertIn("aspect_ratio", payload)
        self.assertIn("size", payload)
        self.assertIn("images", payload)

        # Verify correct values
        self.assertEqual(payload["model"], "jimeng-video-3.0")
        self.assertEqual(payload["prompt"], "cat fish")
        self.assertEqual(payload["aspect_ratio"], "16:9")
        self.assertEqual(payload["size"], "1080P")
        self.assertEqual(payload["images"], [])

    def test_payload_with_images_format(self):
        """Test payload format with images"""
        images = [
            "https://example.com/image1.jpg",
            "https://example.com/image2.jpg"
        ]
        request = create_video_with_images(
            model="jimeng-video-3.0",
            prompt="animate",
            image_urls=images,
            aspect_ratio="16:9",
            size="1080P"
        )
        payload = request.to_dict()

        self.assertEqual(payload["images"], images)
        self.assertEqual(len(payload["images"]), 2)

    def test_json_serialization(self):
        """Test JSON serialization produces valid JSON"""
        request = create_simple_video_request(
            model="jimeng-video-3.0",
            prompt="test"
        )
        json_str = request.to_json()

        # Should be valid JSON
        parsed = json.loads(json_str)
        self.assertIsInstance(parsed, dict)

        # Should have proper formatting
        self.assertIn("\n", json_str)  # Pretty printed


class TestEdgeCases(unittest.TestCase):
    """Test edge cases and boundary conditions"""

    def test_empty_images_list(self):
        """Test request with empty images list"""
        request = JimengVideoRequest(
            model="jimeng-video-3.0",
            prompt="test",
            images=[]
        )
        self.assertEqual(request.images, [])

    def test_long_prompt(self):
        """Test request with long prompt"""
        long_prompt = "a" * 1000
        request = JimengVideoRequest(
            model="jimeng-video-3.0",
            prompt=long_prompt
        )
        self.assertEqual(len(request.prompt), 1000)

    def test_special_characters_in_prompt(self):
        """Test prompt with special characters"""
        special_prompt = "Test with 特殊字符 and émojis 🎬"
        request = JimengVideoRequest(
            model="jimeng-video-3.0",
            prompt=special_prompt
        )
        self.assertEqual(request.prompt, special_prompt)

        # Should serialize correctly
        json_str = request.to_json()
        parsed = json.loads(json_str)
        self.assertEqual(parsed["prompt"], special_prompt)

    def test_multiple_validation_errors(self):
        """Test request with multiple validation errors"""
        client = JimengClient(api_token="test-token")

        # Missing model
        request = JimengVideoRequest(model="", prompt="test")
        is_valid, error = client.validate_request(request)
        self.assertFalse(is_valid)

        # Missing prompt
        request = JimengVideoRequest(model="jimeng-video-3.0", prompt="")
        is_valid, error = client.validate_request(request)
        self.assertFalse(is_valid)


def run_tests():
    """Run all tests and print results"""
    # Create test suite
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add all test classes
    suite.addTests(loader.loadTestsFromTestCase(TestJimengVideoRequest))
    suite.addTests(loader.loadTestsFromTestCase(TestJimengClient))
    suite.addTests(loader.loadTestsFromTestCase(TestHelperFunctions))
    suite.addTests(loader.loadTestsFromTestCase(TestEnums))
    suite.addTests(loader.loadTestsFromTestCase(TestPayloadFormat))
    suite.addTests(loader.loadTestsFromTestCase(TestEdgeCases))

    # Run tests
    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    # Print summary
    print("\n" + "=" * 70)
    print(f"Tests run: {result.testsRun}")
    print(f"Successes: {result.testsRun - len(result.failures) - len(result.errors)}")
    print(f"Failures: {len(result.failures)}")
    print(f"Errors: {len(result.errors)}")
    print("=" * 70)

    return result.wasSuccessful()


if __name__ == "__main__":
    success = run_tests()
    exit(0 if success else 1)
