import { useRef, useState } from 'react'
import { AppShell, MobileHeader, IconButton, Button, Stack, Container, Field, Input, PasswordInput, Textarea, Select, Alert, Text, Heading, Spinner } from '@damage-control/ui'
import { LogOut, Mic, Square, FileText, ListChecks, Users, Languages } from 'lucide-react'
import * as auth from './auth.ts'
import { formatNote, transcribe, translate, Unauthorized } from './ai.ts'
import { startRecording } from './recorder.ts'
import { savedVault, shareFile, toObsidian } from './save.ts'
import { PRIOS, type Draft, type Mode } from './notes.ts'

const MODES: { mode: Mode; label: string; icon: typeof Mic }[] = [
  { mode: 'note', label: 'Notitie', icon: FileText },
  { mode: 'task', label: 'Taak', icon: ListChecks },
  { mode: 'meeting', label: 'Meeting', icon: Users },
]
const PRIO_OPTIONS = PRIOS.map((p) => ({ value: p, label: p }))

// Ask is hidden until the backend exists; server/ask.ts is the reference for it.
type View =
  | { name: 'login' }
  | { name: 'home'; saved?: string }
  | { name: 'recording'; mode: Mode }
  | { name: 'processing'; mode: Mode; audio: Blob[] }
  | { name: 'review'; draft: Draft }

export function App() {
  const [session, setSession] = useState(auth.load)
  const [view, setView] = useState<View>(() => ({ name: session ? 'home' : 'login' }))
  const [error, setError] = useState('')
  const rec = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null)

  const logout = () => (auth.logout(), setSession(null), setView({ name: 'login' }))
  // a key that OpenRouter rejects sends us back to the login screen
  const guard = (e: unknown) => (e instanceof Unauthorized ? logout() : setError((e as Error).message))

  const start = async (mode: Mode) => {
    setError('')
    try {
      rec.current = await startRecording()
      setView({ name: 'recording', mode })
    } catch {
      setError('Geen toegang tot de microfoon. Sta die toe in de instellingen van je browser.')
    }
  }
  const upload = async (mode: Mode, audio: Blob[]) => {
    setError('')
    setView({ name: 'processing', mode, audio })
    try {
      if (!audio.length) throw new Error('Er is niets opgenomen')
      const transcript = await transcribe(session!.key, audio)
      setView({ name: 'review', draft: await formatNote(session!.key, mode, transcript) })
    } catch (e) {
      guard(e)
      // keep the audio in the processing view so the user can retry
      if (!(e instanceof Unauthorized)) setView({ name: 'processing', mode, audio })
    }
  }
  const stop = async () => view.name === 'recording' && upload(view.mode, await rec.current!.stop())

  if (view.name === 'login' || !session) return <Login onDone={(s) => (setSession(s), setView({ name: 'home' }))} />

  return (
    <AppShell
      header={
        <MobileHeader
          title="DC Notes"
          path={[session.user]}
          trailing={<IconButton label="Uitloggen" variant="ghost" onClick={logout}><LogOut aria-hidden /></IconButton>}
        />
      }
    >
      <Container size="narrow">
        <Stack gap={8}>
          {error && <Alert tone="danger" onDismiss={() => setError('')}>{error}</Alert>}

          {view.name === 'home' && (
            <Stack gap={6}>
              {view.saved && <Alert tone="success">Naar Obsidian gestuurd als {view.saved}</Alert>}
              <Heading level={2}>Wat wil je vastleggen?</Heading>
              {MODES.map(({ mode, label, icon: Icon }) => (
                <Button key={mode} block size="lg" icon={<Icon aria-hidden />} onClick={() => start(mode)}>{label}</Button>
              ))}
            </Stack>
          )}

          {view.name === 'recording' && (
            <Stack gap={6}>
              <Heading level={2}>Aan het opnemen</Heading>
              <Text>Praat maar. Druk op stop als je klaar bent.</Text>
              <Button block size="lg" variant="danger" icon={<Square aria-hidden />} onClick={stop}>Stop</Button>
            </Stack>
          )}

          {view.name === 'processing' && (
            <Stack gap={6}>
              {error ? (
                <Button block onClick={() => upload(view.mode, view.audio)}>Opnieuw proberen</Button>
              ) : (
                <><Spinner /><Text>Bezig met uitschrijven…</Text></>
              )}
              <Button block variant="ghost" onClick={() => (setError(''), setView({ name: 'home' }))}>Weggooien</Button>
            </Stack>
          )}

          {view.name === 'review' && (
            <Review
              draft={view.draft}
              onCancel={() => setView({ name: 'home' })}
              onSave={(d, vault) => toObsidian(vault, d).then((path) => setView({ name: 'home', saved: path }), guard)}
              onShare={(d) => shareFile(d).catch(guard)}
              onTranslate={(d) => (setError(''), translate(session.key, d).catch(guard))}
            />
          )}
        </Stack>
      </Container>
    </AppShell>
  )
}

