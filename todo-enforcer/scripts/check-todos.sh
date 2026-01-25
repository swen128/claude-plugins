#!/bin/bash

find_todo_file() {
  local todos_dir="$HOME/.claude/todos"
  
  if [ -n "$CLAUDE_SESSION_ID" ]; then
    find "$todos_dir" -name "${CLAUDE_SESSION_ID}*.json" -type f 2>/dev/null | head -1
  else
    ls -t "$todos_dir"/*.json 2>/dev/null | head -1
  fi
}

count_incomplete_todos() {
  local todo_file="$1"
  jq -r '[.[] | select(.status == "pending" or .status == "in_progress")] | length' "$todo_file" 2>/dev/null
}

find_task_session_dir() {
  local tasks_dir="$HOME/.claude/tasks"
  
  if [ -n "$CLAUDE_SESSION_ID" ]; then
    echo "$tasks_dir/$CLAUDE_SESSION_ID"
  else
    ls -td "$tasks_dir"/*/ 2>/dev/null | head -1
  fi
}

count_incomplete_tasks() {
  local session_dir="$1"
  local count=0
  
  for task_file in "$session_dir"/*.json; do
    if [ -f "$task_file" ]; then
      status=$(jq -r '.status // empty' "$task_file" 2>/dev/null)
      if [ "$status" = "pending" ] || [ "$status" = "in_progress" ]; then
        count=$((count + 1))
      fi
    fi
  done
  
  echo "$count"
}

todo_file=$(find_todo_file)
if [ -n "$todo_file" ] && [ -f "$todo_file" ]; then
  if [ "$(count_incomplete_todos "$todo_file")" -gt 0 ]; then
    echo '{"decision":"block","reason":"TODO is incomplete"}'
    exit 0
  fi
fi

task_session_dir=$(find_task_session_dir)
if [ -d "$task_session_dir" ]; then
  if [ "$(count_incomplete_tasks "$task_session_dir")" -gt 0 ]; then
    echo '{"decision":"block","reason":"Task is incomplete"}'
    exit 0
  fi
fi
