import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const CLI = fileURLToPath(new URL('../mutation-section', import.meta.url))
const FIX = fileURLToPath(new URL('./fixtures/mutation-section/', import.meta.url))
const { load, stryker, pit, render, splice, testName, pitTest } = require('../mutation-section')

const REASONS = JSON.parse(fs.readFileSync(`${FIX}reasons.json`, 'utf8'))
const rep = () => load(`${FIX}mutation.json`)
const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' })
const rows = (text) => text.split('\n').filter((l) => /^\| `/.test(l))
const blocks = (text, summary) => text.split('<details><summary>').slice(1).filter((b) => summary.test(b.split('</summary>')[0])).join('\n')
const visible = (text) => rows(blocks(text, /^Mutation testing: /))

test('keeps "k of m" in one marked score bullet that names the tool and the scope, and folds every table', () => {
  const { text, counts } = render(rep(), { reasons: REASONS })
  const lines = text.split('\n')
  assert.equal(lines[0], "- ⚠️ **Mutation testing:** StrykerJS caught 3 of 5 mutants (60%) on this PR's changed lines. Not caught: 2 with another reason. 1 more was left out of the score because the test run crashed.")
  assert.deepEqual(counts, { caught: 3, scored: 5, left: 2, errors: 1 })
  assert.equal(lines[1], '')
  assert.equal(lines[2], '<details><summary>Mutation testing: 2 not caught</summary><!-- mutation-section -->')
  assert.deepEqual(lines.filter((l) => l.trim() && !/^\|/.test(l) && !/details>/.test(l)), [lines[0]])
  assert.doesNotMatch(text, /git diff|A mutant is one small deliberate bug|The tests did not catch these mutants|Each row says why/)
})

test('puts the mutants not caught and the ones left out of the score in separate three-column tables, marked by emoji', () => {
  const { text, missing } = render(rep(), { reasons: REASONS })
  assert.deepEqual(missing, [])
  assert.match(text, /\n\| Line \| Mutant \(⚠️ survived, ⚪ no test runs it\) \| Why \|\n\| --- \| --- \| --- \|\n/)
  assert.match(text, /\n\| Line \| Mutant \(➖ left out of the score\) \| Why \|\n/)
  assert.ok(text.indexOf('⚠️ survived') < text.indexOf('➖ left out'))
  assert.doesNotMatch(text, /Edit by hand/)
  assert.deepEqual(visible(text), [
    '| `calc.ts:3` | ⚠️ `>` → `>=` | Only differs when a equals b, and line 2 returns first then. |',
    '| `calc.ts:4` | ⚪ `"picked \\| max"` → `""` | Log text only. |',
    '| `calc.ts:1-6` | ➖ block emptied to `{}` | The tests catch it, but the crash ends the run first. |',
  ])
})

test('names only the results a table holds in its header', () => {
  const r = rep()
  r.mutants = r.mutants.filter((m) => m.status !== 'nocov')
  assert.match(render(r, { reasons: REASONS }).text, /\| Line \| Mutant \(⚠️ survived\) \| Why \|/)
})

test('puts mutants on one line that share a reason in one row, and keeps a different reason in its own row', () => {
  const src = 'export const f = (a, b) => a || b;\n'
  const m = (id, mutatorName, replacement, start, end, status = 'Survived') => ({ id, mutatorName, replacement, location: { start: { line: 1, column: start }, end: { line: 1, column: end } }, status })
  const r = stryker({ files: { 'src/f.ts': { source: src, mutants: [m('1', 'LogicalOperator', 'a && b', 28, 34), m('2', 'ConditionalExpression', 'true', 28, 34, 'NoCoverage'), m('3', 'ConditionalExpression', 'false', 28, 34)] } } })
  const ids = Object.fromEntries(r.mutants.map((x) => [x.id, x.to === 'false' ? 'another reason.' : 'same reason.']))
  assert.deepEqual(visible(render(r, { reasons: ids }).text), [
    '| `f.ts:1` | ⚠️ `\\|\\|` → `&&`<br>⚪ `a \\|\\| b` → `true` | Same reason. |',
    '| `f.ts:1` | ⚠️ `a \\|\\| b` → `false` | Another reason. |',
  ])
})

test('shows a mutant over several lines by its line range, and the shortest unique path when files share a name', () => {
  const r = rep()
  const m = r.mutants.find((x) => x.status === 'survived')
  m.end = 5
  const twin = { ...m, file: 'b/calc.ts', path: 'src/b/calc.ts', end: 3 }
  r.mutants.push(twin)
  const v = visible(render(r, { reasons: { ...REASONS, 'b/calc.ts:3:EqualityOperator': 'twin.' } }).text)
  assert.equal(v[0], '| `a/calc.ts:3-5` | ⚠️ `>` → `>=` | Only differs when a equals b, and line 2 returns first then. |')
  assert.match(v[2], /^\| `b\/calc\.ts:3` \| ⚠️ /)
})

const BLOCKS = (mutants) => ({
  files: { 'src/f.ts': { source: 'export function f(x) {\n  if (x) {\n    g();\n    h();\n  }\n  return run(() => {\n    k();\n  });\n}\n', mutants } },
})
const block = (id, start, end, extra = {}) => ({ id, mutatorName: 'BlockStatement', replacement: '{}', location: { start, end }, status: 'Survived', ...extra })

test('says an emptied block over several lines was emptied, naming its keyword, with its range in the Line cell', () => {
  const r = stryker(BLOCKS([block('1', { line: 2, column: 10 }, { line: 5, column: 4 }), block('2', { line: 6, column: 20 }, { line: 8, column: 4 })]))
  const { text } = render(r, { reasons: { 'f.ts:2:BlockStatement': 'no test passes a truthy x.', 'f.ts:6:BlockStatement': 'no test checks k runs.' } })
  assert.deepEqual(visible(text), [
    '| `f.ts:2-5` | ⚠️ `if` block emptied to `{}` | No test passes a truthy x. |',
    '| `f.ts:6-8` | ⚠️ block emptied to `{}` | No test checks k runs. |',
  ])
})

test('labels a multi-line object emptied to {} by its text, not as an emptied block', () => {
  const r = stryker({ files: { 'src/f.ts': { source: 'export const o = {\n  a: 1,\n  b: 2,\n};\n', mutants: [{ id: '9', mutatorName: 'ObjectLiteral', replacement: '{}', location: { start: { line: 1, column: 17 }, end: { line: 4, column: 1 } }, status: 'Survived' }] } } })
  const { text } = render(r, { reasons: { 'f.ts:1:ObjectLiteral': 'x.' } })
  assert.doesNotMatch(text, /block emptied/)
  assert.match(visible(text)[0], /^\| `f\.ts:1-4` \| ⚠️ `\{ a: 1, b: 2,[^`]*` → `\{\}`/)
})

