"""Manage lightweight HTTP preview servers for built games.

Uses synchronous subprocess.Popen with platform-specific detach flags so the
spawned http.server is fully independent of asyncio's event loop lifecycle.
The previous asyncio.subprocess approach died whenever the MCP framework
recycled the loop between tool calls.
"""

from __future__ import annotations

import asyncio
import platform
import socket
import subprocess
import sys
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional

import structlog

logger = structlog.get_logger(__name__)


# Windows process-creation flags. Using literal values so we don't have to
# conditionally import subprocess attributes that don't exist on POSIX.
#
# NOTE on DETACHED_PROCESS vs CREATE_NO_WINDOW:
#   DETACHED_PROCESS (0x00000008) removes the child's console entirely.
#   On Windows this breaks stdout/stderr inheritance — http.server then
#   fails to initialize its standard streams and exits silently with a
#   zero-byte log. CREATE_NO_WINDOW (0x08000000) hides the console window
#   without severing handle inheritance, so file-handle redirection still
#   works. We want the latter.
_WIN_CREATE_NEW_PROCESS_GROUP = 0x00000200
_WIN_CREATE_NO_WINDOW = 0x08000000


@dataclass
class PreviewServer:
    project_name: str
    directory: Path
    port: int
    process: subprocess.Popen
    log_path: Optional[Path] = None

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.port}/index.html"


class PreviewManager:
    """Track running preview servers."""

    def __init__(self) -> None:
        self._servers: Dict[str, PreviewServer] = {}

    async def start(self, project_name: str, directory: Path) -> PreviewServer:
        """Start a preview server serving from the given directory.

        Verifies the port is actually listening before returning. If startup
        fails, raises RuntimeError with the captured stderr so callers see
        the real cause instead of "connection refused" later.
        """
        existing = self._servers.get(project_name)
        if existing:
            await self.stop(project_name)

        port = self._allocate_port()
        log_path = directory / "logs" / "preview-server.log"
        log_path.parent.mkdir(parents=True, exist_ok=True)

        command = [
            sys.executable,
            "-u",  # unbuffered output so the log is useful in real time
            "-m",
            "http.server",
            str(port),
            "--bind",
            "127.0.0.1",
            "--directory",
            str(directory),
        ]

        # Platform-specific detach so the process survives asyncio teardown.
        # See module-level note on flag choice — DETACHED_PROCESS breaks
        # stdout inheritance on Windows; CREATE_NO_WINDOW does not.
        if platform.system() == "Windows":
            creationflags = _WIN_CREATE_NO_WINDOW | _WIN_CREATE_NEW_PROCESS_GROUP
            popen_kwargs = {"creationflags": creationflags}
        else:
            popen_kwargs = {"start_new_session": True}

        logger.info(
            "Starting preview server",
            project=project_name,
            directory=str(directory),
            port=port,
            log=str(log_path),
        )

        # Open the log file. Mode "wb" (truncate) so each preview run starts
        # with a clean slate — easier to diagnose than tailing append history.
        # Write a header so we can prove this code path was reached.
        log_handle = open(log_path, "wb")
        log_handle.write(
            (
                "=== preview_manager start ===\n"
                f"cmd: {command!r}\n"
                f"cwd: {directory!s}\n"
                f"popen_kwargs: {popen_kwargs!r}\n"
                f"sys.executable: {sys.executable!s}\n"
            ).encode("utf-8")
        )
        log_handle.flush()

        try:
            process = subprocess.Popen(
                command,
                stdin=subprocess.DEVNULL,
                stdout=log_handle,
                stderr=subprocess.STDOUT,
                cwd=str(directory),
                **popen_kwargs,
            )
        except Exception as exc:
            log_handle.write(f"Popen raised: {exc!r}\n".encode("utf-8"))
            log_handle.close()
            raise

        log_handle.write(f"spawned pid={process.pid}\n".encode("utf-8"))
        log_handle.flush()

        # Poll the port for up to ~5s to confirm the server is actually listening.
        deadline = time.monotonic() + 5.0
        listening = False
        exit_seen = None
        while time.monotonic() < deadline:
            rc = process.poll()
            if rc is not None:
                exit_seen = rc
                break
            if self._port_is_listening(port):
                listening = True
                break
            await asyncio.sleep(0.1)

        if not listening:
            log_handle.write(
                f"port-poll failed; exit_code={exit_seen!r}\n".encode("utf-8")
            )
            log_handle.flush()
            # Capture whatever the http.server printed before dying.
            try:
                tail = self._tail_log(log_path, 4096)
            except OSError:
                tail = "(could not read log)"
            # Make sure we don't leak a half-dead process.
            try:
                process.terminate()
            except Exception:
                pass
            raise RuntimeError(
                f"Preview server failed to bind 127.0.0.1:{port}. "
                f"Log tail:\n{tail}"
            )

        server = PreviewServer(
            project_name=project_name,
            directory=directory,
            port=port,
            process=process,
            log_path=log_path,
        )
        self._servers[project_name] = server
        return server

    async def stop(self, project_name: str) -> bool:
        """Stop a running preview server."""
        server = self._servers.pop(project_name, None)
        if not server:
            return False

        logger.info("Stopping preview server", project=project_name, port=server.port)
        if server.process.poll() is None:
            server.process.terminate()
            # Give it a moment to shut down cleanly.
            for _ in range(50):
                if server.process.poll() is not None:
                    break
                await asyncio.sleep(0.1)
            else:
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

    @staticmethod
    def _port_is_listening(port: int) -> bool:
        """Return True if something is accepting connections on 127.0.0.1:port."""
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.5):
                return True
        except OSError:
            return False

    @staticmethod
    def _tail_log(path: Path, max_bytes: int) -> str:
        with open(path, "rb") as f:
            f.seek(0, 2)
            size = f.tell()
            f.seek(max(0, size - max_bytes))
            data = f.read()
        try:
            return data.decode("utf-8", errors="replace")
        except Exception:
            return repr(data)
