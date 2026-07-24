#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import type { Node } from "@vscode/tree-sitter-wasm";

interface HookInput {
  tool_name?: string;
  tool_input?: {
    file_path?: string;
    filePath?: string;
    content?: string;
    old_string?: string;
    new_string?: string;
    edits?: Array<{ old_string?: string; new_string?: string }>;
  };
}

interface DetectedComment {
  line: number;
  text: string;
}

const PLUGIN_ROOT = join(import.meta.dir, "..");

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  ".js": "javascript",
  ".mjs": "javascript",
  ".cjs": "javascript",
  ".jsx": "javascript",
  ".ts": "typescript",
  ".mts": "typescript",
  ".cts": "typescript",
  ".tsx": "tsx",
  ".py": "python",
  ".pyi": "python",
  ".go": "go",
  ".rs": "rust",
  ".java": "java",
  ".c": "cpp",
  ".h": "cpp",
  ".cpp": "cpp",
  ".cc": "cpp",
  ".cxx": "cpp",
  ".hpp": "cpp",
  ".hh": "cpp",
  ".cs": "c-sharp",
  ".rb": "ruby",
  ".php": "php",
  ".sh": "bash",
  ".bash": "bash",
  ".zsh": "bash",
  ".ps1": "powershell",
  ".css": "css",
};

const COMMENT_NODE_TYPES = new Set([
  "comment",
  "line_comment",
  "block_comment",
  "doc_comment",
]);

