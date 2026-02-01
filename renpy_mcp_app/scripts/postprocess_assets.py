#!/usr/bin/env python3
"""
Post-process UI assets - remove backgrounds, resize, optimize.
"""

import os
import sys
from pathlib import Path

try:
    from PIL import Image
    from rembg import remove
except ImportError:
    print("Installing required packages...")
    os.system(f"{sys.executable} -m pip install pillow rembg")
    from PIL import Image
    from rembg import remove

# Asset directory
ASSETS_DIR = Path(__file__).parent.parent / "src" / "ui" / "assets"

def remove_background(input_path: Path, output_path: Path = None):
    """Remove background from an image using rembg."""
    if output_path is None:
        output_path = input_path.with_stem(input_path.stem + "_transparent")

    print(f"Removing background from: {input_path.name}")

    with open(input_path, "rb") as f:
        input_data = f.read()

    output_data = remove(input_data)

    with open(output_path, "wb") as f:
        f.write(output_data)

    print(f"  Saved: {output_path.name}")
    return output_path


def resize_image(input_path: Path, max_size: int = 256, output_path: Path = None):
    """Resize image to fit within max_size while preserving aspect ratio."""
    if output_path is None:
        output_path = input_path.with_stem(input_path.stem + f"_{max_size}")

    print(f"Resizing: {input_path.name} to max {max_size}px")

    with Image.open(input_path) as img:
        # Preserve aspect ratio
        img.thumbnail((max_size, max_size), Image.Resampling.LANCZOS)

        # If PNG, preserve transparency
        if input_path.suffix.lower() == ".png":
            img.save(output_path, "PNG")
        else:
            img.save(output_path)

    print(f"  Saved: {output_path.name}")
    return output_path


def process_corner_flourish():
    """Process the corner flourish - remove background."""
    flourish_path = ASSETS_DIR / "corner_flourish.png"
    if flourish_path.exists():
        output = remove_background(flourish_path, ASSETS_DIR / "corner_flourish_transparent.png")
        # Also create smaller version for UI
        resize_image(output, 64, ASSETS_DIR / "corner_flourish_small.png")
    else:
        print(f"Not found: {flourish_path}")


def process_logo():
    """Process the logo - remove background if needed, create sizes."""
    logo_path = ASSETS_DIR / "logo.png"
    if logo_path.exists():
        # Remove background
        transparent = remove_background(logo_path, ASSETS_DIR / "logo_transparent.png")
        # Create favicon size
        resize_image(transparent, 32, ASSETS_DIR / "logo_32.png")
        # Create header size
        resize_image(transparent, 48, ASSETS_DIR / "logo_48.png")
    else:
        print(f"Not found: {logo_path}")


def process_divider():
    """Process the divider - remove background."""
    divider_path = ASSETS_DIR / "divider.png"
    if divider_path.exists():
        remove_background(divider_path, ASSETS_DIR / "divider_transparent.png")
    else:
        print(f"Not found: {divider_path}")


def main():
    print(f"Post-processing assets in: {ASSETS_DIR}\n")

    if not ASSETS_DIR.exists():
        print(f"Assets directory not found: {ASSETS_DIR}")
        sys.exit(1)

    # List available assets
    print("Available assets:")
    for f in ASSETS_DIR.glob("*.png"):
        print(f"  - {f.name}")
    print()

    # Process assets that need background removal
    process_corner_flourish()
    process_logo()
    process_divider()

    print("\n✓ Post-processing complete!")


if __name__ == "__main__":
    main()
