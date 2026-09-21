---
name: renpy
description: Create and playtest Ren'Py visual novels with generated art, web previews, and browser controls.
---

# Ren'Py

Author Ren'Py projects directly in the user's workspace. This folder contains the project template, SDK/build/preview helper, and browser bridge. Resolve bundled paths relative to this `SKILL.md`; the folder can be copied to another skill installation without its containing repository.

## Start from the task

- **New game or narrative/art work:** read [story-and-art.md](references/story-and-art.md). Shape the story and visuals around the user's brief. The starter is a runnable sample; replace its cast, plot, notes, and route tests as needed.
- **Existing game:** preserve its structure and edit `.rpy` source directly. Use only the references relevant to the change; `init` is for a new project.
- **SDK, builds, or preview:** read [toolchain.md](references/toolchain.md) for prerequisites, configuration, and build behavior.
- **Browser playtesting or bridge integration:** read [browser-control.md](references/browser-control.md) for tool discovery, state, and supported screens.

For generated art, use the native ImageGen tool and the system **imagegen** skill that documents it. This workflow does not pin an image API model. If multiple imagegen skills are installed, select the one for the native tool. Selected files belong in the project, with their source references retained. If native generation is unavailable, report the limitation and continue with existing or temporary art where useful; an alternative image provider needs the user's choice.

## Local toolchain

Use an available Python 3.11.8+ interpreter for `scripts/renpy.py`; it uses only the standard library. Ren'Py runs through the SDK's bundled runtime. Below, `PYTHON` and `SKILL` stand for the resolved absolute interpreter and skill-directory paths, not literal commands.

```text
PYTHON SKILL/scripts/renpy.py setup
PYTHON SKILL/scripts/renpy.py doctor
PYTHON SKILL/scripts/renpy.py init /absolute/path/my-game --title "My Game"
PYTHON SKILL/scripts/renpy.py lint /absolute/path/my-game
PYTHON SKILL/scripts/renpy.py build-web /absolute/path/my-game
PYTHON SKILL/scripts/renpy.py serve /absolute/path/my-game
PYTHON SKILL/scripts/renpy.py status /absolute/path/my-game
PYTHON SKILL/scripts/renpy.py stop /absolute/path/my-game
```

The verified SDK pin is 8.5.3 with matching web support. Helpers return JSON and log paths; use `--help` for flags. A rebuild needs `build-web --force` to replace the project's prior helper-owned output, followed by a browser reload. Serving does not compile source changes.

## Playable delivery

For a game-making request, continue through engine lint, web build, and browser playtesting. Inspect screenshots as well as story state: check the relevant outcomes, dialogue readability, sprite/expression continuity, and missing assets. Use fresh revisions and returned choice IDs with WebMCP; the browser reference describes fallback controls when native WebMCP is unavailable.

The optional `test` command runs authored Ren'Py testcases and opens a native game window. Web previews use the browser; native tests are separate coverage, not a prerequisite for opening a preview.

Deliver the source project, preview URL, web build path, and checks actually completed, identifying any unavailable capabilities. Leave a requested preview running with its stop command; stop servers created only for temporary validation.
