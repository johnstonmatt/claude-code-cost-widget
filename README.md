# claude-code-cost-widget

Puts Claude Code's session cost estimate and latest-response token usage in its
status line:

```text
Claude session estimate $0.01234 | latest: 15500 in / 1200 out | cached 12.9%
```

```sh
npx claude-code-cost-widget enable
npx claude-code-cost-widget disable
```

Until the package is published to npm, run it from GitHub (needs access to this
private repository):

```sh
npx github:johnstonmatt/claude-code-cost-widget enable
```

Restart Claude Code if the footer doesn't appear on the next refresh. Node 20+
on macOS or Linux; no dependencies.

## What `enable` does

1. Copies the status-line script to `~/.claude/claude-code-cost-widget/` (or
   `$CLAUDE_CONFIG_DIR/claude-code-cost-widget/`). It lives there, not in the
   npx cache, so clearing the cache doesn't break the footer.
2. Smoke-tests the copied script with the current Node binary. If that fails,
   settings are not touched.
3. Sets `statusLine` in `settings.json` to run that script with the absolute
   path of the current Node binary. Every other setting is preserved, and the
   original file is backed up once to `settings.json.claude-code-cost-widget-backup`.

Running `enable` again is safe. If you upgrade or remove the Node version that
was active when you enabled it (for example with nvm or mise), run `enable`
again to point the footer at the new binary.

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
