# Ren'Py skill verification

Verified September 6, 2026 on macOS with Ren'Py `8.5.3.26051504`, Python 3.11.8, and Codex's in-app browser. The fixture is the bundled two-route story, **The Last Signal**, with deliberate placeholder graphics. Native ImageGen is documented as the art workflow; no generation request or image-provider API was needed for this fixture.

## Build and helpers

- Downloaded the matching official SDK and web archives and verified their pinned SHA-256 hashes.
- Initialized a project, passed engine lint, and produced a fresh web build using upstream `launcher web_build`, without SDK source patches.
- Verified the WebAssembly binary, runtime files, game archive, injected bridge, and build ownership metadata. Output is a sibling of the project to prevent recursive packaging of earlier builds.
- Passed 22 Python helper/bridge tests and 8 JavaScript bridge tests. These cover failed/stale builds, output ownership, process failure and timeout reporting, actual native-test counts, server lifecycle and MIME behavior, stale revisions, enabled choices, cancellation, heartbeat expiry, and both WebMCP registration interfaces.
- Passed skill metadata validation. An independent agent also initialized and linted a separate project using the skill.

The browser-tested fixture build ID is `2def389f8ab5c206907063b9`. Its `game.zip` is 4,672,410 bytes; `renpy.wasm` is 21,586,559 bytes. Machine-specific output and log paths are recorded in the generated project's `.renpy-agent/latest-build.json`.

## Actual browser checks

The Codex browser reported `document.modelContext` support. Its native WebMCP capability discovered and invoked `renpy_get_state`, `renpy_start`, `renpy_advance`, and `renpy_choose`; these checks did not substitute page JavaScript calls for native WebMCP execution.

- Cold-loaded the main menu and started through WebMCP.
- Rejected a deliberately stale start revision without starting the game.
- Read the actual speaker, dialogue, available choices, and allowlisted story variables.
- Selected **Keep the station dark** through WebMCP and reached **ENDING: A promise for tomorrow.**, with `signal_sent = false` and `ending = "quiet"`.
- Saved through the visible game UI, reloaded the browser, loaded the saved slot, and recovered the same ending and state. Story actions were disabled while the save/load screen was open.
- Used the accessible HTML controls to start, advance, and select **Send the signal**, then advanced through WebMCP to **ENDING: A light across the water.**, with `signal_sent = true` and `ending = "light"`.
- Inspected screenshots and checked the browser's warning/error log, which was empty for the final preview.

Native route tests also passed two cases and four assertions earlier in development. The final main-menu initialization adjustment was verified in the browser; the native GUI tests were not rerun for that adjustment.

## Reproduce

From the repository root, with Python 3.11.8+ and Node available:

```sh
python -m unittest discover -s skills/renpy/tests -p 'test_*.py'
node --test skills/renpy/tests/test_bridge.mjs
python skills/renpy/scripts/renpy.py setup
python skills/renpy/scripts/renpy.py init /absolute/path/demo --title "The Last Signal"
python skills/renpy/scripts/renpy.py build-web /absolute/path/demo
python skills/renpy/scripts/renpy.py serve /absolute/path/demo
```

Use a Python 3.11.8+ interpreter for these commands. Open the returned preview URL, discover its WebMCP tools through the browser connector, and play both choices using fresh revisions. Stop the owned preview with `python skills/renpy/scripts/renpy.py stop /absolute/path/demo`.

Coverage is for standard ADV dialogue, choices, and the starter's menus. Custom screens, NVL, input, minigames, other browser engines, public hosting, and generated art need their own checks. WebMCP requires browser support; the adapter also provides accessible controls when it is unavailable.

## Standalone skill verification — September 7, 2026

The 18-file `skills/renpy` folder was copied into an isolated temporary workspace. A new agent context received only the copied skill, the host's Python interpreter preference, and a request for an original short game about a rooftop botanist and the last seed. Temporary art and browser-only testing were part of that evaluation request.

The agent created **The Roof That Remembers**, with an original cast, greenhouse staging, a planting-versus-sharing choice, and two distinct epilogues. It replaced the sample story, notes, public state variables, and authored route testcases. Engine lint passed and the copied helper built the game using the installed pinned SDK. Screenshot review caught a menu overlapping the temporary portraits; the agent adjusted its project layout and rebuilt. Final browser-tested build ID: `503f3aef964c4a15b48f06be`.

The new in-app browser tab discovered and invoked the four tools through the browser connector's native WebMCP capability, with `document.modelContext` reported by the bridge. Choosing the roof route reached `roots_in_common`; choosing the inland route reached `a_future_in_trust`. Both routes returned to the main menu. Browser warning/error logs were empty and server asset requests returned HTTP 200. The agent closed its temporary tab and stopped its owned preview; helper status confirmed no preview remained for that project.

This run reused the installed SDK; it did not repeat a first-time download, generate images, or launch native functional tests. The helper and bridge regression suites passed 22 Python tests and 8 JavaScript tests. Skill validation and all local documentation links passed. The skill contains no filesystem symlinks or personal/repository paths, and its scripts locate bundled files from their own directory.

The entrypoint now routes to focused story/art, toolchain, and browser references. Those references describe the workflow directly, including expression-lighting checks and the possibility of generative changes during alpha cleanup. Project history belongs outside the distributable skill.

A portable archive of the complete `renpy/` skill folder was also checked against the source files, excluding bytecode and operating-system metadata. Generated archives, test workspaces, and browser build artifacts are local validation outputs and are not included in the repository. Install the complete folder from `skills/renpy`.
