from __future__ import annotations

from typing import Generic, Optional, TypeVar
from pydantic import BaseModel

T = TypeVar("T")


class ApiResponse(BaseModel, Generic[T]):
  code: int = 0
  description: str = "OK"
  result: Optional[T] = None


def ok(result: T) -> ApiResponse[T]:
  return ApiResponse(code=0, description="OK", result=result)


def err(message: str, code: int = 1) -> ApiResponse[None]:
  return ApiResponse(code=code, description=message, result=None)

