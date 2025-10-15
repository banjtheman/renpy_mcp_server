"""Application bootstrap for the Ren'Py MCP server."""

from __future__ import annotations

import asyncio
from typing import Optional

import structlog
from mcp.server.fastmcp import FastMCP

from .background_remover import BackgroundRemover
from .build_manager import BuildManager
from .image_service import ImageService
from .logging_config import configure_logging
from .models import BuildRequest
from .preview_manager import PreviewManager
from .project_manager import ProjectManager
from .settings import Settings

configure_logging()
logger = structlog.get_logger(__name__)

settings = Settings()
project_manager = ProjectManager(settings)
build_manager = BuildManager(settings)
preview_manager = PreviewManager()
image_service = ImageService(settings)
background_remover = BackgroundRemover()

# ARCHITECTURE NOTES:
# - MCP client (Claude) generates all text/dialogue/scripts
# - Gemini ONLY used for image generation (backgrounds & characters)
# - No doc search needed (MCP client knows Ren'Py already)

mcp = FastMCP("Ren'Py MCP Server")


@mcp.tool()
async def list_projects() -> dict:
    """Return metadata for available projects."""
    projects = [p.model_dump(mode="json") for p in project_manager.list_projects()]
    return {"projects": projects}


@mcp.tool()
async def list_project_files(project_name: str) -> dict:
    """
    List all files in a project's game directory.

    Returns all .rpy script files, assets, and other game files.
    Useful for inspecting what's in a project before editing.

    Args:
        project_name: Name of the project

    Returns:
        Dict with list of files and their paths
    """
    project_dir = project_manager.ensure_project_dir(project_name)
    game_dir = project_dir / "game"

    if not game_dir.exists():
        return {"error": f"Project {project_name} game directory not found"}

    files = []
    for item in game_dir.rglob("*"):
        if item.is_file():
            rel_path = item.relative_to(game_dir)
            files.append(
                {
                    "path": str(rel_path),
                    "full_path": str(item),
                    "size": item.stat().st_size,
                    "type": item.suffix,
                }
            )

    return {
        "project": project_name,
        "game_dir": str(game_dir),
        "files": files,
        "count": len(files),
    }


@mcp.tool()
async def read_project_file(project_name: str, file_path: str) -> dict:
    """
    Read the contents of a file in a project's game directory.

    Use this to inspect .rpy scripts, see what's already generated,
    or check configuration files before making edits.

    Args:
        project_name: Name of the project
        file_path: Relative path to file (e.g., "script.rpy" or "tennis_date.rpy")

    Returns:
        Dict with file contents and metadata
    """
    project_dir = project_manager.ensure_project_dir(project_name)
    game_dir = project_dir / "game"
    target_file = game_dir / file_path

    if not target_file.exists():
        return {"error": f"File {file_path} not found in project {project_name}"}

    try:
        content = target_file.read_text(encoding="utf-8")
        return {
            "project": project_name,
            "file_path": file_path,
            "full_path": str(target_file),
            "content": content,
            "size": len(content),
            "lines": len(content.splitlines()),
        }
    except Exception as e:
        return {"error": f"Failed to read file: {str(e)}"}


@mcp.tool()
async def edit_project_file(project_name: str, file_path: str, content: str) -> dict:
    """
    Edit or create a file in a project's game directory.

    Use this to:
    - Update existing .rpy scripts
    - Fix dialogue or code
    - Modify character definitions
    - Update configuration files

    IMPORTANT: After editing scripts, you MUST call build_project()
    to recompile the game, otherwise changes won't appear!

    Args:
        project_name: Name of the project
        file_path: Relative path to file (e.g., "script.rpy")
        content: New content for the file (will overwrite existing content)

    Returns:
        Dict with success status and file info
    """
    project_dir = project_manager.ensure_project_dir(project_name)
    game_dir = project_dir / "game"
    target_file = game_dir / file_path

    try:
        # Ensure parent directory exists
        target_file.parent.mkdir(parents=True, exist_ok=True)

        # Write the file
        target_file.write_text(content, encoding="utf-8")

        logger.info("File edited", project=project_name, file=file_path)

        return {
            "success": True,
            "project": project_name,
            "file_path": file_path,
            "full_path": str(target_file),
            "size": len(content),
            "lines": len(content.splitlines()),
            "message": f"File {file_path} updated successfully. Remember to rebuild the project!",
        }
    except Exception as e:
        logger.error("Failed to edit file", error=str(e))
        return {"error": f"Failed to edit file: {str(e)}"}


