"""
Kling Video Generation API Module

A Python client for the Kling AI video generation API.
Supports image-to-video conversion with various controls.
"""

from .kling_client import (
    KlingClient,
    KlingVideoRequest,
    KlingMode,
    CameraControl,
    CameraControlType,
    DynamicMask,
    Trajectory,
    VoiceConfig,
    create_simple_video_request,
    create_video_with_camera_control,
    create_video_with_dynamic_mask,
    wait_for_video_completion
)

__version__ = "1.0.0"
__all__ = [
    "KlingClient",
    "KlingVideoRequest",
    "KlingMode",
    "CameraControl",
    "CameraControlType",
    "DynamicMask",
    "Trajectory",
    "VoiceConfig",
    "create_simple_video_request",
    "create_video_with_camera_control",
    "create_video_with_dynamic_mask",
    "wait_for_video_completion"
]
