# Shared task-file resolver. Sourced by task-anchor.sh, task-state-guard.sh and
# task-state-cleanup.sh so the three cannot drift apart on where the anchor lives.
#
# Reads the hook's stdin payload from $PAYLOAD (the caller slurps it) and sets:
#   SESSION   session id, or empty
#   CWD       the session's working directory
#   AGENT     agent_id, non-empty for subagents
#   STATE     the resolved task-file path
#   STATE_OWNED  "yes" when STATE is a disposable per-session file we created,
#                "no" when it is a repo-local or explicitly-pointed-at file.
#                Cleanup only ever touches an owned file.
#
# Resolution order — sharing is opt-in, never accidental:
#   1. $CLAUDE_TASK_FILE, else $AGENT_TASK_FILE   explicit; two sessions on one task, or a cross-repo task
#   2. <cwd>/.claude/current-task.md only if it ALREADY exists; creating it is the opt-in
#   3. ~/.claude/task-state/<session>.md   the default, per session, never collides

TASK_STATE_DIR="$HOME/.claude/task-state"
TASK_TEMPLATE="${TASK_TEMPLATE:-${CLAUDE_PLUGIN_ROOT:-$(cd "$(dirname "$0")/.." 2>/dev/null && pwd)}/templates/current-task-template.md}"

_field() {
  [ -n "$PAYLOAD" ] || return 0
  command -v python3 >/dev/null 2>&1 || return 0
  printf '%s' "$PAYLOAD" | python3 -c "
import json,sys
try: print(json.load(sys.stdin).get('$1') or '')
except Exception: pass
" 2>/dev/null
}

AGENT=$(_field agent_id)
SESSION=$(_field session_id)
[ -n "$SESSION" ] || SESSION="$CLAUDE_CODE_SESSION_ID"
CWD=$(_field cwd)
[ -n "$CWD" ] || CWD="$PWD"

TASK_FILE_OVERRIDE="${CLAUDE_TASK_FILE:-$AGENT_TASK_FILE}"
if [ -n "$TASK_FILE_OVERRIDE" ]; then
  STATE="$TASK_FILE_OVERRIDE"; STATE_OWNED=no
elif [ -r "$CWD/.claude/current-task.md" ]; then
  STATE="$CWD/.claude/current-task.md"; STATE_OWNED=no
elif [ -n "$SESSION" ]; then
  STATE="$TASK_STATE_DIR/$SESSION.md"; STATE_OWNED=yes
else
  STATE="$HOME/.claude/current-task.md"; STATE_OWNED=no
fi
