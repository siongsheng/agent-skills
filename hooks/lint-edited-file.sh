#!/usr/bin/env bash
# Lint the single file Claude just edited, and fail loudly if it has ERRORS.
#
# Why this exists. On 2026-08-29 a CI job failed on four eslint errors that had been
# reported as clean, because the verification command was piped through `tail -1`: on a
# passing run that shows the summary line, on a failing run it shows the "potentially
# fixable with --fix" hint and the summary scrolls past. A filtered gate can be misread.
# CI hid the same output a second way — its report goes to a file, so its log showed
# nothing either. This surfaces the errors at the moment the edit is made instead.
#
# Deliberately narrow:
#   - only js/jsx/ts/tsx/mjs/cjs
#   - only when the file's own repo has eslint installed (no-op everywhere else)
#   - one file, not the tree, so it stays fast
#   - ERRORS only; warnings do not block, matching what CI enforces
set -uo pipefail

# Python, not jq: jq is often not installed, and a hook that silently no-ops
# because its parser is missing is the same failure this hook exists to prevent. Python 3
# is a hard dependency of the environment. If it is ever absent, say so loudly rather than
# passing silently.
if ! command -v python3 >/dev/null 2>&1; then
  echo "lint-edited-file hook: python3 not found, cannot read hook input" >&2
  exit 0
fi
file=$(python3 -c 'import json,sys
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
ti = d.get("tool_input") or {}
tr = d.get("tool_response") or {}
print(ti.get("file_path") or tr.get("filePath") or "")' 2>/dev/null)
[ -n "$file" ] || exit 0
[ -f "$file" ] || exit 0

case "$file" in
  *.js | *.jsx | *.ts | *.tsx | *.mjs | *.cjs) ;;
  *) exit 0 ;;
esac

# Walk up for the nearest eslint. A repo without one is not a repo this should police.
dir=$(cd "$(dirname "$file")" 2>/dev/null && pwd) || exit 0
eslint=""
while [ "$dir" != "/" ] && [ -n "$dir" ]; do
  if [ -x "$dir/node_modules/.bin/eslint" ]; then
    eslint="$dir/node_modules/.bin/eslint"
    root="$dir"
    break
  fi
  dir=$(dirname "$dir")
done
[ -n "$eslint" ] || exit 0

out=$(cd "$root" && timeout 60 "$eslint" "$file" 2>&1)
status=$?

# 0 = clean or warnings only. 1 = errors. Anything else is eslint itself failing
# (bad config, timeout), which is not the edit's fault and must not block the turn.
[ "$status" -eq 1 ] || exit 0

{
  echo "eslint found ERRORS in the file just edited:"
  echo "$out" | grep -vE '^\s*$' | head -30
  echo
  echo "Fix before reporting this work as clean. Verify with the EXIT CODE, not a filtered line:"
  echo "  npm run eslint --silent > /dev/null 2>&1; echo \$?"
} >&2
exit 2
