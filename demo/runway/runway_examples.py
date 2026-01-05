"""
Runway API Usage Examples

Examples of using the Runway Gen4 video generation API.
Demonstrates 5-second and 10-second video generation.

IMPORTANT: These are dry-run examples.
Actual API calls are commented out to avoid costs.
"""

from runway import (
    RunwayClient,
    create_simple_video_request,
    create_video_5s,
    create_video_10s
)


# ============================================================================
# EXAMPLE 1: Simple 5-Second Video
# ============================================================================
def example_simple_5s():
    """Generate a simple 5-second video"""

    client = RunwayClient(api_token="your-api-token")

    request = create_simple_video_request(
        image_url="https://example.com/image.jpg",
        model="runwayml-gen4_turbo-5",
        prompt_text="cat dance",
        duration=5
    )

    print("Example 1: Simple 5-second video")
    print("Request payload:")
    print(request.to_json())
    print()

    # In actual usage (COSTS MONEY - commented out):
    # response = client.generate_video(request)
    # print(f"Status: {response['status_code']}")
    # print(f"Response: {response['data']}")


# ============================================================================
# EXAMPLE 2: Simple 10-Second Video
# ============================================================================
def example_simple_10s():
    """Generate a simple 10-second video"""

    client = RunwayClient(api_token="your-api-token")

    request = create_simple_video_request(
        image_url="https://example.com/image.jpg",
        model="runwayml-gen4_turbo-10",
        prompt_text="waves crashing on beach",
        duration=10
    )

    print("Example 2: Simple 10-second video")
    print("Request payload:")
    print(request.to_json())
    print()


# ============================================================================
# EXAMPLE 3: Using Helper Functions
# ============================================================================
def example_helper_functions():
    """Use helper functions for quick video creation"""

    client = RunwayClient(api_token="your-api-token")

    print("Example 3: Helper functions")
    print()

    # 5-second video
    request_5s = create_video_5s(
        image_url="https://example.com/image.jpg",
        prompt_text="sunset timelapse"
    )
    print("5-second video:")
    print(request_5s.to_json())
    print()

    # 10-second video
    request_10s = create_video_10s(
        image_url="https://example.com/image.jpg",
        prompt_text="clouds moving"
    )
    print("10-second video:")
    print(request_10s.to_json())
    print()


# ============================================================================
# EXAMPLE 4: Different Aspect Ratios
# ============================================================================
def example_aspect_ratios():
    """Test different aspect ratios"""

    client = RunwayClient(api_token="your-api-token")

    ratios = [
        "1280:768",   # Default
        "1920:1080",  # Full HD
        "768:1280",   # Portrait
        "1024:1024"   # Square
    ]

    print("Example 4: Different aspect ratios")
    print()

    for ratio in ratios:
        request = create_video_5s(
            image_url="https://example.com/image.jpg",
            prompt_text="beautiful landscape",
            ratio=ratio
        )
        print(f"Ratio: {ratio}")
        print(request.to_json())
        print()


# ============================================================================
# EXAMPLE 5: With and Without Watermark
# ============================================================================
def example_watermark():
    """Test watermark options"""

    from runway import RunwayVideoRequest

    print("Example 5: Watermark options")
    print()

    # Without watermark (default)
    request_no_watermark = RunwayVideoRequest(
        promptImage="https://example.com/image.jpg",
        model="runwayml-gen4_turbo-5",
        promptText="cat playing",
        watermark=False,
        duration=5
    )
    print("Without watermark:")
    print(request_no_watermark.to_json())
    print()

    # With watermark
    request_with_watermark = RunwayVideoRequest(
        promptImage="https://example.com/image.jpg",
        model="runwayml-gen4_turbo-5",
        promptText="cat playing",
        watermark=True,
        duration=5
    )
    print("With watermark:")
    print(request_with_watermark.to_json())
    print()


# ============================================================================
# EXAMPLE 6: Validation Before Sending
# ============================================================================
def example_validation():
    """Validate requests before sending"""

    client = RunwayClient(api_token="your-api-token")

    print("Example 6: Request validation")
    print()

    # Valid request
    valid_request = create_video_5s(
        image_url="https://example.com/image.jpg",
        prompt_text="cat dance"
    )
    is_valid, error = client.validate_request(valid_request)
    print(f"Valid request: {is_valid}")
    if error:
        print(f"Error: {error}")
    print()

    # Invalid: wrong duration for model
    from runway import RunwayVideoRequest
    invalid_request = RunwayVideoRequest(
        promptImage="https://example.com/image.jpg",
        model="runwayml-gen4_turbo-5",
        duration=10  # Wrong! Should be 5
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
    print("Runway Gen4 API Usage Examples")
    print("=" * 80)
    print("\nIMPORTANT: These are dry-run examples.")
    print("Actual API calls are commented out to avoid costs.\n")

    example_simple_5s()
    example_simple_10s()
    example_helper_functions()
    example_aspect_ratios()
    example_watermark()
    example_validation()

    print("=" * 80)
    print("Examples completed. No actual API calls were made.")
    print("=" * 80)
