#!/usr/bin/env bash
# Claude Code asks the user about any `cd <dir> && git ...` compound, and about any commit
# or push it finds too complex to match a rule (variables, loops, pipes), whatever the
# allow rules say. Deny those here instead, so the agent rewrites the command and the
# prompt never reaches the user. Any failure here must exit 0, or every Bash call breaks.
set -uo pipefail

python3 -c '
import json, shlex, sys

try:
    cmd = json.load(sys.stdin)["tool_input"]["command"]
    assert isinstance(cmd, str)
except Exception:
    sys.exit(0)

def unquoted_risks(s):
    """Shell syntax outside quotes, and expansions outside single quotes."""
    found, quote, i = set(), None, 0
    while i < len(s):
        c = s[i]
        if quote == "\x27":
            if c == "\x27":
                quote = None
        elif c == "\\":
            i += 1
        elif quote == "\"" and c == "\"":
            quote = None
        elif c == "`" or (c == "$" and s[i + 1:i + 2] and (s[i + 1] in "({" or s[i + 1].isalpha() or s[i + 1] == "_")):
            found.add("expansion")
        elif quote is None:
            if c in "\x27\"":
                quote = c
            elif c == "&" and (s[i - 1:i] == ">" or s[i + 1:i + 2] == ">"):
                pass
            elif c in ";&|\n":
                found.add("chain")
            elif s.startswith("<<", i):
                found.add("heredoc")
        i += 1
    return found

def git_writes(s):
    try:
        lex = shlex.shlex(s, posix=True, punctuation_chars=";&|<>()")
        lex.whitespace_split = True
        tokens = list(lex)
    except ValueError:
        return False
    starts = [0] + [n + 1 for n, t in enumerate(tokens) if set(t) <= set(";&|()")]
    for n in starts:
        words = tokens[n:]
        while words and "=" in words[0] and not words[0].startswith("-"):
            words = words[1:]
        while words and words[0] in ("do", "then", "else", "{", "!", "env", "command", "exec"):
            words = words[1:]
        if not words or words[0].rsplit("/", 1)[-1] != "git":
            continue
        k = 1
        while k < len(words) and words[k].startswith("-"):
            k += 2 if words[k] in ("-C", "-c") else 1
        if k < len(words) and words[k] in ("commit", "push"):
            return True
    return False

if git_writes(cmd) and unquoted_risks(cmd):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": (
            "Commit and push need one simple command per call, or the user gets an approval prompt. "
            "Run each on its own, with an absolute path and no cd, chaining, pipes, loops, $ expansions or heredocs: "
            "git -C /abs/repo add <paths> ; "
            "git -C /abs/repo commit -m \x27<subject>\x27 "
            "(for a body, write the message to a file and use -F <file>) ; "
            "git -C /abs/repo push https://github.com/<org>/<repo>.git HEAD:<branch>. "
            "Run checks, git status and log in separate calls."
        ),
    }}))
' 2>/dev/null
exit 0
