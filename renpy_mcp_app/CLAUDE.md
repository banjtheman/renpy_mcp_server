# CLAUDE.md - RenPy Studio Development Guide

## Project Overview

RenPy Studio is a TypeScript MCP App that provides a visual studio interface for creating Ren'Py visual novels. It's published as `renpy-studio` on npm and can be installed via `npx -y renpy-studio --stdio`.

**Repository**: https://github.com/banjtheman/renpy_mcp_server (in `renpy_mcp_app/` folder)

## Architecture

```
renpy_mcp_app/
├── src/
│   ├── index.ts              # Main entry, registers view_studio tool
│   ├── main.ts               # Server startup (stdio/http modes)
│   ├── provision/            # Project workspace & SDK management
│   │   ├── index.ts          # WORKSPACE_DIR constant (~/.renpy-studio/workspace)
│   │   ├── renpy-sdk.ts      # Auto-downloads Ren'Py SDK
│   │   └── venv.ts           # Python virtual environment setup
│   ├── server/
│   │   ├── tools/
│   │   │   ├── project-tools.ts   # create_project, list_projects, delete_project
│   │   │   ├── asset-tools.ts     # generate_character/background, ui_get_assets, ui_delete_asset
│   │   │   ├── script-tools.ts    # generate_script, get_script_graph, read/edit_project_file
│   │   │   └── build-tools.ts     # build_project, start/stop_web_preview
│   │   └── python-runner.ts  # Executes Python scripts via venv
│   ├── ui/
│   │   ├── studio.tsx        # Main React UI component
│   │   ├── styles.css        # All styling
│   │   └── components/
│   │       └── storybuilder/
│   │           ├── StoryBuilderView.tsx     # Visual story flow component
│   │           ├── BeatCard.tsx             # Individual story beat cards
│   │           └── visual-builder-types.ts  # Beat expansion algorithm
│   └── lib/
│       ├── renpy-parser.ts   # Parses Ren'Py scripts → story graph
│       └── story-types.ts    # SceneNode, DialogueLine, MenuChoice, etc.
├── python/
│   ├── image_service.py      # Gemini image generation
│   ├── background_remover.py # rembg background removal + 750px normalization
│   ├── build_manager.py      # Ren'Py web build
│   └── preview_manager.py    # Local preview server
├── bin/
│   └── cli.js                # CLI entry point for npx
└── dist/                     # Built output (server + bundled UI)
```

## Key Concepts

### Project Structure

Projects are stored in `~/.renpy-studio/workspace/` with this structure:
```
{project_name}/
  game/
    script.rpy      # Main script (has label start)
    *.rpy           # Additional scripts
    images/         # Copied from assets during build
  assets/
    background/     # Generated background images
    character/      # Character sprites (*_transparent.png)
    metadata.json   # Asset descriptions and prompts for regeneration
```

### Asset Metadata System

Each project has `assets/metadata.json` storing generation prompts:
```json
{
  "version": 1,
  "characters": {
    "alice": {
      "description": "friendly barista with brown hair",
      "role": "Main character",
      "displayName": "Alice"
    }
  },
  "backgrounds": {
    "cafe_interior": {
      "description": "Cozy cafe with warm lighting",
      "location": "Indoor",
      "timeOfDay": "Afternoon"
    }
  }
}
```

This enables:
- Displaying descriptions in the Asset Gallery
- "Regenerate" button using original prompts
- Persistence across sessions

### Character Image Pipeline

1. `generate_character` calls `image_service.py` to generate images via Gemini
2. Images saved to `assets/character/` as `{name}_{emotion}.png`
3. `background_remover.py` removes background and normalizes to 750px height
4. Saved as `{name}_{emotion}_transparent.png`
5. Metadata saved to `metadata.json`

### Visual Story Builder

The story builder parses Ren'Py scripts and displays story flow:

1. **Parser** (`renpy-parser.ts`):
   - Extracts labels, dialogue, menus, visual events
   - Tracks multiple menus per label with `SceneMenu[]`
   - Captures inline choice branches with `inlineDialogue`

2. **Beat Expansion** (`visual-builder-types.ts`):
   - Converts scenes to individual "beats" (dialogue moments)
   - Creates branch/merge connections for choices
   - Tracks visual state (background, characters) at each beat

3. **BeatCard** (`BeatCard.tsx`):
   - Shows mini preview with background and up to 3 characters
   - Displays dialogue text and speaker
   - Indicates choice branches with gold styling

### Script Parser Types

```typescript
interface SceneMenu {
  atDialogueIndex: number;  // Where in dialogue[] this menu appears
  prompt?: string;          // "How do you respond?"
  choices: MenuChoice[];
}

interface MenuChoice {
  text: string;
  target: string;           // Label to jump to (empty if inline)
  inlineDialogue?: DialogueLine[];
  inlineVisualEvents?: VisualEvent[];
}
```

