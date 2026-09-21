# Contributing

The recommended workflow for new games is the standalone [Ren'Py skill](skills/renpy/SKILL.md). Contributions should make that folder useful in a fresh agent session without this repository's history or other files. The Python MCP server and RenPy Studio remain in the repository as legacy integrations; their development setup is separate.

## Getting started

Fork and clone the repository, create a branch, and keep your change focused. In your pull request, explain the problem, the resulting behavior, and the checks you actually completed. Link relevant issues and update the documentation alongside behavior changes.

## Skill development

The skill lives entirely in `skills/renpy/`:

- `SKILL.md`: entrypoint and workflow, with focused guidance in `references/`.
- `scripts/renpy.py`: SDK setup, engine lint, web builds, and owned local preview processes.
- `assets/template/`: a runnable starting project, including story notes and route tests.
- `assets/bridge/renpy_agent.rpy` and `assets/web/renpy-agent.js`: engine and browser controls.
- `tests/`: helper and bridge regression tests.

Use Python **3.11.8 or newer** for the helper and Python tests. The helper uses the standard library; it does not require the root Python package, `uv sync`, an MCP server, or an image API key. The JavaScript tests use Node.js with its built-in test runner and do not require `npm install`. Ren'Py itself runs through the SDK's bundled runtime.

From the repository root, select an available interpreter and run:

```bash
PYTHON=/absolute/path/to/python
"$PYTHON" -m unittest discover -s skills/renpy/tests -p 'test_*.py' -v
node --test skills/renpy/tests/test_bridge.mjs
```

These tests use fixtures for the engine and browser APIs. They do not download the SDK or open a native game window; preview tests create and stop their own temporary loopback servers. They check failure handling and bridge behavior, but do not replace a real browser playthrough.

For template, build, or browser-control changes, also validate a separate sample project. The paths below are placeholders; use a new, empty directory for the project:

```bash
GAME=/absolute/path/to/validation-game
"$PYTHON" skills/renpy/scripts/renpy.py setup
"$PYTHON" skills/renpy/scripts/renpy.py doctor
"$PYTHON" skills/renpy/scripts/renpy.py init "$GAME" --title "Validation Game"
"$PYTHON" skills/renpy/scripts/renpy.py lint "$GAME"
"$PYTHON" skills/renpy/scripts/renpy.py build-web "$GAME"
"$PYTHON" skills/renpy/scripts/renpy.py serve "$GAME"
# Open the returned URL and play the relevant routes in a browser.
"$PYTHON" skills/renpy/scripts/renpy.py stop "$GAME"
```

`setup` downloads the pinned SDK and matching web support on first use. Lint and web builds run without a native window. Use `build-web --force` when rebuilding the same helper-owned output, then reload the browser. The separate `test` command runs authored Ren'Py tests in a native game window; it is optional additional coverage, not required for web validation.

Check dialogue readability, image loading, expression continuity, choices, and relevant outcomes. For bridge changes, exercise actual WebMCP tools in a compatible browser and check the fallback controls when applicable. Report unavailable capabilities rather than calling fixture tests browser coverage. See [toolchain guidance](skills/renpy/references/toolchain.md) and [browser controls](skills/renpy/references/browser-control.md).

Keep the skill portable: resolve bundled files relative to the skill folder, avoid personal paths, and keep generated games, SDK caches, credentials, and build artifacts out of the package. When changing the workflow, copy the complete skill folder to another location and check that it can initialize a project without relying on its original repository. For art guidance, use the native ImageGen workflow in [story and art](skills/renpy/references/story-and-art.md).

## Legacy integration development

Use this setup only when changing the existing Python MCP server. Its package currently targets Python 3.10 or 3.11 and uses `uv`:

```bash
uv sync
export RENPY_SDK_PATH="/path/to/renpy-sdk"
# Set GEMINI_API_KEY in your environment when testing image generation.
uv run renpy-mcp-server
```

Test the changed tools with an MCP client. Cover missing files, provider errors, web builds, and character positioning or emotions as relevant. Do not commit keys or local configuration.

The server components are under `src/renpy_mcp_server/`: `server.py` defines tools, `image_service.py` handles Gemini generation, `build_manager.py` builds games, `preview_manager.py` serves previews, and `background_remover.py` processes sprites. Project templates are in `src/renpy_mcp_server/templates/`.

For the separate TypeScript MCP App, follow [RenPy Studio's development instructions](renpy_mcp_app/README.md#development). Existing framework integrations are in [examples](examples/README.md).

## Code and documentation

- Follow the surrounding code style; use clear names and focused functions.
- Use Python type hints and docstrings where they clarify the interface.
- Add regression coverage for meaningful behavior changes, especially build failures, process ownership, and browser actions.
- Update the relevant README, skill reference, or guide. Keep skill instructions understandable without prior conversations or the legacy integrations.

## Issues and pull requests

For bugs, include reproduction steps, expected and actual behavior, environment versions, and relevant logs with credentials removed. For feature requests, describe the use case and a concrete example.

A pull request should state what changed, why, how it was tested, and any remaining limitations. Be respectful and constructive in reviews. Contributions are licensed under the repository's MIT License.
