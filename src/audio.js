// Background-audio detection. Three techniques run on every analyser frame:
//   1. loudness — RMS level well above the room's calibrated noise floor
//   2. speech   — most of the energy sits in the human voice band (300–3400 Hz)
//   3. music    — tonal spectrum (low spectral flatness) with energy outside the voice band
// A frame counts as "noisy" if any technique fires; a warning needs noise sustained for ~1.5 s.

export const FRAME_MS = 100
export const CALIBRATION_FRAMES = 30 // first 3 s of the exam = room noise floor

// ponytail: fixed heuristic thresholds, tune per mic/room if false positives show up
export const THRESHOLDS = {
  loudDb: 15,             // dB above the floor that counts as loud on its own
  activeDb: 8,            // dB above the floor before speech/music checks run
  voiceRatio: 0.65,       // share of energy in 300–3400 Hz that means speech
  flatness: 0.2,          // below this the spectrum is tonal (music, not noise)
  outsideVoiceRatio: 0.35, // share of energy outside the voice band that means music
  minFloorDb: -60,        // a silent room still gets a sane floor
}

export function rmsDb(samples) {
  let sum = 0
  for (const s of samples) sum += s * s
  return 10 * Math.log10(sum / samples.length + 1e-12)
}

// Median of the calibration levels — one cough during calibration doesn't skew it.
export function calibrate(levels) {
  const sorted = [...levels].sort((a, b) => a - b)
  return Math.max(sorted[Math.floor(sorted.length / 2)], THRESHOLDS.minFloorDb)
}

// samples: analyser.getFloatTimeDomainData, spectrumDb: analyser.getFloatFrequencyData
export function analyzeFrame(samples, spectrumDb, sampleRate, floorDb) {
  const level = rmsDb(samples)
  const quiet = { loud: false, speech: false, music: false }
  if (level < floorDb + THRESHOLDS.activeDb) return quiet

  const binHz = sampleRate / 2 / spectrumDb.length
  let total = 0, voice = 0, logSum = 0, bins = 0
  for (let i = Math.ceil(80 / binHz); i < Math.min(spectrumDb.length, 8000 / binHz); i++) {
    const power = 10 ** (spectrumDb[i] / 10)
    const hz = i * binHz
    total += power
    logSum += Math.log(power + 1e-20)
    bins++
    if (hz >= 300 && hz <= 3400) voice += power
  }
  if (total === 0) return quiet

  const voiceRatio = voice / total
  const flatness = Math.exp(logSum / bins) / (total / bins) // geometric / arithmetic mean
  return {
    loud: level > floorDb + THRESHOLDS.loudDb,
    speech: voiceRatio > THRESHOLDS.voiceRatio,
    music: flatness < THRESHOLDS.flatness && 1 - voiceRatio > THRESHOLDS.outsideVoiceRatio,
  }
}

// Leaky counter: noisy frames fill it, quiet frames drain it twice as fast.
// Returns true once when full, then ignores everything for the cooldown.
export function createSustainGate({ needFrames = 15, cooldownFrames = 50 } = {}) {
  let hot = 0
  let cool = 0
  return (noisy) => {
    if (cool > 0) {
      cool--
      return false
    }
    hot = noisy ? hot + 1 : Math.max(0, hot - 2)
    if (hot < needFrames) return false
    hot = 0
    cool = cooldownFrames
    return true
  }
}
