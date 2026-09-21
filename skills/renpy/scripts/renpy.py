#!/usr/bin/env python3
"""Standard-library Ren'Py toolchain. JSON stdout; engine output in logs."""

from __future__ import annotations

import argparse
import contextlib
import hashlib
import http.client
import http.server
import json
import os
from pathlib import Path
import platform
import re
import secrets
import shutil
import signal
import subprocess
import sys
import tarfile
import tempfile
import threading
import time
import urllib.request
import zipfile


VERSION = "8.5.3"
SKILL = Path(__file__).resolve().parents[1]
CACHE = Path(os.environ.get("RENPY_AGENT_CACHE", Path.home() / ".cache/renpy-agent")).expanduser().resolve()
SDK_DEFAULT = CACHE / "sdk" / VERSION
DOWNLOAD_BASE = f"https://www.renpy.org/dl/{VERSION}/"
HASHES = {
    f"renpy-{VERSION}-sdk.tar.bz2": "eb0a9be7f0fb13632fe25ceade9a8bed5a1b4d6b6e83bd19eeeb29e1a1bb4a45",
    f"renpy-{VERSION}-sdkarm.tar.bz2": "0579782517f203ba3535dcc2dab54e34bfc318f2f2a7510a5130b6f809f901f6",
    f"renpy-{VERSION}-web.zip": "954db897e65f51ea63cb2fb7b203d02be0447f4e22069514020bbe6c6691fdfc",
}
REQUIRED_WEB = ("index.html", "renpy.js", "renpy-pre.js", "renpy.wasm", "renpy.data", "game.zip")
BUILD_MARKER = ".renpy-agent-build.json"
HEALTH_PATH = "/__renpy_agent_health"
STOP_PATH = "/__renpy_agent_stop"


class ToolError(Exception):
    def __init__(self, message, **details):
        super().__init__(message)
        self.details = details


def write_json(path: Path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + "." + secrets.token_hex(6) + ".tmp")
    try:
        tmp.write_text(json.dumps(value, indent=2) + "\n", encoding="utf-8")
        tmp.chmod(0o600)
        tmp.replace(path)
    finally:
        tmp.unlink(missing_ok=True)


def read_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def sha256(path: Path):
    digest = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def contained(path: Path, parent: Path):
    return path == parent or parent in path.parents


def project_path(value):
    project = Path(value).expanduser().resolve()
    if not (project / "game").is_dir():
        raise ToolError("Expected a Ren'Py project containing game/", project=str(project))
    return project


def sdk_path(args):
    value = getattr(args, "sdk", None) or os.environ.get("RENPY_SDK_PATH") or SDK_DEFAULT
    sdk = Path(value).expanduser().resolve()
    if not (sdk / "renpy.py").is_file():
        raise ToolError("Ren'Py SDK missing; run setup or set --sdk / RENPY_SDK_PATH", sdk=str(sdk))
    return sdk


def engine_command(sdk: Path):
    if os.name == "nt":
        executable = sdk / "lib/py3-windows-x86_64/python.exe"
        if not executable.is_file():
            raise ToolError("SDK Windows Python runtime missing", sdk=str(sdk))
        return [str(executable), str(sdk / "renpy.py")]
    executable = sdk / "renpy.sh"
    if not executable.is_file() or not os.access(executable, os.X_OK):
        raise ToolError("SDK launcher missing or not executable", launcher=str(executable))
    return [str(executable)]


def terminate_child(process):
    """Only terminate a process group created and retained by this invocation."""
    if process.poll() is not None:
        return
    if os.name == "posix":
        with contextlib.suppress(ProcessLookupError):
            os.killpg(process.pid, signal.SIGTERM)
    else:
        process.terminate()
    try:
        process.wait(timeout=3)
    except subprocess.TimeoutExpired:
        if os.name == "posix":
            with contextlib.suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)
        else:
            process.kill()
        process.wait()


