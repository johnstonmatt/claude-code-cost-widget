#!/usr/bin/env node
import { claudeConfigDirectory, disable, enable } from "../src/widget.js";

const USAGE = "Usage: claude-code-cost-widget <enable|disable>";

async function main(args) {
  if (args.length === 1 && ["-h", "--help", "help"].includes(args[0])) {
    console.log(USAGE);
    return;
  }
  if (args.length !== 1 || !["enable", "disable"].includes(args[0])) {
    throw new Error(USAGE);
  }
  if (process.platform === "win32") {
    throw new Error("This installer supports macOS and Linux.");
  }
  const directory = claudeConfigDirectory();
  if (args[0] === "enable") {
    const result = await enable(directory);
    console.log(
      `${
        result.changed ? "Enabled" : "Already enabled"
      } cost widget: ${result.settings}`,
    );
    if (result.backup) console.log(`Original settings backup: ${result.backup}`);
    console.log(
      "Verified. Claude Code shows it on the next refresh; restart Claude if needed.",
    );
  } else {
    const result = await disable(directory);
    console.log(
      result.changed
        ? `Disabled cost widget and restored previous status-line settings: ${result.settings}`
        : `Cost widget not enabled; settings unchanged: ${result.settings}`,
    );
  }
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
