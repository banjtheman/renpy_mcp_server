"""Utilities for managing Ren'Py project workspaces."""

from __future__ import annotations

import shutil
from pathlib import Path
from typing import List, Optional

from .models import ProjectInfo
from .settings import Settings


class ProjectManager:
    """Manage project directories and metadata."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.settings.workspace_root.mkdir(parents=True, exist_ok=True)

    def list_projects(self) -> List[ProjectInfo]:
        """Return metadata for all known projects."""
        projects: List[ProjectInfo] = []
        for path in sorted(self.settings.workspace_root.glob("*")):
            if path.is_dir():
                meta = ProjectInfo(name=path.name, path=path)
                projects.append(meta)
        return projects

    def ensure_project_dir(self, name: str) -> Path:
        """Return absolute project directory, creating it if necessary."""
        project_dir = self.settings.workspace_root / name
        project_dir.mkdir(parents=True, exist_ok=True)
        return project_dir

    def delete_project(self, name: str) -> None:
        """Remove a project directory."""
        project_dir = self.settings.workspace_root / name
        if project_dir.exists():
            shutil.rmtree(project_dir)

    def copy_template(self, destination: Path, template_dir: Optional[Path]) -> None:
        """Copy a template project into place."""
        if template_dir is None:
            if destination.exists():
                shutil.rmtree(destination)
            (destination / "game").mkdir(parents=True, exist_ok=True)
            (destination / "game" / "script.rpy").write_text(
                "label start:\n    \"Hello from the Ren'Py MCP server!\"\n",
                encoding="utf-8",
            )
            return

        if destination.exists():
            shutil.rmtree(destination)
        shutil.copytree(template_dir, destination)

    def find_template(self, template_name: str) -> Optional[Path]:
        """Return an absolute path to the requested template, if present."""
        built_in = (
            Path(__file__).resolve().parent / "templates" / template_name
        )
        if built_in.exists():
            return built_in
        return None
