# Examples

This directory contains examples of how to integrate the Ren'Py MCP Server with different AI agent frameworks.

## 🤖 Claude Agent SDK

**File:** `claude_agent_example.py`

The Claude Agent SDK example shows how to create autonomous visual novels using Claude's agent capabilities.

### Quick Start

```bash
cd examples
python claude_agent_example.py
```

### How It Works

1. **Setup**: The agent connects to the Ren'Py MCP server via `.mcp.json`
2. **Prompt**: User describes the story they want
3. **Generation**: Agent automatically:
   - Creates a new project
   - Generates backgrounds and characters
   - Writes dialogue and scenes
   - Builds the web game
   - Returns a playable URL

### Example Usage

```python
# The agent handles everything automatically
response = await generate_visual_novel("Create a romance story at a coffee shop")
print(response)  # Returns playable game URL
```

### Configuration

1. **Copy the example config:**
   ```bash
   cp .mcp.json.example .mcp.json
   ```

2. **Update `.mcp.json` with your paths:**
   ```json
   {
     "mcpServers": {
       "renpy_mcp_server": {
         "command": "uv",
         "args": ["--directory", "/path/to/renpy_mcp_server", "run", "renpy-mcp-server"],
         "env": {
           "GEMINI_API_KEY": "your-key",
           "RENPY_SDK_PATH": "/path/to/renpy-sdk"
         }
       }
     }
   }
   ```

## 🏗️ Strands Framework

**File:** `example_strands.py`

The Strands example shows programmatic VN creation using AWS Bedrock and the Strands agent framework.

### Quick Start

```bash
cd examples
python example_strands.py
```

### How It Works

1. **Setup**: Connects to AWS Bedrock and Ren'Py MCP server
2. **Generation**: Uses Strands agents to create VNs programmatically
3. **Deployment**: Can deploy to AWS S3 for hosting

### Example Usage

```python
# Create a romance VN
agent("Create a romance visual novel at a coffee shop")

# Create a mystery VN  
agent("Generate a mystery story with detective characters")

# List existing projects
agent("Show me all the visual novels I've created")
```

### Requirements

- AWS Bedrock access
- Configured AWS credentials
- Ren'Py MCP server running

### Configuration

Set environment variables:
```bash
export AWS_ACCESS_KEY_ID="your-key"
export AWS_SECRET_ACCESS_KEY="your-secret"
export AWS_DEFAULT_REGION="us-east-1"
export GEMINI_API_KEY="your-gemini-key"
export RENPY_SDK_PATH="/path/to/renpy-sdk"
```

## 🚀 Getting Started

1. **Choose your framework**:
   - **Claude Agent SDK**: Best for most users, simple setup
   - **Strands**: For AWS/enterprise, programmatic control

2. **Configure MCP connection**:
   ```bash
   cp .mcp.json.example .mcp.json
   # Edit .mcp.json with your paths and API keys
   ```

3. **Run the example**:
   ```bash
   cd examples
   python [framework]_example.py
   ```

4. **Customize**: Modify the examples for your needs

## 📚 Documentation

Each example includes:
- Complete working code
- Step-by-step explanations
- Configuration options
- Troubleshooting tips

## 🤝 Contributing

Have an example for another framework? We'd love to see it! Please submit a pull request.