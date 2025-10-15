#!/bin/bash

# Ren'Py MCP Server - Automated Setup Script
# This script sets up everything needed to run the Ren'Py MCP Server

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Get Ren'Py SDK version and detect OS
RENPY_VERSION="8.4.1"

# Detect OS and set appropriate download URL
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    RENPY_SDK_URL="https://www.renpy.org/dl/${RENPY_VERSION}/renpy-${RENPY_VERSION}-sdk.dmg"
    RENPY_SDK_FILE="renpy-sdk.dmg"
elif [[ "$OSTYPE" == "linux-gnu"* ]]; then
    # Linux
    RENPY_SDK_URL="https://www.renpy.org/dl/${RENPY_VERSION}/renpy-${RENPY_VERSION}-sdk.tar.bz2"
    RENPY_SDK_FILE="renpy-sdk.tar.bz2"
else
    # Windows or other (default to zip)
    RENPY_SDK_URL="https://www.renpy.org/dl/${RENPY_VERSION}/renpy-${RENPY_VERSION}-sdk.zip"
    RENPY_SDK_FILE="renpy-sdk.zip"
fi

RENPY_SDK_DIR="$(pwd)/renpy-${RENPY_VERSION}-sdk"

print_status "🚀 Ren'Py MCP Server Setup"
print_status "=========================="
echo

# Check system requirements
print_status "Checking system requirements..."

# Check for Python
if ! command_exists python3; then
    print_error "Python 3 is required but not installed."
    print_status "Please install Python 3.8+ and try again."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
print_success "Python $PYTHON_VERSION found"

# Check for uv
if ! command_exists uv; then
    print_warning "uv not found. Installing uv..."
    curl -LsSf https://astral.sh/uv/install.sh | sh
    source $HOME/.cargo/env
    print_success "uv installed"
else
    print_success "uv found"
fi

# Check for Git
if ! command_exists git; then
    print_error "Git is required but not installed."
    print_status "Please install Git and try again."
    exit 1
fi
print_success "Git found"

# Check for unzip (only on non-macOS systems)
if [[ "$OSTYPE" != "darwin"* ]] && ! command_exists unzip; then
    print_warning "unzip not found. It may be needed for extraction."
fi

echo

# Install Python dependencies
print_status "Installing Python dependencies..."
uv sync
print_success "Python dependencies installed"

echo

# Download and setup Ren'Py SDK
print_status "Setting up Ren'Py SDK ${RENPY_VERSION}..."

if [ -d "$RENPY_SDK_DIR" ]; then
    print_warning "Ren'Py SDK directory already exists: $RENPY_SDK_DIR"
    read -p "Do you want to reinstall? (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        print_status "Removing existing SDK..."
        rm -rf "$RENPY_SDK_DIR"
    else
        print_status "Using existing SDK"
    fi
fi

if [ ! -d "$RENPY_SDK_DIR" ]; then
    print_status "Downloading Ren'Py SDK from $RENPY_SDK_URL..."
    
    # Create temp directory
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"
    
    # Download SDK
    if command_exists curl; then
        curl -L "$RENPY_SDK_URL" -o "$RENPY_SDK_FILE"
    elif command_exists wget; then
        wget "$RENPY_SDK_URL" -O "$RENPY_SDK_FILE"
    else
        print_error "Neither curl nor wget found. Please install one of them."
        exit 1
    fi
    
    print_status "Extracting Ren'Py SDK..."
    
    # Extract based on file type
    if [[ "$RENPY_SDK_FILE" == *.dmg ]]; then
        # macOS DMG handling
        print_status "Mounting DMG..."
        hdiutil attach "$RENPY_SDK_FILE" -mountpoint /Volumes/RenpySDK -nobrowse -quiet
        
        print_status "Copying SDK from DMG..."
        cp -R "/Volumes/RenpySDK/renpy-${RENPY_VERSION}-sdk" "$RENPY_SDK_DIR"
        
        print_status "Unmounting DMG..."
        hdiutil detach /Volumes/RenpySDK -quiet
        
    elif [[ "$RENPY_SDK_FILE" == *.tar.bz2 ]]; then
        # Linux tar.bz2 handling
        tar -xjf "$RENPY_SDK_FILE"
        EXTRACTED_DIR=$(find . -maxdepth 1 -type d -name "renpy-*-sdk" | head -n 1)
        if [ -n "$EXTRACTED_DIR" ]; then
            mv "$EXTRACTED_DIR" "$RENPY_SDK_DIR"
        fi
        
    elif [[ "$RENPY_SDK_FILE" == *.zip ]]; then
        # Windows/other zip handling
        unzip -q "$RENPY_SDK_FILE"
        EXTRACTED_DIR=$(find . -maxdepth 1 -type d -name "renpy-*-sdk" | head -n 1)
        if [ -n "$EXTRACTED_DIR" ]; then
            mv "$EXTRACTED_DIR" "$RENPY_SDK_DIR"
        fi
    fi
    
    # Verify extraction
    if [ ! -d "$RENPY_SDK_DIR" ]; then
        print_error "Failed to extract Ren'Py SDK"
        exit 1
    fi
    
    # Disable update checks to prevent errors
    print_status "Configuring SDK..."
    if [ -f "$RENPY_SDK_DIR/renpy/update.py" ]; then
        # Create a marker file to disable updates
        touch "$RENPY_SDK_DIR/.no_update"
    fi
    
    # Cleanup
    cd - > /dev/null
    rm -rf "$TEMP_DIR"
    
    print_success "Ren'Py SDK installed to $RENPY_SDK_DIR"
