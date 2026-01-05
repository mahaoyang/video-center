"""
Kling API Query Examples
Demonstrate how to query video generation status
"""

from kling import KlingClient, create_simple_video_request, wait_for_video_completion


# ============================================================================
# EXAMPLE 1: Simple Query
# ============================================================================
def example_simple_query():
    """Query video generation status by task ID"""

    client = KlingClient(api_token="your-api-token")

    # Query a specific task
    task_id = "827297867001249878"

    try:
        response = client.query_video(task_id)
        print(f"Status Code: {response['status_code']}")
        print(f"Response: {response['data']}")

        # Check status
        if response["status_code"] == 200:
            status = response["data"].get("status")
            print(f"\nTask Status: {status}")

            if status == "completed":
                video_url = response["data"].get("video_url")
                print(f"Video URL: {video_url}")
            elif status == "processing":
                progress = response["data"].get("progress", 0)
                print(f"Progress: {progress}%")
            elif status == "failed":
                error = response["data"].get("error")
                print(f"Error: {error}")

    except Exception as e:
        print(f"Query failed: {e}")


# ============================================================================
# EXAMPLE 2: Generate and Query
# ============================================================================
def example_generate_and_query():
    """Generate video and query its status"""

    client = KlingClient(api_token="your-api-token")

    # Step 1: Generate video
    request = create_simple_video_request(
        model_name="kling-v2-6",
        image_url="https://example.com/image.jpg",
        prompt="Beautiful sunset",
        duration="5"
    )

    print("Generating video...")
    # response = client.generate_video(request)  # Commented to avoid costs
    # task_id = response["data"]["task_id"]

    # For demo, use a fake task ID
    task_id = "fake-task-id-123"

    # Step 2: Query status
    print(f"\nQuerying task: {task_id}")
    try:
        result = client.query_video(task_id)
        print(f"Status: {result['data'].get('status')}")
    except Exception as e:
        print(f"Query error: {e}")


# ============================================================================
# EXAMPLE 3: Wait for Completion
# ============================================================================
def example_wait_for_completion():
    """Generate video and wait for completion"""

    client = KlingClient(api_token="your-api-token")

    # Generate video
    request = create_simple_video_request(
        model_name="kling-v2-6",
        image_url="https://example.com/image.jpg",
        prompt="Beautiful landscape",
        duration="5"
    )

    print("Generating video...")
    # response = client.generate_video(request)  # Commented to avoid costs
    # task_id = response["data"]["task_id"]

    # For demo
    task_id = "fake-task-id-456"

    # Wait for completion (with timeout)
    print(f"Waiting for task {task_id} to complete...")
    try:
        # result = wait_for_video_completion(
        #     client,
        #     task_id,
        #     max_wait_seconds=300,  # 5 minutes
        #     poll_interval=10       # Check every 10 seconds
        # )
        # print(f"Video completed: {result['data']['video_url']}")
        print("(Commented out to avoid actual API calls)")
    except TimeoutError:
        print("Video generation timed out")
    except Exception as e:
        print(f"Error: {e}")


# ============================================================================
# EXAMPLE 4: Poll with Custom Logic
# ============================================================================
def example_custom_polling():
    """Poll with custom logic and progress tracking"""

    import time

    client = KlingClient(api_token="your-api-token")
    task_id = "fake-task-id-789"

    max_attempts = 30
    poll_interval = 10

    print(f"Polling task {task_id}...")

    for attempt in range(max_attempts):
        try:
            response = client.query_video(task_id)

            if response["status_code"] != 200:
                print(f"Query failed: {response}")
                break

            status = response["data"].get("status")
            progress = response["data"].get("progress", 0)

            print(f"Attempt {attempt + 1}/{max_attempts}: {status} ({progress}%)")

            if status == "completed":
                video_url = response["data"].get("video_url")
                print(f"\n✓ Video ready: {video_url}")
                break
            elif status == "failed":
                error = response["data"].get("error")
                print(f"\n✗ Generation failed: {error}")
                break

            time.sleep(poll_interval)

        except Exception as e:
            print(f"Error: {e}")
            break
    else:
        print("\n✗ Timeout: Max attempts reached")


# ============================================================================
# EXAMPLE 5: Batch Query
# ============================================================================
def example_batch_query():
    """Query multiple tasks at once"""

    client = KlingClient(api_token="your-api-token")

    task_ids = [
        "task-id-1",
        "task-id-2",
        "task-id-3"
    ]

    print("Querying multiple tasks...")

    results = {}
    for task_id in task_ids:
        try:
            response = client.query_video(task_id)
            status = response["data"].get("status", "unknown")
            results[task_id] = status
            print(f"  {task_id}: {status}")
        except Exception as e:
            results[task_id] = f"error: {e}"
            print(f"  {task_id}: error")

    # Summary
    print("\nSummary:")
    completed = sum(1 for s in results.values() if s == "completed")
    processing = sum(1 for s in results.values() if s == "processing")
    failed = sum(1 for s in results.values() if "error" in str(s) or s == "failed")

    print(f"  Completed: {completed}")
    print(f"  Processing: {processing}")
    print(f"  Failed: {failed}")


# ============================================================================
# EXAMPLE 6: Query Response Structure
# ============================================================================
def example_response_structure():
    """Understand the query response structure"""

    print("Expected Query Response Structure:")
    print("""
    {
        "status_code": 200,
        "data": {
            "task_id": "827297867001249878",
            "status": "completed",  # or "processing", "failed"
            "progress": 100,        # 0-100
            "video_url": "https://...",  # if completed
            "thumbnail_url": "https://...",
            "duration": "5",
            "created_at": "2025-12-30T12:00:00Z",
            "completed_at": "2025-12-30T12:05:00Z",
            "error": "error message"  # if failed
        }
    }
    """)


# ============================================================================
# Main
# ============================================================================
if __name__ == "__main__":
    print("=" * 80)
    print("Kling API Query Examples")
    print("=" * 80)
    print("\nIMPORTANT: These are demonstration examples.")
    print("Actual API calls are commented out to avoid costs.\n")

    print("\n--- Example 1: Simple Query ---")
    example_simple_query()

    print("\n--- Example 2: Generate and Query ---")
    example_generate_and_query()

    print("\n--- Example 3: Wait for Completion ---")
    example_wait_for_completion()

    print("\n--- Example 4: Custom Polling ---")
    example_custom_polling()

    print("\n--- Example 5: Batch Query ---")
    example_batch_query()

    print("\n--- Example 6: Response Structure ---")
    example_response_structure()

    print("\n" + "=" * 80)
    print("Examples completed.")
    print("=" * 80)
