# ci-watcher-channel

GitHub CI failure watcher that pushes notifications into your Claude Code session. When a CI check fails on one of your open PRs, you get an alert with the failure logs — right inside Claude, ready to diagnose and fix.

## Prerequisites

- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- [Bun](https://bun.sh/) runtime

## Install

```bash
/plugin marketplace add swen128/claude-plugins
/plugin install ci-watcher-channel@harness
```

## Usage

Launch Claude Code with the channel enabled:

```bash
claude --dangerously-load-development-channels plugin:ci-watcher-channel@harness
```

When a CI failure is detected, Claude will automatically receive the notification and can help you investigate.

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `CI_POLL_INTERVAL_MS` | `60000` | Polling interval in milliseconds |

## How it works

An MCP channel server polls `gh pr checks` for your open PRs every 60 seconds. When a new failure is detected, it sends a channel notification containing:

- PR number, title, branch, and URL
- Failed check names with links
- Tail of the failure logs (last 3000 chars, ANSI stripped)

Failures are deduplicated per session — you only get notified once per check per PR.

## Local development

```bash
claude --plugin-dir ./ci-watcher-channel --dangerously-load-development-channels plugin:ci-watcher-channel@inline
```
