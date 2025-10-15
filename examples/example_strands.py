"""
Strands Agent Example for Ren'Py MCP Server

This example demonstrates how to use Strands agents with the Ren'Py MCP Server
to create visual novels programmatically.

Requirements:
    pip install strands mcp

Environment Variables:
    GEMINI_API_KEY - Your Gemini API key
    RENPY_SDK_PATH - Path to Ren'Py SDK
"""

import os
from pathlib import Path

from mcp import StdioServerParameters, stdio_client
from strands import Agent
from strands.models import BedrockModel
from strands.tools.mcp import MCPClient

# Get the absolute path to this project directory
PROJECT_DIR = Path(__file__).parent.absolute()

# Create MCP client for Ren'Py server
renpy_client = MCPClient(
    lambda: stdio_client(
        StdioServerParameters(
            command="uv",
            args=["--directory", str(PROJECT_DIR), "run", "renpy-mcp-server"],
            env={
                "GEMINI_API_KEY": os.getenv("GEMINI_API_KEY", ""),
                "RENPY_SDK_PATH": os.getenv("RENPY_SDK_PATH", ""),
            },
        )
    )
)

# Configure model (using AWS Bedrock Claude)
bedrock_model = BedrockModel(
    model_id="us.anthropic.claude-sonnet-4-5-20250929-v1:0",
    temperature=0.7,
)

# System prompt for visual novel creation
SYSTEM_PROMPT = """
You are an expert visual novel creator using the Ren'Py MCP Server. Your role is to help users create engaging visual novels with:

- Compelling stories with branching narratives
- AI-generated backgrounds (16:9 widescreen)
- Character sprites with multiple emotions (neutral, happy, sad, surprised, angry)
- Interactive choices that matter
- Proper Ren'Py scripting

When creating visual novels:
1. Always generate characters with emotions (generate_emotions=True)
2. Use descriptive prompts for backgrounds and characters
3. Create meaningful choices for players
4. Include emotion changes to make characters feel alive
5. Build and preview the project when complete

Be creative and make engaging stories!
"""


# Example 1: Simple Romance VN
def example_romance():
    """Create a simple romance visual novel."""
    print("\n🌸 Example 1: Creating a Romance Visual Novel...")

    with renpy_client:
        all_tools = renpy_client.list_tools_sync()
        agent = Agent(tools=all_tools, model=bedrock_model, system_prompt=SYSTEM_PROMPT)

        response = agent(
            """Create a short romance visual novel called "coffee_romance":
            - One cozy café background (warm lighting, afternoon)
            - Two characters with emotions: "Sam" (barista, friendly) and "Alex" (customer, shy)
            - A simple meet-cute story where they connect over coffee
            - Include one meaningful choice for the player
            - Build it and give me the preview URL
            """
        )

        print(f"\n✅ Response: {response}")


# Example 2: Mystery VN
def example_mystery():
    """Create a mystery visual novel."""
    print("\n🔍 Example 2: Creating a Mystery Visual Novel...")

    with renpy_client:
        all_tools = renpy_client.list_tools_sync()
        agent = Agent(tools=all_tools, model=bedrock_model, system_prompt=SYSTEM_PROMPT)

        response = agent(
            """Create a mystery visual novel called "library_enigma":
            - Two backgrounds: library (daytime) and archive room (dim lighting)
            - Three characters with emotions: 
              * "Detective Riley" (sharp, investigative)
              * "Librarian Morgan" (nervous, hiding something)
              * "Professor Chen" (wise, knows more than they say)
            - A mystery about a missing rare book
            - Include investigation choices with different clues based on decisions
            - Build and preview
            """
        )

        print(f"\n✅ Response: {response}")


# Example 3: Sci-Fi Adventure
def example_scifi():
    """Create a sci-fi adventure visual novel."""
    print("\n🚀 Example 3: Creating a Sci-Fi Adventure...")

    with renpy_client:
        all_tools = renpy_client.list_tools_sync()
        agent = Agent(tools=all_tools, model=bedrock_model, system_prompt=SYSTEM_PROMPT)

        response = agent(
            """Create a sci-fi visual novel called "starship_adventure":
            - Three backgrounds: 
              * Spaceship bridge (futuristic, screens)
              * Engine room (industrial, red lights)
              * Observation deck (stars, windows)
            - Two characters with emotions:
              * "Captain Nova" (commanding, blue uniform)
              * "Engineer Zara" (technical, coveralls, tools)
            - Story: Engine failure in deep space, must make critical decisions
            - Include a branching choice: repair engines vs call for help
            - Different endings based on choice
            - Build and preview
            """
        )

        print(f"\n✅ Response: {response}")


# Example 4: List Existing Projects
def example_list_projects():
    """List all existing visual novel projects."""
    print("\n📁 Example 4: Listing Existing Projects...")

    with renpy_client:
        all_tools = renpy_client.list_tools_sync()
        agent = Agent(tools=all_tools, model=bedrock_model, system_prompt=SYSTEM_PROMPT)

        response = agent("List all existing visual novel projects")

        print(f"\n✅ Response: {response}")


# Example 5: Interactive Session
def example_interactive():
    """Run an interactive session with the agent."""
    print("\n💬 Example 5: Interactive Visual Novel Creator...")
    print("Ask the agent to create visual novels! Type 'quit' to exit.\n")

    with renpy_client:
        all_tools = renpy_client.list_tools_sync()
        agent = Agent(tools=all_tools, model=bedrock_model, system_prompt=SYSTEM_PROMPT)

        while True:
            user_input = input("\n🎮 You: ")
            if user_input.lower() in ["quit", "exit", "q"]:
                print("\n👋 Goodbye!")
                break

            response = agent(user_input)
            print(f"\n🤖 Agent: {response}")


if __name__ == "__main__":
    # Check environment variables
    if not os.getenv("GEMINI_API_KEY"):
        print("❌ Error: GEMINI_API_KEY environment variable not set!")
        print("Please set it: export GEMINI_API_KEY='your-key'")
        exit(1)

    if not os.getenv("RENPY_SDK_PATH"):
        print("❌ Error: RENPY_SDK_PATH environment variable not set!")
        print("Please set it: export RENPY_SDK_PATH='/path/to/renpy-sdk'")
        exit(1)

    print("🎮 Ren'Py MCP Server - Strands Agent Examples")
    print("=" * 50)

    # Run examples
    # Uncomment the examples you want to run:

    # example_romance()      # Simple romance story
    # example_mystery()      # Mystery investigation
    # example_scifi()        # Sci-fi adventure
    # example_list_projects()  # List projects
    example_interactive()  # Interactive mode (default)

    print("\n✨ Examples completed!")
