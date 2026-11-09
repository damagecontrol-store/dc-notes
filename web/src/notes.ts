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
}

// Obsidian forbids these in file names; # ^ [ ] break links.
export const safeName = (t: string) =>
  t.replace(/[\\/:*?"<>|#^[\]]/g, '').replace(/\s+/g, ' ').trim().slice(0, 80) || 'Untitled'

const list = (xs: string[] = []) => (xs.length ? `\n${xs.map((x) => `  - ${JSON.stringify(x)}`).join('\n')}` : ' []')

// Frontmatter mirrors the real vault notes (dc-base + base_* fields), not Templates/.
export function render(d: Draft, date: string): string {
  const fm =
    d.mode === 'task'
      ? [
          'dc-base: "[[base_Tasks]]"',
          'status: Not started',
          'category: []',
          'assigned_to: []',
          `prio: ${PRIOS.includes(d.prio as never) ? d.prio : 'Medium'}`,
          ...(/^\d{4}-\d{2}-\d{2}$/.test(d.deadline ?? '') ? [`deadline: ${d.deadline}`] : []),
        ]
      : [
          `type: ${d.mode === 'meeting' ? 'Meeting' : 'Note'}`,
          `date: ${date}`,
          `attendees:${list(d.attendees)}`,
          'company: []',
          'status: not processed',
          'dc-base: "[[base_Notebook]]"',
        ]
  return `---\n${fm.join('\n')}\n---\n${d.body.trim()}\n`
}

export const folder = (m: Mode) => (m === 'task' ? 'Tasks' : 'Notebook')
