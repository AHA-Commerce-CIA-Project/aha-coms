#!/bin/bash
# Install the repo-freshness Claude Code hooks into the operator's
# ~/.claude/hooks/ and print the settings.json snippet to merge.
#
# Idempotent: re-running just refreshes the hook scripts. Existing
# ~/.claude/hooks/ files with the same names are overwritten — the
# repo's version is the source of truth.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
HOOKS_SRC="$REPO_ROOT/scripts/claude/hooks"
HOOKS_DST="$HOME/.claude/hooks"

if [ ! -d "$HOOKS_SRC" ]; then
  echo "ERROR: $HOOKS_SRC not found. Run this script from inside a git checkout of the aha-coms repo." >&2
  exit 1
fi

mkdir -p "$HOOKS_DST"

echo "Installing Claude Code repo-freshness hooks into $HOOKS_DST..."
echo

for hook in repo-freshness-on-open repo-freshness-pre-git-op; do
  cp "$HOOKS_SRC/$hook" "$HOOKS_DST/$hook"
  chmod +x "$HOOKS_DST/$hook"
  echo "  ✓ $HOOKS_DST/$hook"
done

cat <<'EOF'

Hook scripts installed.

To activate them, merge this into ~/.claude/settings.json under the
"hooks" key (if you already have hooks configured, just merge the
arrays — don't replace them):

{
  "hooks": {
    "SessionStart": [
      { "matcher": "startup",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/repo-freshness-on-open" }] },
      { "matcher": "resume",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/repo-freshness-on-open" }] },
      { "matcher": "clear",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/repo-freshness-on-open" }] },
      { "matcher": "compact",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/repo-freshness-on-open" }] }
    ],
    "PreToolUse": [
      { "matcher": "Bash",
        "hooks": [{ "type": "command", "command": "~/.claude/hooks/repo-freshness-pre-git-op" }] }
    ]
  }
}

Then restart Claude Code. The hooks fire on the next session.

See scripts/claude/README.md for what the hooks do and how to disable.
EOF
