import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { loadVault, sourcesIn } from './ask.ts'

test('loadVault reads nested md files and skips dot folders and other files', async () => {
  const v = await mkdtemp(join(tmpdir(), 'vault-'))
  await mkdir(join(v, 'Notebook'))
  await mkdir(join(v, '.obsidian'))
  await writeFile(join(v, 'Notebook', 'A.md'), 'alpha')
  await writeFile(join(v, '.obsidian', 'x.md'), 'secret')
  await writeFile(join(v, 'pic.jpg'), 'bin')
  assert.deepEqual(await loadVault(v), [{ path: 'Notebook/A.md', text: 'alpha' }])
})

test('sourcesIn matches [[links]] incl. aliases to real files only', () => {
  const paths = ['Notebook/MXIO brainstorm.md', 'Tasks/Write brand guide.md']
  assert.deepEqual(sourcesIn('Zie [[MXIO brainstorm|brainstorm]] en [[Bestaat niet]]', paths), ['Notebook/MXIO brainstorm.md'])
})