test('names try, catch, else and else if blocks apart when each is emptied', () => {
  const source = 'try {\n  a();\n} catch (e) {\n  b();\n}\nif (x) {\n  c();\n} else if (y) {\n  d();\n} else {\n  e();\n}\n'
  const at = (id, l1, c1, l2) => block(id, { line: l1, column: c1 }, { line: l2, column: 2 })
  const r = stryker({ files: { 'src/f.ts': { source, mutants: [at('1', 1, 5, 3), at('2', 3, 13, 5), at('3', 8, 15, 10), at('4', 10, 8, 12)] } } })
  const { text } = render(r, { reasons: Object.fromEntries(r.mutants.map((m) => [m.id, 'x.'])) })
  assert.deepEqual(visible(text).map((l) => l.split(' | ')[1]), ['⚠️ `try` block emptied to `{}`', '⚠️ `catch` block emptied to `{}`', '⚠️ `else if` block emptied to `{}`', '⚠️ `else` block emptied to `{}`'])
})

test('keeps the mutant text when the range fits on one line', () => {
  const r = stryker(BLOCKS([{ id: '3', mutatorName: 'ArrowFunction', replacement: '() => undefined', location: { start: { line: 6, column: 14 }, end: { line: 6, column: 19 } }, status: 'Survived' }]))
  const { text } = render(r, { reasons: { 'f.ts:6:ArrowFunction': 'x.' } })
  assert.equal(visible(text)[0], '| `f.ts:6` | ⚠️ `() =>` → `() => undefined` | X. |')
})

