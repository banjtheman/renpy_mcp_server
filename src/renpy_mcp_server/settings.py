"""Configuration handling for the Ren'Py MCP server."""

from __future__ import annotations

import os
from pathlib import Path
from typing import Optional

from pydantic import BaseModel, Field


class Settings(BaseModel):
    """Application settings derived from environment variables."""

    workspace_root: Path = Field(default_factory=lambda: Settings._default_workspace_root())
    renpy_sdk_path: Optional[Path] = Field(
        default_factory=lambda: Settings._default_renpy_sdk_path()
    )
    default_template: str = Field(default="basic")
    gemini_api_key: Optional[str] = Field(
        default_factory=lambda: os.environ.get("GEMINI_API_KEY")
    )
    gemini_image_model: str = Field(
        default_factory=lambda: os.environ.get("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")
    )
    gemini_text_model: str = Field(
        default_factory=lambda: os.environ.get("GEMINI_TEXT_MODEL", "gemini-2.0-flash-exp")
    )

    class Config:
        arbitrary_types_allowed = True
        frozen = True

    @staticmethod
    def _default_workspace_root() -> Path:
        """Return the default workspace directory."""
        env_value = os.environ.get("RENPY_MCP_WORKSPACE")
        base = Path(env_value) if env_value else Path.cwd() / "workspace"
        return base.expanduser().resolve()

    @staticmethod
    def _default_renpy_sdk_path() -> Optional[Path]:
        """Attempt to detect a local Ren'Py SDK directory."""
        env_value = os.environ.get("RENPY_SDK_PATH")
        if env_value:
            candidate = Path(env_value).expanduser().resolve()
            if candidate.exists():
                return candidate

        repo_candidate = Path.cwd() / "renpy"
        if repo_candidate.exists():
            return repo_candidate.resolve()

        return None
