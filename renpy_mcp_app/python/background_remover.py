#!/usr/bin/env python3
"""
Background removal service using rembg.

Removes backgrounds from character sprites to create transparent PNGs.
Called from TypeScript via python-runner.ts.

Usage:
  python background_remover.py --input /path/to/image.png --output /path/to/output.png
  python background_remover.py --directory /path/to/assets/character
"""

from __future__ import annotations

import argparse
import json
import logging
import sys
from pathlib import Path

# Configure logging to stderr
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s: %(message)s',
    stream=sys.stderr
)
logger = logging.getLogger(__name__)

try:
    from rembg import remove
    from PIL import Image
except ImportError as e:
    logger.error(f"Required package not installed: {e}")
    logger.error("Run: pip install rembg pillow")
    sys.exit(1)


# Target height for character normalization (consistent with image_service.py)
TARGET_HEIGHT = 750


def resize_to_target_height(image: Image.Image, target_height: int = TARGET_HEIGHT) -> Image.Image:
    """Resize image to target height while maintaining aspect ratio.

    Args:
        image: PIL Image to resize
        target_height: Target height in pixels (default 750px)

    Returns:
        Resized PIL Image
    """
    width, height = image.size

    # Calculate new dimensions maintaining aspect ratio
    aspect_ratio = width / height
    new_height = target_height
    new_width = int(target_height * aspect_ratio)

    # Resize using high-quality LANCZOS resampling
    resized = image.resize((new_width, new_height), Image.Resampling.LANCZOS)
    logger.info(f"Resized: {width}x{height} -> {new_width}x{new_height}")

    return resized


def remove_background(input_path: Path, output_path: Path | None = None, resize: bool = True) -> dict:
    """Remove background from an image and optionally resize to 750px height.

    Args:
        input_path: Path to input image
        output_path: Path for output (default: input_name_transparent.png)
        resize: Whether to resize to TARGET_HEIGHT (default True)

    Returns:
        dict with success status and output path
    """
    if not input_path.exists():
        return {
            "success": False,
            "error": f"Input file not found: {input_path}",
        }

    # Determine output path
    if output_path is None:
        stem = input_path.stem
        # Don't double-add _transparent suffix
        if not stem.endswith("_transparent"):
            output_path = input_path.parent / f"{stem}_transparent.png"
        else:
            output_path = input_path

    try:
        # Read input image
        input_image = Image.open(input_path)

        # Remove background
        output_image = remove(input_image)

        # Convert to PIL Image if needed (rembg may return bytes or ndarray)
        if not isinstance(output_image, Image.Image):
            from io import BytesIO
            if isinstance(output_image, bytes):
                output_image = Image.open(BytesIO(output_image))
            else:
                # Assume numpy array
                output_image = Image.fromarray(output_image)

        # Resize to target height if requested
        if resize:
            output_image = resize_to_target_height(output_image, TARGET_HEIGHT)

        # Save output as PNG with optimization
        output_image.save(output_path, "PNG", optimize=True)
        logger.info(f"Saved transparent: {output_path}")

        return {
            "success": True,
            "input_path": str(input_path),
            "output_path": str(output_path),
            "resized": resize,
            "dimensions": f"{output_image.size[0]}x{output_image.size[1]}",
        }

    except Exception as e:
        logger.exception(f"Background removal failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "input_path": str(input_path),
        }


def process_directory(directory: Path) -> dict:
    """Process all images in a directory.

    Args:
        directory: Directory containing images

    Returns:
        dict with results for all processed images
    """
    if not directory.exists():
        return {
            "success": False,
            "error": f"Directory not found: {directory}",
        }

    results = []
    processed = 0
    failed = 0

    # Supported image formats
    supported_extensions = {".png", ".jpg", ".jpeg", ".webp", ".bmp", ".tiff"}

    for image_path in directory.iterdir():
        # Skip non-images and already transparent images
        if image_path.suffix.lower() not in supported_extensions:
            continue
        if "_transparent" in image_path.stem:
            continue

        result = remove_background(image_path)
        results.append(result)

        if result.get("success"):
            processed += 1
        else:
            failed += 1

    return {
        "success": failed == 0,
        "processed": processed,
        "failed": failed,
        "results": results,
    }


def main():
    parser = argparse.ArgumentParser(description="Remove backgrounds from images")
    parser.add_argument("--input", help="Single input image path")
    parser.add_argument("--output", help="Output path for single image")
    parser.add_argument("--directory", help="Process all images in directory")

    args = parser.parse_args()

    if args.directory:
        result = process_directory(Path(args.directory))
    elif args.input:
        output_path = Path(args.output) if args.output else None
        result = remove_background(Path(args.input), output_path)
    else:
        parser.print_help()
        sys.exit(1)

    # Output JSON result
    print(json.dumps(result))

    # Exit with appropriate code
    sys.exit(0 if result.get("success") else 1)


if __name__ == "__main__":
    main()
