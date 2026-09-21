# Ren'Py Skill for Codex

Create visual novels directly in your workspace: write the story, generate character art, build for the web, and playtest in the browser.

**Use the [Ren'Py skill](skills/renpy/SKILL.md) for new games.** It is the recommended workflow in this repository. The Python MCP server and Ren'Py Studio MCP App remain available for existing integrations; their setup is in the [legacy server guide](docs/LEGACY_MCP_SERVER.md) and [Studio documentation](renpy_mcp_app/README.md).

## Install the skill

Install with the [Skills CLI](https://skills.sh/docs):

```sh
npx skills add banjtheman/renpy_mcp_server --skill renpy --agent codex --global
```

Omit `--global` for a project-local installation. Use `npx skills add banjtheman/renpy_mcp_server --list` to inspect the available skills before installing. Node.js/npm is needed for this installer; the Ren'Py helper itself uses Python.

Or ask Codex to use its bundled installer:

```text
Use $skill-installer to install the Ren'Py skill from
https://github.com/banjtheman/renpy_mcp_server/tree/main/skills/renpy
```

For a manual installation, copy the entire `skills/renpy` folder into your Codex skills directory. The bundled skill installer uses `$CODEX_HOME/skills`, which defaults to `~/.codex/skills`. Keep its scripts, assets, and references together. If a `renpy` skill already exists there, update that installation rather than nesting another folder inside it. The skill works independently of this repository once copied.

Start a fresh Codex task in the workspace where you want the game and ask:

```text
Use $renpy to make a short mystery visual novel with two distinct endings.
Generate backgrounds and consistent character expressions with native ImageGen.
Build it for the web, open the preview, and playtest both endings in the browser.
```

For an existing game, include its project path and the change you want. See [adopting the skill in an existing project](docs/MIGRATING_TO_SKILL.md).

## What the workflow includes

- **Direct authoring:** ordinary `.rpy` scripts, game assets, and concise story notes in your workspace.
- **Native ImageGen:** backgrounds and character variants based on inspected references, with checks for lighting, pose, framing, and real transparency. The native host manages its image model.
- **Reproducible web builds:** a pinned Ren'Py 8.5.3 SDK and matching web runtime, verified downloads, engine lint, and upstream `web_build` packaging.
- **Local browser preview:** an owned loopback server, build logs, and explicit rebuild/reload behavior.
- **Browser playtesting:** screenshots and story state, with WebMCP actions for reading state, starting, advancing dialogue, and choosing an option. An accessible controls panel is available when native WebMCP is unsupported.

Game creation does not require configuring an MCP server, running the repository's `setup.sh`, or installing its Gemini dependencies. Those belong to the legacy integration. The skill's helper uses Python's standard library and the SDK's bundled runtime.

## Requirements and tools

Use Python **3.11.8+**, network access for the initial SDK download, and a browser for preview. Generated art additionally needs native ImageGen in the host. WebMCP needs a compatible browser; ordinary gameplay and the fallback controls work without it. The SDK pin and browser workflow were verified on macOS; consult the [validation record](docs/RENPY_SKILL_VALIDATION.md) for the checks performed.

Codex normally invokes the helper for you. You can also use it directly from this checkout with a Python 3.11.8+ interpreter available as `python`:

```sh
python skills/renpy/scripts/renpy.py setup
python skills/renpy/scripts/renpy.py doctor
python skills/renpy/scripts/renpy.py init /absolute/path/my-game --title "My Game"
python skills/renpy/scripts/renpy.py lint /absolute/path/my-game
python skills/renpy/scripts/renpy.py build-web /absolute/path/my-game
python skills/renpy/scripts/renpy.py serve /absolute/path/my-game
```

`serve` returns the preview URL. After edits, rebuild with `build-web /absolute/path/my-game --force` and reload the browser. Use `status /absolute/path/my-game` or `stop /absolute/path/my-game` with the same helper to inspect or stop the preview.

Web builds go into a sibling `my-game-web` directory. The separate `test` command runs authored Ren'Py testcases and **opens a native game window**; browser playtests are the default for web previews.

## Documentation

- [Skill instructions](skills/renpy/SKILL.md)
- [Story, art, and expression consistency](skills/renpy/references/story-and-art.md)
- [SDK, builds, and preview](skills/renpy/references/toolchain.md)
- [WebMCP and browser controls](skills/renpy/references/browser-control.md)
- [Moving an existing game to the skill](docs/MIGRATING_TO_SKILL.md)
- [Validation record](docs/RENPY_SKILL_VALIDATION.md)
- [Contributing and running tests](CONTRIBUTING.md)

## Watch Codex play through WebMCP

The web build exposes four semantic tools directly to a compatible browser. Codex can discover and invoke them through its browser's native WebMCP capability:

| Tool | What Codex can do |
| --- | --- |
| `renpy_get_state` | Read the visible dialogue, choices, phase, and deliberately public story variables. |
| `renpy_start` | Start the game from its main menu. |
| `renpy_advance` | Reveal or advance the current dialogue. |
| `renpy_choose` | Select an enabled choice using its returned ID. |

Actions use the current state revision so an agent cannot accidentally act on an outdated menu. The bridge runs inside the web game and preserves normal Ren'Py choice behavior. This is browser-native WebMCP; it does not require launching the repository's MCP server.

Playtests combine these state-driven actions with screenshots of the actual game. A JavaScript fallback or a successful build alone does not demonstrate native WebMCP. The [validation record](docs/RENPY_SKILL_VALIDATION.md) identifies the native calls and routes already exercised.

The [timelapse recording plan](docs/DEMO_WALKTHROUGH.md) follows a real Codex session from the initial prompt through story, art, web build, and direct WebMCP gameplay. The new recording will be added here once captured; the older MCP demos are preserved in the legacy guide.

## Existing MCP integrations

The repository name remains `renpy_mcp_server`, so existing clone URLs continue to work. The server code, entry point, and Studio App remain in place. Use the [legacy MCP server guide](docs/LEGACY_MCP_SERVER.md), [MCP integration examples](examples/README.md), or [Studio App README](renpy_mcp_app/README.md) when maintaining those integrations.

## License

[MIT](LICENSE).
