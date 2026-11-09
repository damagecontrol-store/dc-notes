// A password unlocks the OpenRouter key sealed in keys.json (see scripts/keys.ts); there is no server.
import { unseal, type Sealed } from './crypto.ts'

export interface Session {
  user: string
  key: string
}

const STORE = 'dc-notes-session'

// Storage can throw (private mode, blocked site data); then the user simply logs in again.
export function load(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? 'null')
  } catch {
    return null
  }
}

export function logout() {
  try {
    localStorage.removeItem(STORE)
  } catch {}
}

export async function login(name: string, password: string): Promise<Session> {
  const res = await fetch(`${import.meta.env.BASE_URL}keys.json`, { cache: 'no-store' })
  if (!res.ok) throw new Error('Sleutelbestand niet gevonden')
  const keys = (await res.json()) as Record<string, Sealed>
  const user = name.trim().toLowerCase()
  let key: string
  try {
    if (!Object.hasOwn(keys, user)) throw new Error()
    key = await unseal(keys[user], password)
  } catch {
    // same message for unknown user and wrong password
    throw new Error('Onjuiste inloggegevens')
  }
  const s = { user, key }
  try {
    localStorage.setItem(STORE, JSON.stringify(s))
  } catch {}
  return s
}
