// Face presence via MediaPipe BlazeFace, fully on-device (model + wasm are bundled, no network).

export const FACE_CHECK_MS = 500

// Imported lazily so the rule below stays testable in plain Node.
export async function loadFaceDetector() {
  const [{ FaceDetector }, loader, binary, model] = await Promise.all([
    import('@mediapipe/tasks-vision'),
    import('@mediapipe/tasks-vision/vision_wasm_internal.js?url'),
    import('@mediapipe/tasks-vision/vision_wasm_internal.wasm?url'),
    import('./assets/blaze_face_short_range.tflite?inline'), // data: URL, so no file fetch is needed
  ])
  return FaceDetector.createFromOptions(
    { wasmLoaderPath: loader.default, wasmBinaryPath: binary.default },
    { baseOptions: { modelAssetPath: model.default, delegate: 'CPU' }, runningMode: 'VIDEO', minDetectionConfidence: 0.6 },
  )
}

// Fires once when "no face" or "2+ faces" has lasted its limit; re-arms when the condition changes.
// A bad episode only ends after clearMs of good frames, so detector flicker can't reset the timer.
// ponytail: limits are fixed; look-aways shorter than missingMs are ignored on purpose
export function createFaceRule({ missingMs = 5000, multipleMs = 2000, clearMs = 1500 } = {}) {
  let state = null
  let since = 0
  let lastBad = 0
  let fired = false
  return (faces, now) => {
    const seen = faces === 0 ? 'no face' : faces > 1 ? 'multiple faces' : null
    if (seen) lastBad = now
    const next = seen ?? (state && now - lastBad < clearMs ? state : null)
    if (next !== state) {
      state = next
      since = now
      fired = false
    }
    if (!state || fired || now - since < (state === 'no face' ? missingMs : multipleMs)) return null
    fired = true
    return state
  }
}
