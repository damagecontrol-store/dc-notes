import { test } from 'node:test'
import assert from 'node:assert/strict'
import { encodeWav } from './recorder.ts'

test('encodeWav writes a 16 kHz mono 16-bit header and clamped samples', () => {
  const buf = encodeWav(new Float32Array([0, 1, -1, 2]), 16000)
  const v = new DataView(buf)
  const ascii = (o: number) => String.fromCharCode(...new Uint8Array(buf, o, 4))
  assert.equal(buf.byteLength, 44 + 8)
  assert.deepEqual([ascii(0), ascii(8), ascii(12), ascii(36)], ['RIFF', 'WAVE', 'fmt ', 'data'])
  assert.equal(v.getUint32(4, true), 36 + 8)
  assert.equal(v.getUint16(20, true), 1)
  assert.equal(v.getUint16(22, true), 1)
  assert.equal(v.getUint32(24, true), 16000)
  assert.equal(v.getUint32(28, true), 32000)
  assert.equal(v.getUint16(34, true), 16)
  assert.equal(v.getUint32(40, true), 8)
  assert.deepEqual([1, 2, 3].map((i) => v.getInt16(44 + i * 2, true)), [32767, -32768, 32767])
})
