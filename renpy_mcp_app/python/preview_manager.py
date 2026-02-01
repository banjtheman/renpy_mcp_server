#!/usr/bin/env python3
"""
Preview server manager.

Starts/stops local HTTP servers for previewing built web games.
Called from TypeScript via python-runner.ts.

Usage:
  python preview_manager.py --project myproject --action start
  python preview_manager.py --project myproject --action stop --pid 12345
"""

from __future__ import annotations

import argparse
import http.server
import json
import os
import signal
import socketserver
import subprocess
import sys
from pathlib import Path


def find_web_build(project_name: str, workspace: Path) -> Path | None:
    """Find the web build directory for a project.

    The web files might be:
    1. Directly in the web_dir (new builds with fixed SDK path)
    2. In a web/ subdirectory (old builds or SDK nested structure)
    """
    # Check at workspace level first (preferred location)
    web_dir = workspace / f"{project_name}-dists" / f"{project_name}-web"
    if web_dir.exists():
        # Check if index.html is in web/ subdirectory
        if (web_dir / "web" / "index.html").exists():
            return web_dir / "web"
        if (web_dir / "index.html").exists():
            return web_dir
        # Fall through to check other locations

    # Check inside project directory (legacy location)
    project_dir = workspace / project_name
    web_dir = project_dir / f"{project_name}-dists" / f"{project_name}-web"
    if web_dir.exists():
        # Check if index.html is in web/ subdirectory
        if (web_dir / "web" / "index.html").exists():
            return web_dir / "web"
        if (web_dir / "index.html").exists():
            return web_dir

    return None


class CORSRequestHandler(http.server.SimpleHTTPRequestHandler):
    """HTTP request handler with CORS headers for cross-origin blob URL requests."""

    def __init__(self, *args, directory: str | None = None, **kwargs):
        super().__init__(*args, directory=directory or ".", **kwargs)

    def end_headers(self):
        # Add CORS headers to allow requests from blob: origins
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.send_header("Cross-Origin-Embedder-Policy", "require-corp")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        # Add CORP header to allow resources to be loaded from blob context
        self.send_header("Cross-Origin-Resource-Policy", "cross-origin")
        super().end_headers()

    def do_OPTIONS(self):
        """Handle CORS preflight requests."""
        self.send_response(200)
        self.end_headers()

    def log_message(self, _format, *_args):
        # Suppress logging to avoid polluting stderr
        pass


def run_cors_server(port: int, directory: str):
    """Run the CORS-enabled HTTP server (called as subprocess)."""
    os.chdir(directory)
    with socketserver.TCPServer(("", port), CORSRequestHandler) as httpd:
        httpd.serve_forever()


def start_server(project_name: str, workspace: Path) -> dict:
    """Start a preview server for the project.

    Returns dict with pid, port, and url.
    """
    web_dir = find_web_build(project_name, workspace)
    if not web_dir:
        return {
            "success": False,
            "error": f"Web build not found for {project_name}. Run build_project first.",
        }

    # Find an available port
    import socket

    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    sock.bind(("", 0))
    port = sock.getsockname()[1]
    sock.close()

    # Start HTTP server with CORS as subprocess
    # We use this same script with --serve flag to run the server
    process = subprocess.Popen(
        [
            sys.executable,
            __file__,
            "--serve",
            "--port",
            str(port),
            "--directory",
            str(web_dir),
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    return {
        "success": True,
        "pid": process.pid,
        "port": port,
        "url": f"http://127.0.0.1:{port}/index.html",
        "build_dir": str(web_dir),
    }


def stop_server(pid: int) -> dict:
    """Stop a preview server by PID."""
    try:
        os.kill(pid, signal.SIGTERM)
        return {"success": True, "pid": pid}
    except ProcessLookupError:
        return {"success": True, "pid": pid, "note": "Process already stopped"}
    except Exception as e:
        return {"success": False, "error": str(e), "pid": pid}


def main():
    parser = argparse.ArgumentParser(description="Manage preview servers")
    parser.add_argument("--project", help="Project name")
    parser.add_argument("--action", choices=["start", "stop"])
    parser.add_argument("--pid", type=int, help="PID for stop action")
    # Server mode arguments (when run as subprocess)
    parser.add_argument("--serve", action="store_true", help="Run as CORS server")
    parser.add_argument("--port", type=int, help="Port for server")
    parser.add_argument("--directory", help="Directory to serve")

    args = parser.parse_args()

    # If --serve flag, run as CORS server (blocking)
    if args.serve:
        if not args.port or not args.directory:
            print(json.dumps({"success": False, "error": "--port and --directory required for --serve"}))
            sys.exit(1)
        run_cors_server(args.port, args.directory)
        return  # Never reached

    # Otherwise, manage servers
    if not args.project or not args.action:
        print(json.dumps({"success": False, "error": "--project and --action required"}))
        sys.exit(1)

    # Get workspace from environment
    workspace = os.environ.get("RENPY_MCP_WORKSPACE")
    if not workspace:
        data_dir = os.environ.get(
            "RENPY_STUDIO_DATA_DIR", os.path.expanduser("~/.renpy-studio")
        )
        workspace = os.path.join(data_dir, "workspace")

    if args.action == "start":
        result = start_server(args.project, Path(workspace))
    elif args.action == "stop":
        if not args.pid:
            result = {"success": False, "error": "PID required for stop action"}
        else:
            result = stop_server(args.pid)
    else:
        result = {"success": False, "error": f"Unknown action: {args.action}"}

    # Output JSON result
    print(json.dumps(result))

    # Exit with appropriate code
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
