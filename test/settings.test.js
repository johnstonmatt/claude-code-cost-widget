import { test } from "node:test";
import { deepStrictEqual as equal, rejects } from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  realpath,
  rm,
  stat,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  BACKUP_SUFFIX,
  installStatusLine,
  shellQuote,
  uninstallStatusLine,
} from "../src/settings.js";

const SCRIPT = "/opt/widget/statusline.mjs";
const COMMAND = `node ${shellQuote(SCRIPT)}`;

async function withDir(run) {
  const dir = await mkdtemp(join(tmpdir(), "cost-widget-"));
  try {
    await run(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));

test("install preserves settings, backs up originals and is idempotent", () =>
  withDir(async (dir) => {
    const original =
      '{"permissions":{"allow":["Read"]},"statusLine":{"type":"command","command":"old"}}\n';
    await writeFile(join(dir, "settings.json"), original);
    const result = await installStatusLine(dir, "new", SCRIPT);
    equal(result.changed, true);
    equal(await readFile(result.backup, "utf8"), original);
    equal(await readJson(result.settings), {
      permissions: { allow: ["Read"] },
      statusLine: { type: "command", command: "new" },
    });
    const before = await stat(result.settings);
    equal((await installStatusLine(dir, "new", SCRIPT)).changed, false);
    equal((await stat(result.settings)).mtimeMs, before.mtimeMs);
    await installStatusLine(dir, "updated", SCRIPT);
    equal(await readFile(result.backup, "utf8"), original);
  }));

test("install creates missing config and refuses malformed settings", () =>
  withDir(async (dir) => {
    const result = await installStatusLine(join(dir, "new"), "command", SCRIPT);
    equal(result.backup, undefined);
    equal(result.changed, true);
    for (const invalid of ["{broken", "null", "[]", '"text"']) {
      await writeFile(join(dir, "settings.json"), invalid);
      await rejects(() => installStatusLine(dir, "command", SCRIPT));
      equal(await readFile(join(dir, "settings.json"), "utf8"), invalid);
    }
    await rm(join(dir, "settings.json"));
    await symlink("missing.json", join(dir, "settings.json"));
    await rejects(
      () => installStatusLine(dir, "command", SCRIPT),
      /missing target/,
    );
    equal(await readlink(join(dir, "settings.json")), "missing.json");
  }));

test("shellQuote quotes shell metacharacters and spaces literally", () => {
  equal(shellQuote("/a b/it's/$HOME`cmd`"), "'/a b/it'\\''s/$HOME`cmd`'");
});

test("install follows chained relative symlinks and preserves the links", () =>
  withDir(async (dir) => {
    await mkdir(join(dir, "dotfiles"));
    const target = join(dir, "dotfiles", "claude.json");
    const original =
      '{"theme":"dark","statusLine":{"type":"command","command":"old"}}\n';
    await writeFile(target, original);
    await symlink("dotfiles/claude.json", join(dir, "intermediate.json"));
    await symlink("intermediate.json", join(dir, "settings.json"));
    const result = await installStatusLine(dir, "new", SCRIPT);
    equal(result.changed, true);
    equal(await readlink(join(dir, "settings.json")), "intermediate.json");
    equal(
      await readlink(join(dir, "intermediate.json")),
      "dotfiles/claude.json",
    );
    equal(
      await realpath(result.backup),
      await realpath(`${target}${BACKUP_SUFFIX}`),
    );
    equal(await readFile(result.backup, "utf8"), original);
    equal(await readJson(target), {
      theme: "dark",
      statusLine: { type: "command", command: "new" },
    });
    equal((await installStatusLine(dir, "new", SCRIPT)).changed, false);
  }));

test("uninstall restores only the previous status line through a symlink", () =>
  withDir(async (dir) => {
    const target = join(dir, "target.json");
    await writeFile(
      target,
      JSON.stringify({
        theme: "old",
        statusLine: { type: "command", command: "previous" },
      }),
    );
    await symlink("target.json", join(dir, "settings.json"));
    await installStatusLine(dir, COMMAND, SCRIPT);
    const settings = await readJson(join(dir, "settings.json"));
    settings.theme = "new";
    await writeFile(target, JSON.stringify(settings));
    equal((await uninstallStatusLine(dir, SCRIPT)).changed, true);
    equal(await readlink(join(dir, "settings.json")), "target.json");
    equal(await readJson(target), {
      theme: "new",
      statusLine: { type: "command", command: "previous" },
    });
    equal((await uninstallStatusLine(dir, SCRIPT)).changed, false);
  }));

test("uninstall handles absent settings, invalid backups and replacements", () =>
  withDir(async (dir) => {
    const settings = join(dir, "settings.json");
    equal((await uninstallStatusLine(dir, SCRIPT)).changed, false);
    await installStatusLine(dir, COMMAND, SCRIPT);
    equal((await uninstallStatusLine(dir, SCRIPT)).changed, true);
    equal(await readJson(settings), {});
    await installStatusLine(dir, COMMAND, SCRIPT);
    await writeFile(`${settings}${BACKUP_SUFFIX}`, "broken");
    const before = await readFile(settings, "utf8");
    await rejects(() => uninstallStatusLine(dir, SCRIPT));
    equal(await readFile(settings, "utf8"), before);
    await writeFile(
      settings,
      '{"statusLine":{"type":"command","command":"replacement"}}',
    );
    equal((await uninstallStatusLine(dir, SCRIPT)).changed, false);
  }));
