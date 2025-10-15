#!/usr/bin/env python3
"""
Ren'Py VN Agent - A Claude Agent SDK implementation for generating visual novels.

This agent takes user input describing a visual novel concept and uses the Ren'Py MCP server
to create a playable web game, returning a preview URL for the user to play.
"""

import asyncio
import os

from claude_agent_sdk import ClaudeAgentOptions, query


async def generate_visual_novel(user_input: str, mcp_config_path: str = ".mcp.json"):
    """
    Generates a Ren'Py visual novel based on user input.

    Args:
        user_input: User's description of the visual novel they want to create
        mcp_config_path: Path to the MCP configuration file

    Returns:
        str: Messages from the agent including the playable URL
    """
    # System prompt defining the agent's role and behavior
    system_prompt = """You are an expert visual novel creator using the Ren'Py MCP Server. Your role is to:

1. Listen to the user's description of a visual novel they want to create
2. Use the MCP tools to create a complete, playable visual novel:
   - create_project: Create a new Ren'Py project
   - generate_background: Create 16:9 background images with Gemini
   - generate_character: Create character sprites with emotions (use generate_emotions=True)
   - generate_script: Write Ren'Py scripts with choices and proper structure
   - build_project: Compile the game to web format
   - start_web_preview: Start a local server and provide the URL

3. Return the preview URL so the user can play their custom visual novel

CRITICAL GUIDELINES:

**Backgrounds (16:9 aspect ratio):**
- Describe detailed scenes: location, time of day, weather, atmosphere
- Examples: "cozy café interior, evening, warm lighting" or "city park at sunset, cherry blossoms"

**Characters (2:3 aspect ratio):**
- ALWAYS use generate_emotions=True to create 5 emotion variants (neutral, happy, sad, surprised, angry)
- Describe: appearance, clothing, personality indicators, age range
- Examples: "friendly barista with brown ponytail, green apron, warm smile, anime style"

**Scripts:**
- Define all emotion variants at the top:
  ```
  image alice neutral = "images/alice_neutral_transparent.png"
  image alice happy = "images/alice_happy_transparent.png"
  image alice sad = "images/alice_sad_transparent.png"
  ```
- Use proper character positioning with zoom and alignment:
  ```
  transform scaled:
      zoom 0.6
  
  show character at scaled, left
  ```
- ALWAYS include interactive choices (menu blocks)
- Switch emotions during dialogue: `show alice happy`
- End with `return` to prevent looping

**Story Structure:**
- Opening scene with setup
- Character introductions
- Interactive choices that matter
- Dynamic emotions that match dialogue
- Proper ending

Be creative, engaging, and make stories that players will love!
"""

    # Create the prompt for VN generation
    prompt = f"Create a visual novel based on this description: {user_input}"

    # Configure agent options
    options = ClaudeAgentOptions(
        system_prompt=system_prompt,
        mcp_servers=mcp_config_path,
        allowed_tools=[
            # Standard tools
            "Read",
            "Write",
            "Edit",
            "Bash",
            "Glob",
            "Grep",
            "TodoWrite",
            "ListMcpResources",
            "ReadMcpResource",
            # Ren'Py MCP tools
            "mcp__renpy_mcp_server__list_projects",
            "mcp__renpy_mcp_server__create_project",
            "mcp__renpy_mcp_server__generate_background",
            "mcp__renpy_mcp_server__generate_character",
            "mcp__renpy_mcp_server__generate_script",
            "mcp__renpy_mcp_server__build_project",
            "mcp__renpy_mcp_server__start_web_preview",
            "mcp__renpy_mcp_server__stop_web_preview",
        ],
    )

    # Stream messages from the agent
    async for message in query(prompt=prompt, options=options):
        # Handle different message types
        if hasattr(message, "type"):
            msg_type = message.type
        else:
            msg_type = getattr(message, "__class__", type(message)).__name__

        # Print text content from assistant messages
        if msg_type == "text" or "Text" in msg_type:
            if hasattr(message, "text"):
                print(message.text, end="", flush=True)
        elif "Assistant" in msg_type or "Message" in msg_type:
            # Try to extract text from message content
            if hasattr(message, "content"):
                for block in message.content:
                    if hasattr(block, "text"):
                        print(block.text, end="", flush=True)


async def main():
    """
    Main entry point for the Ren'Py VN agent.
    """
    print("🎮 Ren'Py Visual Novel Generator Agent")
    print("=" * 50)

    # Check environment variables
    if not os.getenv("GEMINI_API_KEY"):
        print("\n❌ Error: GEMINI_API_KEY environment variable not set!")
        print("Please set it: export GEMINI_API_KEY='your-key'")
        return

    if not os.getenv("RENPY_SDK_PATH"):
        print("\n❌ Error: RENPY_SDK_PATH environment variable not set!")
        print("Please set it: export RENPY_SDK_PATH='/path/to/renpy-sdk'")
        return

    print("\nDescribe the visual novel you want to create:")
    print("(e.g., 'A romance story at a coffee shop with two characters')\n")

    user_input = input("> ")

    if not user_input.strip():
        print("Please provide a visual novel description.")
        return

    print("\n✨ Generating your visual novel...\n")

    try:
        await generate_visual_novel(user_input)
        print("\n\n🎉 Visual novel generation complete!")
    except Exception as e:
        print(f"\n❌ Error generating visual novel: {e}")
        print("\nMake sure:")
        print("1. Ren'Py MCP server is configured in .mcp.json")
        print("2. claude-agent-sdk is installed: pip install claude-agent-sdk")
        print("3. GEMINI_API_KEY and RENPY_SDK_PATH are set")
        print("4. Ren'Py SDK has web support installed")


if __name__ == "__main__":
    asyncio.run(main())
