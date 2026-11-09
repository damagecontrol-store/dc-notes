// Browser port of server/ai.ts: calls OpenRouter directly with the key unlocked at login.
import type { Draft, Mode } from './notes.ts'
import { toWav } from './recorder.ts'

const URL = 'https://openrouter.ai/api/v1/chat/completions'
// No env at runtime on a static site; same values as .env.example.
const TRANSCRIBE_MODEL = 'google/gemini-3.5-flash-lite'
const FORMAT_MODEL = 'deepseek/deepseek-v4.1-flash'

export class Unauthorized extends Error {}

export async function chat(key: string, model: string, content: unknown, json = false): Promise<string> {
  const res = await fetch(URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: [{ role: 'user', content }],
      ...(json && { response_format: { type: 'json_object' } }),
    }),
  })
  if (res.status === 401) throw new Unauthorized('Sleutel geweigerd, log opnieuw in')
  if (!res.ok) throw new Error(`OpenRouter ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const out = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const text = out.choices?.[0]?.message?.content
  if (!text) throw new Error('OpenRouter gaf geen tekst terug')
  return text
}

// FileReader handles multi-MB blobs; String.fromCharCode(...bytes) would overflow the stack.
const base64 = (b: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve((r.result as string).split(',')[1])
    r.onerror = () => reject(r.error)
    r.readAsDataURL(b)
  })

// One segment at a time so only one decoded 5-minute WAV (~10 MB) is in memory.
// shortcut: a failure restarts all segments on retry, cache finished transcripts if long recordings fail often
export async function transcribe(key: string, segments: Blob[]): Promise<string> {
  const parts: string[] = []
  for (const s of segments) {
    const data = await base64(await toWav(s))
    parts.push(
      await chat(key, TRANSCRIBE_MODEL, [
        { type: 'text', text: 'Transcribeer deze audio letterlijk in de gesproken taal (meestal Nederlands). Geef alleen de transcriptie, geen commentaar.' },
        { type: 'input_audio', input_audio: { data, format: 'wav' } },
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

export async function formatNote(key: string, mode: Mode, transcript: string): Promise<Draft> {
  const raw = await chat(
    key,
    FORMAT_MODEL,
    `Maak van deze transcriptie een ${mode}. Schrijf in dezelfde taal als de transcriptie, verzin niets. Antwoord alleen met JSON: ${SHAPE[mode]}\n\nVandaag: ${new Date().toISOString().slice(0, 10)}\n\nTRANSCRIPTIE:\n${transcript}`,
    true,
  )
  const j = JSON.parse(raw) as Partial<Draft>
  return { mode, title: String(j.title ?? 'Untitled'), body: String(j.body ?? transcript), prio: j.prio, deadline: j.deadline, attendees: j.attendees }
}

// Translates the reviewed text, not the raw transcript, so edits made in the form survive.
export async function translate(key: string, d: Draft): Promise<Pick<Draft, 'title' | 'body'>> {
  const raw = await chat(
    key,
    FORMAT_MODEL,
    `Vertaal deze notitie naar het Engels. Behoud de markdown, "- [ ]" checklijsten, [[links]] en namen precies; verzin niets. Antwoord alleen met JSON: {"title": vertaalde titel, "body": vertaalde tekst}\n\n${JSON.stringify({ title: d.title, body: d.body })}`,
    true,
  )
  const j = JSON.parse(raw) as Partial<Draft>
  return { title: String(j.title ?? d.title), body: String(j.body ?? d.body) }
}
