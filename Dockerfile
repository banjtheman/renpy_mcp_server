# Dockerfile for Ren'Py MCP Server
# Build: docker build -t renpy-mcp-server .
# Run: docker run -e GEMINI_API_KEY=your-key -e RENPY_SDK_PATH=/renpy-sdk renpy-mcp-server

FROM python:3.11-slim

# Install uv
RUN pip install uv

# Set working directory
WORKDIR /app

# Copy project files
COPY pyproject.toml uv.lock ./
COPY src/ ./src/
COPY README.md ./

# Install dependencies
RUN uv sync --frozen

# Expose MCP port (if needed)
EXPOSE 3000

# Run the server
CMD ["uv", "run", "renpy-mcp-server"]

