"""
Sora Video Generation API Module

A Python client for the OpenAI Sora video generation API.
Supports text-to-video and image-to-video generation.
"""

from .sora_client import (
    SoraClient,
    SoraVideoRequest,
    SoraModel,
    Orientation,
    VideoSize,
    create_simple_video_request,
    create_video_with_images,
    create_video_with_character,
    create_private_video,
    wait_for_video_completion
)

__version__ = "1.0.0"
__all__ = [
    "SoraClient",
    "SoraVideoRequest",
    "SoraModel",
    "Orientation",
    "VideoSize",
    "create_simple_video_request",
    "create_video_with_images",
    "create_video_with_character",
    "create_private_video",
    "wait_for_video_completion"
]
