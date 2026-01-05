"""
Runway Video Generation API Module

A Python client for the Runway Gen4 video generation API.
Supports image-to-video generation with 5s and 10s durations.
"""

from .runway_client import (
    RunwayClient,
    RunwayVideoRequest,
    RunwayModel,
    create_simple_video_request,
    create_video_5s,
    create_video_10s,
    wait_for_video_completion
)

__version__ = "1.0.0"
__all__ = [
    "RunwayClient",
    "RunwayVideoRequest",
    "RunwayModel",
    "create_simple_video_request",
    "create_video_5s",
    "create_video_10s",
    "wait_for_video_completion"
]
