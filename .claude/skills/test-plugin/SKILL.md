---
name: test-plugin
description: End-to-end test a Claude Code plugin by launching an interactive Claude session in a tmux pane with the plugin loaded, sending prompts, and verifying behavior.
user-invocable: true
---

# Test Plugin via tmux

Launch an interactive Claude Code session in a tmux split pane with a plugin loaded, send prompts to it, and verify the plugin works correctly.

## Procedure

### Step 1: Resolve plugin info

Read the plugin's `.claude-plugin/plugin.json` to get the plugin name. If the plugin has `.mcp.json`, check if any server declares `claude/channel` capability by reading the source.

### Step 2: Build the launch command

Base command:
```
claude --debug --plugin-dir <absolute-path-to-plugin>
```

If the plugin has a channel server, append:
```
--dangerously-load-development-channels plugin:<plugin-name>@inline
```

### Step 3: Launch in a tmux pane

```bash
tmux split-window -h '<launch-command>'
```

Then find the new pane index:
```bash
tmux list-panes -F '#{pane_index} #{pane_current_command}'
```

### Step 4: Handle confirmation prompts

The `--dangerously-load-development-channels` flag shows a confirmation dialog. Accept it:
```bash
tmux send-keys -t :.<pane> Enter
```

Wait for Claude to fully start (check for the welcome banner):
```bash
sleep 10 && tmux capture-pane -t :.<pane> -p
```

### Step 5: Send test prompt

```bash
tmux send-keys -t :.<pane> "<prompt>" Enter
```

If no prompt was provided, use a default that asks Claude to list connected MCP servers and their capabilities.

### Step 6: Wait and capture result

Poll the pane output periodically:
```bash
sleep <interval> && tmux capture-pane -t :.<pane> -p -S -100
```

Look for the response to complete (the input prompt `❯` reappears at the bottom).

### Step 7: Check debug log

Find the debug log path from the pane output (it shows "Logging to: ..."). Grep for errors:
```bash
grep -i "ERROR\|WARN\|channel\|<plugin-name>" <debug-log-path>
```

### Step 8: Report results

Summarize:
- Whether the plugin loaded successfully
- Whether MCP servers connected
- Whether channel notifications were received (if applicable)
- Any errors from the debug log
- The Claude session's response

### Step 9: Clean up

Kill the test pane:
```bash
tmux kill-pane -t :.<pane>
```

## Important Notes

- Always use `tmux capture-pane -t :.<pane> -p` to read output, not manual inspection
- For channel plugins loaded via `--plugin-dir`, the channel identifier is `plugin:<name>@inline`
- The debug log path is shown in the pane output after startup
- If `tmux split-window` silently fails (pane count doesn't increase), the command errored — add `; sleep 30` to keep the pane alive and see the error
