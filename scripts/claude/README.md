# Claude Code repo-freshness hooks

Two hooks that keep a developer's Claude Code session in sync with
`origin/main` without manual `git pull` ceremony, and that block
destructive git operations when the branch is in a state where
those operations would do harm.

## What the hooks do

### `repo-freshness-on-open` — `SessionStart`

Fires when Claude Code opens the project (startup, resume, clear,
compact). The flow:

1. Quick `git fetch origin` (8-second timeout — if the network is
   offline, the script falls back to the stale tracking ref rather
   than hanging the session).
2. Compute `behind` / `ahead` / `dirty` against the upstream branch.
3. If everything is synchronized + clean → silent exit (no spam).
4. If the working tree is clean AND the branch is purely behind
   (no diverged ahead commits) → auto-fast-forward via `git pull
   --ff-only`. The session continues on a current local.
5. Anything else (uncommitted work, diverged commits) → report the
   state as session context so Claude can name what's stale and
   surface the decision to the operator.

### `repo-freshness-pre-git-op` — `PreToolUse` on `Bash`

Fires before any Bash command. Inspects the staged command for a
destructive git verb and blocks (exit 2 + stderr message Claude
surfaces) when the branch state would make the operation harmful:

| Command | Block when | Reason |
|---|---|---|
| `git push` | branch is behind origin | would fail with non-fast-forward anyway; pull/rebase first |
| `git rebase` / `git merge` / `git reset --hard` | uncommitted files in the tree | the operation would clobber them; stash or commit first |
| `git commit` | on `main` AND behind origin/main | PR-only policy; branch off `origin/main` first |

No network — uses the cached tracking refs from the SessionStart
fetch. Latency on every Bash call is ~5ms (one `git rev-parse` + one
`git rev-list --count`).

## Install

One-time, from inside a git checkout of `aha-coms`:

```bash
bash scripts/claude/install-hooks.sh
```

The installer copies the two hook scripts to `~/.claude/hooks/`,
sets the executable bit, and prints a `settings.json` snippet to
merge into `~/.claude/settings.json` under the `hooks` key.

If you already have other hooks configured, **merge the arrays
don't replace them**. The Claude Code hook system can chain
multiple hooks per event; merging keeps your existing pre-commit
or session hooks intact.

After merging, restart Claude Code (close + reopen the project).
The hooks fire on the next session.

## Disable

Three ways, depending on scope:

1. **Project-only** — drop a `.claude/settings.local.json` (gitignored)
   with empty `hooks` arrays. Project-level settings.local.json
   overrides user-level settings.json for that project.
2. **User-wide** — delete the relevant entries from
   `~/.claude/settings.json`.
3. **Uninstall** — `rm ~/.claude/hooks/repo-freshness-on-open
   ~/.claude/hooks/repo-freshness-pre-git-op` and remove the
   settings.json entries. The hook scripts can be reinstalled
   anytime by re-running the installer.

## Why the install script instead of project-level `.claude/`

The repo's `.gitignore` excludes `.claude/` entirely on purpose —
this is a **public** repo, and per-user Claude Code state
(sessions, memory files, runtime locks) doesn't belong in shared
version control. The install-script approach keeps `.claude/`
gitignored while letting the hook scripts be reviewed, diffed,
and version-controlled in this repo under `scripts/claude/`.

When a hook script needs updating, the change lands as a normal PR
to `scripts/claude/hooks/...`. Developers re-run `install-hooks.sh`
to pick it up.

## Known limitations

- **Auto-pull is fast-forward only.** Rebase-on-pull isn't attempted
  because that's where conflicts surface, and conflict resolution
  needs judgment, not automation.
- **`git commit` block only fires on `main`.** It doesn't fire on
  other branches because the project's Sequence 0 ruleset only
  protects `main`. If you protect more branches, extend the case
  in `repo-freshness-pre-git-op`.
- **The hooks don't catch every dangerous pattern.** They cover the
  common shapes; they're not a substitute for reading what you're
  about to commit. Treat them as guardrails, not gates.

## See also

- `docs/adr/0012-sequence-0-main-protection.md` — the ruleset the
  `git commit` block enforces structurally.
- `apps/fast/CLAUDE.md` — the fast engineer's contract, including
  the pre-commit hooks (`Detect hardcoded secrets`,
  `code-review-graph detect-changes`, `mr-door-check`) that fire
  in addition to these.
