"""
Kling Video Generation API Client
API for generating videos from images using Kling AI models

API Endpoint: yunwu.ai
Documentation: Based on provided API example
Created: 2025-12-30
Updated: 2025-12-30 - Added kling-v2-6 model support

Supported Models:
- kling-v1: Original model
- kling-v2-6: Latest model (recommended)

IMPORTANT: This API has costs associated with each request.
Always verify parameters before making actual API calls.
"""

import http.client
import json
from dataclasses import dataclass, field, asdict
from typing import Optional, List, Dict, Any
from enum import Enum


class KlingMode(Enum):
    """Video generation modes"""
    STANDARD = "std"
    PRO = "pro"


class CameraControlType(Enum):
    """Camera control types"""
    SIMPLE = "simple"
    ADVANCED = "advanced"


@dataclass
class Trajectory:
    """Trajectory point for dynamic mask movement"""
    x: float
    y: float


@dataclass
class DynamicMask:
    """Dynamic mask configuration for video generation"""
    mask: str  # URL to mask image
    trajectories: List[Trajectory]

    def to_dict(self) -> Dict[str, Any]:
        return {
            "mask": self.mask,
            "trajectories": [{"x": t.x, "y": t.y} for t in self.trajectories]
        }


@dataclass
class VoiceConfig:
    """Voice configuration for video"""
    voiceId: str = ""


@dataclass
class CameraControl:
    """Camera control configuration"""
    type: str = "simple"  # "simple" or "advanced"
    config: Dict[str, float] = field(default_factory=lambda: {
        "horizontal": 0.0,
        "vertical": 0.0,
        "pan": 0.0,
        "tilt": 0.0,
        "roll": 0.0,
        "zoom": 0.0
    })

    def to_dict(self) -> Dict[str, Any]:
        return {
            "type": self.type,
            "config": self.config
        }


@dataclass
class KlingVideoRequest:
    """
    Kling video generation request parameters

    Required parameters:
    - model_name: Model to use (e.g., "kling-v2-6")
    - image: URL to source image

    Optional parameters:
    - prompt: Text prompt for video generation
    - negative_prompt: Elements to avoid
    - cfg_scale: Configuration scale (0.0-1.0)
    - mode: Generation mode ("std" or "pro")
    - duration: Video duration in seconds
    - And many more...
    """

    # Required
    model_name: str
    image: str

    # Optional
    image_tail: str = ""
    prompt: str = ""
    negative_prompt: str = ""
    voice_list: List[VoiceConfig] = field(default_factory=lambda: [VoiceConfig()])
    sound: str = ""
    cfg_scale: float = 0.5
    mode: str = "std"
    static_mask: str = ""
    dynamic_masks: List[DynamicMask] = field(default_factory=list)
    camera_control: Optional[CameraControl] = None
    duration: str = "5"
    callback_url: str = ""
    external_task_id: str = ""

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for API request"""
        data = {
            "model_name": self.model_name,
            "image": self.image,
            "image_tail": self.image_tail,
            "prompt": self.prompt,
            "negative_prompt": self.negative_prompt,
            "voice_list": [{"voiceId": v.voiceId} for v in self.voice_list],
            "sound": self.sound,
            "cfg_scale": self.cfg_scale,
            "mode": self.mode,
            "static_mask": self.static_mask,
            "dynamic_masks": [m.to_dict() for m in self.dynamic_masks],
            "duration": self.duration,
            "callback_url": self.callback_url,
            "external_task_id": self.external_task_id
        }

        # Add camera control if specified
        if self.camera_control:
            data["camera_control"] = self.camera_control.to_dict()

        return data

    def to_json(self) -> str:
        """Convert to JSON string for API request"""
        return json.dumps(self.to_dict(), indent=2)


class KlingClient:
    """
    Client for Kling Video Generation API

    Usage:
        client = KlingClient(api_token="your-token")

        request = KlingVideoRequest(
            model_name="kling-v2-6",
            image="https://example.com/image.jpg",
            prompt="A beautiful sunset",
            duration="5"
        )

        response = client.generate_video(request)
    """

    def __init__(self, api_token: str, host: str = "yunwu.ai"):
        """
        Initialize Kling API client

        Args:
            api_token: Bearer token for API authentication
            host: API host (default: yunwu.ai)
        """
        self.api_token = api_token
        self.host = host
        self.endpoint = "/kling/v1/videos/image2video"
        self.query_endpoint = "/kling/v1/videos/image2video"  # Base for queries

    def generate_video(self, request: KlingVideoRequest) -> Dict[str, Any]:
        """
        Generate video from image

        Args:
            request: KlingVideoRequest with all parameters

        Returns:
            API response as dictionary

        Raises:
            Exception: If API request fails

        Note:
            This operation has costs. Verify parameters before calling.
        """
        conn = http.client.HTTPSConnection(self.host)

        payload = request.to_json()

        headers = {
            'Authorization': f'Bearer {self.api_token}',
            'Content-Type': 'application/json'
        }

        try:
            conn.request("POST", self.endpoint, payload, headers)
            res = conn.getresponse()
            data = res.read()

            response_text = data.decode("utf-8")

            # Try to parse as JSON
            try:
                return {
                    "status_code": res.status,
                    "data": json.loads(response_text)
                }
            except json.JSONDecodeError:
                return {
                    "status_code": res.status,
                    "data": response_text
                }

        except Exception as e:
            raise Exception(f"API request failed: {str(e)}")
        finally:
            conn.close()

    def query_video(self, task_id: str) -> Dict[str, Any]:
        """
        Query video generation status by task ID

        Args:
            task_id: Task ID returned from generate_video

        Returns:
            API response with task status and video URL (if completed)

        Example:
            response = client.query_video("827297867001249878")
            print(response["data"]["status"])  # processing, completed, failed
        """
        conn = http.client.HTTPSConnection(self.host)

        headers = {
            'Authorization': f'Bearer {self.api_token}',
            'Content-Type': 'application/json'
        }

        try:
            query_url = f"{self.query_endpoint}/{task_id}"
            conn.request("GET", query_url, '', headers)
            res = conn.getresponse()
            data = res.read()

            response_text = data.decode("utf-8")

            # Try to parse as JSON
            try:
                return {
                    "status_code": res.status,
                    "data": json.loads(response_text)
                }
            except json.JSONDecodeError:
                return {
                    "status_code": res.status,
                    "data": response_text
                }

        except Exception as e:
            raise Exception(f"Query request failed: {str(e)}")
        finally:
            conn.close()

    def validate_request(self, request: KlingVideoRequest) -> tuple[bool, Optional[str]]:
        """
        Validate request parameters before sending

        Args:
            request: KlingVideoRequest to validate

        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check required fields
        if not request.model_name:
            return False, "model_name is required"

        if not request.image:
            return False, "image URL is required"

        # Validate cfg_scale range
        if not 0.0 <= request.cfg_scale <= 1.0:
            return False, "cfg_scale must be between 0.0 and 1.0"

        # Validate mode
        if request.mode not in ["std", "pro"]:
            return False, "mode must be 'std' or 'pro'"

        # Validate duration
        try:
            duration_int = int(request.duration)
            if duration_int <= 0:
                return False, "duration must be positive"
        except ValueError:
            return False, "duration must be a valid number"

        return True, None


