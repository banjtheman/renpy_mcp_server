#!/usr/bin/env python3
"""
Generate UI assets for RenPy Studio using Gemini image generation.
"""

import os
import sys
from pathlib import Path

# Check for API key
if not os.environ.get("GEMINI_API_KEY"):
    print("Error: GEMINI_API_KEY environment variable not set")
    sys.exit(1)

from google import genai
from google.genai import types
from PIL import Image
import io

client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

# Output directory
OUTPUT_DIR = Path(__file__).parent.parent / "src" / "ui" / "assets"
OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

def generate_image(prompt: str, filename: str, aspect_ratio: str = "1:1"):
    """Generate an image and save it."""
    print(f"Generating: {filename}...")

    response = client.models.generate_content(
        model="gemini-3-pro-image-preview",
        contents=[prompt],
        config=types.GenerateContentConfig(
            response_modalities=['TEXT', 'IMAGE'],
            image_config=types.ImageConfig(
                aspect_ratio=aspect_ratio,
                image_size="1K"
            ),
        ),
    )

    for part in response.parts:
        if part.inline_data:
            # Get the image from Gemini (returns as PIL Image)
            gemini_img = part.as_image()
            output_path = OUTPUT_DIR / filename

            # Save as JPEG first (Gemini's native format), then convert to PNG
            temp_path = OUTPUT_DIR / f"temp_{filename}.jpg"
            gemini_img.save(str(temp_path))

            # Open with PIL and save as PNG
            with Image.open(temp_path) as img:
                img.save(str(output_path), "PNG")

            # Clean up temp file
            temp_path.unlink()

            print(f"  Saved: {output_path}")
            return True
        elif part.text:
            print(f"  Note: {part.text[:100]}...")

    print(f"  Warning: No image generated for {filename}")
    return False


def main():
    print("Generating RenPy Studio UI assets...\n")

    # 1. Main Logo - Quill and book with theatrical elements
    generate_image(
        prompt="""Create a logo for 'RenPy Studio', a visual novel development application.

Design elements:
- An elegant open book with aged parchment pages
- A ornate quill pen resting on or writing in the book
- Subtle theater curtain drapes framing the composition
- Warm sepia and burgundy color palette with gold accents
- Antiquarian/Victorian aesthetic, like a rare book library emblem
- Clean vector-style illustration suitable for a software logo
- NO text in the image, just the symbolic elements
- Transparent or cream-colored background

Style: Elegant line art with subtle watercolor wash, vintage book illustration aesthetic""",
        filename="logo.png",
        aspect_ratio="1:1"
    )

    # 2. Decorative corner flourish
    generate_image(
        prompt="""Create a decorative corner flourish ornament for a vintage book design.

Design:
- Elegant curving vine and scroll pattern
- Suitable for top-left corner of a page
- Sepia/brown ink color on transparent background
- Victorian/Art Nouveau style ornamental design
- Delicate line work with organic flowing curves
- Should work as a corner decoration for frames
- NO text, purely decorative element

Style: Vintage engraving/woodcut aesthetic, single color, high contrast""",
        filename="corner_flourish.png",
        aspect_ratio="1:1"
    )

    # 3. Paper texture overlay
    generate_image(
        prompt="""Create a seamless aged parchment paper texture.

Characteristics:
- Cream/ivory base color like old book pages
- Subtle variations and slight discoloration
- Very light coffee-stain-like marks in corners
- Gentle fiber texture visible
- Warm, inviting, vintage book page feel
- Should tile seamlessly as a background
- Very subtle - not too distressed

Style: Photorealistic aged paper texture, soft and warm""",
        filename="paper_texture.png",
        aspect_ratio="1:1"
    )

    # 4. Book spine decorative element
    generate_image(
        prompt="""Create a decorative book spine ornament.

Design:
- Vertical decorative element for a book spine
- Gold leaf style embossing effect
- Includes small flourishes, dots, and lines
- Classical library book binding aesthetic
- Burgundy and gold color scheme
- Elegant, refined, antique book style
- NO text, just ornamental patterns

Style: Metallic gold embossing on rich burgundy leather look""",
        filename="book_spine_ornament.png",
        aspect_ratio="2:3"
    )

    # 5. Horizontal divider/flourish
    generate_image(
        prompt="""Create an elegant horizontal divider ornament for vintage book design.

Design:
- Symmetrical horizontal flourish/rule
- Center focal point with scrollwork extending left and right
- Sepia/brown ink color
- Classical book typography ornament style
- Delicate yet bold enough to be visible
- Width should be about 5x the height
- Works as a section divider

Style: Vintage printer's ornament, elegant and refined""",
        filename="divider.png",
        aspect_ratio="21:9"
    )

    # 6. Empty shelf background
    generate_image(
        prompt="""Create an illustration of an empty wooden bookshelf section.

Design:
- Rich mahogany or walnut wood texture
- Single shelf section, front view
- Warm lighting from above creating subtle shadows
- Classical library aesthetic
- Space for books to be placed on it
- Warm, inviting, cozy library atmosphere
- Detailed wood grain visible

Style: Digital painting, warm and atmospheric, library aesthetic""",
        filename="shelf_bg.png",
        aspect_ratio="16:9"
    )

    print("\n✓ Asset generation complete!")
    print(f"  Output directory: {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