else
    print_success "Ren'Py SDK already installed"
fi

echo

# Install Ren'Py web support
print_status "Installing Ren'Py web support..."

# Check if web support is already installed
if [ -d "$RENPY_SDK_DIR/web" ]; then
    print_success "Ren'Py web support already installed"
else
    print_status "Downloading Ren'Py web module..."
    
    # Create temp directory
    TEMP_DIR=$(mktemp -d)
    cd "$TEMP_DIR"
    
    # Download web module
    WEB_MODULE_URL="https://www.renpy.org/dl/${RENPY_VERSION}/renpy-${RENPY_VERSION}-web.zip"
    if command_exists curl; then
        curl -L "$WEB_MODULE_URL" -o "renpy-web.zip"
    elif command_exists wget; then
        wget "$WEB_MODULE_URL" -O "renpy-web.zip"
    else
        print_error "Neither curl nor wget found."
        exit 1
    fi
    
    print_status "Extracting web module..."
    unzip -q "renpy-web.zip"
    
    # Move web directory to SDK
    if [ -d "web" ]; then
        mv "web" "$RENPY_SDK_DIR/"
        print_success "Ren'Py web support installed successfully"
    else
        print_error "Failed to extract web module"
        exit 1
    fi
    
    # Cleanup
    cd - > /dev/null
    rm -rf "$TEMP_DIR"
fi

echo

# Setup environment variables
print_status "Setting up environment variables..."

# Create .env file if it doesn't exist
if [ ! -f ".env" ]; then
    cat > .env << EOF
# Ren'Py MCP Server Environment Variables
# Copy this file and fill in your values

# Ren'Py SDK Path (automatically set by setup)
export RENPY_SDK_PATH="$RENPY_SDK_DIR"

# Gemini API Key (get from https://aistudio.google.com/app/api-keys)
export GEMINI_API_KEY="your_gemini_api_key_here"

# Optional: Custom workspace directory
# export RENPY_MCP_WORKSPACE="/path/to/your/workspace"
EOF
    print_success "Created .env file with environment variables"
else
    print_success ".env file already exists"
fi

# Update .env with actual SDK path
sed -i.bak "s|export RENPY_SDK_PATH=.*|export RENPY_SDK_PATH=\"$RENPY_SDK_DIR\"|" .env
rm -f .env.bak

echo

# Gemini API Key setup
print_status "Setting up Gemini API Key..."

if [ -z "$GEMINI_API_KEY" ] || [ "$GEMINI_API_KEY" = "your_gemini_api_key_here" ]; then
    print_warning "Gemini API Key not configured."
    echo
    print_status "To get your Gemini API Key:"
    print_status "1. Go to https://aistudio.google.com/app/api-keys"
    print_status "2. Sign in with your Google account"
    print_status "3. Click 'Create API Key'"
    print_status "4. Copy the generated key"
    echo
    read -p "Enter your Gemini API Key (or press Enter to skip): " GEMINI_KEY
    
    if [ ! -z "$GEMINI_KEY" ]; then
        # Update .env file with the key
        if grep -q "GEMINI_API_KEY=" .env; then
            sed -i.bak "s|export GEMINI_API_KEY=.*|export GEMINI_API_KEY=\"$GEMINI_KEY\"|" .env
            rm -f .env.bak
        else
            echo "export GEMINI_API_KEY=\"$GEMINI_KEY\"" >> .env
        fi
        print_success "Gemini API Key configured"
    else
        print_warning "Gemini API Key not set. You'll need to set it manually in .env"
    fi
