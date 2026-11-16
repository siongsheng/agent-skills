#!/bin/sh
# SessionEnd hook. Removes this session's per-session anchor when it was never filled in,
# plus its marker files.
#
# Only ever touches a file this machinery created (STATE_OWNED=yes). A repo-local
# .claude/current-task.md, or anything named by $CLAUDE_TASK_FILE, is yours — never deleted,
# never pruned, regardless of age or content.
#
# "Never filled in" means byte-identical to the template. A file with one real line survives.

PAYLOAD=$(timeout 2 cat 2>/dev/null)
. "$(dirname "$0")/lib/resolve-task-file.sh" 2>/dev/null || exit 0

[ -n "$AGENT" ] && exit 0
# Every per-session marker, including ones another hook adds (such as .handoff). Session ids are
# UUIDs; any other character could reach a file outside this session's markers, so do nothing.
case "$SESSION" in *[!A-Za-z0-9_-]*) exit 0 ;; esac
[ -n "$SESSION" ] && rm -f "$TASK_STATE_DIR/.$SESSION".* 2>/dev/null

[ "$STATE_OWNED" = "yes" ] || exit 0
[ -f "$STATE" ] || exit 0
# Empty, or byte-identical to the template: never filled in, so reap it.
if [ ! -s "$STATE" ]; then
  rm -f "$STATE" 2>/dev/null
elif [ -r "$TASK_TEMPLATE" ] && cmp -s "$STATE" "$TASK_TEMPLATE"; then
  rm -f "$STATE" 2>/dev/null
fi
exit 0
