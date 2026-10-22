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

test('a face coming back re-arms the rule', () => {
  const rule = createFaceRule({ missingMs: 1000 })
  assert.deepEqual(run(rule, [[0, 0], [0, 1000], [1, 1500], [0, 2000], [0, 3000]]), ['no face', 'no face'])
})

test('multiple faces use their own, shorter limit', () => {
  const rule = createFaceRule({ missingMs: 5000, multipleMs: 2000 })
  assert.deepEqual(run(rule, [[2, 0], [2, 1999], [3, 2000]]), ['multiple faces'])
})

test('brief look-away is ignored', () => {
  const rule = createFaceRule({ missingMs: 5000 })
  assert.deepEqual(run(rule, [[0, 0], [0, 3000], [1, 3500], [0, 4000], [0, 8000]]), [])
})
