"""Manage lightweight HTTP preview servers for built games."""

from __future__ import annotations

import asyncio
import socket
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Optional

import structlog

logger = structlog.get_logger(__name__)


@dataclass
class PreviewServer:
    project_name: str
    directory: Path
    port: int
    process: asyncio.subprocess.Process

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/index.html"


class PreviewManager:
    """Track running preview servers."""

    def __init__(self) -> None:
        self._servers: Dict[str, PreviewServer] = {}

    async def start(self, project_name: str, directory: Path) -> PreviewServer:
        """Start a preview server serving from the given directory."""
        existing = self._servers.get(project_name)
        if existing:
            await self.stop(project_name)

        port = self._allocate_port()
        command = [
            sys.executable,
            "-m",
            "http.server",
            str(port),
            "--directory",
            str(directory),
        ]

        logger.info(
            "Starting preview server",
            project=project_name,
            directory=str(directory),
            port=port,
            command=command,
        )

        process = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
        )

        server = PreviewServer(
            project_name=project_name,
            directory=directory,
            port=port,
            process=process,
        )
        self._servers[project_name] = server
        return server

    async def stop(self, project_name: str) -> bool:
        """Stop a running preview server."""
        server = self._servers.pop(project_name, None)
        if not server:
            return False

        logger.info("Stopping preview server", project=project_name, port=server.port)
        server.process.terminate()
        try:
            await asyncio.wait_for(server.process.wait(), timeout=5)
        except asyncio.TimeoutError:
            logger.warning("Force killing preview server", project=project_name)
            server.process.kill()
        return True

    async def stop_all(self) -> None:
        """Terminate all running servers."""
        for project_name in list(self._servers.keys()):
            await self.stop(project_name)

    def _allocate_port(self) -> int:
        """Allocate an ephemeral localhost port."""
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            sock.bind(("127.0.0.1", 0))
            return sock.getsockname()[1]
