/** Edit only the `statusLine` key of Claude Code's settings.json, safely. */
import { randomBytes } from "node:crypto";
import {
  lstat,
  mkdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { dirname, join } from "node:path";

export const BACKUP_SUFFIX = ".claude-code-cost-widget-backup";

export function shellQuote(value) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}

/** True when `value` is a status line that runs the script at `script`. */
export function isWidgetStatusLine(value, script) {
  if (!value || typeof value !== "object") return false;
  return value.type === "command" && typeof value.command === "string" &&
    (value.command.endsWith(` ${shellQuote(script)}`) ||
      value.command.endsWith(` ${script}`));
}

export function installStatusLine(directory, command, script) {
  return updateStatusLine(directory, script, command);
}

export function uninstallStatusLine(directory, script) {
  return updateStatusLine(directory, script);
}

async function readIfExists(path) {
  try {
    return await readFile(path, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return undefined;
    throw error;
  }
}

async function updateStatusLine(directory, script, command) {
  const settings = join(directory, "settings.json");
  let target = settings;
  let original;
  let entry;
  try {
    entry = await lstat(settings);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  if (entry) {
    // Resolve the destination before atomic replacement so symlinks survive.
    try {
      target = await realpath(settings);
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(
          "settings.json points to a missing target; repair the symlink first.",
        );
      }
      throw error;
    }
    if (!(await stat(target)).isFile()) {
      throw new Error("settings.json must resolve to a regular file.");
    }
    original = await readFile(target, "utf8");
  }
  const parsed = original === undefined ? {} : JSON.parse(original);
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("settings.json must contain a JSON object.");
  }
  const removing = command === undefined;
  const backupPath = `${target}${BACKUP_SUFFIX}`;
  if (removing) {
    if (!isWidgetStatusLine(parsed.statusLine, script)) {
      return { changed: false, settings };
    }
    let previous = {};
    const text = await readIfExists(backupPath);
    if (text !== undefined) {
      previous = JSON.parse(text);
      if (
        previous === null || typeof previous !== "object" ||
        Array.isArray(previous)
      ) {
        throw new Error("Settings backup must contain a JSON object.");
      }
    }
    if (
      Object.hasOwn(previous, "statusLine") &&
      !isWidgetStatusLine(previous.statusLine, script)
    ) {
      parsed.statusLine = previous.statusLine;
    } else {
      delete parsed.statusLine;
    }
  } else {
    if (
      parsed.statusLine?.type === "command" &&
      parsed.statusLine?.command === command
    ) {
      return { changed: false, settings };
    }
    parsed.statusLine = { type: "command", command };
  }
  await mkdir(directory, { recursive: true });
  const backup = removing || original === undefined ? undefined : backupPath;
  if (backup) {
    try {
      await writeFile(backup, original, { flag: "wx", mode: 0o600 });
    } catch (error) {
      // Keep the first pre-install settings across repeat installations.
      if (error.code !== "EEXIST") throw error;
    }
  }
  const temporary = join(
    dirname(target),
    `.claude-code-cost-widget-${randomBytes(6).toString("hex")}`,
  );
  try {
    await writeFile(temporary, JSON.stringify(parsed, null, 2) + "\n", {
      flag: "wx",
    });
    // Refuse to overwrite settings changed while this installer was running.
    const current = await readIfExists(settings);
    if (
      current !== original ||
      (entry && await realpath(settings) !== target)
    ) {
      throw new Error("Settings changed during update; run again.");
    }
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
  const saved = JSON.parse(await readFile(settings, "utf8"));
  if (JSON.stringify(saved.statusLine) !== JSON.stringify(parsed.statusLine)) {
    throw new Error("Settings verification failed.");
  }
  return { changed: true, settings, backup };
}
