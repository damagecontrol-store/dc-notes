import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hashPassword, verifyPassword, makeSession, readSession, parseUsers, tooMany } from './auth.ts'

test('password round trip', () => {
  const h = hashPassword('geheim')
  assert.ok(verifyPassword('geheim', h))
  assert.ok(!verifyPassword('fout', h))
  assert.ok(!verifyPassword('x', 'kapot'))
})

test('session signs, expires and rejects tampering', () => {
  const t = makeSession('s3cret', 'joel')
  assert.equal(readSession('s3cret', t), 'joel')
  assert.equal(readSession('other', t), null)
  assert.equal(readSession('s3cret', t.slice(0, -2) + 'xx'), null)
  assert.equal(readSession('s3cret', makeSession('s3cret', 'joel', -1)), null)
  assert.equal(readSession('s3cret', undefined), null)
})

test('parseUsers keeps salt:hash intact', () => {
  assert.equal(parseUsers('a:s:h,b:s2:h2').get('b'), 's2:h2')
})

test('login rate limit trips after 10', () => {
  const r = Array.from({ length: 11 }, () => tooMany('1.2.3.4'))
  assert.deepEqual([r[9], r[10]], [false, true])
})
