# Use the skill with an existing game

The [Ren'Py skill](../skills/renpy/SKILL.md) edits ordinary game files. A project created through the MCP server or Studio can keep its `.rpy` scripts, images, audio, and directory structure.

Install the skill using the [repository quick start](../README.md#install-the-skill), then open the workspace containing your game in Codex. Give the agent the directory that contains `game/`:

```text
Use $renpy with the existing project at /absolute/path/my-game.
Keep its story and assets, set up the web preview and browser controls,
and playtest the existing routes before making further changes.
```

## Project setup

Use the existing project directly; `init` creates a new starter and is not a migration command. Keep saves, release data, and `old-game` files needed for compatibility. Check the project's SDK version and compatibility notes before adopting the skill's pinned SDK.

The helper's `setup` command installs Ren'Py 8.5.3 and matching web support in a versioned user cache. An existing SDK can be selected with `--sdk` or `RENPY_SDK_PATH`; `doctor` checks its engine and web support. Run engine lint and address compatibility errors before building. See the [toolchain reference](../skills/renpy/references/toolchain.md).

Build outputs belong outside the source project. The helper defaults to a sibling `my-game-web` directory, and `--force` replaces only a prior helper-owned output. Choose a new output directory when an older build already occupies that location. Exclude any generated builds stored inside the source project so they are not packaged recursively.

## Browser controls

New skill projects include the bridge automatically. For an existing game, copy the skill's `assets/bridge/renpy_agent.rpy` into `game/renpy_agent.rpy` after checking for a conflicting file. Add only deliberately public story variables to `renpy_agent_variables`. The web builder packages the JavaScript adapter; the game-side bridge stays inactive on native platforms.

The bridge understands standard ADV dialogue, choices, and the main menu. Custom screens, NVL, input, and minigames may need UI playtesting or a specific adapter. Native WebMCP support depends on the browser; the accessible controls panel provides a fallback. See the [browser-control reference](../skills/renpy/references/browser-control.md) for integration and current-state action rules.

## Workflow mapping

| MCP server action | Skill workflow |
| --- | --- |
| `create_project` | Run the helper's `init` for a new project. |
| `generate_script`, file editing tools | Edit `.rpy` source directly in the workspace. |
| `generate_background`, `generate_character` | Use native ImageGen and keep selected outputs in the project. |
| `build_project` | Run `lint`, then `build-web`. |
| `start_web_preview` | Run `serve`; manage the preview with `status` and `stop`. |
| Manual route inspection | Play in the browser using visible UI or the WebMCP bridge, checking screenshots and outcomes. |

Existing artwork remains usable. Native ImageGen is needed only when generating or editing art. The skill does not require a running MCP server or Gemini credentials, and it does not remove existing MCP configuration. The [legacy setup guide](LEGACY_MCP_SERVER.md) remains available for clients that still use that integration.
