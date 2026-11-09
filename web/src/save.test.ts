import { test } from 'node:test'
import assert from 'node:assert/strict'
import { obsidianUrl } from './save.ts'
import { render } from './notes.ts'

test('obsidianUrl carries vault, path and the full note', () => {
  const d = { mode: 'task' as const, title: 'Merch: 5 ontwerpen & meer', body: '- [ ] a+b #1' }
  const p = new URL(obsidianUrl('Damage Control', d, '2026-11-09')).searchParams
  assert.equal(p.get('vault'), 'Damage Control')
  assert.equal(p.get('file'), 'Tasks/Merch 5 ontwerpen & meer')
  assert.equal(p.get('content'), render(d, '2026-11-09'))
})