test('writes StrykerJS for a bare Stryker in reason text, and leaves PIT reasons alone', () => {
  const r = stryker(BLOCKS([block('1', { line: 2, column: 10 }, { line: 5, column: 4 })]))
  const manual = [{ file: 'src/f.ts', line: 7, edit: 'delete `k();`', result: 'survived', why: 'Stryker has no mutator that deletes a statement' }]
  const { text } = render(r, { reasons: { 'f.ts:2:BlockStatement': 'Stryker and StrykerJS both say so.' }, manual })
  assert.match(text, /\| StrykerJS and StrykerJS both say so\. \|/)
  assert.match(text, /\| StrykerJS has no mutator that deletes a statement\. \|/)
  assert.doesNotMatch(text.replace(/StrykerJS/g, ''), /Stryker/)
  const p = pit(fs.readFileSync(`${FIX}mutations.xml`, 'utf8'))
  assert.ok(p.mutants.find((m) => m.status === 'survived'), 'the PIT fixture has a survived mutant')
  const out = render(p, { reasons: Object.fromEntries(p.mutants.map((m) => [m.id, 'Stryker would differ.'])) })
  assert.match(out.text, /Stryker would differ\./)
  assert.doesNotMatch(out.text, /StrykerJS would differ/)
})

test('keeps an "Equivalent:" reason as written, and adds no definition paragraph', () => {
  const r = stryker(BLOCKS([block('1', { line: 2, column: 10 }, { line: 5, column: 4 })]))
  const { text } = render(r, { reasons: { 'f.ts:2:BlockStatement': 'Equivalent: g and h are no-ops here.' } })
  assert.match(visible(text)[0], /\| Equivalent: g and h are no-ops here\. \|$/)
  assert.doesNotMatch(text, /Equivalent means/)
})