function Login({ onDone }: { onDone: (s: auth.Session) => void }) {
  const [user, setUser] = useState('')
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setErr('')
    try { onDone(await auth.login(user, pw)) } catch (x) { setErr((x as Error).message) } finally { setBusy(false) }
  }
  return (
    <Container size="narrow">
      <form onSubmit={submit}>
        <Stack gap={6}>
          <Heading level={2}>Inloggen</Heading>
          {err && <Alert tone="danger">{err}</Alert>}
          <Field label="Gebruiker"><Input value={user} onChange={(e) => setUser(e.target.value)} autoCapitalize="none" autoComplete="username" /></Field>
          <Field label="Wachtwoord"><PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
          <Button type="submit" block loading={busy}>Inloggen</Button>
        </Stack>
      </form>
    </Container>
  )
}

// Comma-separated list; keeps its own text so typing "a, " is not reformatted mid-word.
function ListField({ label, value, onChange }: { label: string; value?: string[]; onChange: (v: string[]) => void }) {
  const [text, setText] = useState(value?.join(', ') ?? '')
  return (
    <Field label={label} hint="Gescheiden met komma's">
      <Input value={text} onChange={(e) => (setText(e.target.value), onChange(e.target.value.split(',').map((s) => s.trim()).filter(Boolean)))} />
    </Field>
  )
}

const MODE_OPTIONS = MODES.map(({ mode, label }) => ({ value: mode, label }))
const today = () => new Date().toISOString().slice(0, 10)

function Review({ draft, onSave, onShare, onTranslate, onCancel }: {
  draft: Draft
  onSave: (d: Draft, vault: string) => Promise<unknown>
  onShare: (d: Draft) => Promise<unknown>
  onTranslate: (d: Draft) => Promise<Pick<Draft, 'title' | 'body'> | void>
  onCancel: () => void
}) {
  const [d, setD] = useState(draft)
  const [vault, setVault] = useState(savedVault)
  const [busy, setBusy] = useState(false)
  const [translating, setTranslating] = useState(false)
  const set = (p: Partial<Draft>) => setD((x) => ({ ...x, ...p }))
  const toEnglish = async () => {
    setTranslating(true)
    const t = await onTranslate(d)
    if (t) set(t)
    setTranslating(false)
  }
  return (
    <Stack gap={6}>
      <Heading level={2}>Controleer en bewaar</Heading>
      <Field label="Soort"><Select options={MODE_OPTIONS} value={d.mode} onValueChange={(mode) => set({ mode: mode as Mode })} aria-label="Soort" /></Field>
      <Field label="Titel"><Input value={d.title} onChange={(e) => set({ title: e.target.value })} /></Field>
      {d.mode === 'task' ? (
        <>
          <Field label="Status"><Input value={d.status ?? 'Not started'} onChange={(e) => set({ status: e.target.value })} /></Field>
          <Field label="Prioriteit"><Select options={PRIO_OPTIONS} value={d.prio ?? 'Medium'} onValueChange={(prio) => set({ prio })} aria-label="Prioriteit" /></Field>
          <Field label="Deadline"><Input type="date" value={d.deadline ?? ''} onChange={(e) => set({ deadline: e.target.value || undefined })} /></Field>
          <ListField label="Categorie" value={d.category} onChange={(category) => set({ category })} />
          <ListField label="Toegewezen aan" value={d.assigned_to} onChange={(assigned_to) => set({ assigned_to })} />
        </>
      ) : (
        <>
          <Field label="Datum"><Input type="date" value={d.date ?? today()} onChange={(e) => set({ date: e.target.value || undefined })} /></Field>
          <Field label="Status"><Input value={d.status ?? 'not processed'} onChange={(e) => set({ status: e.target.value })} /></Field>
          <ListField label="Aanwezigen" value={d.attendees} onChange={(attendees) => set({ attendees })} />
          <ListField label="Bedrijf" value={d.company} onChange={(company) => set({ company })} />
        </>
      )}
      <Field label="Tekst"><Textarea rows={14} value={d.body} onChange={(e) => set({ body: e.target.value })} /></Field>
      <Button block variant="secondary" icon={<Languages aria-hidden />} loading={translating} disabled={!d.body.trim()} onClick={toEnglish}>Vertaal naar Engels</Button>
      <Field label="Obsidian-vault" hint="Precies zoals de vault in Obsidian heet; wordt onthouden">
        <Input value={vault} onChange={(e) => setVault(e.target.value)} autoCapitalize="none" />
      </Field>
      {/* onSave must run synchronously in this tap: browsers only open app links from a user gesture */}
      <Button block loading={busy} disabled={!d.title.trim() || !vault.trim() || translating} onClick={async () => (setBusy(true), await onSave(d, vault.trim()), setBusy(false))}>Bewaar in Obsidian</Button>
      <Button block variant="secondary" disabled={!d.title.trim()} onClick={() => onShare(d)}>Deel als bestand</Button>
      <Button block variant="ghost" onClick={onCancel}>Weggooien</Button>
    </Stack>
  )
}
