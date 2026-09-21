"""Deterministic build and owned-preview failure regression tests (no SDK needed)."""

import argparse
import concurrent.futures
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import time
import unittest
from unittest import mock
import urllib.error
import urllib.request
import zipfile


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/renpy.py"
spec = importlib.util.spec_from_file_location("renpy_toolchain", SCRIPT)
tool = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tool)


def web_files(directory):
    directory.mkdir(parents=True, exist_ok=True)
    for name in tool.REQUIRED_WEB:
        (directory / name).write_bytes(b"fixture")
    (directory / "renpy.wasm").write_bytes(b"\x00asm\x01\x00\x00\x00")
    (directory / "index.html").write_text("<html><body>Fixture</body></html>")
    with zipfile.ZipFile(directory / "game.zip", "w") as archive:
        archive.writestr("game/script.rpyc", "fixture")


class ToolchainTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.project = self.root / "story"
        (self.project / "game").mkdir(parents=True)
        self.sdk = self.root / "sdk"
        (self.sdk / "web").mkdir(parents=True)
        (self.sdk / "renpy.py").write_text("fixture")
        (self.sdk / "web/renpy.wasm").write_bytes(b"fixture")
        self.output = self.project.with_name(self.project.name + "-web")
        self.args = argparse.Namespace(project=str(self.project), sdk=str(self.sdk),
                                       output=None, force=False, timeout=5)
        self.patch = mock.patch.object(tool, "CACHE", self.root / "cache")
        self.patch.start()

    def tearDown(self):
        self.patch.stop()
        self.temp.cleanup()

    def fake_build(self, sdk, arguments, log, timeout, **kwargs):
        log.parent.mkdir(parents=True, exist_ok=True)
        log.write_text("Build fixture\n")
        if "web_build" in arguments:
            web_files(Path(arguments[-1]))
        return {"log": str(log), "seconds": 0.01}

    def old_build(self):
        web_files(self.output)
        tool.write_json(self.output / tool.BUILD_MARKER, {"project": str(self.project)})
        (self.output / "old-only.txt").write_text("must disappear only after success")

    def test_missing_and_corrupt_artifacts_rejected(self):
        web_files(self.output)
        (self.output / "renpy.data").unlink()
        with self.assertRaisesRegex(tool.ToolError, "required web artifacts"):
            tool.validate_web_artifacts(self.output)
        (self.output / "renpy.data").write_bytes(b"data")
        (self.output / "game.zip").write_bytes(b"not a zip")
        with self.assertRaisesRegex(tool.ToolError, "invalid game.zip"):
            tool.validate_web_artifacts(self.output)

    def test_prior_web_output_inside_game_archive_is_rejected(self):
        web_files(self.output)
        with zipfile.ZipFile(self.output / "game.zip", "a") as archive:
            archive.writestr("build/web/" + tool.BUILD_MARKER, "{}")
        with self.assertRaisesRegex(tool.ToolError, "prior web build"):
            tool.validate_web_artifacts(self.output)

    def test_existing_output_requires_force_before_running_engine(self):
        self.old_build()
        with mock.patch.object(tool, "run_engine") as engine:
            with self.assertRaisesRegex(tool.ToolError, "already exists"):
                tool.build_web(self.args)
            engine.assert_not_called()
        self.assertTrue((self.output / "old-only.txt").exists())

    def test_force_refuses_unowned_directory(self):
        self.old_build()
        (self.output / tool.BUILD_MARKER).unlink()
        self.args.force = True
        with self.assertRaisesRegex(tool.ToolError, "not owned"):
            tool.build_web(self.args)
        self.assertTrue((self.output / "old-only.txt").exists())

    def test_failed_build_preserves_previous_output(self):
        self.old_build()
        self.args.force = True
        def failure(sdk, arguments, log, timeout):
            if "web_build" in arguments:
                raise tool.ToolError("Ren'Py command failed", returncode=1)
            return {"log": str(log)}
        with mock.patch.object(tool, "run_engine", side_effect=failure):
            with self.assertRaisesRegex(tool.ToolError, "failed"):
                tool.build_web(self.args)
        self.assertTrue((self.output / "old-only.txt").exists())

    def test_zero_exit_without_new_artifacts_never_uses_stale_output(self):
        self.old_build()
        self.args.force = True
        with mock.patch.object(tool, "run_engine", return_value={"log": "fake"}):
            with self.assertRaisesRegex(tool.ToolError, "required web artifacts"):
                tool.build_web(self.args)
        self.assertTrue((self.output / "old-only.txt").exists())

    def test_successful_force_replaces_whole_build_and_injects_bridge(self):
        self.old_build()
        self.args.force = True
        with mock.patch.object(tool, "run_engine", side_effect=self.fake_build):
            result = tool.build_web(self.args)
        self.assertEqual(result["output"], str(self.output))
        self.assertFalse((self.output / "old-only.txt").exists())
        self.assertTrue((self.output / "renpy-agent.js").is_file())
        self.assertIn('src="renpy-agent.js"', (self.output / "index.html").read_text())
        self.assertEqual(tool.preview_directory(self.project), self.output)

    def test_output_ancestors_and_source_sdk_descendants_rejected(self):
        for output in (self.project, self.root, self.project / "game/export", self.project / "build/web", self.sdk, self.sdk / "web/out"):
            with self.subTest(output=output), self.assertRaises(tool.ToolError):
                tool.validate_output_path(output, self.project, self.sdk)

    def test_init_preserves_existing_files(self):
        original = self.project / "keep.txt"
        original.write_text("my story")
        with self.assertRaisesRegex(tool.ToolError, "existing files"):
            tool.init_project(argparse.Namespace(project=str(self.project), title="New"))
        self.assertEqual(original.read_text(), "my story")

    def test_lint_always_requests_error_exit(self):
        with mock.patch.object(tool, "run_engine", return_value={}) as engine:
            tool.lint_project(self.args)
        self.assertEqual(engine.call_args.args[1][-2:], ["lint", "--error-code"])

    def test_real_subprocess_failure_and_timeout_report_logs(self):
        for body, timeout, message in (("raise SystemExit(3)", 5, "failed"), ("import time; time.sleep(60)", 0.1, "timed out")):
            with self.subTest(message=message), mock.patch.object(tool, "engine_command", return_value=[sys.executable, "-c", body]):
                log = self.root / (message.replace(" ", "_") + ".log")
                with self.assertRaisesRegex(tool.ToolError, message) as caught:
                    tool.run_engine(self.sdk, [], log, timeout)
                self.assertEqual(caught.exception.details["log"], str(log))
                self.assertTrue(log.exists())

    def test_test_runner_does_not_allow_dummy_display(self):
        with mock.patch.dict(os.environ, {"SDL_VIDEODRIVER": "dummy"}):
            with self.assertRaisesRegex(tool.ToolError, "real display"):
                tool.run_engine(self.sdk, ["test"], self.root / "test.log", 1, gui=True)

    def test_zero_exit_with_no_executed_testcases_is_not_success(self):
        (self.project / "game/testcases.rpy").write_text("testcase disabled:\n    pass\n")
        self.args.testcase = None
        log = self.root / "test.log"
        log.write_text("[rpytest] Test cases : 1 | 0 passed | 0 xfailed | 0 failed | 0 xpassed | 1 skipped | 0 not run\n")
        with mock.patch.object(tool, "run_engine", return_value={"log": str(log)}):
            with self.assertRaisesRegex(tool.ToolError, "did not complete"):
                tool.test_project(self.args)

    def test_test_success_includes_actual_runner_counts(self):
        (self.project / "game/testcases.rpy").write_text("testcase route:\n    pass\n")
        self.args.testcase = None
        log = self.root / "test.log"
        log.write_text("[rpytest] Test cases : 2 | 2 passed | 0 xfailed | 0 failed | 0 xpassed | 0 skipped | 0 not run\n")
        with mock.patch.object(tool, "run_engine", return_value={"log": str(log)}):
            self.assertEqual(tool.test_project(self.args)["tests"]["passed"], 2)


class PreviewLifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name).resolve()
        self.output = self.root / "web"
        self.cache = self.root / "cache"
        web_files(self.output)
        self.env = {**os.environ, "RENPY_AGENT_CACHE": str(self.cache)}

    def call(self, *args, success=True):
        process = subprocess.run([sys.executable, str(SCRIPT), *map(str, args)],
                                 env=self.env, capture_output=True, text=True, timeout=20)
        if success:
            self.assertEqual(process.returncode, 0, process.stderr + process.stdout)
        return json.loads(process.stdout)

    def tearDown(self):
        self.call("stop", "--all")
        self.temp.cleanup()

    def test_serve_status_reuse_mime_and_stop(self):
        first = self.call("serve", self.output, "--port", 0)
        self.assertTrue(first["running"])
        self.assertTrue(first["url"].startswith("http://127.0.0.1:"))
        with urllib.request.urlopen(first["url"] + "renpy.wasm") as response:
            self.assertEqual(response.headers.get_content_type(), "application/wasm")
            self.assertIn("no-store", response.headers["Cache-Control"])
        reused = self.call("serve", self.output)
        self.assertTrue(reused["already_running"])
        self.assertEqual(reused["pid"], first["pid"])
        self.assertTrue(self.call("status", self.output)["previews"][0]["running"])
        stopped = self.call("stop", self.output)
        self.assertTrue(stopped["previews"][0]["stopped"])
        self.assertFalse(self.call("status", self.output)["previews"])

    def test_stale_or_forged_state_cannot_stop_another_server(self):
        first = self.call("serve", self.output)
        state_path = next((self.cache / "previews").glob("*.json"))
        original = json.loads(state_path.read_text())
        state_path.write_text(json.dumps({**original, "token": "wrong-owner-token"}))
        refused = self.call("stop", self.output)
        self.assertFalse(refused["previews"][0]["stopped"])
        with urllib.request.urlopen(first["url"]) as response:
            self.assertEqual(response.status, 200)
        state_path.write_text(json.dumps(original))

    def test_concurrent_serve_reuses_one_owned_process(self):
        with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
            states = list(pool.map(lambda _: self.call("serve", self.output), range(2)))
        self.assertEqual(states[0]["pid"], states[1]["pid"])
        self.assertEqual(sum(state["already_running"] for state in states), 1)

    def test_outside_symlinks_and_hidden_files_not_served(self):
        (self.root / "secret.txt").write_text("secret")
        (self.output / "escape.txt").symlink_to(self.root / "secret.txt")
        (self.output / ".private").write_text("secret")
        preview = self.call("serve", self.output)
        for path in ("escape.txt", ".private"):
            with self.subTest(path=path), self.assertRaises(urllib.error.HTTPError) as caught:
                urllib.request.urlopen(preview["url"] + path)
            self.assertEqual(caught.exception.code, 403)


if __name__ == "__main__":
    unittest.main()