def run_engine(sdk, arguments, log, timeout, *, gui=False):
    if timeout <= 0:
        raise ToolError("Timeout must be positive")
    env = os.environ.copy()
    # Tests require a real display. Preserve normal renderer/audio preferences.
    if gui and env.get("SDL_VIDEODRIVER", "").lower() == "dummy":
        raise ToolError("Ren'Py tests require a real display; unset SDL_VIDEODRIVER=dummy")
    if not gui:
        env["SDL_VIDEODRIVER"] = "dummy"
        env["SDL_AUDIODRIVER"] = "dummy"
    command = engine_command(sdk) + list(map(str, arguments))
    log.parent.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    with log.open("w", encoding="utf-8") as output:
        output.write("Command: " + json.dumps(command) + "\n")
        output.flush()
        process = subprocess.Popen(command, cwd=sdk, env=env, stdin=subprocess.DEVNULL,
                                   stdout=output, stderr=subprocess.STDOUT, start_new_session=True)
        try:
            code = process.wait(timeout=timeout)
        except subprocess.TimeoutExpired:
            terminate_child(process)
            raise ToolError("Ren'Py command timed out", log=str(log), timeout=timeout, command=command)
        except BaseException:
            terminate_child(process)
            raise
    if code:
        raise ToolError("Ren'Py command failed", returncode=code, log=str(log), command=command)
    return {"log": str(log), "seconds": round(time.monotonic() - started, 3), "command": command}


def new_log(project, operation):
    stamp = time.strftime("%Y%m%dT%H%M%S") + "-" + secrets.token_hex(4)
    return project / ".renpy-agent/logs" / f"{stamp}-{operation}.log"


def download_verified(name, directory):
    directory.mkdir(parents=True, exist_ok=True)
    destination = directory / name
    expected = HASHES[name]
    if destination.is_file() and sha256(destination) == expected:
        return destination
    temporary = destination.with_suffix(destination.suffix + ".part-" + secrets.token_hex(4))
    print(f"Downloading {name}", file=sys.stderr, flush=True)
    try:
        with urllib.request.urlopen(DOWNLOAD_BASE + name, timeout=60) as source, temporary.open("wb") as output:
            shutil.copyfileobj(source, output)
        if sha256(temporary) != expected:
            raise ToolError("Download failed SHA-256 verification", file=name)
        temporary.replace(destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def extract_zip_safely(archive, destination):
    with zipfile.ZipFile(archive) as source:
        for info in source.infolist():
            path = (destination / info.filename).resolve()
            if not contained(path, destination.resolve()) or ((info.external_attr >> 16) & 0o170000) == 0o120000:
                raise ToolError("Unsafe path or symlink in archive", member=info.filename)
        source.extractall(destination)


def setup(args):
    destination = SDK_DEFAULT
    marker = read_json(destination / ".renpy-agent-sdk.json")
    if destination.exists():
        if marker and marker.get("version") == VERSION and (destination / "renpy.py").is_file() and (destination / "web/renpy.wasm").is_file():
            return {"sdk": str(destination), "version": VERSION, "already_installed": True}
        raise ToolError("SDK cache destination already exists without a valid installation; it was not replaced", sdk=str(destination))
    downloads = CACHE / "downloads" / VERSION
    downloads.mkdir(parents=True, exist_ok=True)
    # Verify both the published checksum list and the pinned release hashes.
    with urllib.request.urlopen(DOWNLOAD_BASE + "checksums.txt", timeout=60) as response:
        checksums = response.read().decode("utf-8")
    arm_linux = platform.system() == "Linux" and platform.machine().lower() in {"aarch64", "arm64"}
    archive_name = f"renpy-{VERSION}-{'sdkarm' if arm_linux else 'sdk'}.tar.bz2"
    web_name = f"renpy-{VERSION}-web.zip"
    for name in (archive_name, web_name):
        if not re.search(r"(?m)^" + HASHES[name] + r"\s+" + re.escape(name) + r"$", checksums):
            raise ToolError("Published SHA-256 does not match pinned release", file=name)
    (downloads / "checksums.txt").write_text(checksums, encoding="utf-8")
    sdk_archive = download_verified(archive_name, downloads)
    web_archive = download_verified(web_name, downloads)
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".install-", dir=destination.parent) as temporary:
        root = Path(temporary)
        with tarfile.open(sdk_archive) as archive:
            if not hasattr(tarfile, "data_filter"):
                raise ToolError("Setup requires Python with tarfile data filter (Python 3.11.8+)")
            archive.extractall(root, filter="data")
        sdk = root / f"renpy-{VERSION}-sdk"
        if not sdk.is_dir():
            raise ToolError("Unexpected SDK archive layout")
        extract_zip_safely(web_archive, sdk)
        if not (sdk / "renpy.py").is_file() or not (sdk / "web/renpy.wasm").is_file():
            raise ToolError("SDK installation is incomplete")
        write_json(sdk / ".renpy-agent-sdk.json", {
            "version": VERSION, "sha256": {name: HASHES[name] for name in (archive_name, web_name)},
            "source": DOWNLOAD_BASE + "checksums.txt", "installed_at": time.time(),
        })
        # Never replace an existing SDK, including another concurrent install.
        if destination.exists():
            raise ToolError("Another installation created the SDK destination; no files replaced")
        sdk.rename(destination)
    return {"sdk": str(destination), "version": VERSION, "already_installed": False}


