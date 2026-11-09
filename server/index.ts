import { Hono } from 'hono'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { bodyLimit } from 'hono/body-limit'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { writeFile, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { parseUsers, verifyPassword, makeSession, readSession, tooMany } from './auth.ts'
import { toChunks, transcribe, formatNote } from './ai.ts'
import { save, type Draft, type Mode } from './notes.ts'
import { ask } from './ask.ts'

const secret = process.env.SESSION_SECRET ?? ''
if (secret.length < 24 || secret.startsWith('change-me')) throw new Error('Set SESSION_SECRET to a long random value')
const users = parseUsers(process.env.USERS ?? '')
const vault = process.env.VAULT_PATH ?? './vault'
const MODES: Mode[] = ['note', 'task', 'meeting']

export const app = new Hono<{ Variables: { user: string } }>()

app.post('/api/login', async (c) => {
  const ip = c.req.header('x-forwarded-for')?.split(',')[0].trim() ?? 'local'
  if (tooMany(ip)) return c.json({ error: 'Te veel pogingen, probeer later opnieuw' }, 429)
  const { user, password } = await c.req.json<{ user?: string; password?: string }>().catch(() => ({}) as never)
  const stored = users.get(user ?? '')
  // same response for unknown user and wrong password
  if (!stored || !verifyPassword(password ?? '', stored)) return c.json({ error: 'Onjuiste inloggegevens' }, 401)
  setCookie(c, 'session', makeSession(secret, user!), {
    httpOnly: true,
    sameSite: 'Strict',
    secure: c.req.header('x-forwarded-proto') === 'https',
    path: '/',
    maxAge: 30 * 86400,
  })
  return c.json({ user })
})

app.use('/api/*', async (c, next) => {
  const user = readSession(secret, getCookie(c, 'session'))
  if (!user || !users.has(user)) return c.json({ error: 'Niet ingelogd' }, 401)
  c.set('user', user)
  await next()
})

app.get('/api/me', (c) => c.json({ user: c.get('user') }))
app.post('/api/logout', (c) => (deleteCookie(c, 'session', { path: '/' }), c.json({ ok: true })))

// audio -> draft. Nothing touches the vault until the user saves at /api/notes.
app.post('/api/capture', bodyLimit({ maxSize: 100 * 1024 * 1024, onError: (c) => c.json({ error: 'Opname te groot' }, 413) }), async (c) => {
  const form = await c.req.parseBody()
  const mode = form.mode as Mode
  const audio = form.audio
  if (!MODES.includes(mode) || !(audio instanceof File)) return c.json({ error: 'mode en audio zijn verplicht' }, 400)
  const dir = await mkdtemp(join(tmpdir(), 'rec-'))
  const input = join(dir, 'in')
  await writeFile(input, Buffer.from(await audio.arrayBuffer()))
  try {
    const transcript = await transcribe(await toChunks(input))
    return c.json({ transcript, draft: await formatNote(mode, transcript) })
  } catch (e) {
    console.error(e)
    return c.json({ error: 'Transcriptie mislukt' }, 502)
  }
})

app.post('/api/notes', async (c) => {
  const d = await c.req.json<Draft>().catch(() => null)
  if (!d || !MODES.includes(d.mode) || !d.title?.trim() || typeof d.body !== 'string') return c.json({ error: 'Ongeldige notitie' }, 400)
  return c.json({ path: await save(vault, d, new Date().toISOString().slice(0, 10)) })
})

app.post('/api/ask', async (c) => {
  const { question } = await c.req.json<{ question?: string }>().catch(() => ({}) as { question?: string })
  if (!question?.trim() || question.length > 1000) return c.json({ error: 'Stel een vraag (max 1000 tekens)' }, 400)
  try {
    return c.json(await ask(vault, question.trim()))
  } catch (e) {
    console.error(e)
    return c.json({ error: 'Vraag beantwoorden mislukt' }, 502)
  }
})

app.use('*', serveStatic({ root: './web/dist' }))
app.get('*', serveStatic({ path: './web/dist/index.html' }))

if (process.env.NODE_ENV !== 'test') {
  serve({ fetch: app.fetch, port: Number(process.env.PORT ?? 3000) }, (i) => console.log(`dc-notes on :${i.port}`))
}
