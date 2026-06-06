#!/usr/bin/env node
// PreToolUse hook: when a tool call touches the compiled effect output under
// node_modules/effect, nudge toward the v4 source checked out in .context/.
// Non-blocking: prints an additionalContext message and exits 0 (only exit 2 blocks).
import { readFileSync } from "node:fs";

let data;
try {
  data = JSON.parse(readFileSync(0, "utf8"));
} catch {
  process.exit(0); // no/garbled stdin — do nothing
}

// The path/pattern/command lives somewhere in tool_input (file_path, path, pattern,
// command, ...). Stringify and substring-match so this works for Read/Grep/Glob/Bash.
if (!JSON.stringify(data.tool_input ?? {}).includes("node_modules/effect")) {
  process.exit(0);
}

const msg =
  "You're touching effect's compiled output under node_modules/effect. Prefer the v4 source at " +
  ".context/effect-smol/packages/effect/src/. Map node_modules/effect/dist/<P>.{js,d.ts} -> " +
  ".context/effect-smol/packages/effect/src/<P>.ts (strip the leading dist/, swap the extension for .ts). " +
  "The source has implementations + JSDoc the dist drops, and it's pinned to the installed 4.0.0-beta.78.";

process.stdout.write(
  JSON.stringify({
    hookSpecificOutput: { hookEventName: "PreToolUse", additionalContext: msg },
  }),
);
process.exit(0);
