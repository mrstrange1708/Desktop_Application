import { useEffect, useState } from 'react'
import { integrityScore } from './integrity.js'

const LABELS = {
  'exam-start': 'Exam started',
  'focus-lost': 'Left the exam window',
  'focus-back': 'Returned to the exam window',
  'quit-attempt': 'Tried to quit',
  'audio-warning': (e) => `Audio warning ${e.n}: ${e.kind}`,
  'face-warning': (e) => `Camera warning ${e.n}: ${e.kind}`,
  'blocked-shortcut': (e) => `Blocked shortcut ${e.key}`,
  idle: (e) => `Idle for ${e.seconds} s`,
  'display-added': 'Extra display connected',
  'capture-error': (e) => `Capture failed (${e.source}): ${e.message}`,
  submitted: 'Submitted',
  ufm: (e) => `Marked UFM: ${e.reason}`,
  'exam-end': 'Exam ended',
}
const FLAGGED = new Set(['focus-lost', 'quit-attempt', 'audio-warning', 'face-warning', 'blocked-shortcut', 'idle', 'display-added', 'capture-error', 'ufm'])

const offset = (ms) => `${String(Math.floor(ms / 60000)).padStart(2, '0')}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`

// Integrity sampled across the exam, drawn as a 0–100 line.
function IntegrityGraph({ events, start, end }) {
  const width = 560
  const height = 96
  const steps = 120
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const t = start + ((end - start) * i) / steps
    const score = integrityScore(events.filter((e) => e.at <= t), t)
    return `${((i / steps) * width).toFixed(1)},${(height - (score / 100) * height).toFixed(1)}`
  })
  return (
    <svg className="graph" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label="Integrity over the exam">
      <line x1="0" y1={height / 2} x2={width} y2={height / 2} className="graph-mid" />
      <polyline points={points.join(' ')} className="graph-line" />
    </svg>
  )
}

export default function Result({ status, reason, score, total, lowestIntegrity, sessionDir }) {
  const ufm = status === 'ufm'
  const [report, setReport] = useState(null) // { chain: { ok, entries, brokenAt? }, events }

  useEffect(() => {
    window.proctor.sessionReport().then(setReport)
  }, [])

  const events = (report?.events ?? []).map((e) => ({ ...e, at: Date.parse(e.at) }))
  const start = events.find((e) => e.type === 'exam-start')?.at ?? events[0]?.at
  const end = events.at(-1)?.at
  const timeline = events.filter((e) => LABELS[e.type])
  const skipped = events.filter((e) => e.type === 'screen-skipped').length
  const chain = report?.chain

  return (
    <div className="screen">
      <div className={`card report ${ufm ? 'result-ufm' : ''}`}>
        <div className="result">
          <p className="eyebrow">{ufm ? 'Unfair means' : 'Exam submitted'}</p>
          <h1>{ufm ? 'You have been marked UFM' : 'Your exam has been submitted'}</h1>
          <p className="lede">
            {ufm ? `Your exam has been rejected. Reason: ${reason}.` : `${reason ? `${reason}. ` : ''}Your answers have been recorded.`}
          </p>
          <p className="score">{score}<span> / {total}</span></p>
        </div>

        <dl className="facts">
          <div>
            <dt>Lowest integrity</dt>
            <dd>{lowestIntegrity}%</dd>
          </div>
          <div>
            <dt>Flagged events</dt>
            <dd>{timeline.filter((e) => FLAGGED.has(e.type)).length}</dd>
          </div>
          <div>
            <dt>Event log</dt>
            <dd className={chain && !chain.ok ? 'error' : ''}>
              {!chain ? 'Checking…' : chain.ok ? `Chain intact · ${chain.entries}` : `Broken at entry ${chain.brokenAt}`}
            </dd>
          </div>
        </dl>

        {start !== undefined && end > start && (
          <section className="report-section">
            <h3>Integrity over the exam</h3>
            <IntegrityGraph events={events} start={start} end={end} />
          </section>
        )}

        <section className="report-section">
          <h3>Timeline</h3>
          <ol className="timeline">
            {timeline.map((e) => {
              const label = LABELS[e.type]
              return (
                <li key={e.hash} className={FLAGGED.has(e.type) ? 'flagged' : ''}>
                  <time>{offset(e.at - start)}</time>
                  <span>{typeof label === 'function' ? label(e) : label}</span>
                </li>
              )
            })}
          </ol>
          {skipped > 0 && <p className="muted small">{skipped} unchanged screenshots skipped (logged).</p>}
        </section>

        <p className="muted small path">Session record: {sessionDir}</p>
        <div className="card-actions">
          <button className="btn" onClick={() => window.proctor.openSession()}>Open session folder</button>
          <button className="btn btn-primary" onClick={() => window.close()}>Close</button>
        </div>
      </div>
    </div>
  )
}
