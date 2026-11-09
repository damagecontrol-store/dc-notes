import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { render, safeName, save } from './notes.ts'

test('safeName strips link-breaking characters', () => {
  assert.equal(safeName('Plan: [Q4] #1 / "ok"?'), 'Plan Q4 1 ok')
  assert.equal(safeName('///'), 'Untitled')
})

test('task frontmatter matches vault, bad prio falls back', () => {
  const t = render({ mode: 'task', title: 'x', body: '- [ ] a', prio: 'Nope', deadline: '2026-11-10' }, '2026-11-08')
  assert.match(t, /dc-base: "\[\[base_Tasks\]\]"/)
  assert.match(t, /prio: Medium/)
  assert.match(t, /deadline: 2026-11-10/)
  assert.doesNotMatch(render({ mode: 'task', title: 'x', body: '', deadline: 'morgen' }, 'd'), /deadline/)
})

test('meeting lists attendees as quoted yaml', () => {
  const t = render({ mode: 'meeting', title: 'x', body: 'b', attendees: ['Joël'] }, '2026-11-08')
  assert.match(t, /type: Meeting/)
  assert.match(t, /attendees:\n {2}- "Joël"/)
})

test('save never overwrites', async () => {
  const v = await mkdtemp(join(tmpdir(), 'vault-'))
  const d = { mode: 'note' as const, title: 'Idee', body: 'een' }
  const a = await save(v, d, '2026-11-08')
  const b = await save(v, { ...d, body: 'twee' }, '2026-11-08')
  assert.equal(a, 'Notebook/Idee.md')
  assert.equal(b, 'Notebook/Idee 2.md')
  assert.match(await readFile(join(v, a), 'utf8'), /een/)
})
