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

// One "bad episode" = any run of frames without exactly one face. It only ends after clearMs of
// good frames, so neither detector flicker nor switching between 0 and 2+ faces resets it.
// Fires "multiple faces" once 2+ faces were first seen multipleMs ago, "no face" once the episode
// is missingMs old; each at most once per episode.
// ponytail: limits are fixed; look-aways shorter than missingMs are ignored on purpose
export function createFaceRule({ missingMs = 5000, multipleMs = 2000, clearMs = 1500 } = {}) {
  let start = null // episode start, null = all good
  let multipleSince = null
  let lastBad = 0
  let fired = new Set()
  return (faces, now) => {
    if (faces !== 1) {
      if (start === null) {
        start = now
        multipleSince = null
        fired = new Set()
      }
      if (faces > 1) multipleSince ??= now
      lastBad = now
    } else if (start !== null && now - lastBad >= clearMs) {
      start = null
    }
    if (start === null) return null

    const kind = multipleSince !== null && now - multipleSince >= multipleMs ? 'multiple faces'
      : now - start >= missingMs ? 'no face'
        : null
    if (!kind || fired.has(kind)) return null
    fired.add(kind)
    return kind
  }
}