@mcp.tool()
async def create_project(name: str, template: Optional[str] = None) -> dict:
    """Create a new project directory using the requested template."""
    template_name = template or settings.default_template
    project_dir = project_manager.ensure_project_dir(name)
    template_path = project_manager.find_template(template_name)
    project_manager.copy_template(project_dir, template_path)

    logger.info("Created project", name=name, template=template_name, path=project_dir)
    return {"name": name, "path": str(project_dir), "template": template_name}


@mcp.tool()
async def generate_background(
    project_name: str,
    description: str,
    style: Optional[str] = None,
    base_filename: Optional[str] = None,
) -> dict:
    """Generate a background image asset using Gemini.

    BACKGROUND DESCRIPTION GUIDELINES:

    Create detailed scene descriptions for visual novel backgrounds in 16:9 widescreen format.

    ESSENTIAL ELEMENTS TO INCLUDE:

    1. LOCATION TYPE:
       - Interior: café, bedroom, classroom, office, library, restaurant, shop
       - Exterior: park, street, beach, forest, mountains, city skyline
       - Fantasy/Sci-fi: castle, spaceship, magical realm, futuristic city

    2. TIME OF DAY (affects lighting and mood):
       - Morning: bright, fresh, soft golden light
       - Afternoon: bright, clear, strong sunlight
       - Evening: warm, amber/orange tones, long shadows
       - Night: dark, artificial lights, stars/moon, atmospheric
       - Dusk/Dawn: transitional lighting, dramatic sky colors

    3. WEATHER & ATMOSPHERE:
       - Clear/sunny, cloudy, overcast
       - Rain, snow, fog, mist
       - Mood: peaceful, busy, mysterious, romantic, tense, cozy

    4. SPECIFIC DETAILS:
       - Furniture and objects (tables, chairs, decorations)
       - Architecture style (modern, traditional, fantasy, Victorian)
       - Color palette (warm tones, cool tones, vibrant, muted)
       - Lighting sources (windows, lamps, candles, neon signs)

    5. COMPOSITION:
       - Specify viewing angle if important (from entrance, from window, panoramic)
       - Mention depth (foreground/background elements)
       - Always mention "16:9 aspect ratio" for widescreen format

    GOOD DESCRIPTION EXAMPLES:

    Example 1 - Café Interior:
    "Cozy café interior, evening time, warm ambient lighting from vintage hanging lamps,
    wooden tables and chairs, counter with espresso machine in background, large windows
    showing darkening sky outside, anime visual novel style, 16:9 aspect ratio"

    Example 2 - Outdoor Scene:
    "City park at sunset, cherry blossom trees in full bloom, pink petals falling,
    wooden park benches along stone path, pond reflecting orange sky, peaceful atmosphere,
    detailed anime background art style, 16:9 widescreen"

    Example 3 - School Setting:
    "High school classroom, afternoon, bright sunlight streaming through large windows on left,
    rows of wooden desks and chairs, blackboard with chalk, empty room, clean and organized,
    anime slice-of-life style, 16:9 format"

    Example 4 - Night Scene:
    "Tokyo street at night, neon signs glowing in Japanese, wet pavement reflecting colorful lights,
    vending machines, closed shops, atmospheric and moody, detailed cyberpunk anime style,
    16:9 cinematic format"

    BAD EXAMPLES (too vague):
    - "a room" ❌
    - "outside somewhere" ❌
    - "nice place" ❌
    - "background" ❌

    Args:
        project_name: Name of the project
        description: Detailed scene description following guidelines above (include "16:9")
        style: Art style (optional, default: anime/visual novel background art)
        base_filename: Optional custom filename (auto-generated if not provided)
    """
    if not image_service.is_available():
        return {
            "success": False,
            "error": "Gemini client is not configured. Set GEMINI_API_KEY to enable image generation.",
        }

    project_dir = project_manager.ensure_project_dir(project_name)
    prompt_parts = [
        description,
        "Create a detailed visual novel background scene, 16:9 ratio.",
    ]
    if style:
        prompt_parts.append(f"Style: {style}.")

    prompt = " ".join(prompt_parts)
    result = await image_service.generate_image(
        project_dir, prompt, "background", base_filename
    )

    relative_files = (
        [str(path.relative_to(project_dir)) for path in result.files]
        if result.success
        else []
    )
    payload = result.model_dump(mode="json")
    payload["project"] = project_name
    if relative_files:
        payload["relative_files"] = relative_files
    return payload


