"""
Runway Video Query Examples

Examples of querying video generation status.
Demonstrates how to check video status and wait for completion.

IMPORTANT: These examples are for reference only.
Actual API calls require valid token and task ID.
"""

from runway import (
    RunwayClient,
    wait_for_video_completion
)


# ============================================================================
# EXAMPLE 1: Simple Query
# ============================================================================
def example_simple_query():
    """Query video status by task ID"""

    client = RunwayClient(api_token="your-api-token")

    # Task ID from generate_video response
    task_id = "2f19d8a7-3b74-4fc4-af42-d0bcadbaec54"

    print("Querying video status...")
    print(f"Task ID: {task_id}")
    print(f"Query URL: https://yunwu.ai/runwayml/v1/tasks/{task_id}")

    # In dry-run mode, we show the request format
    # response = client.query_video(task_id)
    # print(f"Status: {response['data']['status']}")
    # print(f"URL: {response['data']['video_url']}")


# ============================================================================
# EXAMPLE 2: Query Multiple Tasks
# ============================================================================
def example_multiple_queries():
    """Query multiple video tasks"""

    client = RunwayClient(api_token="your-api-token")

    task_ids = [
        "2f19d8a7-3b74-4fc4-af42-d0bcadbaec54",
        "a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6",
        "x7y8z9a0-b1c2-43d4-e5f6-g7h8i9j0k1l2"
    ]

    print("Querying multiple tasks...")
    for task_id in task_ids:
        print(f"\n--- Task: {task_id} ---")
        print(f"Query URL: https://yunwu.ai/runwayml/v1/tasks/{task_id}")

        # In dry-run mode:
        # response = client.query_video(task_id)
        # status = response["data"]["status"]
        # print(f"Status: {status}")


# ============================================================================
# EXAMPLE 3: Query Status Checking
# ============================================================================
def example_query_status():
    """Show different status values"""

    client = RunwayClient(api_token="your-api-token")
    task_id = "2f19d8a7-3b74-4fc4-af42-d0bcadbaec54"

    print("Video status can be:")
    print("- 'processing': Video is being generated")
    print("- 'completed': Video is ready")
    print("- 'failed': Generation failed")
    print()

    # Example response format (dry-run):
    example_response = {
        "status_code": 200,
        "data": {
            "id": task_id,
            "status": "processing",
            "progress": 45,
            "created_at": "2025-12-30T10:00:00Z",
            "updated_at": "2025-12-30T10:05:00Z"
        }
    }

    print("Example processing response:")
    print(f"  Status: {example_response['data']['status']}")
    print(f"  Progress: {example_response['data']['progress']}%")

    # Completed response would look like:
    completed_response = {
        "status_code": 200,
        "data": {
            "id": task_id,
            "status": "completed",
            "progress": 100,
            "video_url": "https://example.com/video.mp4",
            "created_at": "2025-12-30T10:00:00Z",
            "completed_at": "2025-12-30T10:15:00Z"
        }
    }

    print("\nExample completed response:")
    print(f"  Status: {completed_response['data']['status']}")
    print(f"  Progress: {completed_response['data']['progress']}%")
    print(f"  Video URL: {completed_response['data']['video_url']}")


# ============================================================================
# EXAMPLE 4: Wait for Completion
# ============================================================================
def example_wait_for_completion():
    """Use wait_for_video_completion helper"""

    client = RunwayClient(api_token="your-api-token")
    task_id = "2f19d8a7-3b74-4fc4-af42-d0bcadbaec54"

    print("Waiting for video completion...")
    print(f"Task ID: {task_id}")
    print("Timeout: 600 seconds (10 minutes)")
    print("Poll interval: 10 seconds")
    print()

    # In actual usage (COSTS MONEY - commented out):
    # try:
    #     result = wait_for_video_completion(
    #         client,
    #         task_id,
    #         timeout=600,      # Wait up to 10 minutes
    #         poll_interval=10   # Check every 10 seconds
    #     )
    #     print(f"Video ready: {result['data']['video_url']}")
    # except TimeoutError:
    #     print("Video generation timed out")
    # except Exception as e:
    #     print(f"Error: {e}")

    print("Note: Actual polling would happen every 10 seconds")
    print("until video is 'completed' or 'failed'")


# ============================================================================
# EXAMPLE 5: Query with Custom Timeout
# ============================================================================
def example_custom_timeout():
    """Configure custom timeout for waiting"""

    client = RunwayClient(api_token="your-api-token")
    task_id = "2f19d8a7-3b74-4fc4-af42-d0bcadbaec54"

    print("Custom timeout configurations:")
    print()

    # Quick check (timeout: 30 seconds)
    print("1. Quick check (30 seconds):")
    print(f"   timeout=30, poll_interval=5")
    # result = wait_for_video_completion(client, task_id, timeout=30, poll_interval=5)

    print()

    # Standard wait (timeout: 10 minutes)
    print("2. Standard wait (10 minutes):")
    print(f"   timeout=600, poll_interval=10")
    # result = wait_for_video_completion(client, task_id, timeout=600, poll_interval=10)

    print()

    # Long wait (timeout: 30 minutes)
    print("3. Long wait (30 minutes):")
    print(f"   timeout=1800, poll_interval=30")
    # result = wait_for_video_completion(client, task_id, timeout=1800, poll_interval=30)


# ============================================================================
# EXAMPLE 6: Batch Query
# ============================================================================
def example_batch_query():
    """Query multiple tasks and collect results"""

    client = RunwayClient(api_token="your-api-token")

    task_ids = [
        "2f19d8a7-3b74-4fc4-af42-d0bcadbaec54",
        "a1b2c3d4-e5f6-47g8-h9i0-j1k2l3m4n5o6",
        "x7y8z9a0-b1c2-43d4-e5f6-g7h8i9j0k1l2"
    ]

    print("Batch query example:")
    print(f"Querying {len(task_ids)} tasks")
    print()

    results = {
        "completed": [],
        "processing": [],
        "failed": []
    }

    # In actual usage (dry-run format):
    for task_id in task_ids:
        print(f"Querying: {task_id}")
        # response = client.query_video(task_id)
        # status = response["data"]["status"]
        #
        # if status == "completed":
        #     results["completed"].append({
        #         "id": task_id,
        #         "url": response["data"]["video_url"]
        #     })
        # elif status == "processing":
        #     results["processing"].append(task_id)
        # elif status == "failed":
        #     results["failed"].append(task_id)

    print()
    print("Results summary:")
    print(f"  Completed: {len(results['completed'])}")
    print(f"  Processing: {len(results['processing'])}")
    print(f"  Failed: {len(results['failed'])}")


# ============================================================================
# Main
# ============================================================================
if __name__ == "__main__":
    print("=" * 80)
    print("Runway Video Query Examples")
    print("=" * 80)
    print("\nIMPORTANT: These are dry-run examples.")
    print("Actual API calls are commented out to avoid costs.\n")

    print("\n--- Example 1: Simple Query ---")
    example_simple_query()

    print("\n--- Example 2: Multiple Queries ---")
    example_multiple_queries()

    print("\n--- Example 3: Query Status ---")
    example_query_status()

    print("\n--- Example 4: Wait for Completion ---")
    example_wait_for_completion()

    print("\n--- Example 5: Custom Timeout ---")
    example_custom_timeout()

    print("\n--- Example 6: Batch Query ---")
    example_batch_query()

    print("\n" + "=" * 80)
    print("Examples completed. No actual API calls were made.")
    print("=" * 80)
