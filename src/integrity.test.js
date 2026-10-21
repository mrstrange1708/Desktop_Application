import { test } from 'node:test'
import assert from 'node:assert/strict'
import { HALF_LIFE_S, integrityScore } from './integrity.js'

const now = 1_000_000
const ago = (s) => now - s * 1000

test('clean exam is 100, unweighted events are free', () => {
  assert.equal(integrityScore([], now), 100)
  assert.equal(integrityScore([{ type: 'exam-start', at: ago(5) }], now), 100)
})

test('a fresh event costs its full weight and halves every half-life', () => {
  assert.equal(integrityScore([{ type: 'audio-warning', at: now }], now), 75)
  assert.equal(integrityScore([{ type: 'audio-warning', at: ago(HALF_LIFE_S) }], now), 88)
  assert.equal(integrityScore([{ type: 'audio-warning', at: ago(HALF_LIFE_S * 10) }], now), 100)
})

test('repeated events stack and the score floors at 0', () => {
  const burst = Array.from({ length: 3 }, () => ({ type: 'focus-lost', at: now }))
  assert.equal(integrityScore(burst, now), 55)
  const flood = Array.from({ length: 10 }, () => ({ type: 'display-added', at: now }))
  assert.equal(integrityScore(flood, now), 0)
})
