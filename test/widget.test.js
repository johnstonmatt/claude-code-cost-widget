import { test } from "node:test";
import { deepStrictEqual as equal, match, rejects } from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { shellQuote } from "../src/settings.js";
import {
  claudeConfigDirectory,
  disable,
  enable,
  launcherPath,
  launcherScript,
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
      command: `'/bin/sh' ${shellQuote(launcherPath(dir))}`,
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

test("enable keeps the command stable across Node changes and migrates old installs", () =>
  withDir(async (dir) => {
    const settings = join(dir, "settings.json");
    await enable(dir);
    const command = JSON.parse(await readFile(settings, "utf8")).statusLine;
    equal((await enable(dir)).changed, false);
    // A different Node binary only rewrites the launcher, not settings.json.
    const other = join(dir, "other node");
    await symlink(process.execPath, other);
    equal((await enable(dir, { node: other })).changed, true);
    equal(JSON.parse(await readFile(settings, "utf8")).statusLine, command);
    match(await readFile(launcherPath(dir), "utf8"), /other node/);
    // Installs before the launcher ran statusline.mjs with a pinned Node path.
    const legacy = {
      type: "command",
      command: `'/old/node' ${shellQuote(scriptPath(dir))}`,
    };
    await writeFile(settings, JSON.stringify({ statusLine: legacy }));
    equal((await enable(dir)).changed, true);
    equal(JSON.parse(await readFile(settings, "utf8")).statusLine, command);
    await writeFile(settings, JSON.stringify({ statusLine: legacy }));
    equal((await disable(dir)).changed, true);
    equal(JSON.parse(await readFile(settings, "utf8")), {});
    equal(await exists(scriptDirectory(dir)), false);
  }));

test("the launcher falls back to node on PATH, then explains how to recover", () =>
  withDir(async (dir) => {
    await enable(dir);
    const launcher = join(dir, "launcher.sh");
    await writeFile(launcher, launcherScript("/removed/node", scriptPath(dir)));
    const run = (PATH) =>
      spawnSync("/bin/sh", [launcher], {
        env: { PATH },
        input: '{"cost":{"total_cost_usd":0.5}}',
        encoding: "utf8",
      }).stdout.trim();
    equal(
      run(dirname(process.execPath)),
      "Claude session estimate $0.50000 | latest response unavailable",
    );
    const empty = join(dir, "empty");
    await mkdir(empty);
    equal(
      run(empty),
      "Cost widget: Node.js not found. Run: npx claude-code-cost-widget enable",
    );
  }));

test("a failed smoke test leaves settings unchanged", () =>
  withDir(async (dir) => {
    const original = '{"theme":"dark"}';
    await writeFile(join(dir, "settings.json"), original);
    // An executable "node" that fails, so the launcher can't fall back.
    const broken = join(dir, "broken-node");
    await writeFile(broken, "#!/bin/sh\nexit 1\n", { mode: 0o755 });
    await rejects(() => enable(dir, { node: broken }), /smoke test/);
    equal(await readFile(join(dir, "settings.json"), "utf8"), original);
    // A failed re-enable must not break a working launcher either.
    await enable(dir);
    const launcher = await readFile(launcherPath(dir), "utf8");
    await rejects(() => enable(dir, { node: broken }), /smoke test/);
    equal(await readFile(launcherPath(dir), "utf8"), launcher);
    equal(
      (await readdir(scriptDirectory(dir))).sort(),
      ["format.mjs", "statusline.mjs", "statusline.sh"],
    );
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
    equal(await exists(launcherPath(dir)), false);
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
