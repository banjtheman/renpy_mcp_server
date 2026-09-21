# Story and art

## Narrative

Keep brief notes on the premise, character voices, scene sequence, and state that changes an outcome. Check that later dialogue respects what the player knows and chose. Deliberate route reconvergence is useful; accidentally identical consequences can make a choice meaningless. Play a complete scene to judge pacing before expanding it.

## Generated assets

Use the available imagegen skill and native image tool for generation and edits. Choose a shared medium, palette, lighting direction, and camera. Backgrounds need standing space and a readable dialogue area; include people, lettering, or interface elements only when the scene calls for them. Inspect returned dimensions before fitting an image to the viewport.

Select one inspected master sprite per character. Derive each expression independently from that same master, with explicit expression names and facial cues. Ask to keep identity, costume, body pose, lighting, canvas framing, scale, and baseline consistent. Request the expression edit and real transparency together, aiming for a usable sprite in one generative pass. Validate a representative expression against the master before generating the full set. Choose expressions that the story needs; request individual sprites when they will be separate runtime images.

Example edit: “Using this master sprite, make a worried expression: slightly drawn brows, tense mouth, alert eyes. Keep the same identity, outfit, body pose, lighting, framing, and baseline. One character with a transparent background.”

These instructions do not lock pixels. Reference edits can change body shading, pose, or proportions even when only the face was requested. Compare variants against the master, including clothing highlights and silhouette. When exact matching matters, keep one unchanged body/base layer and use aligned facial layers, for example with Ren'Py's `layeredimage`, instead of regenerating the whole sprite for every expression. Check facial seams and lighting at game size.

Inspect actual alpha after each generation or edit. RGB images can contain a baked checkerboard; a checkerboard preview or RGBA mode alone does not prove transparency. Confirm transparent pixels and inspect hair and clothing edges. Native background extraction can repair alpha, but it can also regenerate body lighting or other details. Compare the cleaned image with both the master and its pre-cleanup version before selecting it.

Choose staging transforms from visible character bounds, intended on-screen height, and dialogue placement. Canvas dimensions alone do not establish character size. Compare expression changes at the same transform on the real background, checking for sliding feet, scale jumps, halos, unreadable faces, and lighting changes. Treat a changed pose or camera as a separate pose variant when that change is intentional.

Copy selected assets into `game/images/` or `game/audio/` with stable filenames. Keep source references separately and record useful provenance in `story/assets.json`: runtime and reference paths, character/expression, prompt, dimensions, alpha, and selection status. Use project-relative paths where practical. Record generator and licensing information only when known. Use model selection only if the host exposes it; a model name in prompt text does not select the backend. If the tool does not report its model, record the native tool used and leave the model unspecified.

## Ren'Py integration

Use a shared image tag with expression attributes so a new expression replaces the character already on that layer:

```renpy
image guide neutral = "images/guide_neutral.png"
image guide worried = "images/guide_worried.png"

show guide neutral
show guide worried with dissolve
```

Ren'Py retains an existing ATL/Transform when `at` is omitted. Set or change staging explicitly when needed, and inspect the result. See the [show-statement rules](https://www.renpy.org/doc/html/displaying_images.html#show-statement).

- Share `Character` and image declarations across scene files; Ren'Py loads declarations across files, and labels must remain unique.
- Preserve asset subdirectories when building to avoid filename collisions.
- Escape literal `[` and `{` in dialogue deliberately: they introduce interpolation and text tags.
- Initialize new-game state and preserve `call`/`return` flow. Verify relevant outcomes by playing them; a story graph does not prove route behavior.
