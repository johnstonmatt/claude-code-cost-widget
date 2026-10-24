import { test } from "node:test";
import { deepStrictEqual as equal, rejects } from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { access, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { shellQuote } from "../src/settings.js";
import {
  claudeConfigDirectory,
  disable,
  enable,
  scriptDirectory,
  scriptPath,
} from "../src/widget.js";

const CLI = fileURLToPath(new URL("../bin/cli.js", import.meta.url));

async function withDir(run) {
  const dir = await mkdtemp(join(tmpdir(), "cost widget's "));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const exists = (path) => access(path).then(() => true, () => false);

test("enable installs a runnable copy outside the package and disable removes it", () =>
  withDir(async (dir) => {
    await writeFile(
      join(dir, "settings.json"),
      '{"statusLine":{"type":"command","command":"previous"}}',
    );
    const result = await enable(dir);
    equal(result.changed, true);
    const settings = JSON.parse(await readFile(result.settings, "utf8"));
    equal(settings.statusLine, {
      type: "command",
      command: `${shellQuote(process.execPath)} ${shellQuote(scriptPath(dir))}`,
    });
    // Run the configured command the way Claude Code does: through a shell.
    const run = spawnSync("sh", ["-c", settings.statusLine.command], {
      input: '{"cost":{"total_cost_usd":0.5}}',
      encoding: "utf8",
    });
    equal(
      run.stdout.trim(),
      "Claude session estimate $0.50000 | latest response unavailable",
    );
    equal(spawnSync("sh", ["-c", settings.statusLine.command], {
      input: "not json",
      encoding: "utf8",
    }).stdout.trim(), "Claude usage unavailable (invalid JSON)");
    equal((await enable(dir)).changed, false);

    equal((await disable(dir)).changed, true);
    equal(JSON.parse(await readFile(result.settings, "utf8")).statusLine, {
      type: "command",
      command: "previous",
    });
    equal(await exists(scriptDirectory(dir)), false);
    equal((await disable(dir)).changed, false);
  }));

test("enable rewrites the command after a Node path change; disable still matches", () =>
  withDir(async (dir) => {
    await enable(dir);
    const moved = await enable(dir, { node: process.execPath });
    equal(moved.changed, false);
    // Simulate an install made with an older Node binary path.
    const settings = join(dir, "settings.json");
    const value = JSON.parse(await readFile(settings, "utf8"));
    value.statusLine.command = `'/old/node' ${shellQuote(scriptPath(dir))}`;
    await writeFile(settings, JSON.stringify(value));
    equal((await enable(dir)).changed, true);
    value.statusLine.command = `'/old/node' ${shellQuote(scriptPath(dir))}`;
    await writeFile(settings, JSON.stringify(value));
    equal((await disable(dir)).changed, true);
    equal(JSON.parse(await readFile(settings, "utf8")), {});
  }));

test("a failed smoke test leaves settings unchanged", () =>
  withDir(async (dir) => {
    const original = '{"theme":"dark"}';
    await writeFile(join(dir, "settings.json"), original);
    await rejects(() => enable(dir, { node: "/bin/false" }), /smoke test/);
    equal(await readFile(join(dir, "settings.json"), "utf8"), original);
  }));

test("disable leaves a replacement status line alone and removes unused scripts", () =>
  withDir(async (dir) => {
    await enable(dir);
    const settings = join(dir, "settings.json");
    const replacement =
      '{"statusLine":{"type":"command","command":"replacement"}}';
    await writeFile(settings, replacement);
    await writeFile(join(scriptDirectory(dir), "user-notes.txt"), "keep");
    equal((await disable(dir)).changed, false);
    equal(await readFile(settings, "utf8"), replacement);
    equal(await exists(scriptPath(dir)), false);
    // Unrecognized files keep the directory in place.
    equal(await exists(join(scriptDirectory(dir), "user-notes.txt")), true);
  }));

test("claudeConfigDirectory honors CLAUDE_CONFIG_DIR and requires absolute paths", () => {
  equal(claudeConfigDirectory({ HOME: "/home/a" }), "/home/a/.claude");
  equal(
    claudeConfigDirectory({ HOME: "/home/a", CLAUDE_CONFIG_DIR: "/c" }),
    "/c",
  );
  for (const env of [{}, { CLAUDE_CONFIG_DIR: "relative" }]) {
    let threw = false;
    try {
      claudeConfigDirectory(env);
    } catch {
      threw = true;
    }
    equal(threw, true);
  }
});

test("CLI enables and disables against CLAUDE_CONFIG_DIR and rejects bad usage", () =>
  withDir(async (dir) => {
    const env = { ...process.env, CLAUDE_CONFIG_DIR: dir };
    const cli = (...args) =>
      spawnSync(process.execPath, [CLI, ...args], { env, encoding: "utf8" });
    const on = cli("enable");
    equal(on.status, 0, on.stderr);
    equal(/^Enabled cost widget/.test(on.stdout), true);
    equal(/^Already enabled/.test(cli("enable").stdout), true);
    const off = cli("disable");
    equal(off.status, 0, off.stderr);
    equal(/^Disabled cost widget/.test(off.stdout), true);
    equal(JSON.parse(await readFile(join(dir, "settings.json"), "utf8")), {});
    for (const args of [[], ["toggle"], ["enable", "extra"]]) {
      const bad = cli(...args);
      equal(bad.status, 1);
      equal(/Usage: claude-code-cost-widget <enable\|disable>/.test(bad.stderr), true);
    }
    equal(cli("--help").status, 0);
  }));
