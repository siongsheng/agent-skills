# agent-skills

Claude Code helpers that work in any project, packaged as one plugin.

| Part | What it does |
|---|---|
| Task anchor (`hooks/task-anchor.sh`) | At every start, resume, clear and compaction, injects the session's task file, so goals, verified facts and ruled-out options survive compaction |
| Task-state guard (`hooks/task-state-guard.sh`) | Before a turn ends, asks once to update the task file when files changed since it was last written, at most every 30 minutes |
| Git shape guard (`hooks/git-shape-guard.sh`) | Refuses compound `git commit` and `git push` commands, such as `cd <dir> && git commit ...`, that would trigger a permission prompt, and says the simple form to use |
| Lint on edit (`hooks/lint-edited-file.sh`) | Runs the nearest project's eslint on the one file just edited and fails loudly on errors |
| `/agent-skills:delegate` | A checklist for handing work to a subagent: read first, ask only real forks, write done-checks, brief, then check the result |
| `bin/mutation-section` | Turns a Stryker or PIT mutation report into a PR-body section |

## Install

```text
claude plugin marketplace add siongsheng/agent-skills
claude plugin install agent-skills@siongsheng-skills
```

Requires `bash`, `python3` (hooks parse the hook payload) and, for `bin/mutation-section`, Node 20 or newer.

## The task file

The task anchor picks the first path that applies:

1. `$CLAUDE_TASK_FILE`, else `$AGENT_TASK_FILE`
2. `<cwd>/.claude/current-task.md`, only if it already exists
3. `~/.claude/task-state/<session-id>.md`, seeded from `templates/current-task-template.md`
4. `~/.claude/current-task.md`, when the hook gets no session id

Sections: Goal, Task, Verified, Locked, Ruled out, Next. Keep it under 60 lines.

## Tests

```text
node --test bin/tests/*.test.mjs
```

## Licence

MIT, see `LICENSE`.
