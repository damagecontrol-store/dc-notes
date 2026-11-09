import { readFile } from 'node:fs/promises'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Draft, Mode } from './notes.ts'

const run = promisify(execFile)
const URL = 'https://openrouter.ai/api/v1/chat/completions'

export async function chat(model: string, content: unknown, json = false): Promise<string> {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      ...(json && { response_format: { type: 'json_object' } }),
    }),
  })
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const out = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = out.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenRouter returned no text')
  return text
}

// shortcut: 10 min mono mp3 chunks, the model's real audio limit is unverified; shrink SEGMENT_SECONDS if requests fail
const SEGMENT_SECONDS = 600
export async function toChunks(input: string): Promise<string[]> {
  const dir = await mkdtemp(join(tmpdir(), 'audio-'))
  await run('ffmpeg', ['-v', 'error', '-i', input, '-ac', '1', '-b:a', '48k', '-f', 'segment', '-segment_time', String(SEGMENT_SECONDS), join(dir, 'c%03d.mp3')])
  return (await readdir(dir)).sort().map((f) => join(dir, f))
}

export async function transcribe(files: string[]): Promise<string> {
  const parts: string[] = []
  for (const f of files) {
    const data = (await readFile(f)).toString('base64')
    parts.push(
      await chat(process.env.TRANSCRIBE_MODEL!, [
        { type: 'text', text: 'Transcribeer deze audio letterlijk in de gesproken taal (meestal Nederlands). Geef alleen de transcriptie, geen commentaar.' },
        { type: 'input_audio', input_audio: { data, format: 'mp3' } },
      ]),
    )
  }
  return parts.join('\n\n')
}

const SHAPE: Record<Mode, string> = {
  note: '{"title": korte titel, "body": opgeschoonde notitie in markdown}',
  task: '{"title": korte taaknaam, "body": markdown checklijst met "- [ ]" regels, "prio": Low|Medium|High|Extreme, "deadline": YYYY-MM-DD of weglaten}',
  meeting: '{"title": korte titel, "attendees": [namen], "body": markdown met koppen "## Agenda", "## Notes", "## Decisions", "## Action items" (action items als "- [ ]")}',
}

export async function formatNote(mode: Mode, transcript: string): Promise<Draft> {
  const raw = await chat(
    process.env.FORMAT_MODEL!,
    `Maak van deze transcriptie een ${mode}. Schrijf in dezelfde taal als de transcriptie, verzin niets. Antwoord alleen met JSON: ${SHAPE[mode]}\n\nVandaag: ${new Date().toISOString().slice(0, 10)}\n\nTRANSCRIPTIE:\n${transcript}`,
    true,
  )
  const j = JSON.parse(raw) as Partial<Draft>
  return { mode, title: String(j.title ?? 'Untitled'), body: String(j.body ?? transcript), prio: j.prio, deadline: j.deadline, attendees: j.attendees }
}
