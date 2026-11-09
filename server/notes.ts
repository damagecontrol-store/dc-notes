import { writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { folder, render, safeName, type Draft } from '../web/src/notes.ts'

export * from '../web/src/notes.ts'

// flag 'wx' never overwrites; on a name clash we add " 2", " 3"...
export async function save(vault: string, d: Draft, date: string): Promise<string> {
  const dir = join(vault, folder(d.mode))
  await mkdir(dir, { recursive: true })
  const base = safeName(d.title)
  for (let n = 1; ; n++) {
    const rel = `${folder(d.mode)}/${n === 1 ? base : `${base} ${n}`}.md`
    try {
      await writeFile(join(vault, rel), render(d, date), { flag: 'wx' })
      return rel
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST' || n > 50) throw e
    }
  }
}
