import { useEffect, useRef, useState } from 'react'
import { AppShell, MobileHeader, IconButton, Button, Stack, Container, Field, Input, PasswordInput, Textarea, NativeSelect, SegmentedControl, Alert, Text, Window, Led, Progress, ConfirmDialog, Logo, useToast } from '@damage-control/ui'
import logo from '@damage-control/ui/assets/dc-logo.png'
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
const label = (m: Mode) => MODES.find((x) => x.mode === m)!.label

// Ask is hidden until the backend exists; server/ask.ts is the reference for it.
type View =
  | { name: 'login' }
  | { name: 'home' }
  | { name: 'recording'; mode: Mode; since: number }
  | { name: 'processing'; mode: Mode; audio: Blob[]; done: number }
  | { name: 'review'; draft: Draft }

export function App() {
  const [session, setSession] = useState(auth.load)
  const [view, setView] = useState<View>(() => ({ name: session ? 'home' : 'login' }))
  const [error, setError] = useState('')
  const rec = useRef<Awaited<ReturnType<typeof startRecording>> | null>(null)
  const toast = useToast()

  const logout = () => (auth.logout(), setSession(null), setView({ name: 'login' }))
  // a key that OpenRouter rejects sends us back to the login screen
  const guard = (e: unknown) => (e instanceof Unauthorized ? logout() : setError((e as Error).message))
  const discard = () => (setError(''), setView({ name: 'home' }))

  const start = async (mode: Mode) => {
    setError('')
    try {
      rec.current = await startRecording()
      setView({ name: 'recording', mode, since: Date.now() })
    } catch {
      setError('Geen toegang tot de microfoon. Sta die toe in de instellingen van je browser.')
    }
  }
  const upload = async (mode: Mode, audio: Blob[]) => {
    setError('')
    setView({ name: 'processing', mode, audio, done: 0 })
    try {
      if (!audio.length) throw new Error('Er is niets opgenomen')
      const transcript = await transcribe(session!.key, audio, (done) => setView({ name: 'processing', mode, audio, done }))
      setView({ name: 'processing', mode, audio, done: audio.length })
      setView({ name: 'review', draft: await formatNote(session!.key, mode, transcript) })
    } catch (e) {
      guard(e)
      // keep the audio in the processing view so the user can retry
      if (!(e instanceof Unauthorized)) setView({ name: 'processing', mode, audio, done: 0 })
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
            <Window path={['Notes', 'Nieuw']}>
              <Stack gap={6}>
                <Text>Wat wil je vastleggen?</Text>
                {MODES.map(({ mode, label, icon: Icon }) => (
                  <Button key={mode} block size="lg" icon={<Icon aria-hidden />} onClick={() => start(mode)}>{label}</Button>
                ))}
              </Stack>
            </Window>
          )}

          {view.name === 'recording' && (
            <Window path={['Notes', label(view.mode)]}>
              <Stack gap={6}>
                <Led tone="danger" pulse label={<>Opname loopt · <Elapsed since={view.since} /></>} />
                <Text>Praat maar. Druk op stop als je klaar bent.</Text>
                <Button block size="lg" variant="danger" icon={<Square aria-hidden />} onClick={stop}>Stop</Button>
              </Stack>
            </Window>
          )}

          {view.name === 'processing' && (
            <Window path={['Notes', label(view.mode)]}>
              <Stack gap={6}>
                {error ? (
                  <Button block variant="accent" onClick={() => upload(view.mode, view.audio)}>Opnieuw proberen</Button>
                ) : view.done < view.audio.length ? (
                  <Progress value={view.done} max={view.audio.length} label={`Uitschrijven: deel ${view.done + 1} van ${view.audio.length}`} />
                ) : (
                  <Progress label="Notitie opmaken" />
                )}
                <Discard what="opname" onConfirm={discard} />
              </Stack>
            </Window>
          )}

          {view.name === 'review' && (
            <Review
              draft={view.draft}
              onCancel={discard}
              onSave={(d, vault) =>
                toObsidian(vault, d).then((path) => (toast({ title: 'Naar Obsidian gestuurd', description: path, tone: 'success' }), setView({ name: 'home' })), guard)
              }
              onShare={(d) => shareFile(d).catch(guard)}
              onTranslate={(d) => (setError(''), translate(session.key, d).catch(guard))}
            />
          )}
        </Stack>
      </Container>
    </AppShell>
  )
}

