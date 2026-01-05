"""
Sora API Usage Examples

Examples of using the Sora video generation API.
Demonstrates text-to-video, image-to-video, and character reference.

IMPORTANT: These are dry-run examples.
Actual API calls are commented out to avoid costs.
"""

from sora import (
    SoraClient,
    create_simple_video_request,
    create_video_with_images,
    create_video_with_character,
    create_private_video
)


# ============================================================================
# EXAMPLE 1: Simple Text-to-Video
# ============================================================================
def example_simple_text_to_video():
    """Generate video from text prompt"""

    client = SoraClient(api_token="your-api-token")

    request = create_simple_video_request(
        model="sora-2",
        prompt="cat dance",
        orientation="portrait",
        duration=15
    )

    print("Example 1: Simple text-to-video")
    print("Request payload:")
    print(request.to_json())
    print()

    # In actual usage (COSTS MONEY - commented out):
    # response = client.generate_video(request)
    # print(f"Status: {response['status_code']}")
    # print(f"Response: {response['data']}")


# ============================================================================
# EXAMPLE 2: Video with Reference Images
# ============================================================================
def example_with_images():
    """Generate video with reference images"""

    client = SoraClient(api_token="your-api-token")

    request = create_video_with_images(
        model="sora-2",
        prompt="make animate",
        image_urls=[
            "https://filesystem.site/cdn/20250612/998IGmUiM2koBGZM3UnZeImbPBNIUL.png"
        ],
        orientation="portrait",
        duration=15
    )

    print("Example 2: Video with reference images")
    print("Request payload:")
    print(request.to_json())
    print()


# ============================================================================
# EXAMPLE 3: Video with Character Reference
# ============================================================================
def example_with_character():
    """Generate video with character reference"""

    client = SoraClient(api_token="your-api-token")

    request = create_video_with_character(
        model="sora-2",
        prompt="make animate",
        character_url="https://filesystem.site/cdn/20251030/javYrU4etHVFDqg8by7mViTWHlMOZy.mp4",
        character_timestamps="1,3",
        orientation="portrait",
        duration=15
    )

    print("Example 3: Video with character reference")
    print("Request payload:")
    print(request.to_json())
    print()


# ============================================================================
# EXAMPLE 4: Private Video (Pro Model)
# ============================================================================
def example_private_video():
    """Generate private video using sora-2-pro"""

    client = SoraClient(api_token="your-api-token")

    request = create_private_video(
        prompt="make animate",
        orientation="portrait",
        duration=15
    )

    print("Example 4: Private video (sora-2-pro)")
    print("Request payload:")
    print(request.to_json())
    print()


# ============================================================================
# EXAMPLE 5: Different Orientations
# ============================================================================
def example_orientations():
    """Test different video orientations"""

    from sora import SoraVideoRequest

    orientations = ["portrait", "landscape", "square"]

    print("Example 5: Different orientations")
    print()

    for orientation in orientations:
        request = SoraVideoRequest(
            model="sora-2",
            prompt="beautiful landscape",
            orientation=orientation,
            duration=15
        )
        print(f"Orientation: {orientation}")
        print(request.to_json())
        print()


# ============================================================================
# EXAMPLE 6: Different Sizes
# ============================================================================
def example_sizes():
    """Test different video sizes"""

    from sora import SoraVideoRequest

    sizes = ["small", "medium", "large"]

    print("Example 6: Different sizes")
    print()

    for size in sizes:
        request = SoraVideoRequest(
            model="sora-2",
            prompt="cat playing",
            size=size,
            duration=15
        )
        print(f"Size: {size}")
        print(request.to_json())
        print()


# ============================================================================
# EXAMPLE 7: With and Without Watermark
# ============================================================================
def example_watermark():
    """Test watermark options"""

    from sora import SoraVideoRequest

    print("Example 7: Watermark options")
    print()

    # Without watermark (default)
    request_no_watermark = SoraVideoRequest(
        model="sora-2",
        prompt="cat dance",
        watermark=False,
        duration=15
    )
    print("Without watermark:")
    print(request_no_watermark.to_json())
    print()

    # With watermark
    request_with_watermark = SoraVideoRequest(
        model="sora-2",
        prompt="cat dance",
        watermark=True,
        duration=15
    )
    print("With watermark:")
    print(request_with_watermark.to_json())
    print()


# ============================================================================
# EXAMPLE 8: Validation
# ============================================================================
def example_validation():
    """Validate requests before sending"""

    client = SoraClient(api_token="your-api-token")

    print("Example 8: Request validation")
    print()

    # Valid request
    valid_request = create_simple_video_request(
        model="sora-2",
        prompt="cat dance"
    )
    is_valid, error = client.validate_request(valid_request)
    print(f"Valid request: {is_valid}")
    if error:
        print(f"Error: {error}")
    print()

    # Invalid: private with non-pro model
    from sora import SoraVideoRequest
    invalid_request = SoraVideoRequest(
        model="sora-2",
        prompt="test",
        private=True  # Only for sora-2-pro
    )
    is_valid, error = client.validate_request(invalid_request)
    print(f"Invalid request: {is_valid}")
    print(f"Error: {error}")
    print()


# ============================================================================
# Main
# ============================================================================
if __name__ == "__main__":
    print("=" * 80)
    print("Sora API Usage Examples")
    print("=" * 80)
    print("\nIMPORTANT: These are dry-run examples.")
    print("Actual API calls are commented out to avoid costs.\n")

    example_simple_text_to_video()
    example_with_images()
    example_with_character()
    example_private_video()
    example_orientations()
    example_sizes()
    example_watermark()
    example_validation()

    print("=" * 80)
    print("Examples completed. No actual API calls were made.")
    print("=" * 80)
