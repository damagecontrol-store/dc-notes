// Shared with server/notes.ts, which adds the fs-based save().
export type Mode = 'note' | 'task' | 'meeting'
export const PRIOS = ['Low', 'Medium', 'High', 'Extreme'] as const

export interface Draft {
  mode: Mode
  title: string
  body: string
  prio?: string
  deadline?: string
  attendees?: string[]
  status?: string
  category?: string[]
  assigned_to?: string[]
  company?: string[]
  date?: string
}

// Obsidian forbids these in file names; # ^ [ ] break links.
export const safeName = (t: string) =>
  t.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled'

const list = (xs: string[] = []) => (xs.length ? `\n${xs.map((x) => `  - ${JSON.stringify(x)}`).join('\n')}` : ' []')
// Free text from the review form must not break the YAML; plain values stay unquoted like in the vault.
const scalar = (s: string) => (/^[\p{L}\p{N} ._-]+$/u.test(s) ? s : JSON.stringify(s))
// assigned_to holds links to people notes in the vault: "[[Joël]]"
const link = (x: string) => (x.startsWith('[[') ? x : `[[${x}]]`)
const isDate = (s?: string) => /^\d{4}-\d{2}-\d{2}$/.test(s ?? '')

// Frontmatter mirrors the real vault notes (dc-base + base_* fields), not Templates/.
export function render(d: Draft, date: string): string {
  const fm =
    d.mode === 'task'
      ? [
          'dc-base: "[[base_Tasks]]"',
          `status: ${scalar(d.status?.trim() || 'Not started')}`,
          `category:${list(d.category)}`,
          `assigned_to:${list(d.assigned_to?.map(link))}`,
          `prio: ${PRIOS.includes(d.prio as never) ? d.prio : 'Medium'}`,
          ...(isDate(d.deadline) ? [`deadline: ${d.deadline}`] : []),
        ]
      : [
          `type: ${d.mode === 'meeting' ? 'Meeting' : 'Note'}`,
          `date: ${isDate(d.date) ? d.date : date}`,
          `attendees:${list(d.attendees)}`,
          `company:${list(d.company)}`,
          `status: ${scalar(d.status?.trim() || 'not processed')}`,
          'dc-base: "[[base_Notebook]]"',
        ]
  return `---\n${fm.join('\n')}\n---\n${d.body.trim()}\n`
}

export const folder = (m: Mode) => (m === 'task' ? 'Tasks' : 'Notebook')