@mcp.tool()
async def generate_character(
    project_name: str,
    character_name: str,
    description: str,
    pose: Optional[str] = None,
    emotion: Optional[str] = None,
    style: Optional[str] = None,
    generate_emotions: bool = False,
) -> dict:
    """Generate a character sprite using Gemini.

    CHARACTER DESCRIPTION GUIDELINES:

    Create detailed visual descriptions for full-body character sprites in anime/visual novel style.

    Generated characters are automatically normalized to 750px height for consistent display in Ren'Py.

    MULTIPLE EMOTIONS (RECOMMENDED!):
    Set generate_emotions=True to create 5 full-body emotion variants in one call:
    - neutral, happy, sad, surprised, angry
    Files will be saved as: {name}_neutral.png, {name}_happy.png, etc.

    This is the EASIEST way to make dynamic characters - just switch between images!

    Using emotion variants in Ren'Py (Simple Method):
    ```renpy
    # Step 1: Define emotion variants (in init or at top of script)
    image alice neutral = "images/alice_neutral_transparent.png"
    image alice happy = "images/alice_happy_transparent.png"
    image alice sad = "images/alice_sad_transparent.png"
    image alice surprised = "images/alice_surprised_transparent.png"
    image alice angry = "images/alice_angry_transparent.png"

    # Step 2: Switch emotions in dialogue - just use show!
    label start:
        show alice neutral at left with moveinleft
        Alice "Hello there."

        show alice happy with dissolve  # Automatically switches to happy sprite!
        Alice "It's so nice to see you!"

        show alice surprised with dissolve  # Switches to surprised!
        Alice "Wait, what did you say?!"

        show alice sad with dissolve  # Switches to sad!
        Alice "Oh no... that's terrible."
    ```

    No LayeredImages needed - full-body sprite switching is simpler and works great!

    WHAT TO INCLUDE IN DESCRIPTIONS:
    - Physical appearance: hair color/style, eye color, build, height
    - Clothing: outfit details, accessories, distinctive features
    - Personality indicators: friendly, serious, shy, confident (affects expression)
    - Age range: child, teen, young adult, adult, elderly
    - Distinctive features: glasses, scars, tattoos, jewelry, etc.

    EMOTION/EXPRESSION OPTIONS:
    - happy, cheerful, smiling, laughing
    - sad, crying, disappointed
    - angry, frustrated, annoyed
    - surprised, shocked, amazed
    - neutral, calm, serious
    - embarrassed, blushing, shy
    - confident, proud, smug
    - worried, anxious, scared

    POSE SUGGESTIONS:
    - standing (default, most common)
    - hands on hips, arms crossed
    - waving, pointing
    - holding object (specify what)
    - thinking pose (hand on chin)

    VISUAL STYLE:
    - Default: anime/visual novel style
    - Full-body sprite (head to toe)
    - Clean lines, vibrant colors
    - Character should face forward or at slight angle

    GOOD DESCRIPTION EXAMPLES:

    Example 1 - Barista:
    "friendly young woman with shoulder-length brown hair in ponytail, warm brown eyes,
    wearing green apron over white shirt, holding coffee cup, cheerful smile, anime style"

    Example 2 - Student:
    "teenage boy with messy black hair, glasses, wearing school uniform with red tie,
    backpack over shoulder, curious expression, anime style"

    Example 3 - Fantasy Character:
    "elf warrior woman with long silver hair, pointed ears, wearing leather armor,
    sword at hip, confident stance, detailed anime fantasy style"

    BAD EXAMPLES (too vague):
    - "a person" ❌
    - "someone happy" ❌
    - "character" ❌

    Args:
        project_name: Name of the project
        character_name: Name of the character (lowercase, used for filename)
        description: Detailed visual description following guidelines above
        pose: Character's pose (optional, default: standing)
        emotion: Character's emotion/expression (optional, default: neutral)
        style: Art style (optional, default: anime/visual novel style)
    """
    if not image_service.is_available():
        return {
            "success": False,
            "error": "Gemini client is not configured. Set GEMINI_API_KEY to enable image generation.",
        }

    project_dir = project_manager.ensure_project_dir(project_name)
    prompt_parts = [
        f"Character name: {character_name}.",
        description,
        "Create a full body character sprite suitable for a Ren'Py visual novel with transparent background.",
        "IMPORTANT FRAMING: Character should fill approximately 70-75% of the vertical frame height, centered, with head near top and feet near bottom.",
        "Leave some empty space above the head and below the feet for consistent sizing across all characters.",
        "The character should be drawn at a consistent scale - not too close (filling entire frame) and not too far (tiny in frame).",
    ]
    if pose:
        prompt_parts.append(f"Pose: {pose}.")
    if emotion:
        prompt_parts.append(f"Emotion: {emotion}.")
    if style:
        prompt_parts.append(f"Art style: {style}.")

    prompt = " ".join(prompt_parts)
    result = await image_service.generate_image(
        project_dir,
        prompt,
        "character",
        base_name=character_name,
        generate_emotions=generate_emotions,
    )

    relative_files = (
        [str(path.relative_to(project_dir)) for path in result.files]
        if result.success
        else []
    )
    transparent_files: list[str] = []

    if result.success:
        for original_path in result.files:
            transparent_path = await asyncio.to_thread(
                background_remover.remove_background, original_path
            )
            if transparent_path is not None:
                try:
                    transparent_files.append(
                        str(transparent_path.relative_to(project_dir))
                    )
                except ValueError:
                    transparent_files.append(str(transparent_path))

        # FINAL NORMALIZATION: Ensure all images (original + transparent) are consistent
        # This runs after background removal to guarantee uniform sizing
        from .image_service import _normalize_character_sizes

        character_assets_dir = project_dir / "assets" / "character"
        if character_assets_dir.exists():
            await asyncio.to_thread(
                _normalize_character_sizes, character_assets_dir, target_height=750
            )

    payload = result.model_dump(mode="json")
    payload["project"] = project_name
    payload["character"] = character_name
    if relative_files:
        payload["relative_files"] = relative_files
    if transparent_files:
        payload["transparent_files"] = transparent_files
    return payload


