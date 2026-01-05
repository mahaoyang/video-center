"""
Sora Video Generation API Client
API for generating videos using OpenAI Sora models

API Endpoint: yunwu.ai
Created: 2025-12-30

Supported Models:
- sora-2: Standard Sora model
- sora-2-pro: Professional Sora model with private option

IMPORTANT: This API has costs associated with each request.
Always verify parameters before making actual API calls.
"""

import requests
import json
import time
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from enum import Enum


class SoraModel(Enum):
    """Sora models"""
    SORA_2 = "sora-2"
    SORA_2_PRO = "sora-2-pro"


class Orientation(Enum):
    """Video orientation"""
    PORTRAIT = "portrait"
    LANDSCAPE = "landscape"
    SQUARE = "square"


class VideoSize(Enum):
    """Video size"""
    SMALL = "small"
    MEDIUM = "medium"
    LARGE = "large"


@dataclass
class SoraVideoRequest:
    """
    Sora video generation request parameters

    Required parameters:
    - model: Model to use (e.g., "sora-2", "sora-2-pro")
    - prompt: Text prompt for video generation

    Optional parameters:
    - images: List of image URLs for reference (default: [])
    - orientation: Video orientation (default: "portrait")
    - size: Video size (default: "large")
    - duration: Video duration in seconds (default: 15)
    - watermark: Whether to add watermark (default: False)
    - private: Private mode for sora-2-pro (default: False)
    - character_url: URL to character reference video
    - character_timestamps: Timestamps for character reference (e.g., "1,3")
    """

    # Required
    model: str
    prompt: str

    # Optional
    images: List[str] = field(default_factory=list)
    orientation: str = "portrait"
    size: str = "large"
    duration: int = 15
    watermark: bool = False
    private: bool = False
    character_url: Optional[str] = None
    character_timestamps: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API request"""
        data = {
            "model": self.model,
            "prompt": self.prompt,
            "images": self.images,
            "orientation": self.orientation,
            "size": self.size,
            "duration": self.duration,
            "watermark": self.watermark
        }

        # Add optional fields
        if self.private:
            data["private"] = self.private

        if self.character_url:
            data["character_url"] = self.character_url

        if self.character_timestamps:
            data["character_timestamps"] = self.character_timestamps

        return data

    def to_json(self) -> str:
        """Convert to JSON string for API request"""
        return json.dumps(self.to_dict(), indent=2)


class SoraClient:
    """
    Client for Sora Video Generation API

    Usage:
        client = SoraClient(api_token="your-token")

        request = SoraVideoRequest(
            model="sora-2",
            prompt="cat dance",
            orientation="portrait",
            duration=15
        )

        response = client.generate_video(request)
    """

    def __init__(self, api_token: str, base_url: str = "https://yunwu.ai"):
        """
        Initialize Sora API client

        Args:
            api_token: Bearer token for API authentication
            base_url: API base URL (default: https://yunwu.ai)
        """
        self.api_token = api_token
        self.base_url = base_url
        self.endpoint = "/v1/video/create"
        self.query_endpoint = "/v1/video/query"

    def generate_video(self, request: SoraVideoRequest) -> Dict[str, Any]:
        """
        Generate video from prompt

        Args:
            request: SoraVideoRequest with all parameters

        Returns:
            API response as dictionary

        Raises:
            Exception: If API request fails
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

    def query_video(self, video_id: str) -> Dict[str, Any]:
        """
        Query video generation status by video ID

        Args:
            video_id: Video ID returned from generate_video (e.g., "sora-2:task_01kbfq03gpe0wr9ge11z09xqrj")

        Returns:
            API response with video status and URL (if completed)

        Example:
            response = client.query_video("sora-2:task_01kbfq03gpe0wr9ge11z09xqrj")
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

    def validate_request(self, request: SoraVideoRequest) -> tuple[bool, Optional[str]]:
        """
        Validate request parameters before sending

        Args:
            request: SoraVideoRequest to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check required fields
        if not request.model:
            return False, "model is required"

        if not request.prompt:
            return False, "prompt is required"

        # Validate model
        valid_models = ["sora-2", "sora-2-pro"]
        if request.model not in valid_models:
            return False, f"model must be one of {valid_models}"

        # Validate orientation
        valid_orientations = ["portrait", "landscape", "square"]
        if request.orientation not in valid_orientations:
            return False, f"orientation must be one of {valid_orientations}"

        # Validate size
        valid_sizes = ["small", "medium", "large"]
        if request.size not in valid_sizes:
            return False, f"size must be one of {valid_sizes}"

        # Validate duration
        if request.duration <= 0:
            return False, "duration must be positive"

        # Validate private only for pro model
        if request.private and request.model != "sora-2-pro":
            return False, "private option only available for sora-2-pro"

        return True, None


# Helper functions for common use cases

def create_simple_video_request(
    model: str,
    prompt: str,
    orientation: str = "portrait",
    duration: int = 15
) -> SoraVideoRequest:
    """
    Create a simple video generation request

    Args:
        model: Model to use (e.g., "sora-2")
        prompt: Text prompt for video generation
        orientation: Video orientation (default: "portrait")
        duration: Video duration in seconds (default: 15)

    Returns:
        SoraVideoRequest ready to send
    """
    return SoraVideoRequest(
        model=model,
        prompt=prompt,
        orientation=orientation,
        duration=duration
    )


def create_video_with_images(
    model: str,
    prompt: str,
    image_urls: List[str],
    orientation: str = "portrait",
    duration: int = 15
) -> SoraVideoRequest:
    """
    Create video request with reference images

    Args:
        model: Model to use
        prompt: Text prompt
        image_urls: List of reference image URLs
        orientation: Video orientation
        duration: Video duration

    Returns:
        SoraVideoRequest with images
    """
    return SoraVideoRequest(
        model=model,
        prompt=prompt,
        images=image_urls,
        orientation=orientation,
        duration=duration
    )


def create_video_with_character(
    model: str,
    prompt: str,
    character_url: str,
    character_timestamps: str,
    orientation: str = "portrait",
    duration: int = 15
) -> SoraVideoRequest:
    """
    Create video request with character reference

    Args:
        model: Model to use
        prompt: Text prompt
        character_url: URL to character reference video
        character_timestamps: Timestamps for character (e.g., "1,3")
        orientation: Video orientation
        duration: Video duration

    Returns:
        SoraVideoRequest with character reference
    """
    return SoraVideoRequest(
        model=model,
        prompt=prompt,
        character_url=character_url,
        character_timestamps=character_timestamps,
        orientation=orientation,
        duration=duration
    )


def create_private_video(
    prompt: str,
    orientation: str = "portrait",
    duration: int = 15
) -> SoraVideoRequest:
    """
    Create private video request (sora-2-pro only)

    Args:
        prompt: Text prompt
        orientation: Video orientation
        duration: Video duration

    Returns:
        SoraVideoRequest with private mode enabled
    """
    return SoraVideoRequest(
        model="sora-2-pro",
        prompt=prompt,
        orientation=orientation,
        duration=duration,
        private=True
    )


def wait_for_video_completion(
    client: SoraClient,
    video_id: str,
    timeout: int = 600,
    poll_interval: int = 10
) -> Dict[str, Any]:
    """
    Poll video status until completion or timeout

    Args:
        client: SoraClient instance
        video_id: Video ID to query
        timeout: Maximum wait time in seconds (default: 600)
        poll_interval: Seconds between status checks (default: 10)

    Returns:
        Final API response with video URL

    Raises:
        TimeoutError: If video not completed within timeout
        Exception: If video generation failed
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
