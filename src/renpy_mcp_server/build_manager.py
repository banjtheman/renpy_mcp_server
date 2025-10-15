"""Handles building Ren'Py projects into deployable targets."""

from __future__ import annotations

import asyncio
import os
import platform
import shutil
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

import structlog

from .models import BuildRequest, BuildResult
from .settings import Settings

logger = structlog.get_logger(__name__)


class BuildManager:
    """Coordinate build jobs using the configured Ren'Py toolchain."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def _auto_copy_assets(self, project_dir: Path) -> None:
        """Automatically copy assets from assets/ to game/images/."""
        assets_dir = project_dir / "assets"
        images_dir = project_dir / "game" / "images"
        
        if not assets_dir.exists():
            return
        
        images_dir.mkdir(parents=True, exist_ok=True)
        
        # Copy all assets to game/images/
        for subdir in ["background", "character"]:
            source_dir = assets_dir / subdir
            if not source_dir.exists():
                continue
            
            for asset_file in source_dir.iterdir():
                if asset_file.is_file() and asset_file.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}:
                    dest_file = images_dir / asset_file.name
                    shutil.copy2(asset_file, dest_file)
                    logger.info("Copied asset to game/images", 
                               source=str(asset_file.relative_to(project_dir)),
                               dest=str(dest_file.relative_to(project_dir)))
    
    async def build(self, request: BuildRequest) -> BuildResult:
        """Execute a build request."""
        project_dir = self.settings.workspace_root / request.project_name
        if not project_dir.exists():
            return BuildResult(
                project_name=request.project_name,
                target=request.target,
                success=False,
                error=f"Project '{request.project_name}' not found in {self.settings.workspace_root}",
            )
        
        # Auto-copy assets before building
        self._auto_copy_assets(project_dir)

        toolchain = self._resolve_toolchain()
        if toolchain is None:
            return BuildResult(
                project_name=request.project_name,
                target=request.target,
                success=False,
                error=self._toolchain_error(),
            )

        return await toolchain.build(project_dir, request)

    def _resolve_toolchain(self) -> Optional["LocalRenpyToolchain"]:
        """Return an available toolchain implementation."""
        if self.settings.renpy_sdk_path:
            local = LocalRenpyToolchain(self.settings.renpy_sdk_path)
            if local.available:
                return local
        return None

    def _toolchain_error(self) -> str:
        """Return a helpful message when no toolchain is available."""
        base = "No usable Ren'Py SDK found."
        if self.settings.renpy_sdk_path:
            return f"{base} Checked {self.settings.renpy_sdk_path}, but could not locate 'renpy.sh'."
        return f"{base} Set the RENPY_SDK_PATH environment variable to an extracted Ren'Py SDK."


class LocalRenpyToolchain:
    """Use a locally installed Ren'Py SDK to build projects."""

    def __init__(self, sdk_path: Path) -> None:
        self.sdk_path = sdk_path
        self.executable = self._find_executable()
        self.web_support_available = (self.sdk_path / "web").exists()

    @property
    def available(self) -> bool:
        return self.executable is not None

    async def build(self, project_dir: Path, request: BuildRequest) -> BuildResult:
        if not self.available:
            return BuildResult(
                project_name=request.project_name,
                target=request.target,
                success=False,
                error=f"Ren'Py executable not found under {self.sdk_path}",
            )

        if request.target != "web":
            return BuildResult(
                project_name=request.project_name,
                target=request.target,
                success=False,
                error=f"Unsupported build target '{request.target}'. Only 'web' is currently implemented.",
            )

        if not self.web_support_available:
            return BuildResult(
                project_name=request.project_name,
                target=request.target,
                success=False,
                error=(
                    "Ren'Py Web support is not installed. "
                    "Open the Ren'Py launcher and download web support, "
                    "or place the 'web' directory inside the SDK path."
                ),
            )

        # The distribute command outputs to project_dir.parent/destination_name
        # We'll use project_dir/build as the destination directory
        build_dest = project_dir.parent / f"{project_dir.name}-dists"
        log_dir = project_dir / "logs"
        log_dir.mkdir(parents=True, exist_ok=True)

        timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%S")
        log_file = log_dir / f"build-{request.target}-{timestamp}.log"

        env = self._build_env()
        destination = str(build_dest.resolve())
        command = self._build_command(project_dir, destination, request.force_rebuild)

        logger.info(
            "Starting Ren'Py build",
            command=command,
            cwd=str(self.sdk_path),
            log_file=str(log_file),
        )

        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.STDOUT,
            cwd=str(self.sdk_path),
            env=env,
        )

        await self._stream_log(process, log_file)

        returncode = await process.wait()
        success = returncode == 0

        if success:
            # The distribute command creates project_name-web.zip
            project_name = project_dir.name
            web_zip = build_dest / f"{project_name}-web.zip"

            # Check for the zip file (even with incorrect naming like "-web.zip")
            zip_files = list(build_dest.glob("*-web.zip"))
            if zip_files:
                web_zip = zip_files[0]  # Use the first matching zip

            output_path = None

            # Extract the zip file and create web player
            if web_zip.exists():
                web_dir = build_dest / f"{project_name}-web"

                # Clean the directory for a fresh build
                if web_dir.exists():
                    logger.info("Removing old build directory", path=str(web_dir))
                    shutil.rmtree(web_dir)

                logger.info(
                    "Extracting web build",
                    zip_file=str(web_zip),
                    destination=str(web_dir),
                )
                try:
                    # Extract game files
                    with zipfile.ZipFile(web_zip, "r") as zip_ref:
                        zip_ref.extractall(web_dir)
                    logger.info("Web build extracted successfully", path=str(web_dir))

                    # Copy web runtime files and create proper web player
                    if self._create_web_player(web_dir, project_name):
                        # Create game.zip with all game files as expected by web player
                        game_zip = web_dir / "game.zip"
                        logger.info("Creating game.zip for web player")
                        with zipfile.ZipFile(game_zip, "w", zipfile.ZIP_DEFLATED) as zf:
                            # Include all files except web runtime files
                            exclude_files = {
                                "index.html",
                                "index.html.symbols",
                                "manifest.json",
                                "renpy-pre.js",
                                "renpy.data",
                                "renpy.js",
                                "renpy.wasm",
                                "service-worker.js",
                                "web-icon.png",
                                "web-presplash.jpg",
                            }

                            for file_path in web_dir.rglob("*"):
                                if (
                                    file_path.is_file()
                                    and file_path.name not in exclude_files
                                ):
                                    # Don't include game.zip itself
                                    if file_path == game_zip:
                                        continue
                                    arcname = file_path.relative_to(web_dir)
                                    zf.write(file_path, arcname)
                                    logger.debug("Added to game.zip", file=str(arcname))
                        output_path = web_dir
                    else:
                        logger.warning(
                            "Failed to create web player, using extracted files"
                        )
                        output_path = web_dir
                except Exception as e:
                    logger.error("Failed to process web build", error=str(e))
                    output_path = web_zip
            else:
                # Check if already in directory format
                web_dir = build_dest / f"{project_name}-web"
                if web_dir.exists():
                    output_path = web_dir

            logger.info(
                "Ren'Py build succeeded",
                target=request.target,
                output=str(output_path) if output_path else None,
            )
            return BuildResult(
                project_name=request.project_name,
                target=request.target,
                success=True,
                output_path=output_path,
                log_path=log_file,
            )

        error_message = f"Ren'Py exited with status {returncode}"
        if log_file.exists():
            error_message += f". See log at {log_file}"
        logger.error("Ren'Py build failed", returncode=returncode, log=str(log_file))
        return BuildResult(
            project_name=request.project_name,
            target=request.target,
            success=False,
            log_path=log_file,
            error=error_message,
        )

    def _find_executable(self) -> Optional[Path]:
        candidates = [
            self.sdk_path / "renpy.sh",
            self.sdk_path / "renpy.exe",
            self.sdk_path / "renpy",
        ]
        for candidate in candidates:
            if candidate.exists():
                return candidate.resolve()
        # macOS app bundle fallback
        if platform.system() == "Darwin":
            bundle = self.sdk_path / "Ren'Py.app" / "Contents" / "MacOS" / "python"
            if bundle.exists():
                return bundle.resolve()
        return None

    def _build_env(self) -> dict[str, str]:
        env = os.environ.copy()
        env.setdefault("SDL_VIDEODRIVER", "dummy")
        env.setdefault("SDL_AUDIODRIVER", "dummy")
        env.setdefault("RENPY_FORCE_SOFTWARE", "1")
        env.setdefault("RENPY_DISABLE_UPDATE", "1")
        env.setdefault("RENPY_DISABLE_JOYSTICK", "1")
        return env

    def _create_web_player(self, web_dir: Path, project_name: str) -> bool:
        """Copy web runtime files from SDK and create a proper web player."""
        web_runtime = self.sdk_path / "web"
        if not web_runtime.exists():
            logger.error("Web runtime not found in SDK", path=str(web_runtime))
            return False

        logger.info("Creating web player", destination=str(web_dir))

        # Copy all web runtime files except index.html (we'll customize it)
        for item in web_runtime.iterdir():
            if item.name == "index.html":
                # Customize index.html with project name
                with open(item, "r", encoding="utf-8") as f:
                    html_content = f.read()
                html_content = html_content.replace("%%TITLE%%", project_name)
                with open(web_dir / "index.html", "w", encoding="utf-8") as f:
                    f.write(html_content)
            elif item.name not in {"hash.txt"}:  # Skip hash.txt
                dest = web_dir / item.name
                if item.is_file():
                    shutil.copy2(item, dest)
                elif item.is_dir():
                    shutil.copytree(item, dest, dirs_exist_ok=True)

        logger.info("Web player created successfully")
        return True

    def _build_command(
        self, project_dir: Path, destination: str, force_rebuild: bool
    ) -> list[str]:
        # Use the launcher's distribute command to build web packages
        launcher_path = self.sdk_path / "launcher"
        command = [str(self.executable), str(launcher_path.resolve()), "distribute"]
        command.extend(["--package", "web"])
        command.extend(["--destination", str(destination)])
        command.append(str(project_dir.resolve()))
        return command

    async def _stream_log(
        self,
        process: asyncio.subprocess.Process,
        log_file: Path,
    ) -> None:
        if process.stdout is None:
            return

        with log_file.open("wb") as log_handle:
            while True:
                chunk = await process.stdout.readline()
                if not chunk:
                    break
                log_handle.write(chunk)
                log_handle.flush()
                logger.info("renpy", line=chunk.decode(errors="ignore").rstrip())