const DIRECTIVE_PATTERNS: RegExp[] = [
  /^#!/,
  /^\/\/\/?\s*<reference\s/,
  /^\/[/*]\s*@ts-(ignore|expect-error|nocheck|check)\b/,
  /^\/[/*]\s*eslint-(disable|enable)/,
  /^\/[/*]\s*(prettier-ignore|biome-ignore)\b/,
  /^\/[/*]\s*(istanbul|c8|v8)\s+ignore\b/,
  /^\/\/#\s*source(Mapping)?URL=/,
  /^\/\/go:/,
  /^\/\/\s*nolint\b/,
  /^\/\/\s*\+build\b/,
  /^\/\/\s*lint:ignore\b/,
  /^#\s*noqa\b/,
  /^#\s*type:\s/,
  /^#\s*(mypy|pylint|ruff|isort|fmt|pyright|coverage|pragma):/,
  /^#\s*frozen_string_literal:/,
  /^#\s*rubocop:(disable|enable)/,
  /^#\s*shellcheck\s/,
  /^\/[/*]\s*@(license|preserve|jsx|jsxImportSource|jsxRuntime)\b/,
];

function isDirective(text: string): boolean {
  const trimmed = text.trim();
  return DIRECTIVE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function collectCommentNodes(root: Node): Node[] {
  const found: Node[] = [];
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (COMMENT_NODE_TYPES.has(node.type)) {
      found.push(node);
      continue;
    }
    for (let i = node.childCount - 1; i >= 0; i--) {
      const child = node.child(i);
      if (child) stack.push(child);
    }
  }
  return found;
}

function collectPythonDocstrings(root: Node): Node[] {
  const found: Node[] = [];
  const stack: Node[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    const body =
      node.type === "module"
        ? node
        : node.type === "function_definition" || node.type === "class_definition"
          ? node.childForFieldName("body")
          : null;
    if (body) {
      const first = body.namedChildren.find((c) => c && c.type !== "comment");
      const string = first?.type === "expression_statement" ? first.namedChild(0) : null;
      if (string?.type === "string") found.push(string);
    }
    for (let i = node.namedChildCount - 1; i >= 0; i--) {
      const child = node.namedChild(i);
      if (child) stack.push(child);
    }
  }
  return found;
}

async function loadParser(languageName: string) {
  const wasmDir = join(PLUGIN_ROOT, "node_modules", "@vscode", "tree-sitter-wasm", "wasm");
  if (!existsSync(wasmDir)) {
    const install = Bun.spawnSync(["bun", "install", "--silent"], { cwd: PLUGIN_ROOT });
    if (!install.success || !existsSync(wasmDir)) return null;
  }

  const { Parser, Language } = (await import(
    join(wasmDir, "tree-sitter.js")
  )) as typeof import("@vscode/tree-sitter-wasm");

  await Parser.init({ locateFile: () => join(wasmDir, "tree-sitter.wasm") });
  const language = await Language.load(join(wasmDir, `tree-sitter-${languageName}.wasm`));
  const parser = new Parser();
  parser.setLanguage(language);
  return parser;
}

async function detectComments(
  filePath: string,
  source: string
): Promise<DetectedComment[]> {
  const languageName = LANGUAGE_BY_EXTENSION[extname(filePath).toLowerCase()];
  if (!languageName) return [];

  const parser = await loadParser(languageName);
  const tree = parser?.parse(source);
  if (!tree) return [];

  const nodes = collectCommentNodes(tree.rootNode);
  if (languageName === "python") {
    nodes.push(...collectPythonDocstrings(tree.rootNode));
  }

  return nodes
    .filter((node) => !isDirective(node.text))
    .map((node) => ({ line: node.startPosition.row + 1, text: node.text }))
    .sort((a, b) => a.line - b.line);
}

function normalize(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function filterNewlyAdded(
  comments: DetectedComment[],
  input: NonNullable<HookInput["tool_input"]>
): DetectedComment[] {
  const edits = input.edits ?? (input.new_string !== undefined ? [input] : null);
  if (!edits) return comments;

  const added = normalize(edits.map((e) => e.new_string ?? "").join("\n"));
  const removed = normalize(edits.map((e) => e.old_string ?? "").join("\n"));

  return comments.filter((c) => {
    const text = normalize(c.text);
    return added.includes(text) && !removed.includes(text);
  });
}

function buildMessage(filePath: string, comments: DetectedComment[]): string {
  const listing = comments
    .map((c) => {
      const text = c.text.length > 500 ? c.text.slice(0, 500) + "…" : c.text;
      return `  <comment line-number="${c.line}">${text}</comment>`;
    })
    .join("\n");

  return `Never write code comments. You need comments ONLY when your code sucks. Instead of patching the garbage, address the root cause of why your code is so unreadable in the first place.

- Comment must not repeat anything inferrable from surrounding codes.
- Comment must not contain any temporal context which future readers won't understand.
- Comment must not be used for preventing regressions. They should be enforced by static checks or tests.
- "TODO" comment is allowed only when it has a permalink to a ticket clearly describing when to remove the code.
- "Existing pattern" won't justify adding new ones.

Remove comments BY DEFAULT.
If you ABSOLUTELY need to add/update any comment, you MUST write report explaining ALL the incidents and reasons following the \`/artifact-design\` skill, after the implementation has been finished.

Detected comments/docstrings:
<comments file="${filePath}">
${listing}
</comments>`;
}

function isInTempDir(filePath: string): boolean {
  return /^\/(private\/)?tmp\//.test(filePath) || filePath.startsWith(tmpdir());
}

function isGitIgnored(filePath: string): boolean {
  try {
    const result = Bun.spawnSync(["git", "check-ignore", "-q", "--", filePath], {
      cwd: dirname(filePath),
    });
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

function shouldCheck(filePath: string): boolean {
  return existsSync(filePath) && !isInTempDir(filePath) && !isGitIgnored(filePath);
}

async function main(): Promise<void> {
  const raw = await Bun.stdin.text();
  let input: HookInput;
  try {
    input = JSON.parse(raw);
  } catch {
    return;
  }

  const toolInput = input.tool_input ?? {};
  const filePath = toolInput.file_path ?? toolInput.filePath;
  if (!filePath || !shouldCheck(filePath)) return;

  const source = readFileSync(filePath, "utf8");
  const comments = filterNewlyAdded(await detectComments(filePath, source), toolInput);
  if (comments.length === 0) return;

  console.error(buildMessage(filePath, comments));
  process.exit(2);
}

await main();
