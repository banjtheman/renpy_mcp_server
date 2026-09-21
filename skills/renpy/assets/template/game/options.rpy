# Project identity, display settings, and web packaging defaults.
init -2 python:
    gui.init(1280, 720)

define config.name = "__PROJECT_TITLE__"
define config.version = "0.1.0"
define config.check_conflicting_properties = True
define build.name = "__PROJECT_SLUG__"
define config.save_directory = "__PROJECT_SLUG__-agent-v1"
define config.window = "auto"
define config.has_sound = True
define config.has_music = True
define config.has_voice = False
default preferences.text_cps = 0

# Only these public game variables are exposed by the browser bridge.
define renpy_agent_variables = ("signal_sent", "ending")

init python:
    build.classify("**.rpy", None)
    build.classify("**/testcases.rpyc", None)
    build.classify("**/tests/**", None)
    build.classify("**/saves/**", None)
    build.classify(".renpy-agent/**", None)
    build.classify("story/**", None)
    build.classify("assets/**", None)
    build.classify("build/**", None)
    build.classify("log.txt", None)
    build.classify("errors.txt", None)
    build.classify("traceback.txt", None)
