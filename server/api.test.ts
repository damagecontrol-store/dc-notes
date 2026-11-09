import { test, before } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { hashPassword } from './auth.ts'

let app: typeof import('./index.ts').app
let vault: string
before(async () => {
  vault = await mkdtemp(join(tmpdir(), 'vault-'))
  Object.assign(process.env, {
    NODE_ENV: 'test',
    SESSION_SECRET: 'x'.repeat(32),
    VAULT_PATH: vault,
    USERS: `ertugrul:${hashPassword('pw')}`,
  })
  app = (await import('./index.ts')).app
})

const post = (path: string, body: unknown, cookie = '') =>
  app.request(path, { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify(body) })

test('api rejects anonymous callers', async () => {
  assert.equal((await app.request('/api/me')).status, 401)
  assert.equal((await post('/api/notes', {})).status, 401)
})

test('wrong password 401, right password sets session and saves a note', async () => {
  assert.equal((await post('/api/login', { user: 'ertugrul', password: 'x' })).status, 401)
  const ok = await post('/api/login', { user: 'ertugrul', password: 'pw' })
  assert.equal(ok.status, 200)
  const cookie = ok.headers.get('set-cookie')!.split(';')[0]
  assert.equal((await post('/api/notes', { mode: 'note', title: '', body: 'x' }, cookie)).status, 400)
  const saved = await post('/api/notes', { mode: 'note', title: 'Test', body: 'hallo' }, cookie)
  const { path } = (await saved.json()) as { path: string }
  assert.match(await readFile(join(vault, path), 'utf8'), /hallo/)
})