def doctor(args):
    sdk = sdk_path(args)
    log = CACHE / "logs" / ("doctor-" + secrets.token_hex(6) + ".log")
    result = run_engine(sdk, ["--version"], log, 30)
    missing = [name for name in REQUIRED_WEB if name not in {"game.zip"} and not (sdk / "web" / name).is_file()]
    if missing:
        raise ToolError("SDK web support is incomplete", sdk=str(sdk), missing=missing, log=str(log))
    return {"sdk": str(sdk), "platform": platform.system(), "machine": platform.machine(),
            "python": sys.version.split()[0], "engine_version": log.read_text().strip().splitlines()[-1],
            "web_support": True, **result}


def init_project(args):
    project = Path(args.project).expanduser().resolve()
    if project.exists() and (not project.is_dir() or any(project.iterdir())):
        raise ToolError("Init requires a new or empty directory; existing files were not changed", project=str(project))
    title = args.title or project.name.replace("_", " ").replace("-", " ").title()
    if not title.strip() or any(ord(c) < 32 for c in title):
        raise ToolError("Title must be non-empty text without control characters")
    slug = re.sub(r"[^a-z0-9]+", "_", project.name.lower()).strip("_") or "visual_novel"
    template = SKILL / "assets/template"
    bridge = SKILL / "assets/bridge/renpy_agent.rpy"
    if not template.is_dir() or not bridge.is_file():
        raise ToolError("Skill template or bridge asset is missing", template=str(template), bridge=str(bridge))
    project.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".renpy-init-", dir=project.parent) as temporary:
        prepared = Path(temporary) / "project"
        shutil.copytree(template, prepared)
        # Titles occur inside quoted Ren'Py/Python strings in the template.
        escaped_title = json.dumps(title, ensure_ascii=False)[1:-1]
        for path in prepared.rglob("*"):
            if path.is_file():
                try:
                    text = path.read_text(encoding="utf-8")
                except UnicodeDecodeError:
                    continue
                replacement = escaped_title if path.suffix == ".rpy" else title
                path.write_text(text.replace("__PROJECT_TITLE__", replacement).replace("__PROJECT_SLUG__", slug), encoding="utf-8")
        (prepared / "game").mkdir(exist_ok=True)
        shutil.copy2(bridge, prepared / "game/renpy_agent.rpy")
        if project.exists():
            project.rmdir()  # Fails safely if a concurrent writer populated it.
        prepared.rename(project)
    return {"project": str(project), "title": title, "slug": slug}


def lint_project(args):
    project, sdk = project_path(args.project), sdk_path(args)
    return {"project": str(project), **run_engine(sdk, [project, "lint", "--error-code"], new_log(project, "lint"), args.timeout)}


