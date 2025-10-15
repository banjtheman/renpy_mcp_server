"""Data models used by the Ren'Py MCP server."""

from __future__ import annotations

from datetime import datetime
from pathlib import Path
from typing import List, Optional

from pydantic import BaseModel, Field


class ProjectInfo(BaseModel):
    """Metadata for a managed Ren'Py project."""

    name: str
    path: Path
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class BuildRequest(BaseModel):
    """Parameters controlling a build request."""

    project_name: str
    target: str = "web"
    force_rebuild: bool = False


class BuildResult(BaseModel):
    """Result payload returned from a build run."""

    project_name: str
    target: str
    success: bool
    output_path: Optional[Path] = None
    log_path: Optional[Path] = None
    error: Optional[str] = None


class ImageGenerationResult(BaseModel):
    """Metadata about generated image files."""

    success: bool
    prompt: str
    image_type: str
    files: List[Path] = Field(default_factory=list)
    primary_file: Optional[Path] = None
    error: Optional[str] = None


# REMOVED MODELS (no longer needed):
# - CharacterDefinition: No longer used (was for deprecated generate_dialogue)
# - DialogueLine, DialogueGenerationResult: MCP client generates scripts directly
# - ScriptGenerationResult: generate_script returns simple dict
# - DocSearchHit, DocSearchResult: search_docs tool removed