## MCP Tools

### Project Management
- `create_project` - Creates new project with directory structure
- `list_projects` - Lists all projects with metadata
- `delete_project` - Removes a project and all files

### Asset Generation
- `generate_character` - Creates character sprites with 5 emotions
- `generate_background` - Creates scene backgrounds
- `ui_get_assets` - Returns all assets with base64 data and metadata (app-only)
- `ui_delete_asset` - Deletes an asset and its metadata (app-only)

### Script Management
- `generate_script` - Creates new .rpy file with auto-validation
- `read_project_file` - Reads script content
- `edit_project_file` - Creates/updates script files
- `get_script_graph` - Parses scripts into story graph for Visual Story Builder

### Build & Preview
- `build_project` - Compiles game for web
- `start_web_preview` - Starts local preview server
- `stop_web_preview` - Stops preview server
- `view_studio` - Opens the UI (with optional `initialView` and `projectName`)

## UI Components

### Views (controlled by `initialView` parameter)
- `home` - Project library with book shelf
- `create` - Story creation wizard
- `assets` - Character and background gallery
- `story` - Visual story builder
- `preview` - Game preview iframe

### Asset Gallery Features
- Character grid with neutral emotion preview
- Click to open detail modal with:
  - Emotion cycler (← → navigation)
  - Transparency toggle
  - Metadata display
  - Regenerate/Delete buttons
- Background grid with 16:9 previews

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `GEMINI_API_KEY` | Yes | Google Gemini API key for image generation |
| `RENPY_SDK_PATH` | No | Custom Ren'Py SDK path (auto-downloaded if not set) |
| `PORT` | No | HTTP server port for development (default: 3001) |

## Script Writing Guidelines

When generating scripts, include:

1. **Character definitions** at top:
   ```renpy
   define alice = Character("Alice", color="#4a90e2")
   ```

2. **Image definitions** for each emotion:
   ```renpy
   image alice neutral = "images/alice_neutral_transparent.png"
   image alice happy = "images/alice_happy_transparent.png"
   ```

3. **Position definitions**:
   ```renpy
   define left_pos = Position(xalign=0.2, yalign=1.0)
   define center_pos = Position(xalign=0.5, yalign=1.0)
   define right_pos = Position(xalign=0.8, yalign=1.0)

   transform scaled:
       zoom 0.65
   ```

4. **Unique label names** (NOT "label start"):
   ```renpy
   label cafe_intro:  # Good
   label start:       # Bad - conflicts with main script
   ```

5. **Always include position when showing/switching emotions**:
   ```renpy
   show alice neutral at scaled, left_pos with moveinleft
   show alice happy at scaled, left_pos with dissolve  # Must keep position!
   ```

## Python Scripts

### image_service.py
Generates images via Gemini API:
```bash
python image_service.py --type character --project myproject --name alice --prompt "..." --emotions
python image_service.py --type background --project myproject --prompt "..." --filename cafe
```

### background_remover.py
Removes backgrounds and normalizes to 750px height:
```bash
python background_remover.py --directory /path/to/assets/character
```

### build_manager.py
Builds Ren'Py project for web:
```bash
python build_manager.py --project myproject --target web
```

### preview_manager.py
Manages local preview server:
```bash
python preview_manager.py --project myproject --action start --port 8080
```

## Common Issues

### Images showing as silhouettes
- Background removal not running → check `*_transparent.png` files exist
- Check Python venv is set up correctly

### "Character not defined" errors
- Missing `define X = Character(...)` in script
- Script validation warns about this

### Character appears twice or changes position
- Missing `at scaled, position` when switching emotions
- Always include BOTH transform AND position on show statements

### Visual Story Builder shows branches incorrectly
- Menu prompt being added to dialogue array
- Parser now captures menu prompts separately

### view_studio not navigating correctly
- Check `initialView` parameter is being passed
- SDK notifications don't include tool name - check argument patterns

## Development

### Building
```bash
cd renpy_mcp_app
npm install
npm run build
```

### Testing locally with Claude Desktop
```json
{
  "mcpServers": {
    "renpy-studio": {
      "command": "npx",
      "args": ["--silent", "tsx", "/path/to/renpy_mcp_app/src/main.ts", "--stdio"],
      "env": {
        "GEMINI_API_KEY": "your-key"
      }
    }
  }
}
```

### Publishing to npm
```bash
npm login
npm publish
```

### Adding new tools
1. Add tool registration in appropriate `*-tools.ts` file
2. Use `server.tool()` for model-facing tools
3. Use `registerAppTool()` for UI-facing tools (hidden from model)
4. Include helpful text output with full paths
