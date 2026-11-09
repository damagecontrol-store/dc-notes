// iOS Safari records audio/mp4, Chrome/Android audio/webm; toWav() turns both into WAV that every model accepts.
// The recorder restarts every 5 minutes so each segment is a standalone file that decodes without
// holding a whole hour of PCM in memory.
// shortcut: a few ms of audio can drop at each restart, record continuously and slice PCM if that matters
const SEGMENT_MS = 5 * 60_000

export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  // A locked screen stops recording on iOS, so ask for a wake lock; it is best effort.
  const lock = await navigator.wakeLock?.request('screen').catch(() => null)
  const segments: Promise<Blob>[] = []
  let rec: MediaRecorder
  const begin = () => {
    const r = new MediaRecorder(stream)
    const parts: Blob[] = []
    r.ondataavailable = (e) => e.data.size && parts.push(e.data)
    segments.push(new Promise((resolve) => (r.onstop = () => resolve(new Blob(parts, { type: r.mimeType })))))
    r.start(1000)
    rec = r
  }
  begin()
  const timer = setInterval(() => (rec.stop(), begin()), SEGMENT_MS)
  return {
    stop: async (): Promise<Blob[]> => {
      clearInterval(timer)
      rec.stop()
      const out = await Promise.all(segments)
      stream.getTracks().forEach((t) => t.stop())
      lock?.release().catch(() => {})
      return out.filter((b) => b.size)
    },
  }
}
// shortcut: the audio lives in memory until transcribed, a killed tab loses it; persist segments to IndexedDB if that bites

const RATE = 16_000

// Decode, then render through a 1-channel 16 kHz context to downmix and resample in one go.
export async function toWav(blob: Blob): Promise<Blob> {
  const decoded = await new OfflineAudioContext(1, 1, RATE).decodeAudioData(await blob.arrayBuffer())
  const ctx = new OfflineAudioContext(1, Math.ceil(decoded.duration * RATE), RATE)
  const src = ctx.createBufferSource()
  src.buffer = decoded
  src.connect(ctx.destination)
  src.start()
  const out = await ctx.startRendering()
  return new Blob([encodeWav(out.getChannelData(0), RATE)], { type: 'audio/wav' })
}

// 44-byte RIFF header + 16-bit little-endian mono PCM.
export function encodeWav(samples: Float32Array, rate: number): ArrayBuffer {
  const v = new DataView(new ArrayBuffer(44 + samples.length * 2))
  const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVE')
  str(12, 'fmt ')
  v.setUint32(16, 16, true) // fmt chunk size
  v.setUint16(20, 1, true) // PCM
  v.setUint16(22, 1, true) // mono
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true) // byte rate
  v.setUint16(32, 2, true) // block align
  v.setUint16(34, 16, true) // bits per sample
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  samples.forEach((x, i) => {
    const s = Math.max(-1, Math.min(1, x))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  })
  return v.buffer
}
