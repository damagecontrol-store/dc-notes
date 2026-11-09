import { readdir, readFile, stat } from 'node:fs/promises'
import { join, basename } from 'node:path'
import { chat } from './ai.ts'

// shortcut: whole vault goes in one prompt, no search index; add SQLite FTS5 once the vault outgrows MAX_CHARS
const MAX_CHARS = 2_000_000 // about 500k tokens, well inside deepseek's 1M context

async function* mdFiles(dir: string, root = dir): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.')) continue // .obsidian, .git
    const p = join(dir, e.name)
    if (e.isDirectory()) yield* mdFiles(p, root)
    else if (e.name.endsWith('.md')) yield p.slice(root.length + 1)
  }
}

// newest notes first, so if the vault is too big the oldest ones are dropped
export async function loadVault(vault: string): Promise<{ path: string; text: string }[]> {
  const files = await Promise.all(
    (await Array.fromAsync(mdFiles(vault))).map(async (path) => ({ path, mtime: (await stat(join(vault, path))).mtimeMs })),
  )
  const out: { path: string; text: string }[] = []
  let size = 0
  for (const f of files.sort((a, b) => b.mtime - a.mtime)) {
    const text = await readFile(join(vault, f.path), 'utf8')
    if (size + text.length > MAX_CHARS) continue
    size += text.length
    out.push({ path: f.path, text })
  }
  return out
}

export const sourcesIn = (answer: string, paths: string[]) => {
  const names = new Set([...answer.matchAll(/\[\[([^\]|#]+)/g)].map((m) => m[1].trim()))
  return paths.filter((p) => names.has(basename(p, '.md')))
}

export async function ask(vault: string, question: string) {
  const notes = await loadVault(vault)
  if (!notes.length) return { answer: 'De vault is leeg.', sources: [] }
  const context = notes.map((n) => `=== ${n.path} ===\n${n.text}`).join('\n\n')
  const answer = await chat(
    process.env.ASK_MODEL ?? 'deepseek/deepseek-v4.1-flash',
    `Je beantwoordt vragen over de Obsidian-vault van Damage Control. Antwoord kort, in de taal van de vraag, en alleen op basis van de notities hieronder. Staat het antwoord er niet in, zeg dat dan. Verwijs naar notities als [[Notitienaam]] (bestandsnaam zonder .md).\n\nVRAAG: ${question}\n\nNOTITIES:\n${context}`,
  )
  return { answer, sources: sourcesIn(answer, notes.map((n) => n.path)) }
}
