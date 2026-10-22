import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createFaceRule } from './face.js'

const run = (rule, frames) => frames.map(([faces, t]) => rule(faces, t)).filter(Boolean)

test('no face fires once after the limit, not before', () => {
  const rule = createFaceRule({ missingMs: 5000 })
  assert.deepEqual(run(rule, [[1, 0], [0, 1000], [0, 5500], [0, 5999]]), [])
  assert.deepEqual(run(rule, [[0, 6000], [0, 7000]]), ['no face'])
  assert.deepEqual(run(rule, [[0, 20000]]), []) // same episode, no repeat
})

test('a face back for clearMs ends the episode and re-arms the rule', () => {
  const rule = createFaceRule({ missingMs: 1000, clearMs: 1500 })
  assert.deepEqual(run(rule, [[0, 0], [0, 1000], [1, 1500], [1, 3000], [0, 3500], [0, 4500]]), ['no face', 'no face'])
})

test('flickering detections do not reset the timer', () => {
  const rule = createFaceRule({ missingMs: 5000, clearMs: 1500 })
  const flicker = Array.from({ length: 12 }, (_, i) => [i % 2, i * 500]) // 0,1,0,1… every 500 ms
  assert.deepEqual(run(rule, flicker), ['no face'])
})

test('multiple faces use their own, shorter limit', () => {
  const rule = createFaceRule({ missingMs: 5000, multipleMs: 2000 })
  assert.deepEqual(run(rule, [[2, 0], [2, 1999], [3, 2000]]), ['multiple faces'])
})

test('a short look-away is ignored', () => {
  const rule = createFaceRule({ missingMs: 5000, clearMs: 1500 })
  assert.deepEqual(run(rule, [[0, 0], [0, 3000], [1, 3500], [1, 5000], [0, 5500], [0, 9000]]), [])
})
