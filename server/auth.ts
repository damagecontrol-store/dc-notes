import { scryptSync, randomBytes, timingSafeEqual, createHmac } from 'node:crypto'

export function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString('hex')
  return `${salt}:${scryptSync(pw, salt, 32).toString('hex')}`
}

export function verifyPassword(pw: string, stored: string): boolean {
  const [salt, hash] = stored.split(':')
  if (!salt || !hash) return false
  const a = scryptSync(pw, salt, 32)
  const b = Buffer.from(hash, 'hex')
  return a.length === b.length && timingSafeEqual(a, b)
}

// USERS="ertugrul:salt:hash,joel:salt:hash"
export function parseUsers(env: string): Map<string, string> {
  return new Map(
    env.split(',').filter(Boolean).map((e) => {
      const i = e.indexOf(':')
      return [e.slice(0, i), e.slice(i + 1)] as [string, string]
    }),
  )
}

const sign = (secret: string, v: string) => createHmac('sha256', secret).update(v).digest('base64url')

export const makeSession = (secret: string, user: string, ttlMs = 30 * 864e5) => {
  const v = `${user}|${Date.now() + ttlMs}`
  return `${Buffer.from(v).toString('base64url')}.${sign(secret, v)}`
}

export function readSession(secret: string, token?: string): string | null {
  const [p, sig] = (token ?? '').split('.')
  if (!p || !sig) return null
  const v = Buffer.from(p, 'base64url').toString()
  const good = sign(secret, v)
  if (sig.length !== good.length || !timingSafeEqual(Buffer.from(sig), Buffer.from(good))) return null
  const [user, exp] = v.split('|')
  return Number(exp) > Date.now() ? user : null
}

// shortcut: in-memory per-IP counter, resets on restart; move to a store if we ever run >1 instance
const tries = new Map<string, { n: number; reset: number }>()
export function tooMany(ip: string, max = 10, windowMs = 15 * 60e3): boolean {
  const now = Date.now()
  const t = tries.get(ip)
  if (!t || t.reset < now) return tries.set(ip, { n: 1, reset: now + windowMs }), false
  return ++t.n > max
}
