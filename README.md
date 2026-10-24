# claude-code-cost-widget

Puts Claude Code's session cost estimate and latest-response token usage in its
status line.

### preview

```text
Claude session estimate $0.01234 | latest: 15500 in / 1200 out | cached 12.9%
```

### usage

```sh
# setup
npx claude-code-cost-widget enable

# teardown
npx claude-code-cost-widget disable
```

Restart Claude Code if the footer doesn't appear on the next refresh. Node 20+
on macOS or Linux; no dependencies.

## What `enable` does

1. Copies the status-line script to `~/.claude/claude-code-cost-widget/` (or
   `$CLAUDE_CONFIG_DIR/claude-code-cost-widget/`). It lives there, not in the
   npx cache, so clearing the cache doesn't break the footer.
2. Writes a small launcher, `statusline.sh`, beside it. The launcher runs the
   script with the Node binary that ran `enable`, and falls back to whichever
   `node` is on `PATH` if that binary is gone.
3. Smoke-tests the launcher the way Claude Code will run it. If that fails,
   neither settings nor an existing launcher are touched.
4. Sets `statusLine` in `settings.json` to `/bin/sh` running the launcher.
   Every other setting is preserved, and the original file is backed up once
   to `settings.json.claude-code-cost-widget-backup`.

Running `enable` again is safe. Upgrading or removing the Node version you
enabled with (for example with nvm or mise) doesn't break the footer while
another `node` is on `PATH`. If none is, the footer says so instead of going
blank; running `enable` again with a working Node fixes it. Installs from
before the launcher existed are migrated by running `enable` again.

`settings.json` symlinks are followed and preserved: the resolved file is
updated and the backup sits beside it. Dangling symlinks, malformed settings,
and settings that change while the command runs all fail without writing.

## What `disable` does

Restores the `statusLine` you had before enabling (or removes it if there was
none) without touching other settings changed since. If the status line has
since been replaced by something else, it's left alone. The copied scripts are
removed; the backup is kept. Running `disable` again is safe.

## What the footer shows

The session figure is **Claude Code's own estimate** (`cost.total_cost_usd` in
the [status-line payload](https://code.claude.com/docs/en/statusline)), not an
independent calculation or an invoice. The token counts describe only the
latest response; cache reads and writes are counted once in the input total.
Missing or invalid fields are shown as unavailable, never as zero. The script
makes no network calls and doesn't read the transcript.

## Development

```sh
npm test
```

## Releasing

Releases are automated with
[release-please](https://github.com/googleapis/release-please). Merge to `main`
with [conventional commit](https://www.conventionalcommits.org/) titles
(squash-merge PRs): `fix:` bumps the patch version and `feat:` the minor (a
breaking change also bumps the minor while the version is below 1.0.0).
release-please keeps a release PR open with the next version and
`CHANGELOG.md`. Merging it tags the release, creates the GitHub release, and
publishes to npm from `.github/workflows/release.yml` using
[trusted publishing](https://docs.npmjs.com/trusted-publishers), so no npm
token is stored.