else
    print_success "Gemini API Key already configured"
fi

echo

# Create MCP configuration
print_status "Setting up MCP configuration..."

if [ ! -f ".mcp.json" ]; then
    cat > .mcp.json << EOF
{
  "mcpServers": {
    "renpy_mcp_server": {
      "command": "uv",
      "args": [
        "--directory",
        "$(pwd)",
        "run",
        "renpy-mcp-server"
      ],
      "env": {
        "GEMINI_API_KEY": "\${GEMINI_API_KEY}",
        "RENPY_SDK_PATH": "\${RENPY_SDK_PATH}"
      }
    }
  }
}
EOF
    print_success "Created .mcp.json configuration"
else
    print_success ".mcp.json already exists"
fi

echo

# Test the setup
print_status "Testing the setup..."

# Save any already-exported GEMINI_API_KEY before sourcing .env
SAVED_GEMINI_KEY="$GEMINI_API_KEY"

# Source environment variables if .env exists
if [ -f ".env" ]; then
    source .env
fi

# If RENPY_SDK_PATH not set, use the one we just installed
if [ -z "$RENPY_SDK_PATH" ]; then
    export RENPY_SDK_PATH="$RENPY_SDK_DIR"
else
    export RENPY_SDK_PATH
fi

# Restore the saved GEMINI_API_KEY if it was set (prefer exported over .env)
if [ ! -z "$SAVED_GEMINI_KEY" ] && [ "$SAVED_GEMINI_KEY" != "your_gemini_api_key_here" ]; then
    export GEMINI_API_KEY="$SAVED_GEMINI_KEY"
    print_status "Using GEMINI_API_KEY from environment (not .env)"
elif [ ! -z "$GEMINI_API_KEY" ] && [ "$GEMINI_API_KEY" != "your_gemini_api_key_here" ]; then
    export GEMINI_API_KEY
fi

# Test Ren'Py SDK
if [ -d "$RENPY_SDK_PATH" ] && ([ -f "$RENPY_SDK_PATH/renpy.py" ] || [ -f "$RENPY_SDK_PATH/renpy.sh" ]); then
    print_success "Ren'Py SDK is accessible at $RENPY_SDK_PATH"
else
    print_error "Ren'Py SDK not found at $RENPY_SDK_PATH"
    exit 1
fi

# Test web support
if [ -d "$RENPY_SDK_PATH/web" ]; then
    print_success "Ren'Py web support is installed"
else
    print_warning "Ren'Py web support not detected"
fi

# Test Gemini API Key (after sourcing .env)
if [ ! -z "$GEMINI_API_KEY" ] && [ "$GEMINI_API_KEY" != "your_gemini_api_key_here" ]; then
    print_success "Gemini API Key is configured: ${GEMINI_API_KEY:0:10}..."
else
    print_warning "Gemini API Key not configured (edit .env file to add it)"
fi

echo

# Final instructions
print_success "🎉 Setup Complete!"
echo
print_status "Next steps:"
print_status "1. If you haven't already, set your Gemini API Key in .env"
print_status "2. Try out the AI agent examples in examples/"
print_status "3. Configure your MCP client (Claude Desktop, Cursor, etc.)"
print_status "4. Start creating visual novels!"
echo
print_status "Quick start - Try an agent example:"
print_status "  cd examples"
print_status "  python claude_agent_example.py     # Claude Agent SDK"
print_status "  python example_strands.py          # Strands framework"
echo
print_status "Or test the components:"
print_status "  python test_nano_banana.py         # Test image generation"
print_status "  cat README.md                      # View documentation"
echo
print_status "For more help:"
print_status "  - README.md (main documentation)"
print_status "  - SETUP.md (detailed setup guide)"
print_status "  - examples/README.md (agent examples)"
echo
print_success "Happy visual novel creating! 🎮✨"