test('counts a manual mutant that was not caught and has no why as missing, and prints no body', () => {
  const manual = [{ file: 'src/a/calc.ts', line: 2, edit: 'return `"other"`', result: 'survived' }]
  assert.deepEqual(render(rep(), { reasons: REASONS, manual }).missing.map((m) => m.id), ['manual:src/a/calc.ts:2'])
  assert.deepEqual(render(rep(), { reasons: REASONS, manual: [{ ...manual[0], result: 'caught', test: 't' }] }).missing, [])
  const dir = fs.mkdtempSync(`${FIX}tmp-`)
  try {
    fs.writeFileSync(`${dir}/manual.json`, JSON.stringify(manual))
    const out = run('--report', `${FIX}mutation.json`, '--reasons', `${FIX}reasons.json`, '--manual', `${dir}/manual.json`)
    assert.equal(out.status, 1)
    assert.equal(out.stdout, '')
    assert.match(out.stderr, /1 mutant\(s\) with no reason/)
    assert.match(out.stderr, /"<id>": "<why>"/)
    assert.match(out.stderr, /give each manual: id a "why" in the manual file/)
    assert.match(out.stderr, /manual:src\/a\/calc\.ts:2\t⚠️ Not caught\treturn `"other"`/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('counts the caught mutants on the score line only, with no caught table', () => {
  const { text } = render(rep(), { reasons: REASONS })
  assert.match(text.split('\n')[0], /StrykerJS caught 3 of 5 mutants/)
  assert.doesNotMatch(text, /\d+ caught<\/summary>|Caught by|timed out/)
})

test('reads a reason by file:line:mutatorName, with the path or the file name, or by the id from ids', () => {
  const r = rep()
  const id = r.mutants.find((m) => m.status === 'survived').id
  assert.match(id, /^a\/calc\.ts:3:EqualityOperator:[0-9a-f]{6}$/)
  const { text } = render(r, { reasons: { ...REASONS, [id]: 'the id wins.' } })
  assert.match(visible(text)[0], /\| The id wins\. \|$/)
  const { missing } = render(r, { reasons: { 'calc.ts:3:EqualityOperator': 'x' } })
  assert.deepEqual(missing.map((m) => m.line).sort(), [1, 4])
})

test('fails with each mutant id and prints no body when a reason is missing, and ids lists every mutant that needs one', () => {
  const out = run('--report', `${FIX}mutation.json`)
  assert.equal(out.status, 1)
  assert.equal(out.stdout, '')
  assert.equal(run('--report', `${FIX}mutation.json`, '--into', `${FIX}reasons.json`).stdout, '')
  assert.match(out.stderr, /3 mutant\(s\) with no reason/)
  assert.match(out.stderr, /a\/calc\.ts:3:EqualityOperator:[0-9a-f]{6}\t⚠️ Survived\t`>` → `>=`/)
  const ids = run('ids', '--report', `${FIX}mutation.json`)
  assert.equal(ids.status, 0)
  assert.equal(ids.stdout.trim().split('\n').length, 3)
  assert.equal(run('--report', `${FIX}mutation.json`, '--reasons', `${FIX}reasons.json`).status, 0)
})

test('puts manual mutants in their own table, marked caught or not, with the test that fails', () => {
  const manual = [{ file: 'src/a/calc.ts', line: 5, edit: 'delete `return max;`', result: 'caught', test: 'pick › returns the larger', why: 'StrykerJS cannot delete a statement' },
    { file: 'src/a/calc.ts', line: 2, edit: 'return `"other"`', result: 'survived', why: 'no test reads the text' }]
  const { text, counts } = render(rep(), { reasons: REASONS, manual })
  assert.equal(counts.scored, 5)
  const v = visible(text)
  assert.equal(v.length, 5)
  assert.equal(v[3], '| `calc.ts:2` | ⚠️ return `"other"` | No test reads the text. |')
  assert.equal(v[4], '| `calc.ts:5` | ✅ delete `return max;` | Fails "pick › returns the larger". StrykerJS cannot delete a statement. |')
  assert.match(text, /\n\n\| Line \| Edit by hand, not scored \(✅ caught, ⚠️ not caught\) \| Why \|\n/)
  assert.match(render(rep(), { reasons: REASONS, manual: manual.slice(0, 1) }).text, /\| Edit by hand, not scored \(✅ caught\) \|/)
})

test('shows only the ✅ score line when the score is 100%', () => {
  const r = rep()
  r.mutants = r.mutants.filter((m) => m.status === 'killed')
  assert.equal(render(r).text, "- ✅ **Mutation testing:** StrykerJS caught 2 of 2 mutants (100%) on this PR's changed lines.")
})

test('says when no mutant was scored', () => {
  const r = rep()
  r.mutants = []
  assert.equal(render(r).text, "- ⚠️ **Mutation testing:** StrykerJS made no scored mutants on this PR's changed lines.")
})

test('reads a PIT mutations.xml, with the killing test by class › nested › method', () => {
  const r = load(`${FIX}mutations.xml`)
  const { text, missing } = render(r)
  assert.equal(r.tool, 'PIT')
  assert.equal(text.split('\n')[0], "- ⚠️ **Mutation testing:** PIT caught 2 of 4 mutants (50%) on this PR's changed lines. Not caught: 2 with another reason. 1 more was left out of the score because the test run crashed. PIT's own report counts a crash as caught.")
  assert.equal(missing.length, 3)
  assert.match(text, /\| `Calc\.java:5` \| ⚠️ changed conditional boundary \|/)
  assert.match(text, /\| `Calc\.java:9` \| ⚪ removed call to `java\/io\/PrintStream::println` \|/)
  assert.match(text, /\| `Calc\.java:6` \| ➖ replaced int return with 0 for `com\/example\/Calc::pick` \|/)
  assert.deepEqual(r.mutants.find((m) => m.status === 'killed' && m.line === 5).by, ['CalcTest › Picking › returnsTheLarger'])
  assert.equal(pitTest('com.example.CalcTest.picks(com.example.CalcTest)'), 'CalcTest › picks')
})

test('names each cause in the left-out table only when the causes differ', () => {
  const m = (status, line) => `<mutation status='${status}'><sourceFile>A.java</sourceFile><mutatedClass>p.A</mutatedClass><lineNumber>${line}</lineNumber><mutator>x.M</mutator><description>d${line}</description></mutation>`
  const p = pit(`<mutations>${m('RUN_ERROR', 1)}${m('NON_VIABLE', 2)}</mutations>`)
  const { text } = render(p, { reasons: Object.fromEntries(p.mutants.map((x) => [x.id, 'r.'])) })
  assert.match(text, /\| ➖ d1 \(crashed the run\) \|/)
  assert.match(text, /\| ➖ d2 \(did not compile\) \|/)
})

test('puts a PIT method name such as <init> in backticks, splits killingTests on |, and counts a memory error as caught', () => {
  const m = (status, desc, killing = '') => `<mutation status='${status}'><sourceFile>A.java</sourceFile><mutatedClass>p.A</mutatedClass><lineNumber>3</lineNumber><mutator>x.VoidMethodCallMutator</mutator><killingTests>${killing}</killingTests><description>${desc}</description></mutation>`
  const xml = `<mutations>${m('KILLED', 'negated conditional', 'p.ATest.a(p.ATest)|p.ATest.b(p.ATest)|p.ATest.c(p.ATest)')}${m('MEMORY_ERROR', 'negated conditional')}${m('SURVIVED', 'removed call to java/util/ArrayList::&lt;init&gt;')}</mutations>`
  const p = pit(xml)
  assert.deepEqual(p.mutants[0].by, ['ATest › a', 'ATest › b', 'ATest › c'])
  const { text, counts } = render(p, { reasons: Object.fromEntries(p.mutants.map((x) => [x.id, 'r.'])) })
  assert.match(text, /\| ⚠️ removed call to `java\/util\/ArrayList::<init>` \|/)
  assert.equal(counts.caught, 2)
})

test('splits a jest name on the describe titles the test file declares, and leaves an unknown one whole', () => {
  const src = 'describe("a b", () => { describe(`c`, () => { it.each([1])("d %s", () => {}) }) })'
  assert.equal(testName('a b c d 1', src), 'a b › c › d 1')
  assert.equal(testName('x y', src), 'x y')
  assert.equal(testName('a b c', undefined), 'a b c')
})

const OLD = `## Summary

Text.

## Verification

**What to look for:** the pin.

**Mutation testing:** StrykerJS scored 60% on the changed lines: 3 of 5 mutants killed.

- \`calc.ts:3\` survives: a reason.
- \`calc.ts:4\` survives: a reason.

**Unit tests:** 12 pass.

## Not checked

- Firefox.
`

const V2 = `## Summary

Text.

## How it was tested

- ✅ **Unit tests:** 12 pass.
- ✅ **Lint and types:** clean.
- ✅ **CI:** green.

<details><summary>End-to-end files</summary>

x

</details>

## Not checked

None
`

test('replaces an old mutation part with the score bullet, folds the tables at the end of the section, and is stable', () => {
  const { text } = render(rep(), { reasons: REASONS })
  const once = splice(OLD, text)
  assert.ok(once.startsWith("## Summary\n\nText.\n\n## Verification\n\n**What to look for:** the pin.\n\n- ⚠️ **Mutation testing:** StrykerJS caught 3 of 5 mutants (60%) on this PR's changed lines"))
  assert.ok(once.includes("crashed.\n\n**Unit tests:** 12 pass.\n\n<details><summary>Mutation testing: 2 not caught</summary>"))
  assert.ok(once.endsWith('</details>\n\n## Not checked\n\n- Firefox.\n'))
  assert.doesNotMatch(once, /survives: a reason/)
  assert.equal(splice(once, text), once)
})

test('puts the score bullet after Lint and types in a tight list, and the tables after the section\'s own details', () => {
  const { text } = render(rep(), { reasons: REASONS })
  const once = splice(V2, text)
  assert.ok(once.includes("- ✅ **Lint and types:** clean.\n- ⚠️ **Mutation testing:** StrykerJS caught 3 of 5"))
  assert.ok(once.includes("crashed.\n- ✅ **CI:** green.\n\n<details><summary>End-to-end files</summary>\n\nx\n\n</details>\n\n<details><summary>Mutation testing: 2 not caught"))
  assert.ok(once.endsWith('</details>\n\n## Not checked\n\nNone\n'))
  assert.equal(splice(once, text), once)
  const again = render({ ...rep(), mutants: rep().mutants.filter((m) => m.status === 'killed') }).text
  const fixed = splice(once, again)
  assert.doesNotMatch(fixed, /not caught<\/summary>|left out of the score<\/summary>/)
  assert.ok(fixed.includes('- ✅ **Mutation testing:** StrykerJS caught 2 of 2'))
})

test('adds the score to the end of Verification, or adds a How it was tested section', () => {
  const body = OLD.replace(/\*\*Mutation testing:\*\*[\s\S]*?(?=\*\*Unit tests)/, '')
  assert.ok(splice(body, '- ✅ **Mutation testing:** X').includes('**Unit tests:** 12 pass.\n\n- ✅ **Mutation testing:** X\n\n## Not checked'))
  assert.equal(splice('## Summary\n\nText.\n', 'LINE'), '## Summary\n\nText.\n\n## How it was tested\n\nLINE\n')
})

test('ends the mutation part at the next bold lead-in bullet of a tight list, marked or not', () => {
  const tight = '## Verification\n\n- **Mutation testing:** 3 of 5 killed.\n  - `calc.ts:3` survives.\n- **Unit tests:** 12 pass.\n- ✅ **Lint:** clean.\n\n## Not checked\n'
  assert.equal(splice(tight, '- ✅ **Mutation testing:** M'), '## Verification\n\n- ✅ **Mutation testing:** M\n- **Unit tests:** 12 pass.\n- ✅ **Lint:** clean.\n\n## Not checked\n')
  const marked = '## How it was tested\n\n- ⚠️ **Mutation testing:** old.\n- ✅ **CI:** green.\n'
  assert.equal(splice(marked, '- ✅ **Mutation testing:** M'), '## How it was tested\n\n- ✅ **Mutation testing:** M\n- ✅ **CI:** green.\n')
  const last = '## Verification\n\n- **Lint:** clean.\n- **Mutation testing:** 3 of 5 killed.\n\n## Not checked\n'
  assert.equal(splice(last, '- ✅ **Mutation testing:** M\n\n<details><summary>Mutation testing: 1 caught</summary>\n\nT\n\n</details>'),
    '## Verification\n\n- **Lint:** clean.\n- ✅ **Mutation testing:** M\n\n<details><summary>Mutation testing: 1 caught</summary>\n\nT\n\n</details>\n\n## Not checked\n')
})

test('sorts each reason by its first words into gaps, equivalent, not observable and other', () => {
  const r = rep()
  const ids = r.mutants.filter((m) => m.status === 'survived' || m.status === 'nocov').map((m) => m.id)
  const at = (whys) => render(r, { reasons: { ...REASONS, [ids[0]]: whys[0], [ids[1]]: whys[1] } }).text.split('\n')[0]
  assert.match(at(['Gap: no test reads it.', 'Gap: same.']), /Not caught: 2 gaps\./)
  assert.match(at(['Equivalent: same result.', 'Not observable: log text.']), /Not caught: 1 equivalent, 1 not observable\./)
  assert.match(at(['Gap: x.', 'Twin of line 3.']), /Not caught: 1 gap, 1 with another reason\./)
})

test('says how many hand edits were caught on the score line', () => {
  const manual = [{ file: 'src/a/calc.ts', line: 5, edit: 'e', result: 'caught', test: 't' }, { file: 'src/a/calc.ts', line: 2, edit: 'f', result: 'survived', why: 'w' }]
  assert.match(render(rep(), { reasons: REASONS, manual }).text.split('\n')[0], / Checked by hand: 1 of 2 caught\.$/)
})

test('drops only the blocks mutation-section wrote, by its marker or an old exact summary', () => {
  const human = '<details><summary>Mutation testing: what the tests miss</summary>\n\nH\n\n</details>'
  const body = `## How it was tested\n\n- ⚠️ **Mutation testing:** old.\n\n${human}\n\n<details><summary>Mutation testing: 322 caught</summary>\n\nT\n\n</details>\n\n<details><summary>Mutation testing: 2 not caught</summary><!-- mutation-section -->\n\nU\n\n</details>\n\n## Not checked\n`
  const out = splice(body, '- ✅ **Mutation testing:** M')
  assert.ok(out.includes(human))
  assert.doesNotMatch(out, /322 caught|2 not caught/)
})

test('splice leaves blank runs inside a code fence alone', () => {
  const body = '## How it was tested\n\n```sh\na\n\n\n\nb\n```\n\n- ✅ **Lint and types:** clean\n\n\n\n## Not checked\n'
  const out = splice(body, '- ✅ **Mutation testing:** M')
  assert.ok(out.includes('a\n\n\n\nb'))
  assert.ok(!out.includes('\n\n\n\n## Not'))
})

test('ids leaves out a PIT memory error, which the score counts as caught', () => {
  const dir = fs.mkdtempSync(`${FIX}../tmp-`)
  try {
    const m = (status) => `<mutation status='${status}'><sourceFile>A.java</sourceFile><mutatedClass>p.A</mutatedClass><lineNumber>3</lineNumber><mutator>x.VoidMethodCallMutator</mutator><description>${status}</description></mutation>`
    fs.writeFileSync(`${dir}/m.xml`, `<mutations>${m('MEMORY_ERROR')}${m('SURVIVED')}</mutations>`)
    const r = run('ids', '--report', `${dir}/m.xml`)
    assert.equal(r.status, 0)
    assert.doesNotMatch(r.stdout, /MEMORY_ERROR/)
    assert.match(r.stdout, /SURVIVED/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('exits 2 with a one-line error, not a stack trace, for a missing or unparsable input', () => {
  const missing = run('--report', `${FIX}no-such-report.json`)
  assert.equal(missing.status, 2)
  assert.match(missing.stderr, /^mutation-section: cannot read --report .*no-such-report\.json: /)
  assert.doesNotMatch(missing.stderr, /\n\s+at /)
  assert.equal(missing.stdout, '')
  const bad = run('--report', `${FIX}mutation.json`, '--reasons', `${FIX}mutations.xml`)
  assert.equal(bad.status, 2)
  assert.match(bad.stderr, /cannot read --reasons/)
})

test('adds the score to an Evidence section', () => {
  assert.equal(splice('## Evidence\n\n- **Unit tests:** pass.\n\n## Not checked\n', '- ✅ **Mutation testing:** X'),
    '## Evidence\n\n- **Unit tests:** pass.\n\n- ✅ **Mutation testing:** X\n\n## Not checked\n')
})
