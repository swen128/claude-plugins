#!/bin/bash

TODOS_DIR="$HOME/.claude/todos"

if [ -n "$CLAUDE_SESSION_ID" ]; then
  TODO_FILE=$(find "$TODOS_DIR" -name "${CLAUDE_SESSION_ID}*.json" -type f 2>/dev/null | head -1)
else
  TODO_FILE=$(ls -t "$TODOS_DIR"/*.json 2>/dev/null | head -1)
fi

if [ -z "$TODO_FILE" ] || [ ! -f "$TODO_FILE" ]; then
  exit 0
fi

INCOMPLETE=$(jq -r '[.[] | select(.status == "pending" or .status == "in_progress")] | length' "$TODO_FILE" 2>/dev/null)

if [ "$INCOMPLETE" -gt 0 ]; then
  echo '{"decision":"block","reason":"TODO is incomplete"}'
  exit 0
fi
