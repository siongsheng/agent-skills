#!/bin/sh
# SessionStart hook: re-anchors the agent after every compact, clear, resume, fork and start.
#
# Compaction summarises the transcript away, so whatever is not re-injected here is gone.
# This hook injects one block: the current task's state file — what we are doing, what is
# proven, what is ruled out.
#
# The state file is keyed on the SESSION, not the directory. Two sessions in one repo get
# their own anchor; a session launched from a parent directory over several repos still gets
# one. Sharing is opt-in, never accidental:
#
#   1. $CLAUDE_TASK_FILE            — explicit. Point two sessions at one task, or park a
#                                     cross-repo task somewhere findable.
#   2. <cwd>/.claude/current-task.md — used only if it ALREADY exists. Creating it is the
#                                     opt-in: you made the file, so you meant to share it.
#   3. ~/.claude/task-state/<session>.md — the default. Seeded from the template, never collides.
#
# Subagents get nothing. They are given their task in the prompt and are gone before any
# compaction; injecting extra context into each one just costs context.

# Slurp the payload. `timeout` is GNU coreutils and macOS does not ship it, so try it and
# fall back to a plain cat rather than lose the payload — Claude Code already bounds this
# hook itself. A timeout that fails to exec has not consumed stdin, so the fallback still
# sees the payload; one that ran and read an empty payload leaves the fallback empty too.
PAYLOAD=""
if command -v timeout >/dev/null 2>&1; then
  PAYLOAD=$(timeout 2 cat 2>/dev/null) || PAYLOAD=""
fi
[ -n "$PAYLOAD" ] || PAYLOAD=$(cat 2>/dev/null)

# FAIL CLOSED. The subagent guard below reads agent_id out of the payload, so anything that
# leaves the payload unreadable makes a subagent look exactly like a main session. Measured
# 17 Sep 2026: with `timeout` absent this hook printed 566 bytes of task anchor into a
# subagent. Two ways it goes unreadable, and both exit rather than guess:
#   1. no payload at all
#   2. python3 missing, or present but broken — `command -v` cannot tell those apart, so
#      test that it RUNS and that what it read is really JSON
[ -n "$PAYLOAD" ] || exit 0
printf '%s' "$PAYLOAD" | python3 -c 'import json,sys; json.load(sys.stdin)' 2>/dev/null || exit 0

. "$(dirname "$0")/lib/resolve-task-file.sh" 2>/dev/null || exit 0

# A subagent carries an agent_id. Stay out of its context entirely.
[ -n "$AGENT" ] && exit 0

# Prune disposable per-session anchors older than 30 days. Repo-local files and anything
# named by $CLAUDE_TASK_FILE live elsewhere and are never touched.
find "$TASK_STATE_DIR" -maxdepth 1 -name '*.md' -mtime +30 -delete 2>/dev/null

if [ ! -e "$STATE" ]; then
  mkdir -p "$(dirname "$STATE")" 2>/dev/null
  if [ -r "$TASK_TEMPLATE" ]; then
    cp "$TASK_TEMPLATE" "$STATE" 2>/dev/null
  else
    : > "$STATE" 2>/dev/null
  fi
fi

if [ -r "$STATE" ]; then
  echo "<current-task>"
  echo "Your state file for this session is: $STATE"
  echo "It is the anchor and it outranks anything summarised out of the transcript. Re-read it"
  echo "before planning. Write to it in the same reply as the work — whenever a fact is verified,"
  echo "a decision is locked, or an option is ruled out. If it is not written there it does not"
  echo "survive the next compaction. Replace stale entries, never append to them."
  echo
  head -c 6000 "$STATE"
  if [ "$(wc -c < "$STATE")" -gt 6000 ]; then
    echo
    echo "[truncated at 6000 bytes — the state file is too long, trim it]"
  fi
  echo
  echo "</current-task>"
  echo
fi
