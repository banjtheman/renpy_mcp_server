"""Background removal utilities for generated character art."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import List, Optional, Tuple

from PIL import Image

try:
    from rembg import remove as rembg_remove

    REMBG_IMPORT_ERROR: Optional[Exception] = None
except Exception as exc:  # pragma: no cover - depends on optional deps
    rembg_remove = None
    REMBG_IMPORT_ERROR = exc

logger = logging.getLogger(__name__)

IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}


class BackgroundRemover:
    """Remove backgrounds from images using rembg."""

    def __init__(self, resize_to: Optional[int] = None) -> None:
        self.resize_to = resize_to
        self._remove = rembg_remove

        if self._remove is None and REMBG_IMPORT_ERROR is not None:
            logger.warning(
                "rembg is unavailable; automatic background removal disabled. (%s)",
                REMBG_IMPORT_ERROR,
            )

    def remove_background(self, input_path: Path) -> Optional[Path]:
        """Remove the background from a single image.

        The output will maintain the same dimensions as the input image.
        """
        if self._remove is None:
            return None

        try:
            input_path = input_path.resolve()

            if input_path.suffix.lower() not in IMAGE_EXTENSIONS:
                logger.debug("Skipping unsupported file %s", input_path)
                return None

            output_path = input_path.with_name(f"{input_path.stem}_transparent.png")
            if output_path.exists():
                logger.debug("Transparent version already exists: %s", output_path)
                return output_path

            with Image.open(input_path) as image:
                # Store original dimensions to maintain size
                original_size = image.size

                # Remove background
                result = self._remove(image)

                # Ensure result maintains input dimensions
                if result.size != original_size:
                    logger.warning(
                        "Background removal changed size %s -> %s, resizing back",
                        original_size,
                        result.size,
                    )
                    result = result.resize(original_size, Image.Resampling.LANCZOS)

                # Apply optional resize (if configured)
                if self.resize_to:
                    result = result.resize(
                        (self.resize_to, self.resize_to), Image.Resampling.LANCZOS
                    )

                result.save(output_path, "PNG", optimize=True)

            logger.info("Removed background: %s -> %s", input_path, output_path)
            return output_path
        except Exception as exc:  # pragma: no cover - best effort logging
            logger.error("Failed to remove background for %s: %s", input_path, exc)
            return None

    def process_directory(self, directory: Path) -> Tuple[List[Path], List[Path]]:
        """Process all supported images inside a directory."""
        successes: List[Path] = []
        failures: List[Path] = []

        for image_file in directory.iterdir():
            if not image_file.is_file():
                continue
            if image_file.suffix.lower() not in IMAGE_EXTENSIONS:
                continue
            if "_transparent" in image_file.stem:
                continue

            output = self.remove_background(image_file)
            if output:
                successes.append(output)
            else:
                failures.append(image_file)

        return successes, failures