def test_project(args):
    project, sdk = project_path(args.project), sdk_path(args)
    if not any(re.search(r"(?m)^\s*testcase\s+", p.read_text(encoding="utf-8")) for p in (project / "game").rglob("*.rpy")):
        raise ToolError("No Ren'Py testcase declarations found; refusing a vacuous test pass", project=str(project))
    arguments = [project, "test"]
    if args.testcase:
        arguments.append(args.testcase)
    arguments.append("--report-detailed")
    result = run_engine(sdk, arguments, new_log(project, "test"), args.timeout, gui=True)
    text = re.sub(r"\x1b\[[0-9;]*m", "", Path(result["log"]).read_text(encoding="utf-8"))
    summary = re.search(r"Test cases\s*:\s*(\d+)\s*\|\s*(\d+) passed\s*\|\s*(\d+) xfailed\s*\|\s*(\d+) failed\s*\|\s*(\d+) xpassed\s*\|\s*(\d+) skipped\s*\|\s*(\d+) not run", text)
    if not summary:
        raise ToolError("Test runner exited without a completed test summary", log=result["log"])
    tests = dict(zip(("total", "passed", "xfailed", "failed", "xpassed", "skipped", "not_run"), map(int, summary.groups())))
    if tests["passed"] + tests["xfailed"] == 0 or tests["failed"] or tests["xpassed"] or tests["not_run"]:
        raise ToolError("Test run did not complete successfully", tests=tests, log=result["log"])
    return {"project": str(project), "testcase": args.testcase or "global", "tests": tests, **result}


def validate_output_path(output, project, sdk):
    # Protect source, SDK, and symlinked ancestors even when --force is given.
    for protected in (project / "game", sdk):
        if contained(protected, output) or contained(output, protected):
            raise ToolError("Build output overlaps project source or SDK", output=str(output), protected=str(protected))
    if contained(output, project) or contained(project, output):
        raise ToolError("Build output must be outside the project to prevent recursive packaging", output=str(output))


def validate_web_artifacts(directory):
    missing = [name for name in REQUIRED_WEB if not (directory / name).is_file() or (directory / name).stat().st_size == 0]
    if missing:
        raise ToolError("Build did not produce all required web artifacts", output=str(directory), missing=missing)
    if (directory / "renpy.wasm").read_bytes()[:4] != b"\x00asm":
        raise ToolError("Build produced invalid WebAssembly", output=str(directory))
    try:
        with zipfile.ZipFile(directory / "game.zip") as archive:
            if not archive.namelist() or archive.testzip():
                raise ToolError("Build produced empty or corrupt game.zip")
            nested = [name for name in archive.namelist() if name.rstrip("/").endswith("/" + BUILD_MARKER) or name == BUILD_MARKER]
            if nested:
                raise ToolError("A prior web build was packaged inside game.zip; move that output outside the project or exclude it in build.classify", nested_build_markers=nested)
    except zipfile.BadZipFile as error:
        raise ToolError("Build produced invalid game.zip") from error
    html = (directory / "index.html").read_text(encoding="utf-8")
    if "</body>" not in html.lower():
        raise ToolError("Build produced invalid index.html")
    return {name: (directory / name).stat().st_size for name in REQUIRED_WEB}


def inject_web_bridge(directory):
    bridge = SKILL / "assets/web/renpy-agent.js"
    if not bridge.is_file():
        raise ToolError("Skill browser bridge is missing", bridge=str(bridge))
    shutil.copy2(bridge, directory / "renpy-agent.js")
    index = directory / "index.html"
    html = index.read_text(encoding="utf-8")
    html = re.sub(r"</body>", '<script src="renpy-agent.js"></script>\n</body>', html, count=1, flags=re.I)
    index.write_text(html, encoding="utf-8")
    catalog_path = directory / "pwa_catalog.json"
    catalog = read_json(catalog_path)
    if catalog and isinstance(catalog.get("files"), list) and "renpy-agent.js" not in catalog["files"]:
        catalog["files"].append("renpy-agent.js")
        write_json(catalog_path, catalog)


