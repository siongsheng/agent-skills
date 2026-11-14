#!/bin/sh
# PostToolUse hook on Edit|Write. Touches a per-session marker so the Stop hook can tell
# "this turn changed files" from "this turn answered a question" without parsing the
# transcript. Nothing else reads it.
#
# Deliberately does not fire for a write to the task file itself — updating the anchor
# must not re-arm the nag that asked for it.

PAYLOAD=$(timeout 2 cat 2>/dev/null)
. "$(dirname "$0")/lib/resolve-task-file.sh" 2>/dev/null || exit 0

[ -n "$AGENT" ] && exit 0
[ -n "$SESSION" ] || exit 0

EDITED=$(printf '%s' "$PAYLOAD" | python3 -c "
import json,sys
try: print(json.load(sys.stdin).get('tool_input',{}).get('file_path') or '')
except Exception: pass
" 2>/dev/null)

[ "$EDITED" = "$STATE" ] && exit 0

mkdir -p "$TASK_STATE_DIR" 2>/dev/null
touch "$TASK_STATE_DIR/.$SESSION.edited" 2>/dev/null
exit 0
