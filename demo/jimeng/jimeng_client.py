"""
Jimeng Video Generation API Client
API for generating videos using Jimeng AI models

API Endpoint: yunwu.ai
Created: 2025-12-30

Supported Models:
- jimeng-video-3.0: Latest video generation model

IMPORTANT: This API has costs associated with each request.
Always verify parameters before making actual API calls.
"""

import requests
import json
import time
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from enum import Enum


class AspectRatio(Enum):
    """Video aspect ratios"""
    RATIO_16_9 = "16:9"
    RATIO_9_16 = "9:16"
    RATIO_1_1 = "1:1"
    RATIO_4_3 = "4:3"


class VideoSize(Enum):
    """Video resolution sizes"""
    SIZE_720P = "720P"
    SIZE_1080P = "1080P"


@dataclass
class JimengVideoRequest:
    """
    Jimeng video generation request parameters

    Required parameters:
    - model: Model to use (e.g., "jimeng-video-3.0")
    - prompt: Text prompt for video generation

    Optional parameters:
    - aspect_ratio: Video aspect ratio (default: "16:9")
    - size: Video resolution (default: "1080P")
    - images: List of image URLs for reference
    """

    # Required
    model: str
    prompt: str

    # Optional
    aspect_ratio: str = "16:9"
    size: str = "1080P"
    images: List[str] = field(default_factory=list)

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API request"""
        return {
            "model": self.model,
            "prompt": self.prompt,
            "aspect_ratio": self.aspect_ratio,
            "size": self.size,
            "images": self.images
        }

    def to_json(self) -> str:
        """Convert to JSON string for API request"""
        return json.dumps(self.to_dict(), indent=2)


class JimengClient:
    """
    Client for Jimeng Video Generation API

    Usage:
        client = JimengClient(api_token="your-token")

        request = JimengVideoRequest(
            model="jimeng-video-3.0",
            prompt="cat fish",
            aspect_ratio="16:9",
            size="1080P"
        )

        response = client.generate_video(request)
    """

    def __init__(self, api_token: str, base_url: str = "https://yunwu.ai"):
        """
        Initialize Jimeng API client

        Args:
            api_token: Bearer token for API authentication
            base_url: API base URL (default: https://yunwu.ai)
        """
        self.api_token = api_token
        self.base_url = base_url
        self.endpoint = "/v1/video/create"
        self.query_endpoint = "/v1/video/query"

    def generate_video(self, request: JimengVideoRequest) -> Dict[str, Any]:
        """
        Generate video from text prompt

        Args:
            request: JimengVideoRequest with all parameters

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

            # Return status code and parsed response
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

    def validate_request(self, request: JimengVideoRequest) -> tuple[bool, Optional[str]]:
        """
        Validate request parameters before sending

        Args:
            request: JimengVideoRequest to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check required fields
        if not request.model:
            return False, "model is required"

        if not request.prompt:
            return False, "prompt is required"

        # Validate aspect ratio
        valid_ratios = ["16:9", "9:16", "1:1", "4:3"]
        if request.aspect_ratio not in valid_ratios:
            return False, f"aspect_ratio must be one of {valid_ratios}"

        # Validate size
        valid_sizes = ["720P", "1080P"]
        if request.size not in valid_sizes:
            return False, f"size must be one of {valid_sizes}"

        return True, None

    def query_video(self, video_id: str) -> Dict[str, Any]:
        """
        Query video generation status by video ID

        Args:
            video_id: Video ID returned from generate_video (e.g., "jimeng:7391ad0e-9813-48ba-a742-ed0720e44e45")

        Returns:
            API response with video status and URL (if completed)

        Example:
            response = client.query_video("jimeng:7391ad0e-9813-48ba-a742-ed0720e44e45")
            print(response["data"]["status"])  # processing, completed, failed
        """
        url = f"{self.base_url}{self.query_endpoint}?id={video_id}"

        headers = {
            'Accept': 'application/json',
            'Authorization': f'Bearer {self.api_token}'
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
    model: str,
    prompt: str,
    aspect_ratio: str = "16:9",
    size: str = "1080P"
) -> JimengVideoRequest:
    """
    Create a simple video generation request

    Args:
        model: Model to use (e.g., "jimeng-video-3.0")
        prompt: Text prompt for video generation
        aspect_ratio: Video aspect ratio (default: "16:9")
        size: Video resolution (default: "1080P")

    Returns:
        JimengVideoRequest ready to send
    """
    return JimengVideoRequest(
        model=model,
        prompt=prompt,
        aspect_ratio=aspect_ratio,
        size=size
    )


def create_video_with_images(
    model: str,
    prompt: str,
    image_urls: List[str],
    aspect_ratio: str = "16:9",
    size: str = "1080P"
) -> JimengVideoRequest:
    """
    Create video request with reference images

    Args:
        model: Model to use
        prompt: Text prompt
        image_urls: List of reference image URLs
        aspect_ratio: Video aspect ratio
        size: Video resolution

    Returns:
        JimengVideoRequest with images
    """
    return JimengVideoRequest(
        model=model,
        prompt=prompt,
        aspect_ratio=aspect_ratio,
        size=size,
        images=image_urls
    )


def wait_for_video_completion(
    client: JimengClient,
    video_id: str,
    timeout: int = 600,
    poll_interval: int = 10
) -> Dict[str, Any]:
    """
    Poll video status until completion or timeout

    Args:
        client: JimengClient instance
        video_id: Video ID to query
        timeout: Maximum wait time in seconds (default: 600)
        poll_interval: Seconds between status checks (default: 10)

    Returns:
        Final API response with video URL

    Raises:
        TimeoutError: If video not completed within timeout
        Exception: If video generation failed

    Example:
        client = JimengClient(api_token="your-token")
        response = client.generate_video(request)
        video_id = response["data"]["id"]

        result = wait_for_video_completion(client, video_id, timeout=600)
        print(f"Video URL: {result['data']['video_url']}")
    """
    start_time = time.time()

    while True:
        elapsed = time.time() - start_time
        if elapsed > timeout:
            raise TimeoutError(f"Video generation timed out after {timeout} seconds")

        response = client.query_video(video_id)

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
