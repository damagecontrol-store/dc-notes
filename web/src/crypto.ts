// Shared by the browser (login) and Node (scripts/keys.ts); both have WebCrypto as globalThis.crypto.
export interface Sealed {
  salt: string
  iv: string
  ct: string
}

const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0))

async function derive(password: string, salt: Uint8Array<ArrayBuffer>) {
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 600_000 },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  )
}

export async function seal(secret: string, password: string): Promise<Sealed> {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await derive(password, salt), new TextEncoder().encode(secret))
  return { salt: b64(salt), iv: b64(iv), ct: b64(new Uint8Array(ct)) }
}

// AES-GCM authenticates, so a wrong password rejects instead of returning garbage.
export async function unseal(s: Sealed, password: string): Promise<string> {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(s.iv) }, await derive(password, unb64(s.salt)), unb64(s.ct))
  return new TextDecoder().decode(pt)
}
