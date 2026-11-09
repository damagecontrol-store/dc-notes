import { hashPassword } from './auth.ts'
const pw = process.argv[2]
if (!pw) throw new Error('usage: npm run hash -- <password>')
console.log(hashPassword(pw))
