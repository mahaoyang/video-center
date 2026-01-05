"""
Runway Video Generation API Client
API for generating videos using Runway Gen4 models

API Endpoint: yunwu.ai
Created: 2025-12-30

Supported Models:
- runwayml-gen4_turbo-5: 5-second video generation
- runwayml-gen4_turbo-10: 10-second video generation

IMPORTANT: This API has costs associated with each request.
Always verify parameters before making actual API calls.
"""

import requests
import json
import time
from dataclasses import dataclass
from typing import Optional, Dict, Any
from enum import Enum


class RunwayModel(Enum):
    """Runway Gen4 models"""
    GEN4_TURBO_5 = "runwayml-gen4_turbo-5"
    GEN4_TURBO_10 = "runwayml-gen4_turbo-10"


@dataclass
class RunwayVideoRequest:
    """
    Runway video generation request parameters

    Required parameters:
    - promptImage: URL to source image
    - model: Model to use (e.g., "runwayml-gen4_turbo-5")

    Optional parameters:
    - promptText: Text prompt for video generation (default: "")
    - watermark: Whether to add watermark (default: False)
    - duration: Video duration in seconds (default: 5)
    - ratio: Video aspect ratio (default: "1280:768")
    """

    # Required
    promptImage: str
    model: str

    # Optional
    promptText: str = ""
    watermark: bool = False
    duration: int = 5
    ratio: str = "1280:768"

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API request"""
        return {
            "promptImage": self.promptImage,
            "model": self.model,
            "promptText": self.promptText,
            "watermark": self.watermark,
            "duration": self.duration,
            "ratio": self.ratio
        }

    def to_json(self) -> str:
        """Convert to JSON string for API request"""
        return json.dumps(self.to_dict(), indent=2)


class RunwayClient:
    """
    Client for Runway Video Generation API

    Usage:
        client = RunwayClient(api_token="your-token")

        request = RunwayVideoRequest(
            promptImage="https://example.com/image.jpg",
            model="runwayml-gen4_turbo-5",
            promptText="cat dance",
            duration=5
        )

        response = client.generate_video(request)
    """

    def __init__(self, api_token: str, base_url: str = "https://yunwu.ai"):
        """
        Initialize Runway API client

        Args:
            api_token: Bearer token for API authentication
            base_url: API base URL (default: https://yunwu.ai)
        """
        self.api_token = api_token
        self.base_url = base_url
        self.endpoint = "/runwayml/v1/image_to_video"
        self.query_endpoint = "/runwayml/v1/tasks"

    def generate_video(self, request: RunwayVideoRequest) -> Dict[str, Any]:
        """
        Generate video from image

        Args:
            request: RunwayVideoRequest with all parameters

        Returns:
            API response as dictionary

        Raises:
            Exception: If API request fails

        Note:
            This operation has costs. Verify parameters before calling.
        """
        url = f"{self.base_url}{self.endpoint}"

        headers = {
            'Accept': 'application/json',
            'Authorization': f'Bearer {self.api_token}',
            'Content-Type': 'application/json'
        }

        try:
            response = requests.post(
                url,
                headers=headers,
                data=request.to_json()
            )

            try:
                return {
                    "status_code": response.status_code,
                    "data": response.json()
                }
            except json.JSONDecodeError:
                return {
                    "status_code": response.status_code,
                    "data": response.text
                }

        except Exception as e:
            raise Exception(f"API request failed: {str(e)}")

    def validate_request(self, request: RunwayVideoRequest) -> tuple[bool, Optional[str]]:
        """
        Validate request parameters before sending

        Args:
            request: RunwayVideoRequest to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check required fields
        if not request.promptImage:
            return False, "promptImage is required"

        if not request.model:
            return False, "model is required"

        # Validate model
        valid_models = ["runwayml-gen4_turbo-5", "runwayml-gen4_turbo-10"]
        if request.model not in valid_models:
            return False, f"model must be one of {valid_models}"

        # Validate duration
        if request.duration not in [5, 10]:
            return False, "duration must be 5 or 10 seconds"

        # Validate model and duration match
        if request.model == "runwayml-gen4_turbo-5" and request.duration != 5:
            return False, "runwayml-gen4_turbo-5 requires duration=5"
        if request.model == "runwayml-gen4_turbo-10" and request.duration != 10:
            return False, "runwayml-gen4_turbo-10 requires duration=10"

        return True, None

    def query_video(self, task_id: str) -> Dict[str, Any]:
        """
        Query video generation status by task ID

        Args:
            task_id: Task ID returned from generate_video

        Returns:
            API response with task status and video URL (if completed)

        Example:
            response = client.query_video("2f19d8a7-3b74-4fc4-af42-d0bcadbaec54")
            print(response["data"]["status"])  # processing, completed, failed
        """
        url = f"{self.base_url}{self.query_endpoint}/{task_id}"

        headers = {
            'Accept': 'application/json',
            'Authorization': f'Bearer {self.api_token}',
            'Content-Type': 'application/json'
        }

        try:
            response = requests.get(url, headers=headers)

            try:
                return {
                    "status_code": response.status_code,
                    "data": response.json()
                }
            except json.JSONDecodeError:
                return {
                    "status_code": response.status_code,
                    "data": response.text
                }

        except Exception as e:
            raise Exception(f"Query request failed: {str(e)}")


# Helper functions for common use cases

def create_simple_video_request(
    image_url: str,
    model: str = "runwayml-gen4_turbo-5",
    prompt_text: str = "",
    duration: int = 5
) -> RunwayVideoRequest:
    """
    Create a simple video generation request

    Args:
        image_url: URL to source image
        model: Model to use (default: "runwayml-gen4_turbo-5")
        prompt_text: Text prompt for video generation
        duration: Video duration in seconds (default: 5)

    Returns:
        RunwayVideoRequest ready to send
    """
    return RunwayVideoRequest(
        promptImage=image_url,
        model=model,
        promptText=prompt_text,
        duration=duration
    )


def create_video_5s(
    image_url: str,
    prompt_text: str = "",
    ratio: str = "1280:768"
) -> RunwayVideoRequest:
    """
    Create 5-second video request

    Args:
        image_url: URL to source image
        prompt_text: Text prompt
        ratio: Video aspect ratio

    Returns:
        RunwayVideoRequest for 5-second video
    """
    return RunwayVideoRequest(
        promptImage=image_url,
        model="runwayml-gen4_turbo-5",
        promptText=prompt_text,
        duration=5,
        ratio=ratio
    )


def create_video_10s(
    image_url: str,
    prompt_text: str = "",
    ratio: str = "1280:768"
) -> RunwayVideoRequest:
    """
    Create 10-second video request

    Args:
        image_url: URL to source image
        prompt_text: Text prompt
        ratio: Video aspect ratio

    Returns:
        RunwayVideoRequest for 10-second video
    """
    return RunwayVideoRequest(
        promptImage=image_url,
        model="runwayml-gen4_turbo-10",
        promptText=prompt_text,
        duration=10,
        ratio=ratio
    )


def wait_for_video_completion(
    client: 'RunwayClient',
    task_id: str,
    timeout: int = 600,
    poll_interval: int = 10
) -> Dict[str, Any]:
    """
    Poll video status until completion or timeout

    Args:
        client: RunwayClient instance
        task_id: Task ID to query
        timeout: Maximum wait time in seconds (default: 600)
        poll_interval: Seconds between status checks (default: 10)

    Returns:
        Final API response with video URL

    Raises:
        TimeoutError: If video not completed within timeout
        Exception: If video generation failed

    Example:
        client = RunwayClient(api_token="your-token")
        response = client.generate_video(request)
        task_id = response["data"]["id"]

        result = wait_for_video_completion(client, task_id, timeout=600)
        print(f"Video URL: {result['data']['video_url']}")
    """
    start_time = time.time()

    while True:
        elapsed = time.time() - start_time
        if elapsed > timeout:
            raise TimeoutError(f"Video generation timed out after {timeout} seconds")

        response = client.query_video(task_id)

        if response["status_code"] != 200:
            raise Exception(f"Query failed with status {response['status_code']}")

        data = response.get("data", {})
        status = data.get("status", "unknown")

        if status == "completed":
            return response
        elif status == "failed":
            error = data.get("error", "Unknown error")
            raise Exception(f"Video generation failed: {error}")

        # Still processing
        time.sleep(poll_interval)
