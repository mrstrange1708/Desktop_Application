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
// "no face" fires missingMs into the episode, "multiple faces" multipleMs after 2+ faces were
// first seen — judged independently, and repeated every limit while the episode lasts, so
// staying out of view keeps adding warnings (and reaches UFM) instead of warning once.
// ponytail: limits are fixed; look-aways shorter than missingMs are ignored on purpose
export function createFaceRule({ missingMs = 5000, multipleMs = 2000, clearMs = 1500 } = {}) {
  const kinds = ['multiple faces', 'no face']
  let inEpisode = false
  let lastBad = 0
  let due = {} // kind → time its next warning is due
  return (faces, now) => {
    if (faces !== 1) {
      if (!inEpisode) {
        inEpisode = true
        due = { 'no face': now + missingMs, 'multiple faces': Infinity }
      }
      if (faces > 1 && due['multiple faces'] === Infinity) due['multiple faces'] = now + multipleMs
      lastBad = now
    } else if (inEpisode && now - lastBad >= clearMs) {
      inEpisode = false
    }
    if (!inEpisode) return null

    const kind = kinds.find((k) => now >= due[k])
    if (!kind) return null
    // "no face" repeats on its own; "multiple faces" re-arms only when 2+ faces show up again.
    due[kind] = kind === 'no face' ? now + missingMs : Infinity
    return kind
  }
}