@mcp.tool()
async def generate_script(
    project_name: str,
    script_name: str,
    script_content: str,
) -> dict:
    """Write a Ren'Py script file to the project.

    YOU (the MCP client) should generate the script content based on these guidelines,
    then pass it to this tool to save. Gemini is only for images, not dialogue!

    SCRIPT WRITING GUIDELINES:

    Create interactive visual novel scenes with proper Ren'Py structure and player choices.

    CRITICAL REQUIREMENTS:

    0. LABEL NAMING (VERY IMPORTANT):
       NEVER use "label start" in generated scripts!
       - The main script.rpy already has "label start"
       - Use a unique label name based on the script name
       - Example: If script is "tennis_date.rpy", use "label tennis_date:"
       - The main script.rpy will call your label

       ❌ WRONG:
       label start:
           "This will cause an error!"

       ✅ CORRECT:
       label my_scene:
           "This works perfectly!"

    1. INTERACTIVE CHOICES (REQUIRED):
       Every scene MUST include at least ONE menu with 2-3 player choices.
       Each choice should lead to different dialogue/responses.

    2. CHARACTER POSITIONING:
       ALWAYS add an ``at`` clause so sprites don't stack center-screen.
       Characters are normalized to 750px height for consistent sizing.

       IMPORTANT: Use wider spacing to prevent characters from bunching together!

       Define positions with good spacing:
       ```
       # Custom positions with wider spacing (RECOMMENDED)
       define left_pos = Position(xalign=0.2, yalign=1.0)   # 20% from left
       define center_pos = Position(xalign=0.5, yalign=1.0)  # Center
       define right_pos = Position(xalign=0.8, yalign=1.0)   # 80% from left

       # Characters are 750px, zoom 0.65 works great
       transform scaled:
           zoom 0.65  # Good size for 750px characters with proper spacing
       ```

       Then use in scenes:
       - 1 character: show {name} at scaled, center_pos
       - 2 characters: show {name1} at scaled, left_pos
                       show {name2} at scaled, right_pos
       - 3 characters: show {name1} at scaled, left_pos
                       show {name2} at scaled, center_pos
                       show {name3} at scaled, right_pos

       This gives characters proper breathing room!

       IMPORTANT: Prefer Ren'Py's built-in left/center/right/truecenter or Position(...)
       Maximum: 3 characters visible at once for visual clarity

    3. IMAGE REFERENCES & EMOTION SWITCHING:
       - Backgrounds: "images/{filename}.png"
       - Characters: "images/{name}_{emotion}_transparent.png"
       - Use simple, lowercase filenames

       EMOTION SWITCHING (Recommended for all characters!):
       When characters are generated with emotions, define each as a separate image:
       ```
       # Define all emotions at the top of script
       image alice neutral = "images/alice_neutral_transparent.png"
       image alice happy = "images/alice_happy_transparent.png"
       image alice sad = "images/alice_sad_transparent.png"
       image alice surprised = "images/alice_surprised_transparent.png"
       image alice angry = "images/alice_angry_transparent.png"
       ```

           Switch emotions during dialogue:
           ```
           show alice neutral at scaled, left_pos with moveinleft
           Alice "Hello there."

           show alice happy at scaled, left_pos with dissolve  # ✅ MUST include BOTH transform AND position!
           Alice "It's so nice to see you!"

           show alice surprised at scaled, left_pos with dissolve  # ✅ Keep ALL attributes!
           Alice "Wait, what?!"

           show alice sad at scaled, left_pos with dissolve  # ✅ Never omit the position!
           Alice "Oh no..."
           ```

           CRITICAL: When switching emotions, ALWAYS include "at scaled, position"!
           - Missing transform → character changes size
           - Missing position → creates DUPLICATE character at different location
           - You MUST include BOTH every time you switch emotions!

       This makes characters feel alive and reactive to the story!

    4. TRANSITIONS & VISUAL FLOW:
       - Use transitions when changing backgrounds or bringing sprites on screen.
         scene bg cafe_interior with dissolve
       - Character entrances/exits should feel intentional:
         show bob at scaled, right with moveinright
         hide bob with moveoutright
       - Swapping emotions benefits from something subtle:
         show alice happy with dissolve
       - Explore Ren'Py's built-in transitions (dissolve, fade, moveinleft/right, ease, etc.)
         to match the scene tempo. See https://www.renpy.org/doc/html/transitions.html

    5. SCENE STRUCTURE:
       Every scene follows this pattern (use unique label name, NOT "start"):

       ```
       # Use script name or scene name for label, NEVER "start"
       label my_scene_name:
           # Setup
           scene bg {background_name} with dissolve  # soften background changes
           show {character} at {position} with moveinleft  # pick a transition that fits

           # Dialogue
           Character "Dialogue text"

           # Interactive Choice
           menu:
               "Question or prompt?"

               "Choice 1":
                   Character "Response to choice 1"

               "Choice 2":
                   Character "Response to choice 2"

               "Choice 3":
                   Character "Response to choice 3"

           # Conclusion
           Character "Concluding dialogue"
           return
       ```

       IMPORTANT: The main script.rpy will call your label like this:
       ```
       label start:
           call my_scene_name
           return
       ```

    COMPLETE EXAMPLE (2 characters with proper spacing):

    ```renpy
    # File: cafe_intro.rpy
    # IMPORTANT: Use unique label name, NOT "start"!

    # Define positions with good spacing to prevent bunching
    # Characters are normalized to 750px for consistent sizing
    define left_pos = Position(xalign=0.2, yalign=1.0)   # 20% from left
    define right_pos = Position(xalign=0.8, yalign=1.0)  # 80% from left
    define center_pos = Position(xalign=0.5, yalign=1.0) # Center

    # Characters are 750px, zoom 0.65 looks great
    transform scaled:
        zoom 0.65  # Good size with nice spacing

    # Use script-specific label name (cafe_intro, NOT start)
    label cafe_intro:
        # Scene setup
        scene bg cafe_interior with fade
        show alice at scaled, left_pos with moveinleft
        show bob at scaled, right_pos with moveinright

        # Opening dialogue
        Alice "Welcome to The Daily Grind! Come on in!"
        Bob "Thanks! This place looks really cozy."
        Alice "We pride ourselves on atmosphere. What can I get you?"

        # Interactive choice (REQUIRED)
        menu:
            "What would you like to order?"

            "I'll have a latte, please.":
                Alice "Excellent choice! One latte coming up!"
                Bob "Perfect, thanks!"

            "Do you have any tea?":
                Alice "Absolutely! We have green, black, and herbal."
                Bob "I'll take green tea, please."

            "Just water is fine.":
                Alice "Of course! Still or sparkling?"
                Bob "Still water, thanks."

        # Concluding dialogue
        show alice happy at scaled, left_pos with dissolve  # Always include position!
        Alice "I'll have that ready in just a moment!"
        Bob "Great, I'll grab a seat."

        return

    # The main script.rpy will call this like:
    # label start:
    #     call cafe_intro
    #     return
    ```

    TONE EXAMPLES:
    - upbeat: cheerful, energetic, positive dialogue
    - mysterious: subtle, questioning, atmospheric
    - romantic: warm, intimate, emotional
    - dramatic: intense, conflict-driven, impactful
    - comedic: humorous, lighthearted, playful

    CHOICE DESIGN TIPS:
    - Make choices meaningful (different outcomes/responses)
    - Keep choice text concise (one line)
    - Provide 2-3 options (not too many or too few)
    - Each choice should feel distinct

    Args:
        project_name: Name of the project
        script_name: Name for the script file (e.g., "intro" creates intro.rpy)
        script_content: Complete Ren'Py script content (generated by you, the MCP client!)
    """
    import re
    from pathlib import Path

    project_dir = project_manager.ensure_project_dir(project_name)

    # Sanitize script name for filename
    safe_name = re.sub(r"[^a-z0-9_]+", "_", script_name.lower()).strip("_") or "scene"
    script_path = project_dir / "game" / f"{safe_name}.rpy"
    script_path.parent.mkdir(parents=True, exist_ok=True)

    # Write the script content
    script_path.write_text(script_content, encoding="utf-8")

    logger.info("Wrote script file", path=str(script_path), size=len(script_content))

    # Extract the label name from the script content
    label_name = None
    for line in script_content.split("\n"):
        line = line.strip()
        if line.startswith("label ") and ":" in line:
            label_name = line[6 : line.index(":")].strip()
            break

    # Update the main script.rpy to call this label
    main_script = project_dir / "game" / "script.rpy"
    if main_script.exists() and label_name:
        main_content = main_script.read_text(encoding="utf-8")

        # Check if it's still the template default (has "Welcome to your new Ren'Py project!")
        if "Welcome to your new Ren'Py project!" in main_content:
            # Replace the template with a call to the generated script
            new_main_content = f"""label start:
    # Call the generated story
    call {label_name}
    
    # Return to main menu
    return
"""
            main_script.write_text(new_main_content, encoding="utf-8")
            logger.info(
                "Updated main script.rpy to call generated label", label=label_name
            )

    # Preview first 15 lines
    preview_lines = "\n".join(script_content.split("\n")[:15])
    if len(script_content.split("\n")) > 15:
        preview_lines += "\n... (truncated)"

    return {
        "success": True,
        "project_name": project_name,
        "script_name": safe_name,
        "script_path": str(script_path.relative_to(project_dir)),
        "preview": preview_lines,
        "message": f"Script saved to {script_path.relative_to(project_dir)}"
        + (
            f" and main script.rpy updated to call '{label_name}'" if label_name else ""
        ),
    }


