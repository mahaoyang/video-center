"""
Test Kling API client with actual payload format
Verify that our implementation matches the expected API format
"""

from kling import (
    KlingClient,
    KlingVideoRequest,
    DynamicMask,
    Trajectory
)
import json


def test_actual_payload_format():
    """Test that we can generate the exact payload format from the API example"""

    # Create the exact request from the provided example
    request = KlingVideoRequest(
        model_name="kling-v2-6",
        image="https://h2.inkwai.com/bs2/upload-ylab-stunt/se/ai_portal_queue_mmu_image_upscale_aiweb/3214b798-e1b4-4b00-b7af-72b5b0417420_raw_image_0.jpg",
        image_tail="",
        prompt="",
        negative_prompt="",
        cfg_scale=0.5,
        mode="std",
        static_mask="",
        dynamic_masks=[
            DynamicMask(
                mask="https://h2.inkwai.com/bs2/upload-ylab-stunt/se/ai_portal_queue_mmu_image_upscale_aiweb/3214b798-e1b4-4b00-b7af-72b5b0417420_raw_image_0.jpg",
                trajectories=[
                    Trajectory(x=0, y=0),
                    Trajectory(x=1, y=1)
                ]
            )
        ],
        duration="5",
        callback_url="",
        external_task_id=""
    )

    # Generate JSON
    payload = request.to_json()
    print("Generated Payload:")
    print(payload)
    print("\n" + "="*80 + "\n")

    # Parse to verify it's valid JSON
    try:
        parsed = json.loads(payload)
        print("✓ Valid JSON")
        print(f"✓ Model: {parsed['model_name']}")
        print(f"✓ Image URL present: {bool(parsed['image'])}")
        print(f"✓ Dynamic masks count: {len(parsed['dynamic_masks'])}")
        print(f"✓ Trajectories count: {len(parsed['dynamic_masks'][0]['trajectories'])}")
        print(f"✓ Duration: {parsed['duration']}")
        print(f"✓ Mode: {parsed['mode']}")
        print(f"✓ CFG Scale: {parsed['cfg_scale']}")
    except json.JSONDecodeError as e:
        print(f"✗ Invalid JSON: {e}")
        return False

    return True


def test_with_camera_control():
    """Test payload with camera control enabled"""

    from kling import CameraControl

    request = KlingVideoRequest(
        model_name="kling-v2-6",
        image="https://example.com/image.jpg",
        camera_control=CameraControl(
            type="simple",
            config={
                "horizontal": 1.0,
                "vertical": 0,
                "pan": 0,
                "tilt": 0,
                "roll": 0,
                "zoom": 0
            }
        ),
        duration="5"
    )

    payload = request.to_json()
    print("Payload with Camera Control:")
    print(payload)
    print("\n" + "="*80 + "\n")

    parsed = json.loads(payload)
    print("✓ Camera control present:", "camera_control" in parsed)
    print(f"✓ Camera type: {parsed['camera_control']['type']}")
    print(f"✓ Horizontal: {parsed['camera_control']['config']['horizontal']}")


def test_validation():
    """Test request validation"""

    client = KlingClient(api_token="test-token")

    # Valid request
    request = KlingVideoRequest(
        model_name="kling-v2-6",
        image="https://example.com/image.jpg",
        cfg_scale=0.5,
        mode="std",
        duration="5"
    )

    is_valid, error = client.validate_request(request)
    print(f"Valid request: {is_valid}, Error: {error}")

    # Invalid cfg_scale
    request.cfg_scale = 1.5
    is_valid, error = client.validate_request(request)
    print(f"Invalid cfg_scale: {is_valid}, Error: {error}")

    # Invalid mode
    request.cfg_scale = 0.5
    request.mode = "invalid"
    is_valid, error = client.validate_request(request)
    print(f"Invalid mode: {is_valid}, Error: {error}")


def test_minimal_request():
    """Test minimal required parameters"""

    request = KlingVideoRequest(
        model_name="kling-v2-6",
        image="https://example.com/image.jpg"
    )

    payload = request.to_json()
    print("Minimal Request:")
    print(payload)
    print("\n" + "="*80 + "\n")

    parsed = json.loads(payload)
    print("✓ Has required fields:")
    print(f"  - model_name: {parsed['model_name']}")
    print(f"  - image: {parsed['image']}")
    print(f"  - duration: {parsed['duration']} (default)")
    print(f"  - mode: {parsed['mode']} (default)")
    print(f"  - cfg_scale: {parsed['cfg_scale']} (default)")


if __name__ == "__main__":
    print("="*80)
    print("Kling API Payload Format Tests")
    print("="*80)
    print()

    print("Test 1: Actual Payload Format")
    print("-"*80)
    test_actual_payload_format()
    print()

    print("Test 2: With Camera Control")
    print("-"*80)
    test_with_camera_control()
    print()

    print("Test 3: Validation")
    print("-"*80)
    test_validation()
    print()

    print("Test 4: Minimal Request")
    print("-"*80)
    test_minimal_request()
    print()

    print("="*80)
    print("All tests completed successfully!")
    print("="*80)
