## Project Overview

This is a Claude Code plugin marketplace repository. It serves as a collection of custom plugins that extend Claude Code with slash commands, agents, hooks, Skills, and MCP servers.

## Repository Structure

- `.claude-plugin/marketplace.json` - Marketplace manifest defining available plugins
- `.claude/skills/` - Standalone Skills (not part of a plugin)

## Plugin Development

### References

- https://code.claude.com/docs/en/plugins.md
- https://code.claude.com/docs/en/plugin-marketplaces.md
- https://code.claude.com/docs/en/plugins-reference.md

If the plugin in question involves Hooks or Slash Commands, you must read the respective documents as well:

- https://code.claude.com/docs/en/hooks.md
- https://code.claude.com/docs/en/slash-commands.md

### Testing Plugins Locally

Whenever you develop a plugin, you MUST test it end-to-end.

```bash
bun scripts/test-plugin.ts ./path-to-plugin -p "prompt..."
```

You MUST iterate until you are absolutely sure the plugin works corectly.

### Plugin Structure

Each plugin requires:
1. `.claude-plugin/plugin.json` - Manifest file (only this goes in `.claude-plugin/`)
2. At the plugin root (NOT inside `.claude-plugin/`):
   - `commands/` - Slash command Markdown files
   - `agents/` - Agent definition Markdown files
   - `skills/` - Agent Skills with `SKILL.md` files
   - `hooks/hooks.json` - Event handlers
   - `.mcp.json` - MCP server configurations
   - `.lsp.json` - LSP server configurations
