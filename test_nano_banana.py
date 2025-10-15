"""Quick image generation test for Gemini Flash Image (Nano Banana).

This is a lightweight test that generates ONE test image to verify your
Gemini API key works. It won't use much of your API quota.

For extensive testing with multiple images, emotions, and aspect ratios,
see the full test suite in the development version.

Usage:
    python test_nano_banana.py

Requirements:
    google-genai>=0.3.0
"""

import mimetypes
import os
import sys
from pathlib import Path

from google import genai
from google.genai import types


def generate_test_image(client: genai.Client) -> bool:
    """Test basic single image generation - quick API verification."""
    print("\n=== Quick Image Generation Test ===")
    print("Generating a single test image to verify Gemini API...")
    prompt = "A simple anime-style character sprite, friendly expression, standing pose"
    output_dir = Path("nano_banana_test_output")
    output_dir.mkdir(exist_ok=True)

    config = types.GenerateContentConfig(response_modalities=["IMAGE", "TEXT"])

    saved = []
    for chunk in client.models.generate_content_stream(
        model=os.environ.get("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"),
        contents=[
            types.Content(
                role="user",
                parts=[types.Part.from_text(text=prompt)],
            )
        ],
        config=config,
    ):
        if not chunk.candidates:
            continue
        content = chunk.candidates[0].content
        if not content or not content.parts:
            continue
        part = content.parts[0]

        inline_data = getattr(part, "inline_data", None)
        if inline_data and inline_data.data:
            extension = mimetypes.guess_extension(inline_data.mime_type) or ".png"
            file_path = output_dir / f"test_image{extension}"
            file_path.write_bytes(inline_data.data)
            saved.append(file_path)
            print(f"✅ Generated: {file_path}")
            break  # Only generate one image
        elif getattr(part, "text", None):
            print(f"Note: {part.text.strip()}")

    if saved:
        print(f"✅ Test passed! Gemini API is working correctly.")
        print(f"   Output: {saved[0]}")
        return True

    print("❌ Test failed: No image generated")
    return False


def main() -> int:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        print("❌ GEMINI_API_KEY is not set. Export your key and retry.")
        print("   Get your key from: https://aistudio.google.com/app/api-keys")
        return 1

    client = genai.Client(api_key=api_key)

    print("🎨 Ren'Py MCP Server - Gemini API Test 🎨")
    print("=" * 60)
    print("\nThis will generate ONE test image to verify your API key works.")
    print("It won't use much of your API quota.\n")

    # Quick single image test
    try:
        success = generate_test_image(client)
    except Exception as exc:
        print(f"❌ Test failed with exception: {exc}")
        success = False

    # Summary
    print("\n" + "=" * 60)
    if success:
        print("🎉 Success! Your Gemini API is working correctly.")
        print("\nYou're all set to generate backgrounds and characters!")
        print("The MCP server will use this API to create visual novel assets.")
        return 0
    else:
        print("💥 Test failed. Please check:")
        print("  1. Your API key is correct")
        print("  2. You have API quota available")
        print("  3. Your network connection is working")
        return 1


if __name__ == "__main__":
    sys.exit(main())
