// No backend: hand the note to Obsidian on the phone; LiveSync carries it to the vault.
import { folder, render, safeName, type Draft } from './notes.ts'

const VAULT = 'dc-notes-vault'

export function savedVault(): string {
  try {
    return localStorage.getItem(VAULT) ?? ''
  } catch {
    return ''
  }
}

const today = () => new Date().toISOString().slice(0, 10)

// The note travels in the URI itself: clipboard writes are refused by Safari too often to rely on.
export const obsidianUrl = (vault: string, d: Draft, date: string) =>
  `obsidian://new?vault=${encodeURIComponent(vault)}&file=${encodeURIComponent(`${folder(d.mode)}/${safeName(d.title)}`)}&content=${encodeURIComponent(render(d, date))}`

export async function toObsidian(vault: string, d: Draft): Promise<string> {
  try {
    localStorage.setItem(VAULT, vault)
  } catch {}
  location.href = obsidianUrl(vault, d, today())
  return `${folder(d.mode)}/${safeName(d.title)}`
}

// Manual fallback when the Obsidian URI does nothing: share sheet, else a download.
export async function shareFile(d: Draft) {
  const name = `${safeName(d.title)}.md`
  const file = new File([render(d, today())], name, { type: 'text/markdown' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      return await navigator.share({ files: [file] })
    } catch (e) {
      // cancelled: throw so the review stays open and nothing is lost
      if ((e as Error).name === 'AbortError') throw new Error('Delen geannuleerd')
    }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
}
