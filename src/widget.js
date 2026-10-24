/** Enable or disable the widget for one Claude Code configuration directory. */
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, rm, rmdir, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  installStatusLine,
  isWidgetStatusLine,
  shellQuote,
  uninstallStatusLine,
} from "./settings.js";

const FILES = ["format.mjs", "statusline.mjs"];
const SMOKE_INPUT = '{"cost":{"total_cost_usd":0.01234}}';
const SMOKE_OUTPUT =
  "Claude session estimate $0.01234 | latest response unavailable";

export function claudeConfigDirectory(env = process.env) {
  const directory = env.CLAUDE_CONFIG_DIR ||
    (env.HOME ? join(env.HOME, ".claude") : "");
  if (!isAbsolute(directory)) {
    throw new Error("Set HOME or an absolute CLAUDE_CONFIG_DIR.");
  }
  return directory;
}

/** Stable home for the script, so it outlives the npx cache it came from. */
export function scriptDirectory(directory) {
  return join(directory, "claude-code-cost-widget");
}

export function scriptPath(directory) {
  return join(scriptDirectory(directory), "statusline.mjs");
}

async function copyScripts(directory) {
  const destination = scriptDirectory(directory);
  await mkdir(destination, { recursive: true });
  for (const name of FILES) {
    const source = await readFile(new URL(name, import.meta.url), "utf8");
    const path = join(destination, name);
    const existing = await readFile(path, "utf8").catch((error) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (existing === source) continue;
    const temporary = `${path}.${randomBytes(6).toString("hex")}`;
    try {
      await writeFile(temporary, source, { flag: "wx" });
      await rename(temporary, path);
    } finally {
      await rm(temporary, { force: true });
    }
  }
}

async function removeScripts(directory) {
  for (const name of FILES) {
    await rm(join(scriptDirectory(directory), name), { force: true });
  }
  // Leave the directory alone if anything else was put in it.
  await rmdir(scriptDirectory(directory)).catch((error) => {
    if (!["ENOENT", "ENOTEMPTY", "EEXIST"].includes(error.code)) throw error;
  });
}

export async function enable(directory, { node = process.execPath } = {}) {
  await copyScripts(directory);
  const script = scriptPath(directory);
  const smoke = spawnSync(node, [script], {
    input: SMOKE_INPUT,
    encoding: "utf8",
    timeout: 10_000,
  });
  if (smoke.status !== 0 || smoke.stdout.trim() !== SMOKE_OUTPUT) {
    throw new Error("Status-line smoke test failed; settings were not changed.");
  }
  const command = [node, script].map(shellQuote).join(" ");
  return { ...await installStatusLine(directory, command, script), script };
}

export async function disable(directory) {
  const script = scriptPath(directory);
  const result = await uninstallStatusLine(directory, script);
  const settings = JSON.parse(
    await readFile(result.settings, "utf8").catch((error) => {
      if (error.code === "ENOENT") return "{}";
      throw error;
    }),
  );
  if (!isWidgetStatusLine(settings.statusLine, script)) {
    await removeScripts(directory);
  }
  return result;
}
