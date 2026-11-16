import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const hook = fileURLToPath(new URL('../../hooks/task-state-cleanup.sh', import.meta.url))

test('removes every marker of the ending session, and no other session\'s', () => {
  const home = mkdtempSync(join(tmpdir(), 'cleanup-'))
  const dir = join(home, '.claude', 'task-state')
  mkdirSync(dir, { recursive: true })
  for (const f of ['.s1.edited', '.s1.nagged', '.s1.handoff', '.s2.handoff']) writeFileSync(join(dir, f), '')
  execFileSync('/bin/sh', [hook], { input: JSON.stringify({ session_id: 's1' }), env: { HOME: home, PATH: process.env.PATH } })
  assert.deepEqual(readdirSync(dir).filter((f) => f.startsWith('.')).sort(), ['.s2.handoff'])
  rmSync(home, { recursive: true, force: true })
})

test('a session id with a path in it removes nothing', () => {
  const home = mkdtempSync(join(tmpdir(), 'cleanup-'))
  const dir = join(home, '.claude', 'task-state')
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(home, 'foo.keep'), '')
  writeFileSync(join(home, 'foo.edited'), '')
  execFileSync('/bin/sh', [hook], { input: JSON.stringify({ session_id: '/../../foo' }), env: { HOME: home, PATH: process.env.PATH } })
  assert.deepEqual(readdirSync(home).filter((f) => f.startsWith('foo')).sort(), ['foo.edited', 'foo.keep'])
  rmSync(home, { recursive: true, force: true })
})
