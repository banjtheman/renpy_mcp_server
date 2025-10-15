"""Generate visual assets using Google Gemini (Nano Banana)."""

from __future__ import annotations

import logging
import mimetypes
import re
from datetime import datetime
from pathlib import Path
from typing import Optional

from google.genai import types
from PIL import Image

from .gemini_provider import GeminiProviderError, get_gemini_client
from .models import ImageGenerationResult
from .settings import Settings

logger = logging.getLogger(__name__)


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return slug or "image"


def _resize_character_image(image_path: Path, target_height: int = 750) -> None:
    """Resize character sprite to a consistent size.

    Characters are generated at 832x1248 (2:3 ratio), which is too large.
    This resizes them to target_height while maintaining aspect ratio.

    Args:
        image_path: Path to the image file to resize
        target_height: Target height in pixels (default 750px for optimal display)
    """
    try:
        img = Image.open(image_path)

        # Calculate new dimensions maintaining aspect ratio
        width, height = img.size

        aspect_ratio = width / height
        new_height = target_height
        new_width = int(target_height * aspect_ratio)

        # Always resize to ensure consistency, even if smaller
        resized = img.resize((new_width, new_height), Image.Resampling.LANCZOS)

        # Save back to the same file
        resized.save(image_path, optimize=True, quality=95)
        logger.info(f"Resized character: {width}x{height} -> {new_width}x{new_height}")

    except Exception as e:
        logger.warning(f"Failed to resize image {image_path}: {e}")
        # Don't fail the whole operation if resize fails


def _normalize_character_sizes(assets_dir: Path, target_height: int = 750) -> None:
    """Post-process all character images to ensure consistent sizing.

    This runs AFTER all images are generated to guarantee uniform dimensions.

    Args:
        assets_dir: Directory containing character images
        target_height: Target height for all characters (default 750px)
    """
    try:
        # Find all PNG files in the character assets directory
        for image_file in assets_dir.glob("*.png"):
            _resize_character_image(image_file, target_height=target_height)

        logger.info(f"Normalized all character images to {target_height}px height")
    except Exception as e:
        logger.warning(f"Failed to normalize character sizes: {e}")


class ImageService:
    """High-level image generation helpers."""

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        try:
            self.client = get_gemini_client(settings.gemini_api_key)
        except GeminiProviderError as exc:
            logger.warning("Gemini client unavailable: %s", exc)
            self.client = None

    def is_available(self) -> bool:
        return self.client is not None

    async def generate_image(
        self,
        project_dir: Path,
        prompt: str,
        image_type: str,
        base_name: Optional[str] = None,
        generate_emotions: bool = False,
    ) -> ImageGenerationResult:
        """Generate an image asset and persist it to the project directory.

        Automatically uses optimal aspect ratios and sizes:
        - background: 16:9 (1344x768) - widescreen for scenes
        - character: 2:3 aspect ratio, normalized to 750px height (~500x750) for optimal display

        Character images are normalized AFTER all generation to ensure consistent sizing.

        For characters, can generate multiple emotion variants in one call if generate_emotions=True.
        This creates: neutral, happy, sad, surprised, angry expressions.
        """
        if not self.client:
            return ImageGenerationResult(
                success=False,
                prompt=prompt,
                image_type=image_type,
                error="Gemini client is not configured. Set GEMINI_API_KEY.",
            )

        assets_dir = project_dir / "assets" / image_type
        assets_dir.mkdir(parents=True, exist_ok=True)

        raw_name = (
            base_name or f"{_slugify(prompt)[:48]}-{datetime.utcnow():%Y%m%d%H%M%S}"
        )
        filename_root = _slugify(raw_name)
        saved_files: list[Path] = []

        # Choose aspect ratio based on image type
        aspect_ratio = "16:9" if image_type == "background" else "2:3"

        # For characters, optionally generate multiple emotions
        if generate_emotions and image_type == "character":
            # CRITICAL: Be explicit that we want SEPARATE images, not a character sheet!
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

        # Emotion suffixes for multi-emotion generation
        emotion_suffixes = ["neutral", "happy", "sad", "surprised", "angry"]

        try:
            file_index = 0
            for chunk in self.client.models.generate_content_stream(
                model=self.settings.gemini_image_model,
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
                    file_extension = (
                        mimetypes.guess_extension(inline_data.mime_type) or ".png"
                    )

                    # If generating emotions, use emotion-specific filenames
                    if (
                        generate_emotions
                        and image_type == "character"
                        and file_index < len(emotion_suffixes)
                    ):
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
                    logger.info(f"Saved image: {file_path.name}")
                elif getattr(part, "text", None):
                    logger.debug("Gemini text response: %s", part.text)

            if not saved_files:
                return ImageGenerationResult(
                    success=False,
                    prompt=prompt,
                    image_type=image_type,
                    error="No image data returned from Gemini.",
                )

            # POST-PROCESSING: Normalize all character images to consistent size
            # This runs AFTER all images are generated to ensure uniformity
            if image_type == "character":
                _normalize_character_sizes(assets_dir, target_height=750)
                logger.info(
                    "Applied post-generation size normalization to all character images"
                )

            return ImageGenerationResult(
                success=True,
                prompt=prompt,
                image_type=image_type,
                files=saved_files,
                primary_file=saved_files[0],
            )
        except Exception as exc:  # pragma: no cover - best effort logging
            logger.exception("Image generation failed: %s", exc)
            return ImageGenerationResult(
                success=False,
                prompt=prompt,
                image_type=image_type,
                error=str(exc),
            )
