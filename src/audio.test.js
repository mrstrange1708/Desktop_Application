import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeFrame, calibrate, createSustainGate } from './audio.js'

const RATE = 48000
const BINS = 1024
const binOf = (hz) => Math.round(hz / (RATE / 2 / BINS))

const samples = (amplitude) => new Float32Array(2048).fill(amplitude)
function spectrum(peaksHz, base = -120) {
  const s = new Float32Array(BINS).fill(base)
  for (const hz of peaksHz) s[binOf(hz)] = -20
  return s
}

test('quiet room triggers nothing', () => {
  assert.deepEqual(analyzeFrame(samples(0.0005), spectrum([1000]), RATE, -60), { loud: false, speech: false, music: false })
})

test('voice-band harmonics = speech', () => {
  const r = analyzeFrame(samples(0.2), spectrum([500, 1000, 1500, 2000]), RATE, -60)
  assert.equal(r.speech, true)
  assert.equal(r.music, false)
  assert.equal(r.loud, true)
})

test('tones with bass + highs = music', () => {
  const r = analyzeFrame(samples(0.2), spectrum([110, 220, 5000, 6500]), RATE, -60)
  assert.equal(r.music, true)
  assert.equal(r.speech, false)
})

test('broadband noise is loud but neither speech nor music', () => {
  const r = analyzeFrame(samples(0.2), new Float32Array(BINS).fill(-30), RATE, -60)
  assert.deepEqual(r, { loud: true, speech: false, music: false })
})

test('calibrate uses the median and clamps a silent room', () => {
  assert.equal(calibrate([-50, -45, -90, -48, -47]), -48)
  assert.equal(calibrate([-90, -95, -92]), -60)
})

test('gate fires once after sustained noise, then cools down', () => {
  const gate = createSustainGate({ needFrames: 3, cooldownFrames: 2 })
  assert.deepEqual([true, true, true].map(gate), [false, false, true])
  assert.deepEqual([true, true].map(gate), [false, false]) // cooldown
  assert.deepEqual([true, true, true].map(gate), [false, false, true])
})

test('gate ignores short bursts', () => {
  const gate = createSustainGate({ needFrames: 3 })
  assert.equal([true, true, false, true, false, true, true].some(gate), false)
})