def build_web(args):
    project, sdk = project_path(args.project), sdk_path(args)
    output = Path(args.output).expanduser().resolve() if args.output else project.with_name(project.name + "-web")
    validate_output_path(output, project, sdk)
    if output.exists():
        marker = read_json(output / BUILD_MARKER)
        if not args.force:
            raise ToolError("Build output already exists; use --force to replace a prior skill build", output=str(output))
        if not marker or marker.get("project") != str(project):
            raise ToolError("Refusing to replace an output directory not owned by this project's skill build", output=str(output))
    if not (sdk / "web/renpy.wasm").is_file():
        raise ToolError("SDK web support missing; run setup with the pinned SDK")
    lint = run_engine(sdk, [project, "lint", "--error-code"], new_log(project, "lint"), args.timeout)
    work = CACHE / "builds"
    work.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix="web-", dir=work) as temporary:
        fresh = Path(temporary) / "web"
        log = new_log(project, "build-web")
        result = run_engine(sdk, ["launcher", "web_build", project, "--destination", fresh], log, args.timeout)
        try:
            artifacts = validate_web_artifacts(fresh)
            inject_web_bridge(fresh)
            artifacts = {name: (fresh / name).stat().st_size for name in (*REQUIRED_WEB, "renpy-agent.js")}
        except ToolError as error:
            error.details["log"] = str(log)
            raise
        build_id = secrets.token_hex(12)
        manifest = {"project": str(project), "sdk": str(sdk), "build_id": build_id,
                    "built_at": time.time(), "artifacts": artifacts, "log": str(log)}
        write_json(fresh / BUILD_MARKER, manifest)
        # Stage alongside destination for an atomic final rename, even across volumes.
        output.parent.mkdir(parents=True, exist_ok=True)
        staged = output.with_name("." + output.name + ".new-" + build_id)
        backup = output.with_name("." + output.name + ".old-" + build_id)
        try:
            shutil.copytree(fresh, staged)
            # Recheck ownership immediately before replacing an old build.
            if output.exists():
                marker = read_json(output / BUILD_MARKER)
                if not args.force or not marker or marker.get("project") != str(project):
                    raise ToolError("Output changed during build; leaving it untouched", output=str(output))
                output.rename(backup)
            try:
                staged.rename(output)
            except BaseException:
                if backup.exists():
                    backup.rename(output)
                raise
            if backup.exists():
                shutil.rmtree(backup)
        finally:
            if staged.exists():
                shutil.rmtree(staged)
    write_json(project / ".renpy-agent/latest-build.json", {**manifest, "output": str(output)})
    return {"project": str(project), "output": str(output), "build_id": build_id,
            "artifacts": artifacts, "lint_log": lint["log"], **result}


def preview_directory(value):
    target = Path(value).expanduser().resolve()
    if (target / "game").is_dir():
        latest = read_json(target / ".renpy-agent/latest-build.json")
        target = Path(latest["output"]).resolve() if latest and latest.get("output") else target.with_name(target.name + "-web")
    return target


def preview_state_path(directory):
    return CACHE / "previews" / (hashlib.sha256(str(directory).encode()).hexdigest()[:24] + ".json")


