from __future__ import annotations

from dataclasses import dataclass
import os


@dataclass(frozen=True)
class Settings:
  database_url: str
  cors_allow_origins: list[str]
  data_dir: str


def load_settings() -> Settings:
  database_url = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@localhost:5433/media_backend").strip()
  data_dir = os.environ.get("MEDIA_DATA_DIR", os.path.join(os.getcwd(), ".data")).strip()

  cors = os.environ.get("CORS_ALLOW_ORIGINS", "*").strip()
  cors_allow_origins = ["*"] if cors == "*" else [o.strip() for o in cors.split(",") if o.strip()]

  return Settings(
    database_url=database_url,
    cors_allow_origins=cors_allow_origins,
    data_dir=data_dir,
  )
