# SDK, builds, and preview

`scripts/renpy.py` uses Python's standard library and launches Ren'Py with the SDK's bundled runtime. All templates and bridge files are inside this skill folder.

## Version and installation

Use Python 3.11.8+; setup requires `tarfile.data_filter` for archive extraction. The verified pin is Ren'Py 8.5.3 with matching web support. `setup` downloads the official SDK and web archives, verifies pinned SHA-256 values, and installs into `~/.cache/renpy-agent/sdk/8.5.3`. It needs network access on the first installation. Existing SDK copies are not upgraded in place.

`RENPY_AGENT_CACHE` selects a different cache root. `--sdk` or `RENPY_SDK_PATH` selects an existing SDK for `doctor`, `lint`, `test`, and `build-web`; `setup` installs the pinned SDK in the cache. Resolve an override to an absolute path and run `doctor` to check its engine and web support. Keep the SDK and web runtime on the same version.

Use the [official release page](https://www.renpy.org/latest.html) to resolve the latest stable SDK. A live documentation banner may describe the next development version. Do not replace the tested pin just because a newer number appears in documentation. Review [compatibility changes](https://www.renpy.org/doc/html/incompatible.html) and repeat the actual build/playtest fixture after upgrades.

## Official build path

The helper invokes the SDK's supported `launcher web_build PROJECT --destination OUTPUT` command. On macOS/Linux, the launcher is `renpy.sh`; the helper selects the bundled runtime on Windows.

The helper stages a fresh native web output, checks the required runtime and game archive, and adds `renpy-agent.js` to the HTML. Keep the official engine, service worker, progressive-loading files, icons, and packaging intact. Do not splice together runtime files from a different SDK version or reuse a stale ZIP from an earlier build.

The default output is a sibling directory named `PROJECT-web`, outside the game project. Outputs inside the project are rejected: Ren'Py can package a previous web build recursively on the next invocation. Exclude any other generated builds kept inside an existing project. `--force` replaces only an output owned by this project's previous helper build.

Builds and lint run without a native window. The separate `test` command launches a native game window and needs working graphics and an exiting test-suite teardown. SDL's dummy driver cannot validate rendered gameplay. Preserve `old-game` and release data needed for compatibility with existing saves.

For an existing project, copy `assets/bridge/renpy_agent.rpy` into `game/renpy_agent.rpy` after checking there is no conflicting file. It is inert on native platforms. Add `define renpy_agent_variables = (...)` only for state intentionally exposed to browser agents. See [browser-control.md](browser-control.md) for the supported screen contracts.

## Validation

- `lint`: engine lint with failure status and a diagnostic log.
- `test`: the game's authored native tests, including an exiting teardown. A successful process without executed tests is not route coverage.
- `build-web`: new output and an identifiable log. Build success does not establish gameplay correctness.
- Browser playthrough: cold load, relevant choices and outcomes, layout screenshots, asset requests, and save/reload when relevant. Native tests and browser playtests cover different failure modes.

Consult the SDK's bundled documentation for exact behavior on the selected pin. Official references: [CLI](https://www.renpy.org/doc/html/cli.html), [functional tests](https://www.renpy.org/doc/html/testcases.html), [web platform](https://www.renpy.org/doc/html/web.html).

## Preview and releases

The server binds loopback, serves only the selected build, uses WebAssembly MIME and development cache behavior, and records its owned process. Prefer a fresh browser context when diagnosing service-worker or save-state effects. Rebuild and reload after changes; serving files is not live compilation.

Use `status` and `stop` against the same project/output path used to start a preview. Do not kill arbitrary processes by port or process name. Do not expose the server to the network to work around a local browser issue.

The built directory is the static hosting artifact. Public deployment needs HTTPS and suitable `.wasm` MIME, plus platform-specific checks for asset loading, browser saves, and user-gesture audio. WebMCP additionally needs browser feature support/eligibility; injecting JavaScript cannot enable an unsupported browser API. Publish only within the user's authorized destination and scope.