# REMOVED: search_docs tool
# The MCP client (Claude) already has comprehensive Ren'Py knowledge,
# so local doc search is unnecessary.


@mcp.tool()
async def build_project(
    project_name: str, target: str = "web", force_rebuild: bool = False
) -> dict:
    """Run the build pipeline for a project.

    Compiles a Ren'Py project into a playable web game. All asset management
    (copying images to correct locations) happens automatically.

    WORKFLOW:
    1. generate_background() → create background images
    2. generate_character() → create character sprites
    3. generate_script() → write dialogue and scenes
    4. build_project() → compile everything into web game ⚠️ REQUIRED after script changes!
    5. start_web_preview() → play the game in browser

    IMPORTANT: Always rebuild after editing or generating .rpy scripts!
    Ren'Py caches compiled .rpyc files, so changes won't appear until rebuild.

    REQUIREMENTS:
    - Ren'Py SDK configured (RENPY_SDK_PATH environment variable)
    - Ren'Py web support installed (via launcher)
    - Valid project with at least one .rpy script in game/ folder

    OUTPUT:
    Creates {project_name}-dists/{project_name}-web/ containing the playable web game.
    Use start_web_preview() to serve and test the game locally.

    Args:
        project_name: Name of the project to build
        target: Build target ("web" for browser, "pc"/"mac"/"linux" for desktop)
        force_rebuild: Clean build from scratch (default: False)
    """
    request = BuildRequest(
        project_name=project_name, target=target, force_rebuild=force_rebuild
    )
    result = await build_manager.build(request)

    if result.success:
        logger.info(
            "Build complete",
            project=project_name,
            target=target,
            output=result.output_path,
        )
    else:
        logger.error(
            "Build failed",
            project=project_name,
            target=target,
            error=result.error,
        )

    return result.model_dump(mode="json")


