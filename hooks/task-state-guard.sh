#!/bin/sh
# Stop hook. Fires when Claude finishes a turn — including before a clear, resume or
# compact, which is exactly when an un-written anchor gets lost.
#
# Blocks once, with a reason fed back to the model, when this session has edited files
# since the task file was last written. Otherwise silent.
#
# Five guards against being a nuisance, because a Stop hook that fires on every reply is
# worse than no hook:
#   - never for subagents
#   - never while stop_hook_active is true (the harness's own loop guard)
#   - never when no file was edited since the anchor was last written
#   - never when the anchor was written within NAG_WINDOW seconds
#   - at most once per NAG_WINDOW seconds

NAG_WINDOW=1800

PAYLOAD=$(timeout 2 cat 2>/dev/null)
. "$(dirname "$0")/lib/resolve-task-file.sh" 2>/dev/null || exit 0

[ -n "$AGENT" ] && exit 0
[ -n "$SESSION" ] || exit 0

ACTIVE=$(printf '%s' "$PAYLOAD" | python3 -c "
import json,sys
try: print(json.load(sys.stdin).get('stop_hook_active') or '')
except Exception: pass
" 2>/dev/null)
[ "$ACTIVE" = "True" ] || [ "$ACTIVE" = "true" ] && exit 0

EDITED="$TASK_STATE_DIR/.$SESSION.edited"
NAGGED="$TASK_STATE_DIR/.$SESSION.nagged"

# Nothing changed on disk this session — there is nothing to record.
[ -f "$EDITED" ] || exit 0

# The anchor is newer than the last edit: already up to date.
[ -f "$STATE" ] && [ ! "$EDITED" -nt "$STATE" ] && exit 0

# A forced turn re-reads the whole context, so a recent anchor is left alone.
NOW=$(date +%s)
if [ -f "$STATE" ]; then
  WRITTEN=$(date -r "$STATE" +%s 2>/dev/null || echo 0)
  [ $((NOW - WRITTEN)) -lt "$NAG_WINDOW" ] && exit 0
fi

if [ -f "$NAGGED" ]; then
  LAST=$(date -r "$NAGGED" +%s 2>/dev/null || echo 0)
  [ $((NOW - LAST)) -lt "$NAG_WINDOW" ] && exit 0
fi
touch "$NAGGED" 2>/dev/null

python3 - "$STATE" <<'PY'
import json, sys
state = sys.argv[1]
print(json.dumps({
    "decision": "block",
    "reason": (
        "Files changed this session but the task anchor at " + state + " has not been "
        "written since. Auto-compact can fire at any turn and everything not in that file is lost "
        "with the transcript.\n\n"
        "Update it now, then finish:\n"
        "  Task        - what we are doing, and what counts as done\n"
        "  Verified    - each fact with the command that proved it and the date; "
        "replace stale rows, never append\n"
        "  Locked      - decisions made, dated\n"
        "  Ruled out   - options rejected and why, so they are not re-proposed\n"
        "  Next        - one to three steps\n\n"
        "Keep it under 60 lines. If there is genuinely nothing worth recording, say so in "
        "one line to the user and stop."
    ),
}))
PY
exit 0
