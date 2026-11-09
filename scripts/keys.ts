// Generates one password per user and writes web/public/keys.json with the OpenRouter key sealed per password.
// Prints the passwords once; they are not stored anywhere else.
import { writeFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { seal, type Sealed } from '../web/src/crypto.ts'

const USERS = ['ertugrul', 'joel']
const key = process.env.OPENROUTER_API_KEY
if (!key) throw new Error('OPENROUTER_API_KEY is empty in .env')

const out: Record<string, Sealed> = {}
for (const user of USERS) {
  const password = randomBytes(18).toString('base64url') // 24 characters
  out[user] = await seal(key, password)
  console.log(`${user}: ${password}`)
}
await writeFile('web/public/keys.json', JSON.stringify(out, null, 2) + '\n')
console.log('Wrote web/public/keys.json. Save these passwords now, they are not shown again.')