@contextlib.contextmanager
def preview_lock(path):
    """Serialize start/stop so concurrent callers cannot orphan a server."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.with_suffix(".lock").open("a+b") as lock:
        if os.name == "posix":
            import fcntl
            fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        else:
            import msvcrt
            lock.seek(0)
            lock.write(b"\0")
            lock.flush()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_LOCK, 1)
        try:
            yield
        finally:
            if os.name == "posix":
                fcntl.flock(lock.fileno(), fcntl.LOCK_UN)
            else:
                lock.seek(0)
                msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def request_preview(state, method="GET", path=HEALTH_PATH):
    connection = http.client.HTTPConnection("127.0.0.1", int(state["port"]), timeout=1)
    try:
        headers = {"Authorization": "Bearer " + state["token"]}
        connection.request(method, path, headers=headers)
        response = connection.getresponse()
        payload = response.read()
        if response.status != 200:
            return None
        return json.loads(payload)
    except (OSError, ValueError, http.client.HTTPException):
        return None
    finally:
        connection.close()


def owned_preview(state):
    if not state or not all(key in state for key in ("port", "token", "directory", "pid")):
        return False
    answer = request_preview(state)
    return bool(answer and answer.get("token") == state["token"] and answer.get("pid") == state["pid"] and answer.get("directory") == state["directory"])


def public_state(state, running):
    return {key: value for key, value in {**state, "running": running}.items() if key != "token"}


def serve(args):
    directory = preview_directory(args.target)
    validate_web_artifacts(directory)
    if not 0 <= args.port <= 65535:
        raise ToolError("Port must be between 0 and 65535")
    state_path = preview_state_path(directory)
    state_path.parent.mkdir(parents=True, exist_ok=True)
    with preview_lock(state_path):
        return start_preview_locked(args, directory, state_path)


def start_preview_locked(args, directory, state_path):
    state = read_json(state_path)
    if owned_preview(state):
        if args.port and args.port != state["port"]:
            raise ToolError("Preview already running on another port; stop it before changing ports", **public_state(state, True))
        return {"already_running": True, **public_state(state, True)}
    token = secrets.token_hex(32)
    log = state_path.with_suffix(".log")
    command = [sys.executable, str(Path(__file__).resolve()), "_serve", "--directory", str(directory),
               "--port", str(args.port), "--state", str(state_path), "--token", token]
    with log.open("a", encoding="utf-8") as output:
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=output, stderr=output,
                                   start_new_session=True, env=os.environ.copy())
    deadline = time.monotonic() + 10
    while time.monotonic() < deadline:
        state = read_json(state_path)
        if state and state.get("token") == token and owned_preview(state):
            return {"already_running": False, **public_state(state, True), "log": str(log)}
        if process.poll() is not None:
            raise ToolError("Preview server failed to start (port may already be in use)", log=str(log))
        time.sleep(0.05)
    terminate_child(process)
    raise ToolError("Preview server did not become ready", log=str(log))


def status(args):
    paths = [preview_state_path(preview_directory(args.target))] if args.target else sorted((CACHE / "previews").glob("*.json"))
    states = []
    for path in paths:
        state = read_json(path)
        if state:
            states.append(public_state(state, owned_preview(state)))
    return {"previews": states}


def stop(args):
    paths = sorted((CACHE / "previews").glob("*.json")) if args.all else [preview_state_path(preview_directory(args.target))]
    stopped = []
    for path in paths:
        with preview_lock(path):
            result = stop_preview_locked(path)
            if result:
                stopped.append(result)
    return {"previews": stopped}


def stop_preview_locked(path):
    state = read_json(path)
    if not state:
        return None
    if not owned_preview(state):
        return {**public_state(state, False), "stopped": False, "reason": "No matching owned server"}
    answer = request_preview(state, "POST", STOP_PATH)
    if not answer or not answer.get("stopping"):
        raise ToolError("Owned preview rejected shutdown", url=state.get("url"))
    deadline = time.monotonic() + 5
    while time.monotonic() < deadline and owned_preview(state):
        time.sleep(0.05)
    if owned_preview(state):
        raise ToolError("Preview did not stop in time", url=state.get("url"))
    return {**public_state(state, False), "stopped": True}


def serve_worker(args):
    directory = Path(args.directory).resolve()
    state_path = Path(args.state)
    token = args.token
    state = {}

    class Handler(http.server.SimpleHTTPRequestHandler):
        extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".wasm": "application/wasm", ".js": "text/javascript"}

        def __init__(self, *handler_args, **kwargs):
            super().__init__(*handler_args, directory=str(directory), **kwargs)

        def end_headers(self):
            self.send_header("Cache-Control", "no-store, max-age=0")
            self.send_header("X-Content-Type-Options", "nosniff")
            super().end_headers()

        def valid_host(self):
            return self.headers.get("Host", "") in {f"127.0.0.1:{state['port']}", f"localhost:{state['port']}"}

        def authenticated(self):
            return secrets.compare_digest(self.headers.get("Authorization", ""), "Bearer " + token)

        def json_response(self, value):
            payload = json.dumps(value).encode()
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)

        def validate_request_path(self):
            if not self.valid_host():
                self.send_error(403)
                return False
            translated = Path(self.translate_path(self.path)).resolve()
            if not contained(translated, directory) or any(part.startswith(".") for part in translated.relative_to(directory).parts):
                self.send_error(403)
                return False
            return True

        def do_HEAD(self):
            if self.validate_request_path():
                super().do_HEAD()

        def do_GET(self):
            if not self.validate_request_path():
                return
            if self.path == HEALTH_PATH:
                if not self.authenticated():
                    self.send_error(403)
                    return
                self.json_response(state)
                return
            super().do_GET()

        def do_POST(self):
            if not self.valid_host() or self.path != STOP_PATH or not self.authenticated():
                self.send_error(403)
                return
            self.json_response({"stopping": True})
            threading.Thread(target=self.server.shutdown, daemon=True).start()

        def list_directory(self, path):
            self.send_error(403, "Directory listing disabled")
            return None

    server = http.server.ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    port = server.server_address[1]
    state.update({"directory": str(directory), "pid": os.getpid(), "token": token, "port": port,
                  "url": f"http://127.0.0.1:{port}/", "started_at": time.time()})
    write_json(state_path, state)
    try:
        server.serve_forever(poll_interval=0.1)
    finally:
        server.server_close()
        current = read_json(state_path)
        if current and current.get("token") == token:
            state_path.unlink(missing_ok=True)
    return {}


def make_parser():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--sdk", help="SDK root (otherwise RENPY_SDK_PATH or the pinned cache)")
    commands = parser.add_subparsers(dest="command", required=True)
    for name, action in (("setup", setup), ("doctor", doctor), ("init", init_project), ("lint", lint_project),
                         ("test", test_project), ("build-web", build_web), ("serve", serve), ("status", status), ("stop", stop)):
        sub = commands.add_parser(name)
        sub.set_defaults(action=action)
        if name in {"doctor", "lint", "test", "build-web"}:
            sub.add_argument("--sdk", default=argparse.SUPPRESS)
        if name in {"init", "lint", "test", "build-web"}:
            sub.add_argument("project")
        if name in {"lint", "test", "build-web"}:
            sub.add_argument("--timeout", type=float, default=300 if name == "build-web" else 120)
        if name == "init":
            sub.add_argument("--title")
        elif name == "test":
            sub.add_argument("--testcase")
        elif name == "build-web":
            sub.add_argument("--output")
            sub.add_argument("--force", action="store_true")
        elif name == "serve":
            sub.add_argument("target")
            sub.add_argument("--port", type=int, default=0)
        elif name == "status":
            sub.add_argument("target", nargs="?")
        elif name == "stop":
            sub.add_argument("target", nargs="?")
            sub.add_argument("--all", action="store_true")
    worker = commands.add_parser("_serve", help=argparse.SUPPRESS)
    worker.set_defaults(action=serve_worker)
    for flag in ("directory", "state", "token"):
        worker.add_argument("--" + flag, required=True)
    worker.add_argument("--port", type=int, required=True)
    return parser


def main(argv=None):
    args = make_parser().parse_args(argv)
    try:
        if args.command == "stop" and not args.target and not args.all:
            raise ToolError("Specify a project/output path or --all")
        result = args.action(args)
        print(json.dumps({"ok": True, "operation": args.command, **result}))
        return 0
    except ToolError as error:
        print(str(error), file=sys.stderr)
        print(json.dumps({"ok": False, "operation": args.command, "error": str(error), **error.details}))
        return 1
    except (OSError, ValueError, tarfile.TarError, zipfile.BadZipFile) as error:
        print(str(error), file=sys.stderr)
        print(json.dumps({"ok": False, "operation": args.command, "error": str(error)}))
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
