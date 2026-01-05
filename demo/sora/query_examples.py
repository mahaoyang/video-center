"""
Sora Video Query Examples

Examples of querying video generation status.
Demonstrates status checking and polling.

IMPORTANT: These are dry-run examples.
Actual API calls are commented out to avoid costs.
"""

from sora import SoraClient, wait_for_video_completion


# ============================================================================
# EXAMPLE 1: Simple Query
# ============================================================================
def example_simple_query():
    """Query video status by ID"""

    client = SoraClient(api_token="your-api-token")

    video_id = "sora-2:task_01kbfq03gpe0wr9ge11z09xqrj"

    print("Example 1: Simple query")
    print(f"Querying video: {video_id}")
    print()

    # In actual usage (COSTS MONEY - commented out):
    # response = client.query_video(video_id)
    # print(f"Status: {response['data']['status']}")
    # if response['data']['status'] == 'completed':
    #     print(f"Video URL: {response['data']['video_url']}")


# ============================================================================
# EXAMPLE 2: Multiple Queries
# ============================================================================
def example_multiple_queries():
    """Query multiple videos"""

    client = SoraClient(api_token="your-api-token")

    video_ids = [
        "sora-2:task_01kbfq03gpe0wr9ge11z09xqrj",
        "sora-2-pro:task_01kbfq03gpe0wr9ge11z09xqrk"
    ]

    print("Example 2: Multiple queries")
    print()

    for video_id in video_ids:
        print(f"Querying: {video_id}")
        # response = client.query_video(video_id)
        # print(f"Status: {response['data']['status']}")
        print()


# ============================================================================
# EXAMPLE 3: Status Checking
# ============================================================================
def example_status_checking():
    """Check different status values"""

    client = SoraClient(api_token="your-api-token")

    video_id = "sora-2:task_01kbfq03gpe0wr9ge11z09xqrj"

    print("Example 3: Status checking")
    print()

    # In actual usage:
    # response = client.query_video(video_id)
    # status = response['data']['status']
    #
    # if status == 'processing':
    #     print("Video is still processing...")
    # elif status == 'completed':
    #     print(f"Video completed: {response['data']['video_url']}")
    # elif status == 'failed':
    #     print(f"Video failed: {response['data'].get('error', 'Unknown error')}")


# ============================================================================
# EXAMPLE 4: Wait for Completion
# ============================================================================
def example_wait_for_completion():
    """Wait for video to complete"""

    client = SoraClient(api_token="your-api-token")

    video_id = "sora-2:task_01kbfq03gpe0wr9ge11z09xqrj"

    print("Example 4: Wait for completion")
    print(f"Waiting for video: {video_id}")
    print()

    # In actual usage:
    # try:
    #     result = wait_for_video_completion(
    #         client,
    #         video_id,
    #         timeout=600,      # 10 minutes
    #         poll_interval=10   # Check every 10 seconds
    #     )
    #     print(f"✓ Video completed: {result['data']['video_url']}")
    # except TimeoutError:
    #     print("✗ Video generation timed out")
    # except Exception as e:
    #     print(f"✗ Error: {e}")


# ============================================================================
# EXAMPLE 5: Custom Timeout
# ============================================================================
def example_custom_timeout():
    """Use custom timeout and poll interval"""

    client = SoraClient(api_token="your-api-token")

    video_id = "sora-2:task_01kbfq03gpe0wr9ge11z09xqrj"

    print("Example 5: Custom timeout")
    print()

    # In actual usage:
    # result = wait_for_video_completion(
    #     client,
    #     video_id,
    #     timeout=300,       # 5 minutes
    #     poll_interval=5    # Check every 5 seconds
    # )


# ============================================================================
# EXAMPLE 6: Batch Query
# ============================================================================
def example_batch_query():
    """Query multiple videos and collect results"""

    client = SoraClient(api_token="your-api-token")

    video_ids = [
        "sora-2:task_01kbfq03gpe0wr9ge11z09xqrj",
        "sora-2:task_01kbfq03gpe0wr9ge11z09xqrk",
        "sora-2-pro:task_01kbfq03gpe0wr9ge11z09xqrl"
    ]

    print("Example 6: Batch query")
    print()

    # In actual usage:
    # results = []
    # for video_id in video_ids:
    #     response = client.query_video(video_id)
    #     results.append({
    #         'id': video_id,
    #         'status': response['data']['status'],
    #         'url': response['data'].get('video_url')
    #     })
    #
    # completed = [r for r in results if r['status'] == 'completed']
    # print(f"Completed: {len(completed)}/{len(results)}")


# ============================================================================
# Main
# ============================================================================
if __name__ == "__main__":
    print("=" * 80)
    print("Sora Video Query Examples")
    print("=" * 80)
    print("\nIMPORTANT: These are dry-run examples.")
    print("Actual API calls are commented out to avoid costs.\n")

    example_simple_query()
    example_multiple_queries()
    example_status_checking()
    example_wait_for_completion()
    example_custom_timeout()
    example_batch_query()

    print("=" * 80)
    print("Examples completed. No actual API calls were made.")
    print("=" * 80)
