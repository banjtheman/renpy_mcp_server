"""Engine-side protocol regression tests; a real web playthrough remains required."""
import json
from pathlib import Path
import sys
import textwrap
from types import ModuleType, SimpleNamespace
import unittest
from unittest.mock import patch


HELPER = Path(__file__).resolve().parents[1] / "assets/bridge/renpy_agent.rpy"


class FakeChoice:
    caption = "Take the lantern"

    def __init__(self):
        self.used = False
        self.action = self

    def __call__(self):
        self.used = True
        return 7


class BridgeTests(unittest.TestCase):
    def setUp(self):
        self.choice = FakeChoice()
        self.command = None
        self.sent = []
        self.screen = "choice"
        self.renpy = ModuleType("renpy")
        self.api = ModuleType("renpy.exports")
        self.renpy.exports = self.api
        # Match the engine's real namespace split; public functions must not
        # accidentally be called on the raw renpy package.
        self.api.substitute = str
        self.api.filter_text_tags = lambda value, **kw: value
        self.api.get_screen = lambda name: name == self.screen
        self.api.get_screen_variable = lambda name, **kw: [self.choice]
        self.api.is_sensitive = lambda action: True
        self.api.run = lambda action: action()
        self.renpy.config = SimpleNamespace(name="Test game")
        self.renpy.store = SimpleNamespace(renpy_agent_variables=("ending", "_private"),
            ending="Dock", _private="must not be exposed")
        self.api.emscripten = SimpleNamespace(
            run_script_string=lambda script: json.dumps(self.command), run_script=self.sent.append)
        code = HELPER.read_text().split("init -90 python in renpy_agent:\n", 1)[1].split("\ninit 90 python:", 1)[0]
        namespace = {}
        with patch.dict(sys.modules, {"renpy": self.renpy}):
            exec(compile(textwrap.dedent(code), str(HELPER), "exec"), namespace)
        self.bridge = namespace["bridge"]

    def reply(self):
        script = next(script for script in reversed(self.sent) if "._reply(" in script)
        return json.loads(script.split("._reply(", 1)[1][:-2])

    def test_real_choice_action_return_and_allowlisted_variables(self):
        state, _ = self.bridge.state()
        self.assertEqual(state["variables"], {"ending": "Dock"})
        self.command = {"id": "1", "action": "choose", "revision": state["revision"], "choice_id": "0"}
        self.assertEqual(self.bridge.poll(), 7)
        self.assertTrue(self.choice.used)
        self.assertTrue(self.reply()["ok"])

    def test_stale_revision_cannot_select_even_identical_choice(self):
        state, _ = self.bridge.state()
        self.command = {"id": "1", "action": "choose", "revision": state["revision"], "choice_id": "0"}
        self.bridge.begin_interaction()
        self.assertIsNone(self.bridge.poll())
        self.assertFalse(self.choice.used)
        self.assertIn("Stale revision", self.reply()["error"])

    def test_arbitrary_action_rejected(self):
        state, _ = self.bridge.state()
        self.command = {"id": "1", "action": "eval", "revision": state["revision"], "code": "raise Exception('unsafe')"}
        self.bridge.poll()
        self.assertFalse(self.reply()["ok"])
        self.assertIn("Unknown action", self.reply()["error"])

    def test_boolean_revision_is_rejected(self):
        self.command = {"id": "1", "action": "choose", "revision": True, "choice_id": "0"}
        self.bridge.poll()
        self.assertFalse(self.choice.used)
        self.assertIn("Stale revision", self.reply()["error"])


if __name__ == "__main__":
    unittest.main()
