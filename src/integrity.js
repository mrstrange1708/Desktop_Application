// Integrity score: 100 = clean. Every logged event costs points, and the cost fades with a
// half-life, so one slip recovers while repeated slips stack up.
//   integrity = 100 − Σ weight · 0.5^(age / halfLife)

export const HALF_LIFE_S = 120

// ponytail: hand-picked weights, tune once there is real exam data
export const WEIGHTS = {
  'focus-lost': 15,
  'quit-attempt': 25,
  'audio-warning': 25,
  'display-added': 30,
  'blocked-shortcut': 5,
  idle: 10,
}

// events: [{ type, at: ms timestamp }]
export function integrityScore(events, now) {
  let penalty = 0
  for (const { type, at } of events) {
    const weight = WEIGHTS[type]
    if (weight) penalty += weight * 0.5 ** (Math.max(0, now - at) / 1000 / HALF_LIFE_S)
  }
  return Math.max(0, Math.round(100 - penalty))
}
