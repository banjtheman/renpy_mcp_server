#!/usr/bin/env python3
"""
Image generation service using Google Gemini.

Standalone CLI script for generating backgrounds and character sprites.
Called from TypeScript via python-runner.ts.

Usage:
  python image_service.py --type background --project myproject --prompt "..."
  python image_service.py --type character --project myproject --name alice --prompt "..." --emotions
"""

from __future__ import annotations

import argparse
import json
import logging
import mimetypes
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

# Configure logging to stderr so stdout is reserved for JSON output
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s: %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

# Import Gemini and PIL
try:
    from google import genai
    from google.genai import types
except ImportError:
    logger.error("google-genai not installed. Run: pip install google-genai")
    sys.exit(1)

try:
    from PIL import Image
except ImportError:
    logger.error("pillow not installed. Run: pip install pillow")
    sys.exit(1)


def slugify(value: str) -> str:
    """Convert string to filesystem-safe slug."""
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "image"


def resize_character_image(image_path: Path, target_height: int = 750) -> None:
    """Resize character sprite to consistent size.

    Characters are generated at 832x1248 (2:3 ratio), which is too large.
    This resizes them to target_height while maintaining aspect ratio.
    """
    try:
        img = Image.open(image_path)
        width, height = img.size

        aspect_ratio = width / height
        new_height = target_height
        new_width = int(target_height * aspect_ratio)

        resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)
        resized.save(image_path, optimize=True, quality=95)
        logger.info(f"Resized: {width}x{height} -> {new_width}x{new_height}")
    except Exception as e:
        logger.warning(f"Failed to resize {image_path}: {e}")


def normalize_character_sizes(assets_dir: Path, target_height: int = 750) -> None:
    """Post-process all character images to ensure consistent sizing."""
    try:
        for image_file in assets_dir.glob("*.png"):
            resize_character_image(image_file, target_height=target_height)
        logger.info(f"Normalized all characters to {target_height}px height")
    except Exception as e:
        logger.warning(f"Failed to normalize sizes: {e}")


def generate_image(
    project_dir: Path,
    prompt: str,
    image_type: str,
    base_name: Optional[str] = None,
    generate_emotions: bool = False,
) -> dict:
    """Generate an image asset and save to project directory.

    Returns JSON-serializable result dict.
    """
    # Get API key from environment
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return {
            "success": False,
            "error": "GEMINI_API_KEY not set",
            "prompt": prompt,
            "image_type": image_type,
        }

    # Get model from environment or use default
    # Use gemini-2.5-flash-image which supports aspect ratio
    model_name = os.environ.get("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")

    # Initialize client
    try:
        client = genai.Client(api_key=api_key)
    except Exception as e:
        return {
            "success": False,
            "error": f"Failed to initialize Gemini client: {e}",
            "prompt": prompt,
            "image_type": image_type,
        }

    # Create assets directory
    assets_dir = project_dir / "assets" / image_type
    assets_dir.mkdir(parents=True, exist_ok=True)

    # Generate filename
    raw_name = base_name or f"{slugify(prompt)[:48]}-{datetime.utcnow():%Y%m%d%H%M%S}"
    filename_root = slugify(raw_name)
    saved_files: list[Path] = []

    # Choose aspect ratio
    aspect_ratio = "16:9" if image_type == "background" else "2:3"

    # Build prompt
    if generate_emotions and image_type == "character":
        enhanced_prompt = (
            f"{prompt}\n\n"
            "IMPORTANT: Generate 5 SEPARATE, INDIVIDUAL images (not a character sheet).\n"
            "Each image should contain ONE SINGLE character with a different emotion:\n"
            "1. First image: Neutral/calm expression\n"
            "2. Second image: Happy/cheerful expression\n"
            "3. Third image: Sad/worried expression\n"
            "4. Fourth image: Surprised/shocked expression\n"
            "5. Fifth image: Angry/serious expression\n\n"
            "Keep the character design IDENTICAL across all images, only change the facial expression.\n"
            "Each image must show ONLY ONE character, not multiple characters side-by-side."
        )
        final_prompt = enhanced_prompt
    else:
        final_prompt = prompt

    # Emotion suffixes
    emotion_suffixes = ["neutral", "happy", "sad", "surprised", "angry"]

    try:
        contents = [
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=final_prompt)],
            )
        ]
        config = types.GenerateContentConfig(
            response_modalities=["IMAGE", "TEXT"],
            image_config=types.ImageConfig(
                aspect_ratio=aspect_ratio,
            ),
        )

        file_index = 0
        for chunk in client.models.generate_content_stream(
            model=model_name,
            contents=contents,
            config=config,
        ):
            if (
                not chunk.candidates
                or not chunk.candidates[0].content
                or not chunk.candidates[0].content.parts
            ):
                continue

            part = chunk.candidates[0].content.parts[0]
            inline_data = getattr(part, "inline_data", None)

            if inline_data and inline_data.data:
                file_extension = mimetypes.guess_extension(inline_data.mime_type) or ".png"

                # Generate filename
                if generate_emotions and image_type == "character" and file_index < len(emotion_suffixes):
                    emotion = emotion_suffixes[file_index]
                    file_name = f"{filename_root}_{emotion}"
                elif file_index == 0:
                    file_name = filename_root
                else:
                    file_name = f"{filename_root}-{file_index}"

                file_index += 1

                file_path = assets_dir / f"{file_name}{file_extension}"
                file_path.write_bytes(inline_data.data)
                saved_files.append(file_path)
                logger.info(f"Saved: {file_path.name}")

            elif getattr(part, "text", None):
                logger.debug(f"Text response: {part.text}")

        if not saved_files:
            return {
                "success": False,
                "error": "No image data returned from Gemini",
                "prompt": prompt,
                "image_type": image_type,
            }

        # Normalize character sizes
        if image_type == "character":
            normalize_character_sizes(assets_dir, target_height=750)

        return {
            "success": True,
            "prompt": prompt,
            "image_type": image_type,
            "files": [str(f) for f in saved_files],
            "primary_file": str(saved_files[0]),
            "filename": saved_files[0].name,
        }

    except Exception as e:
        logger.exception(f"Generation failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "prompt": prompt,
            "image_type": image_type,
        }


def main():
    parser = argparse.ArgumentParser(description="Generate images with Gemini")
    parser.add_argument("--type", required=True, choices=["background", "character"])
    parser.add_argument("--project", required=True, help="Project name")
    parser.add_argument("--prompt", required=True, help="Image description")
    parser.add_argument("--name", help="Character name (for characters)")
    parser.add_argument("--filename", help="Custom filename")
    parser.add_argument("--emotions", action="store_true", help="Generate emotion variants")

    args = parser.parse_args()

    # Get workspace from environment
    workspace = os.environ.get("RENPY_MCP_WORKSPACE")
    if not workspace:
        # Fall back to data directory
        data_dir = os.environ.get("RENPY_STUDIO_DATA_DIR", os.path.expanduser("~/.renpy-studio"))
        workspace = os.path.join(data_dir, "workspace")

    project_dir = Path(workspace) / args.project

    # Determine base name
    base_name = args.filename or args.name

    # Generate image
    result = generate_image(
        project_dir=project_dir,
        prompt=args.prompt,
        image_type=args.type,
        base_name=base_name,
        generate_emotions=args.emotions,
    )

    # Output JSON result
    print(json.dumps(result))

    # Exit with appropriate code
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
