"""
Kling API Usage Examples

IMPORTANT: These examples are for reference only.
DO NOT run them without proper API token and understanding of costs.
Each API call has associated costs.
"""

from kling import (
    KlingClient,
    KlingVideoRequest,
    create_simple_video_request,
    create_video_with_camera_control,
    create_video_with_dynamic_mask
)

# ============================================================================
# EXAMPLE 1: Simple Video Generation
# ============================================================================
def example_simple_video():
    """Generate a simple video from an image"""

    # Initialize client with your API token
    client = KlingClient(api_token="your-api-token-here")

    # Create a simple request
    request = create_simple_video_request(
        model_name="kling-v2-6",
        image_url="https://example.com/your-image.jpg",
        prompt="A beautiful sunset scene with gentle movement",
        duration="5",
        mode="std"
    )

    # Validate before sending (recommended)
    is_valid, error = client.validate_request(request)
    if not is_valid:
        print(f"Invalid request: {error}")
        return

    # Send request (COSTS MONEY - commented out)
    # response = client.generate_video(request)
    # print(response)

    # Preview the request payload
    print("Request payload:")
    print(request.to_json())


# ============================================================================
# EXAMPLE 2: Video with Camera Movement
# ============================================================================
def example_camera_control():
    """Generate video with camera movement"""

    client = KlingClient(api_token="your-api-token-here")

    # Create request with camera controls
    request = create_video_with_camera_control(
        model_name="kling-v2-6",
        image_url="https://example.com/your-image.jpg",
        horizontal=1.0,   # Move right
        vertical=0.0,     # No vertical movement
        zoom=0.5,         # Slight zoom in
        duration="5"
    )

    print("Camera control request:")
    print(request.to_json())


# ============================================================================
# EXAMPLE 3: Advanced Configuration
# ============================================================================
def example_advanced_config():
    """Generate video with advanced configuration"""

    client = KlingClient(api_token="your-api-token-here")

    # Create detailed request
    request = KlingVideoRequest(
        model_name="kling-v2-6",
        image="https://example.com/your-image.jpg",
        prompt="Cinematic camera movement through a forest",
        negative_prompt="blurry, low quality, distorted",
        cfg_scale=0.7,
        mode="pro",  # Use pro mode for better quality
        duration="10"
    )

    is_valid, error = client.validate_request(request)
    print(f"Valid: {is_valid}")
    if error:
        print(f"Error: {error}")

    print("\nAdvanced request:")
    print(request.to_json())


# ============================================================================
# EXAMPLE 4: Dynamic Mask Animation
# ============================================================================
def example_dynamic_mask():
    """Generate video with animated mask"""

    client = KlingClient(api_token="your-api-token-here")

    # Define mask movement trajectory
    trajectories = [
        (0.0, 0.0),  # Start position
        (0.5, 0.5),  # Middle position
        (1.0, 1.0)   # End position
    ]

    request = create_video_with_dynamic_mask(
        model_name="kling-v2-6",
        image_url="https://example.com/your-image.jpg",
        mask_url="https://example.com/your-mask.jpg",
        trajectories=trajectories,
        duration="5"
    )

    print("Dynamic mask request:")
    print(request.to_json())


# ============================================================================
# EXAMPLE 5: Batch Processing (Dry Run)
# ============================================================================
def example_batch_processing():
    """Prepare multiple video generation requests"""

    client = KlingClient(api_token="your-api-token-here")

    images = [
        "https://example.com/image1.jpg",
        "https://example.com/image2.jpg",
        "https://example.com/image3.jpg"
    ]

    prompts = [
        "Gentle wind blowing through trees",
        "Waves crashing on the shore",
        "Clouds moving across the sky"
    ]

    requests = []
    for image, prompt in zip(images, prompts):
        request = create_simple_video_request(
            model_name="kling-v2-6",
            image_url=image,
            prompt=prompt,
            duration="5"
        )

        # Validate each request
        is_valid, error = client.validate_request(request)
        if is_valid:
            requests.append(request)
            print(f"✓ Valid request for: {prompt}")
        else:
            print(f"✗ Invalid request: {error}")

    print(f"\nTotal valid requests: {len(requests)}")
    print("Ready to process (but not executing to avoid costs)")


# ============================================================================
# EXAMPLE 6: Error Handling
# ============================================================================
def example_error_handling():
    """Demonstrate proper error handling"""

    client = KlingClient(api_token="your-api-token-here")

    # Invalid request (missing required field)
    try:
        request = KlingVideoRequest(
            model_name="",  # Empty model name
            image="https://example.com/image.jpg"
        )

        is_valid, error = client.validate_request(request)
        if not is_valid:
            print(f"Validation failed: {error}")

    except Exception as e:
        print(f"Error creating request: {e}")

    # Invalid cfg_scale
    request = KlingVideoRequest(
        model_name="kling-v2-6",
        image="https://example.com/image.jpg",
        cfg_scale=1.5  # Out of range
    )

    is_valid, error = client.validate_request(request)
    print(f"Valid: {is_valid}, Error: {error}")


# ============================================================================
# EXAMPLE 7: Request Inspection
# ============================================================================
def example_inspect_request():
    """Inspect request before sending"""

    request = create_simple_video_request(
        model_name="kling-v2-6",
        image_url="https://example.com/image.jpg",
        prompt="Beautiful landscape",
        duration="5"
    )

    # Get request as dictionary
    request_dict = request.to_dict()

    print("Request parameters:")
    for key, value in request_dict.items():
        if value:  # Only show non-empty values
            print(f"  {key}: {value}")


# ============================================================================
# Main - Run Examples
# ============================================================================
if __name__ == "__main__":
    print("=" * 80)
    print("Kling API Usage Examples")
    print("=" * 80)
    print("\nIMPORTANT: These are dry-run examples.")
    print("Actual API calls are commented out to avoid costs.\n")

    print("\n--- Example 1: Simple Video ---")
    example_simple_video()

    print("\n--- Example 2: Camera Control ---")
    example_camera_control()

    print("\n--- Example 3: Advanced Config ---")
    example_advanced_config()

    print("\n--- Example 4: Dynamic Mask ---")
    example_dynamic_mask()

    print("\n--- Example 5: Batch Processing ---")
    example_batch_processing()

    print("\n--- Example 6: Error Handling ---")
    example_error_handling()

    print("\n--- Example 7: Request Inspection ---")
    example_inspect_request()

    print("\n" + "=" * 80)
    print("Examples completed. No actual API calls were made.")
    print("=" * 80)