@mcp.tool()
async def start_web_preview(project_name: str) -> dict:
    """Serve the generated web build from a local HTTP server."""
    # The distribute command creates project_name-dists/project_name-web/
    build_dir = (
        settings.workspace_root / f"{project_name}-dists" / f"{project_name}-web"
    )
    if not build_dir.exists():
        return {
            "success": False,
            "error": f"No web build found for project '{project_name}'. Run build_project first.",
        }
    if not (build_dir / "index.html").exists():
        return {
            "success": False,
            "error": f"Web build at {build_dir} is missing index.html. Ensure the build completed successfully.",
        }

    server = await preview_manager.start(project_name, build_dir)
    logger.info(
        "Preview server started",
        project=project_name,
        port=server.port,
        url=server.url,
    )
    return {
        "success": True,
        "project": project_name,
        "url": server.url,
        "port": server.port,
    }


@mcp.tool()
async def stop_web_preview(project_name: str) -> dict:
    """Stop the local preview server."""
    stopped = await preview_manager.stop(project_name)
    return {"project": project_name, "stopped": stopped}


@mcp.resource("renpy://build/{project_name}")
async def build_resource(project_name: str) -> str:
    """Return a human-readable summary of the latest web build for a project."""
    project_dir = settings.workspace_root / project_name
    build_dir = (
        settings.workspace_root / f"{project_name}-dists" / f"{project_name}-web"
    )
    if not build_dir.exists():
        return f"No web build found for project '{project_name}'."

    lines = [
        f"Project: {project_name}",
        f"Build directory: {build_dir}",
    ]

    log_dir = project_dir / "logs"
    latest_log = (
        max(
            log_dir.glob("build-web-*.log"),
            default=None,
            key=lambda path: path.stat().st_mtime,
        )
        if log_dir.exists()
        else None
    )
    if latest_log:
        lines.append(f"Latest log: {latest_log}")

    index_path = build_dir / "index.html"
    if index_path.exists():
        lines.append("Status: Ready to preview via start_web_preview tool.")
    else:
        lines.append("Status: Build directory exists but index.html is missing.")

    return "\n".join(lines)


def main() -> None:
    """Launch the MCP server."""
    logger.info("Starting Ren'Py MCP server")
    mcp.run()
