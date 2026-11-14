import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const hook = fileURLToPath(new URL('../../hooks/git-shape-guard.sh', import.meta.url))
const raw = (input, env = process.env) => execFileSync('/bin/bash', [hook], { input, env }).toString()
const denied = (command) => raw(JSON.stringify({ tool_input: { command } })).includes('"permissionDecision": "deny"')

test('allows one plain git commit or push, whatever its message holds', () => {
  for (const c of [
    "git -C /repo commit -m 'fix: x'",
    'git -C /repo push https://github.com/o/r.git HEAD:b',
    "git commit -m 'fix: a; b'",
    "git commit -m 'cost $5 && more'",
    "git commit -m 'a -> b'",
    "git commit -m 'subject\n\nbody line'",
    'git -C /r commit -F /tmp/msg',
    'git -C /r commit -m x 2>&1',
  ]) assert.equal(denied(c), false, c)
})

test('allows chained commands that neither commit nor push', () => {
  for (const c of [
    'git status | head',
    'cd /repo && ls',
    'git stash push -m wip && git status',
    'git log --grep commit | head',
    'gh pr create --body "then git push"',
    'gh pr create --body "run x; git push"',
    "gh pr create --body 'step\ngit push origin main'",
  ]) assert.equal(denied(c), false, c)
})

test('denies a commit or push inside a compound command', () => {
  for (const c of [
    'cd /repo && git push',
    'git add . ; git commit -m x',
    'for f in a; do git commit -m x; done',
    'git commit -m "$(cat msg)"',
    'git commit -m `cat msg`',
    'git push origin $BRANCH',
    'git push | tail -2',
    "git commit -F - <<'EOF'\nmsg\nEOF",
    'cd /r && /usr/bin/git push',
    'cd /r && env git push',
  ]) assert.equal(denied(c), true, c)
})

test('fails open on input it cannot read', () => {
  for (const input of ['{}', 'not json', '[]', '{"tool_input":"x"}']) assert.equal(raw(input), '', input)
  assert.equal(raw(JSON.stringify({ tool_input: { command: 'cd /r && git push' } }), { PATH: '/nonexistent' }), '')
})
