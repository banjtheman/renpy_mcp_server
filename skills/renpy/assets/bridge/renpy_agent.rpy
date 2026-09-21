# Ren'Py Agent bridge v1. Copy into game/ before the official web build.
# No SDK patch, network listener, Python evaluator, or unrestricted store access.
# Desktop builds intentionally do not activate this bridge.

init -90 python in renpy_agent:
    import json
    import math
    import renpy as engine
    # The module named renpy differs from the script-visible public API.
    # Named stores need the explicit exports import for get_screen/run/etc.
    from renpy import exports as renpy

    # Browser transport state must never participate in saves or rollback.
    _constant = True

    class Bridge:
        def __init__(self):
            self.revision = 0
            self.interaction = 0
            self.signature = None

        def begin_interaction(self):
            self.interaction += 1

        def text(self, value):
            if value is None:
                return ""
            value = renpy.substitute(str(value))
            return renpy.filter_text_tags(value, allow=[])[:12000]

        def variable(self, name, screen, default=None):
            try:
                return renpy.get_screen_variable(name, screen=screen)
            except (NameError, ValueError):
                return default

        def safe_value(self, value, depth=0):
            if value is None or type(value) in (bool, int, str):
                return value[:2000] if isinstance(value, str) else value
            if type(value) is float:
                return value if math.isfinite(value) else None
            if depth < 3 and isinstance(value, (list, tuple)):
                return [self.safe_value(v, depth + 1) for v in value[:50]]
            if depth < 3 and isinstance(value, dict):
                return {str(k)[:100]: self.safe_value(v, depth + 1) for k, v in list(value.items())[:50]}
            return "<unsupported value>"

        def state(self):
            # These are the standard Ren'Py screens. A custom UI can supply its
            # own adapter by extending this method in the copied helper.
            screen_names = ("main_menu", "say", "choice", "input", "nvl",
                "preferences", "save", "load", "history", "about", "help", "confirm")
            screens = [name for name in screen_names if renpy.get_screen(name)]
            blocked = any(name in screens for name in
                ("preferences", "save", "load", "history", "about", "help", "confirm", "input"))
            main_menu = "main_menu" in screens
            items = self.variable("items", "choice", []) if "choice" in screens else []
            choices = []
            actions = {}
            for index, item in enumerate(items):
                action = getattr(item, "action", None)
                if action is None:
                    continue
                choice_id = str(index)
                enabled = bool(renpy.is_sensitive(action))
                choices.append({"id": choice_id, "text": self.text(item.caption), "enabled": enabled})
                if enabled:
                    actions[choice_id] = action

            dialogue = None
            if "say" in screens and not main_menu:
                dialogue = {"speaker": self.text(self.variable("who", "say", "")),
                    "text": self.text(self.variable("what", "say", ""))}

            phase = "blocked" if blocked else "main_menu" if main_menu else "choice" if choices else "dialogue" if dialogue else "other"
            exposed = {}
            for name in getattr(engine.store, "renpy_agent_variables", ()):
                if isinstance(name, str) and name.isidentifier() and not name.startswith("_"):
                    exposed[name] = self.safe_value(getattr(engine.store, name, None))
            state = {"protocol": 1, "ready": True, "title": self.text(engine.config.name),
                "interaction": self.interaction, "phase": phase, "screens": screens,
                "dialogue": dialogue, "choices": choices, "variables": exposed,
                "can": {"start": phase == "main_menu", "advance": phase == "dialogue",
                    "choose": phase == "choice" and bool(actions)}}
            signature = json.dumps(state, sort_keys=True, ensure_ascii=True)
            if signature != self.signature:
                self.signature = signature
                self.revision += 1
            state["revision"] = self.revision
            return state, actions

        def send(self, method, payload):
            # JSON is embedded as a value, never as caller-provided JavaScript.
            encoded = json.dumps(payload, ensure_ascii=True, allow_nan=False)
            renpy.emscripten.run_script("window.renpyAgent && window.renpyAgent.%s(%s);" % (method, encoded))

        def poll(self):
            if not renpy.emscripten:
                return
            state, actions = self.state()
            self.send("_publish", state)
            raw = renpy.emscripten.run_script_string("window.renpyAgent ? window.renpyAgent._next() : 'null'")
            command = json.loads(raw or "null")
            if command is None:
                return
            request_id = command.get("id")
            action = command.get("action")
            revision = command.get("revision")
            error = None
            if action not in ("start", "advance", "choose"):
                error = "Unknown action. Only start, advance, and choose are supported."
            elif type(revision) is not int or revision != state["revision"]:
                error = "Stale revision. Read the current state and choose again."
            elif not state["can"].get(action):
                error = "Action unavailable in the current screen. Use the visible game controls."
            elif action == "choose" and command.get("choice_id") not in actions:
                error = "Choice is missing or disabled. Read the current choices."
            if error:
                self.send("_reply", {"id": request_id, "ok": False, "error": error, "state": state})
                return

            # Acknowledge before control flow changes. JavaScript waits for a
            # subsequent engine heartbeat before returning the resulting state.
            self.send("_reply", {"id": request_id, "ok": True, "revision": state["revision"]})
            if action == "start":
                renpy.run(engine.store.Start())
            elif action == "advance":
                # Preserve text reveal and say behavior while allowing the
                # browser panel (rather than the canvas) to have focus.
                renpy.queue_event(["dismiss", "dismiss_unfocused"])
            elif action == "choose":
                # Run the real ChoiceReturn, preserving chosen/rollback state.
                # The Function timer returns this result to the interaction.
                return renpy.run(actions[command["choice_id"]])

    bridge = Bridge()

init 90 python:
    if renpy.emscripten:
        config.always_shown_screens.append("_renpy_agent_poll")
        config.start_interact_callbacks.append(renpy_agent.bridge.begin_interaction)

screen _renpy_agent_poll():
    zorder 10000
    # Timer is never modal and has no visible/focusable displayable. Browser
    # requests are pulled here on the engine thread, avoiding Asyncify reentry.
    timer 0.10 repeat True modal False action Function(renpy_agent.bridge.poll, _update_screens=False)
