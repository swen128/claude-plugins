#!/usr/bin/env bun

import { query } from "@anthropic-ai/claude-agent-sdk";
import { homedir } from "os";
import { join } from "path";
import { readdir, stat } from "fs/promises";

const DEBUG_DIR = join(homedir(), ".claude", "debug");

async function getLatestDebugFile(before: string[]): Promise<string | null> {
  const files = await readdir(DEBUG_DIR).catch(() => []);
  const newFiles = files.filter((f) => !before.includes(f) && f.endsWith(".txt"));
  if (newFiles.length === 0) return null;

  const withStats = await Promise.all(
    newFiles.map(async (f) => ({
      file: f,
      mtime: (await stat(join(DEBUG_DIR, f))).mtime.getTime(),
    }))
  );
  return withStats.sort((a, b) => b.mtime - a.mtime)[0]?.file ?? null;
}

function parseArgs(args: string[]): { plugins: string[]; prompt: string } {
  const pluginDirIndex = args.findIndex((a) => a === "-p");
  if (pluginDirIndex === -1) {
    return { plugins: args, prompt: "" };
  }
  return {
    plugins: args.slice(0, pluginDirIndex),
    prompt: args.slice(pluginDirIndex + 1).join(" "),
  };
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.error("Usage: bun scripts/test-plugin.ts <plugin-dir> -p 'prompt'");
    console.error("Example: bun scripts/test-plugin.ts ./todo-enforcer -p 'Create a todo'");
    process.exit(1);
  }

  const { plugins, prompt } = parseArgs(args);
  const existingFiles = await readdir(DEBUG_DIR).catch(() => []);

  console.log(`Plugins: ${plugins.join(", ")}`);
  console.log(`Prompt: ${prompt}\n`);
  console.log("=".repeat(60));
  console.log("CONVERSATION:");
  console.log("=".repeat(60));

  const conversation = query({
    prompt,
    options: {
      plugins: plugins.map((p) => ({ type: "local" as const, path: p })),
      permissionMode: "bypassPermissions",
      allowDangerouslySkipPermissions: true,
    },
  });

  for await (const message of conversation) {
    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          console.log(`\nAssistant: ${block.text}`);
        } else if (block.type === "tool_use") {
          console.log(`\nTool: ${block.name}`);
          console.log(`Input: ${JSON.stringify(block.input, null, 2)}`);
        }
      }
    } else if (message.type === "user") {
      for (const block of message.message.content) {
        if (block.type === "tool_result") {
          const content = typeof block.content === "string" 
            ? block.content 
            : JSON.stringify(block.content);
          console.log(`Result: ${content.slice(0, 500)}${content.length > 500 ? "..." : ""}`);
        }
      }
    } else if (message.type === "result") {
      console.log(`\n--- Result: ${message.subtype} ---`);
    }
  }

  console.log("\n" + "=".repeat(60));
  const debugFile = await getLatestDebugFile(existingFiles);
  console.log(`Debug log location: ${debugFile ? join(DEBUG_DIR, debugFile) : "Not found"}`);
}

main();