# Helper functions for common use cases

def create_simple_video_request(
    model_name: str,
    image_url: str,
    prompt: str = "",
    duration: str = "5",
    mode: str = "std"
) -> KlingVideoRequest:
    """
    Create a simple video generation request

    Args:
        model_name: Model to use (e.g., "kling-v2-6")
        image_url: URL to source image
        prompt: Optional text prompt
        duration: Video duration in seconds (default: "5")
        mode: Generation mode (default: "std")

    Returns:
        KlingVideoRequest ready to send
    """
    return KlingVideoRequest(
        model_name=model_name,
        image=image_url,
        prompt=prompt,
        duration=duration,
        mode=mode
    )


def create_video_with_camera_control(
    model_name: str,
    image_url: str,
    horizontal: float = 0.0,
    vertical: float = 0.0,
    zoom: float = 0.0,
    duration: str = "5"
) -> KlingVideoRequest:
    """
    Create video request with camera movement

    Args:
        model_name: Model to use
        image_url: URL to source image
        horizontal: Horizontal movement (-1.0 to 1.0)
        vertical: Vertical movement (-1.0 to 1.0)
        zoom: Zoom level (-1.0 to 1.0)
        duration: Video duration in seconds

    Returns:
        KlingVideoRequest with camera controls
    """
    camera = CameraControl(
        type="simple",
        config={
            "horizontal": horizontal,
            "vertical": vertical,
            "pan": 0.0,
            "tilt": 0.0,
            "roll": 0.0,
            "zoom": zoom
        }
    )

    return KlingVideoRequest(
        model_name=model_name,
        image=image_url,
        camera_control=camera,
        duration=duration
    )


def create_video_with_dynamic_mask(
    model_name: str,
    image_url: str,
    mask_url: str,
    trajectories: List[tuple[float, float]],
    duration: str = "5"
) -> KlingVideoRequest:
    """
    Create video request with dynamic mask animation

    Args:
        model_name: Model to use
        image_url: URL to source image
        mask_url: URL to mask image
        trajectories: List of (x, y) coordinate tuples for mask movement
        duration: Video duration in seconds

    Returns:
        KlingVideoRequest with dynamic mask
    """
    trajectory_objects = [Trajectory(x=x, y=y) for x, y in trajectories]
    dynamic_mask = DynamicMask(mask=mask_url, trajectories=trajectory_objects)

    return KlingVideoRequest(
        model_name=model_name,
        image=image_url,
        dynamic_masks=[dynamic_mask],
        duration=duration
    )


def wait_for_video_completion(
    client: KlingClient,
    task_id: str,
    max_wait_seconds: int = 300,
    poll_interval: int = 10
) -> Dict[str, Any]:
    """
    Poll video generation status until completion or timeout

    Args:
        client: KlingClient instance
        task_id: Task ID to query
        max_wait_seconds: Maximum time to wait (default: 300s = 5min)
        poll_interval: Seconds between polls (default: 10s)

    Returns:
        Final response with video URL if completed

    Raises:
        TimeoutError: If max_wait_seconds exceeded
        Exception: If generation failed

    Example:
        response = client.generate_video(request)
        task_id = response["data"]["task_id"]
        result = wait_for_video_completion(client, task_id)
        print(result["data"]["video_url"])
    """
    import time

    elapsed = 0
    while elapsed < max_wait_seconds:
        response = client.query_video(task_id)

        if response["status_code"] != 200:
            raise Exception(f"Query failed: {response}")

        status = response["data"].get("status", "unknown")

        if status == "completed":
            return response
        elif status == "failed":
            raise Exception(f"Video generation failed: {response['data']}")

        time.sleep(poll_interval)
        elapsed += poll_interval

    raise TimeoutError(f"Video generation timed out after {max_wait_seconds}s")
