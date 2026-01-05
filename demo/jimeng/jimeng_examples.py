"""
Jimeng API Usage Examples

IMPORTANT: These examples are for reference only.
DO NOT run them without proper API token and understanding of costs.
Each API call has associated costs.
"""

from jimeng import (
    JimengClient,
    JimengVideoRequest,
    create_simple_video_request,
    create_video_with_images
)


# ============================================================================
# EXAMPLE 1: Simple Video Generation
# ============================================================================
def example_simple_video():
    """Generate a simple video from text prompt"""

    # Initialize client
    client = JimengClient(api_token="your-api-token")

    # Create request
    request = create_simple_video_request(
        model="jimeng-video-3.0",
        prompt="cat fish",
        aspect_ratio="16:9",
        size="1080P"
    )

    # Validate
    is_valid, error = client.validate_request(request)
    if not is_valid:
        print(f"Invalid request: {error}")
        return

    # Preview payload
    print("Request payload:")
    print(request.to_json())

    # Send request (COSTS MONEY - commented out)
    # response = client.generate_video(request)
    # print(response)


# ============================================================================
# EXAMPLE 2: Different Aspect Ratios
# ============================================================================
def example_aspect_ratios():
    """Generate videos with different aspect ratios"""

    client = JimengClient(api_token="your-api-token")

    ratios = ["16:9", "9:16", "1:1", "4:3"]

    for ratio in ratios:
        request = create_simple_video_request(
            model="jimeng-video-3.0",
            prompt="beautiful landscape",
            aspect_ratio=ratio,
            size="1080P"
        )

        print(f"\nAspect Ratio: {ratio}")
        print(request.to_json())


# ============================================================================
# EXAMPLE 3: With Reference Images
# ============================================================================
def example_with_images():
    """Generate video with reference images"""

    client = JimengClient(api_token="your-api-token")

    # Reference images
    image_urls = [
        "https://example.com/image1.jpg",
        "https://example.com/image2.jpg"
    ]

    request = create_video_with_images(
        model="jimeng-video-3.0",
        prompt="animate these images with smooth transitions",
        image_urls=image_urls,
        aspect_ratio="16:9",
        size="1080P"
    )

    print("Request with images:")
    print(request.to_json())


# ============================================================================
# EXAMPLE 4: Different Resolutions
# ============================================================================
def example_resolutions():
    """Generate videos with different resolutions"""

    client = JimengClient(api_token="your-api-token")

    sizes = ["720P", "1080P"]

    for size in sizes:
        request = create_simple_video_request(
            model="jimeng-video-3.0",
            prompt="sunset over ocean",
            aspect_ratio="16:9",
            size=size
        )

        print(f"\nResolution: {size}")
        print(request.to_json())


# ============================================================================
# EXAMPLE 5: Validation
# ============================================================================
def example_validation():
    """Test request validation"""

    client = JimengClient(api_token="your-api-token")

    # Valid request
    request = JimengVideoRequest(
        model="jimeng-video-3.0",
        prompt="cat playing",
        aspect_ratio="16:9",
        size="1080P"
    )

    is_valid, error = client.validate_request(request)
    print(f"Valid request: {is_valid}, Error: {error}")

    # Invalid aspect ratio
    request.aspect_ratio = "21:9"
    is_valid, error = client.validate_request(request)
    print(f"Invalid aspect ratio: {is_valid}, Error: {error}")

    # Invalid size
    request.aspect_ratio = "16:9"
    request.size = "4K"
    is_valid, error = client.validate_request(request)
    print(f"Invalid size: {is_valid}, Error: {error}")


# ============================================================================
# EXAMPLE 6: Batch Processing
# ============================================================================
def example_batch_processing():
    """Prepare multiple video generation requests"""

    client = JimengClient(api_token="your-api-token")

    prompts = [
        "cat playing with yarn",
        "dog running in park",
        "bird flying in sky"
    ]

    requests = []
    for prompt in prompts:
        request = create_simple_video_request(
            model="jimeng-video-3.0",
            prompt=prompt,
            aspect_ratio="16:9",
            size="1080P"
        )

        is_valid, error = client.validate_request(request)
        if is_valid:
            requests.append(request)
            print(f"✓ Valid: {prompt}")
        else:
            print(f"✗ Invalid: {error}")

    print(f"\nTotal valid requests: {len(requests)}")


# ============================================================================
# Main
# ============================================================================
if __name__ == "__main__":
    print("=" * 80)
    print("Jimeng API Usage Examples")
    print("=" * 80)
    print("\nIMPORTANT: These are dry-run examples.")
    print("Actual API calls are commented out to avoid costs.\n")

    print("\n--- Example 1: Simple Video ---")
    example_simple_video()

    print("\n--- Example 2: Aspect Ratios ---")
    example_aspect_ratios()

    print("\n--- Example 3: With Images ---")
    example_with_images()

    print("\n--- Example 4: Resolutions ---")
    example_resolutions()

    print("\n--- Example 5: Validation ---")
    example_validation()

    print("\n--- Example 6: Batch Processing ---")
    example_batch_processing()

    print("\n" + "=" * 80)
    print("Examples completed. No actual API calls were made.")
    print("=" * 80)
