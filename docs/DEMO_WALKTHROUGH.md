# Ren'Py skill walkthrough — recording plan

**Status: plan only. No recording or finished video is included.**

Record an actual Codex session using the installed `renpy` skill: prompt → story and art → web build → browser gameplay controlled through native WebMCP. Aim for a 90-second edit, accelerating long waits while keeping the result and the agent's actions readable.

## Demo prompt

Paste this into a fresh Codex task with the skill installed and an empty project directory:

> Use $renpy to make an original, short cinematic visual novel called The Lantern Keeper's Debt. At a remote mountain observatory, Iona, a weather keeper, and Rem, a courier, have one working lantern before a dangerous night crossing. Give them distinct voices and a meaningful choice: guide an unknown traveler through the pass or keep the lantern to protect the people already sheltering inside. Write two different endings that show the cost of the decision without making either choice obviously correct. Aim for a five-minute game with two characters and two backgrounds. Use native ImageGen for painterly art, with a restrained blue and amber palette, readable silhouettes, and consistent character expressions. Establish a neutral master for each character, derive expressions from that same reference, and check lighting, framing, and real transparency on one expression before making the rest. Keep source art and generation notes in the project. Build the web version, open it in the Codex browser, and play both routes. Use the browser's native WebMCP capability to discover and invoke the game's tools, reading fresh state before every action. Also inspect screenshots for text readability, asset loading, and expression continuity. Leave the playable preview running and report the source, build, and stop command.

## Capture setup

- Use a dedicated demo window and a clean project directory. Capture only the task and its browser pane; hide the sidebar, account details, unrelated tabs, notifications, and private paths before recording.
- Confirm native ImageGen and the browser's native WebMCP capability are available. Use the skill's documented SDK setup before the timed story session if the SDK download would dominate the footage; mention that preparation in the caption.
- Record the real session from prompt submission. Keep the original recording and note useful timestamps. If a generation or build needs correction, retain the real sequence and summarize the correction honestly when editing.
- Use the web preview throughout. Keep gameplay large enough to read; a full-screen browser shot can follow the split task/browser view.

## Shot list

| Edited time | Actual footage to capture | What the viewer should see |
| --- | --- | --- |
| 0–10 s | Submit the prompt in the fresh task. | The request and use of `$renpy`. |
| 10–25 s | Story brief, character descriptions, choice and route writing. | The agent creating the game's source files. |
| 25–45 s | Native ImageGen calls, returned art, expression comparison and asset integration. | Original backgrounds and characters; a visible check that expressions preserve lighting and placement. |
| 45–55 s | Successful lint, web build and local preview launch. | Real command results and the game loading in the browser. |
| 55–80 s | Native WebMCP discovery, state reads, start, dialogue advancement and a choice. | Tool names and actual calls alongside the changing game. Hold briefly on the choice and first ending. |
| 80–90 s | Restart through the game UI, take the other route, and show the second ending. | Both outcomes and the playable result. Use a caption to identify the second playthrough. |

Adjust the edit to what the session actually produces. Label accelerated sections “sped up”; do not imply the edited runtime is the game's creation time. A short description can disclose cuts through repeated dialogue and generation waits.

## Capture native WebMCP evidence

Use the browser connector's documented native capability, for example `tab.capabilities.get("webmcp")`, then `fetchTools()` and the returned handle's `call(name, input)`. Record the discovered tools and at least one actual call for each of these actions:

| Tool | Input captured from the live session |
| --- | --- |
| `renpy_get_state` | `{}` |
| `renpy_start` | `{revision: state.revision}` when `state.can.start` is true. |
| `renpy_advance` | `{revision: state.revision}` when advancing is enabled and dialogue is visible. |
| `renpy_choose` | `{revision: state.revision, choice_id: choice.id}` using an enabled choice from that state's `choices`. |

Parse the tools' JSON text results. Read state after each action and again before the next mutation; do not reuse a revision or choice ID from an earlier interaction. Wait through transitions or temporarily empty dialogue. Rediscover tools after navigation when the browser handle is invalidated. Restart normally through the game's visible UI for the second route; do not jump to labels or manufacture ending state.

Calling `window.renpyAgent` or clicking the “Ren'Py agent controls” panel is **page fallback control**, not proof of native WebMCP invocation. If native discovery or execution is unavailable, record and label the fallback accurately; it does not satisfy the native WebMCP demonstration planned here. See [browser-control.md](../skills/renpy/references/browser-control.md) for the full interaction contract.

## Planned deliverables

- A real-session edit at `media/videos/renpy-skill-workflow.mp4`.
- An optional short gameplay excerpt at `media/videos/renpy-skill-workflow.gif`.
- A publication caption stating the actual tools used, preparation, and editing performed. Link the playable project or build only after it exists at its intended public destination.

These are planned output paths, not available downloads. Use actual captured footage and tool results; do not fabricate a transcript, claim an unverified image-model version, or invent time-saved metrics. Review the final export for readable gameplay, accurate captions, and unintended private information before publication.
