#!/bin/bash
set -euo pipefail

VERSION="0.4.1"
REPO="code-yeongyu/go-claude-code-comment-checker"

get_cache_dir() {
  if [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]]; then
    echo "${LOCALAPPDATA:-${APPDATA:-$HOME/AppData/Local}}/comment-checker/bin"
  else
    echo "${XDG_CACHE_HOME:-$HOME/.cache}/comment-checker/bin"
  fi
}

get_platform_info() {
  local os arch ext
  case "$(uname -s)" in
    Darwin) os="darwin" ;;
    Linux) os="linux" ;;
    MINGW*|MSYS*|CYGWIN*) os="windows" ;;
    *) exit 0 ;;
  esac
  case "$(uname -m)" in
    x86_64|amd64) arch="amd64" ;;
    arm64|aarch64) arch="arm64" ;;
    *) exit 0 ;;
  esac
  [[ "$os" == "windows" ]] && ext="zip" || ext="tar.gz"
  echo "$os $arch $ext"
}

download_binary() {
  local cache_dir="$1" binary_path="$2"
  read -r os arch ext <<< "$(get_platform_info)"
  local asset="comment-checker_v${VERSION}_${os}_${arch}.${ext}"
  local url="https://github.com/${REPO}/releases/download/v${VERSION}/${asset}"
  
  mkdir -p "$cache_dir"
  echo "[comment-checker] Downloading..." >&2
  curl -fsSL "$url" -o "$cache_dir/$asset"
  
  if [[ "$ext" == "tar.gz" ]]; then
    tar -xzf "$cache_dir/$asset" -C "$cache_dir"
  else
    unzip -q "$cache_dir/$asset" -d "$cache_dir"
  fi
  rm -f "$cache_dir/$asset"
  chmod +x "$binary_path" 2>/dev/null || true
  echo "[comment-checker] Ready." >&2
}

get_binary() {
  local cache_dir binary_name binary_path
  cache_dir="$(get_cache_dir)"
  [[ "${OSTYPE:-}" == msys* || "${OSTYPE:-}" == cygwin* ]] && binary_name="comment-checker.exe" || binary_name="comment-checker"
  binary_path="$cache_dir/$binary_name"
  [[ ! -x "$binary_path" ]] && download_binary "$cache_dir" "$binary_path"
  [[ -x "$binary_path" ]] && echo "$binary_path"
}

BINARY="$(get_binary)" || exit 0
[[ -z "$BINARY" ]] && exit 0

INPUT=$(cat)
FILE_PATH=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_input.filePath // empty' 2>/dev/null) || exit 0
[[ -z "$FILE_PATH" ]] && exit 0

if [[ -z "$(echo "$INPUT" | jq -r '.tool_input.content // empty' 2>/dev/null)" && -f "$FILE_PATH" ]]; then
  CONTENT=$(cat "$FILE_PATH")
  INPUT=$(echo "$INPUT" | jq --arg c "$CONTENT" '.tool_input.content = $c')
fi

RESULT=$("$BINARY" <<< "$INPUT" 2>&1) && EXIT_CODE=$? || EXIT_CODE=$?
if [[ "$EXIT_CODE" -eq 2 ]]; then
  echo "$RESULT" >&2
  exit 2
fi
exit 0
