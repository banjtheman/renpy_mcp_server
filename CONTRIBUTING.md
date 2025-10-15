# Contributing to Ren'Py MCP Server

Thank you for your interest in contributing! This is an experimental project exploring AI-powered game development.

## 🚀 Quick Start

1. Fork the repository
2. Clone your fork
3. Create a branch for your feature: `git checkout -b feature/amazing-feature`
4. Make your changes
5. Test your changes
6. Commit: `git commit -m "Add amazing feature"`
7. Push: `git push origin feature/amazing-feature`
8. Open a Pull Request

## 📋 Development Setup

### Prerequisites

- Python 3.10 or 3.11
- uv package manager
- Ren'Py SDK with web support
- Gemini API key (for testing)

### Install Development Dependencies

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/renpy_mcp_server.git
cd renpy_mcp_server

# Install with uv
uv sync

# Set up environment variables
export GEMINI_API_KEY="your-key"
export RENPY_SDK_PATH="/path/to/renpy-sdk"
```

### Run Tests

```bash
# Run the server
uv run renpy-mcp-server

# Test with an MCP client (Claude Desktop, etc.)
```

## 🎯 Areas for Contribution

### High Priority

- **More Templates** - Add new project templates in `src/renpy_mcp_server/templates/`
- **Better Error Handling** - Improve error messages and recovery
- **Image Generation Improvements** - Better prompts, style options
- **Documentation** - Improve guides, add examples
- **Testing** - Add automated tests

### Feature Ideas

- Support for more Ren'Py features (save/load, preferences, etc.)
- Additional image generation models
- Custom character creation workflows
- Asset library/reuse system
- Multi-language support

### Bug Fixes

Check the [Issues](https://github.com/banjtheman/renpy_mcp_server/issues) page for bugs to fix.

## 📝 Code Style

- Follow PEP 8 for Python code
- Use type hints where possible
- Add docstrings to public functions
- Keep functions focused and small
- Use descriptive variable names

## 🧪 Testing Guidelines

When adding features:

1. Test manually with different prompts
2. Verify web builds work
3. Check character positioning and emotions
4. Test error cases (missing files, API failures)
5. Verify documentation is updated

## 📚 Documentation

When adding features, update:

- `README.md` - If adding user-facing features
- `docs/` - For detailed guides
- Docstrings - For code documentation
- `CHANGELOG.md` - List your changes

## 🐛 Reporting Bugs

When reporting bugs, include:

1. **Description** - What went wrong?
2. **Steps to Reproduce** - How to trigger the bug?
3. **Expected Behavior** - What should happen?
4. **Actual Behavior** - What actually happened?
5. **Environment** - OS, Python version, dependencies
6. **Logs** - Error messages, stack traces

## 💡 Suggesting Features

Feature requests are welcome! Please include:

1. **Use Case** - What problem does this solve?
2. **Proposed Solution** - How should it work?
3. **Alternatives** - Other ways to solve it?
4. **Examples** - Show how it would be used

## 🔄 Pull Request Process

1. **Update Documentation** - Add/update relevant docs
2. **Follow Code Style** - Keep it consistent
3. **Test Your Changes** - Ensure everything works
4. **Describe Changes** - Explain what and why
5. **Link Issues** - Reference related issues

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Documentation update
- [ ] Performance improvement

## Testing
How was this tested?

## Related Issues
Fixes #123
```

## 📖 Architecture Overview

Key components:

- **server.py** - MCP tool definitions
- **image_service.py** - Gemini integration
- **build_manager.py** - Ren'Py builds
- **preview_manager.py** - Web server
- **background_remover.py** - Sprite transparency

## 🙏 Code of Conduct

- Be respectful and inclusive
- Welcome newcomers
- Provide constructive feedback
- Focus on the code, not the person
- Have fun and learn!

## 📄 License

By contributing, you agree that your contributions will be licensed under the MIT License.

## 🤝 Questions?

- Open an issue
- Start a discussion
- Check existing documentation

---

**Thank you for contributing to Ren'Py MCP Server!** 🎮✨