function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const s = Math.max(0, Math.floor((now - since) / 1000))
  return <>{Math.floor(s / 60)}:{String(s % 60).padStart(2, '0')}</>
}

// Throwing away a recording or draft cannot be undone, so it always asks first.
function Discard({ what, onConfirm }: { what: string; onConfirm: () => void }) {
  return (
    <ConfirmDialog
      title={`${what[0].toUpperCase()}${what.slice(1)} weggooien?`}
      description={`De ${what} is daarna weg en komt niet in Obsidian.`}
      confirmLabel="Weggooien"
      cancelLabel="Annuleren"
      danger
      onConfirm={onConfirm}
      trigger={<Button block variant="ghost">Weggooien</Button>}
    />
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
      <Stack gap={8}>
        {/* own centred Stack: the column's default stretch would distort the logo */}
        <Stack align="center"><Logo src={logo} /></Stack>
        <Window path={['Notes', 'Inloggen']}>
          <form onSubmit={submit}>
            <Stack gap={6}>
              {err && <Alert tone="danger">{err}</Alert>}
              <Field label="Gebruiker" required><Input value={user} onChange={(e) => setUser(e.target.value)} autoCapitalize="none" autoComplete="username" /></Field>
              <Field label="Wachtwoord" required><PasswordInput value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="current-password" /></Field>
              <Button type="submit" variant="accent" block loading={busy}>Inloggen</Button>
            </Stack>
          </form>
        </Window>
      </Stack>
    </Container>
  )
}

// shortcut: own comma field instead of the design system's TagInput, which drops unconfirmed text on save
// and relies on a ',' keydown that Android keyboards often do not send; switch once TagInput handles both.
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
    <Window path={['Notes', label(d.mode), 'Controle']}>
      <Stack gap={6}>
        <Field label="Soort"><SegmentedControl options={MODE_OPTIONS} value={d.mode} onValueChange={(mode) => set({ mode: mode as Mode })} aria-label="Soort" /></Field>
        <Field label="Titel" required><Input value={d.title} onChange={(e) => set({ title: e.target.value })} /></Field>
        {d.mode === 'task' ? (
          <>
            <Field label="Status"><Input value={d.status ?? 'Not started'} onChange={(e) => set({ status: e.target.value })} /></Field>
            <Field label="Prioriteit">
              <NativeSelect value={d.prio ?? 'Medium'} onChange={(e) => set({ prio: e.target.value })}>
                {PRIOS.map((p) => <option key={p} value={p}>{p}</option>)}
              </NativeSelect>
            </Field>
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
        <Field label="Obsidian-vault" hint="Precies zoals de vault in Obsidian heet; wordt onthouden" required>
          <Input value={vault} onChange={(e) => setVault(e.target.value)} autoCapitalize="none" />
        </Field>
        {/* onSave must run synchronously in this tap: browsers only open app links from a user gesture */}
        <Button block variant="accent" loading={busy} disabled={!d.title.trim() || !vault.trim() || translating} onClick={async () => (setBusy(true), await onSave(d, vault.trim()), setBusy(false))}>Bewaar in Obsidian</Button>
        <Button block variant="secondary" disabled={!d.title.trim()} onClick={() => onShare(d)}>Deel als bestand</Button>
        <Discard what="notitie" onConfirm={onCancel} />
      </Stack>
    </Window>
  )
}
