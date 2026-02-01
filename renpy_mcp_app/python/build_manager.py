#!/usr/bin/env python3
"""
Ren'Py build manager.

Handles building projects to web format using the Ren'Py SDK.
Called from TypeScript via python-runner.ts.

Usage:
  python build_manager.py --project myproject
  python build_manager.py --project myproject --force
"""

from __future__ import annotations

import argparse
import asyncio
import json
import logging
import os
import platform
import shutil
import sys
import zipfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

# Configure logging to stderr
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s: %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)


def find_renpy_executable(sdk_path: Path) -> Optional[Path]:
    """Find the Ren'Py executable in the SDK."""
    system = platform.system()

    if system == "Darwin":
        # macOS: Try app bundle first
        for app_name in ["renpy.app", "Ren'Py.app"]:
            bundle = sdk_path / app_name / "Contents" / "MacOS" / "renpy"
            if bundle.exists():
                return bundle.resolve()

    # Try shell script or executable
    candidates = [
        sdk_path / "renpy.sh",
        sdk_path / "renpy.exe",
        sdk_path / "renpy",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()

    return None


def auto_copy_assets(project_dir: Path) -> None:
    """Copy assets from assets/ to game/images/."""
    assets_dir = project_dir / "assets"
    images_dir = project_dir / "game" / "images"

    if not assets_dir.exists():
        return

    images_dir.mkdir(parents=True, exist_ok=True)

    for subdir in ["background", "character"]:
        source_dir = assets_dir / subdir
        if not source_dir.exists():
            continue

        for asset_file in source_dir.iterdir():
            if asset_file.is_file() and asset_file.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
                dest_file = images_dir / asset_file.name
                shutil.copy2(asset_file, dest_file)
                logger.info(f"Copied: {asset_file.name}")


def create_web_player(sdk_path: Path, web_dir: Path, project_name: str) -> bool:
    """Copy web runtime files from SDK and create web player."""
    # SDK has nested web/web/ structure - the actual files are in web/web/
    web_runtime = sdk_path / "web" / "web"
    if not web_runtime.exists():
        # Fall back to single web/ if nested doesn't exist
        web_runtime = sdk_path / "web"
        if not web_runtime.exists():
            logger.error(f"Web runtime not found: {web_runtime}")
            return False

    logger.info(f"Creating web player in {web_dir}")

    for item in web_runtime.iterdir():
        if item.name == "index.html":
            # Customize index.html with project name
            html_content = item.read_text(encoding="utf-8")
            html_content = html_content.replace("%%TITLE%%", project_name)
            (web_dir / "index.html").write_text(html_content, encoding="utf-8")
        elif item.name not in {"hash.txt"}:
            dest = web_dir / item.name
            if item.is_file():
                shutil.copy2(item, dest)
            elif item.is_dir():
                shutil.copytree(item, dest, dirs_exist_ok=True)

    logger.info("Web player created successfully")
    return True


async def build_project(
    project_name: str,
    workspace: Path,
    sdk_path: Path,
    force_rebuild: bool = False,
) -> dict:
    """Build a project to web format.

    Returns JSON-serializable result dict.
    """
    project_dir = workspace / project_name
    if not project_dir.exists():
        return {
            "success": False,
            "error": f"Project not found: {project_name}",
            "project_name": project_name,
        }

    # Find Ren'Py executable
    executable = find_renpy_executable(sdk_path)
    if not executable:
        return {
            "success": False,
            "error": f"Ren'Py executable not found in {sdk_path}",
            "project_name": project_name,
        }

    # Check for web support
    web_support = sdk_path / "web"
    if not web_support.exists():
        return {
            "success": False,
            "error": "Ren'Py web support not installed. Download from Ren'Py launcher.",
            "project_name": project_name,
        }

    # Auto-copy assets
    logger.info("Copying assets...")
    auto_copy_assets(project_dir)

    # Setup build paths - put dists at workspace level to avoid recursive nesting
    build_dest = workspace / f"{project_name}-dists"
    log_dir = project_dir / "logs"
    log_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
    log_file = log_dir / f"build-web-{timestamp}.log"

    # Build command
    launcher_path = sdk_path / "launcher"
    command = [
        str(executable),
        str(launcher_path.resolve()),
        "distribute",
        "--package", "web",
        "--destination", str(build_dest.resolve()),
        str(project_dir.resolve()),
    ]

    # Environment for headless build
    env = os.environ.copy()
    env.setdefault("SDL_VIDEODRIVER", "dummy")
    env.setdefault("SDL_AUDIODRIVER", "dummy")
    env.setdefault("RENPY_FORCE_SOFTWARE", "1")
    env.setdefault("RENPY_DISABLE_UPDATE", "1")
    env.setdefault("RENPY_DISABLE_JOYSTICK", "1")

    logger.info(f"Starting build: {' '.join(command)}")

    try:
        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(sdk_path),
            env=env,
        )

        # Stream output to log file using chunk-based reading
        # to avoid buffer limit issues with very long lines
        CHUNK_SIZE = 8192
        buffer = b""

        with log_file.open("wb") as log_handle:
            while True:
                chunk = await process.stdout.read(CHUNK_SIZE)
                if not chunk:
                    # Process any remaining data in buffer
                    if buffer:
                        log_handle.write(buffer)
                        log_handle.flush()
                        logger.info(buffer.decode(errors="ignore").rstrip())
                    break

                buffer += chunk

                # Process complete lines from buffer
                while b"\n" in buffer:
                    line, buffer = buffer.split(b"\n", 1)
                    line_with_newline = line + b"\n"
                    log_handle.write(line_with_newline)
                    log_handle.flush()
                    logger.info(line.decode(errors="ignore").rstrip())

                # If buffer gets too large without newlines, flush it anyway
                if len(buffer) > 65536:
                    log_handle.write(buffer)
                    log_handle.flush()
                    logger.info(buffer.decode(errors="ignore").rstrip())
                    buffer = b""

        returncode = await process.wait()

        if returncode != 0:
            return {
                "success": False,
                "error": f"Build failed with exit code {returncode}",
                "project_name": project_name,
                "log_path": str(log_file),
            }

        # Find and extract the web build
        web_zip = None
        for zip_file in build_dest.glob("*-web.zip"):
            web_zip = zip_file
            break

        if not web_zip:
            return {
                "success": False,
                "error": "Web build zip not found after build",
                "project_name": project_name,
            }

        # Extract and create web player
        web_dir = build_dest / f"{project_name}-web"
        if web_dir.exists():
            shutil.rmtree(web_dir)

        logger.info(f"Extracting {web_zip}...")
        with zipfile.ZipFile(web_zip, "r") as zf:
            zf.extractall(web_dir)

        # Create web player with runtime files
        if create_web_player(sdk_path, web_dir, project_name):
            # Create game.zip with game files
            game_zip = web_dir / "game.zip"
            logger.info("Creating game.zip...")

            exclude_files = {
                "index.html", "index.html.symbols", "manifest.json",
                "renpy-pre.js", "renpy.data", "renpy.js", "renpy.wasm",
                "service-worker.js", "web-icon.png", "web-presplash.jpg",
            }

            with zipfile.ZipFile(game_zip, "w", zipfile.ZIP_DEFLATED) as zf:
                for file_path in web_dir.rglob("*"):
                    if file_path.is_file() and file_path.name not in exclude_files:
                        if file_path == game_zip:
                            continue
                        arcname = file_path.relative_to(web_dir)
                        zf.write(file_path, arcname)

        return {
            "success": True,
            "project_name": project_name,
            "outputPath": str(web_dir),
            "log_path": str(log_file),
        }

    except Exception as e:
        logger.exception(f"Build error: {e}")
        return {
            "success": False,
            "error": str(e),
            "project_name": project_name,
        }


def main():
    parser = argparse.ArgumentParser(description="Build Ren'Py project")
    parser.add_argument("--project", required=True, help="Project name")
    parser.add_argument("--force", action="store_true", help="Force rebuild")

    args = parser.parse_args()

    # Get paths from environment
    workspace = os.environ.get("RENPY_MCP_WORKSPACE")
    if not workspace:
        data_dir = os.environ.get("RENPY_STUDIO_DATA_DIR", os.path.expanduser("~/.renpy-studio"))
        workspace = os.path.join(data_dir, "workspace")

    sdk_path = os.environ.get("RENPY_SDK_PATH")
    if not sdk_path:
        data_dir = os.environ.get("RENPY_STUDIO_DATA_DIR", os.path.expanduser("~/.renpy-studio"))
        sdk_path = os.path.join(data_dir, "renpy-sdk")

    # Run build
    result = asyncio.run(build_project(
        project_name=args.project,
        workspace=Path(workspace),
        sdk_path=Path(sdk_path),
        force_rebuild=args.force,
    ))

    # Output JSON result
    print(json.dumps(result))

    # Exit with appropriate code
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
