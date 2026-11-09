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

test('edited review fields land in the frontmatter', () => {
  const t = render({ mode: 'task', title: 'x', body: '', status: 'In progress', category: ['Branding'], assigned_to: ['Joël', '[[Ertugrul]]'] }, 'd')
  assert.match(t, /status: In progress/)
  assert.match(t, /category:\n {2}- "Branding"/)
  assert.match(t, /assigned_to:\n {2}- "\[\[Joël\]\]"\n {2}- "\[\[Ertugrul\]\]"/)
  const n = render({ mode: 'note', title: 'x', body: '', date: '2026-11-01', company: ['MXIO'], status: 'a: b\nc' }, '2026-11-09')
  assert.match(n, /date: 2026-11-01/)
  assert.match(n, /company:\n {2}- "MXIO"/)
  assert.match(n, /status: "a: b\\nc"/) // free text cannot break the yaml
  assert.match(render({ mode: 'note', title: 'x', body: '', date: 'gisteren' }, '2026-11-09'), /date: 2026-11-09/)
})
