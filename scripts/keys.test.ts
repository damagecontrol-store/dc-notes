import { test } from 'node:test'
import assert from 'node:assert/strict'
import { seal, unseal } from '../web/src/crypto.ts'

test('seal then unseal returns the secret, a wrong password throws', async () => {
  const s = await seal('sk-or-dummy', 'dummy-password')
  assert.equal(await unseal(s, 'dummy-password'), 'sk-or-dummy')
  await assert.rejects(unseal(s, 'wrong-password'))
})
