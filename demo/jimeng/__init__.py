"""
Jimeng Video Generation API Module

A Python client for the Jimeng AI video generation API.
Supports text-to-video generation and status querying.
"""

from .jimeng_client import (
    JimengClient,
    JimengVideoRequest,
    AspectRatio,
    VideoSize,
    create_simple_video_request,
    create_video_with_images,
    wait_for_video_completion
)

__version__ = "1.0.0"
__all__ = [
    "JimengClient",
    "JimengVideoRequest",
    "AspectRatio",
    "VideoSize",
    "create_simple_video_request",
    "create_video_with_images",
    "wait_for_video_completion"
]
