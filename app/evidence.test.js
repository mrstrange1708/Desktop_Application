import { test } from 'node:test'
import assert from 'node:assert/strict'
import { GENESIS, chainEntry, verifyChain, dHash, hamming } from './evidence.js'

function buildLog(entries) {
  let prev = GENESIS
  return entries.map((entry) => {
    const line = chainEntry(prev, entry)
    prev = line.hash
    return JSON.stringify(line)
  })
}

test('intact chain verifies', () => {
  const lines = buildLog([{ type: 'exam-start' }, { type: 'focus-lost' }, { type: 'submitted', score: 4 }])
  assert.deepEqual(verifyChain(lines.join('\n') + '\n'), { ok: true, entries: 3 })
})

test('edited, deleted or garbage lines break the chain', () => {
  const lines = buildLog([{ type: 'exam-start' }, { type: 'ufm', score: 0 }, { type: 'exam-end' }])
  const edited = [...lines]
  edited[1] = edited[1].replace('"score":0', '"score":5')
  assert.deepEqual(verifyChain(edited.join('\n')), { ok: false, entries: 3, brokenAt: 2 })
  assert.equal(verifyChain([lines[0], lines[2]].join('\n')).brokenAt, 2)
  assert.equal(verifyChain([lines[0], 'not json'].join('\n')).brokenAt, 2)
})

test('dHash: same image → distance 0, small noise → small, new content → large', () => {
  const base = Uint8Array.from({ length: 72 }, (_, i) => (i * 37) % 256)
  const noisy = base.map((v, i) => (i === 10 ? v + 1 : v))
  const inverted = base.map((v) => 255 - v)
  assert.equal(hamming(dHash(base), dHash(base)), 0)
  assert.ok(hamming(dHash(base), dHash(noisy)) <= 2)
  assert.ok(hamming(dHash(base), dHash(inverted)) > 40)
})
