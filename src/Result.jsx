import { useEffect, useState } from 'react'

export default function Result({ status, reason, score, total, lowestIntegrity, sessionDir }) {
  const ufm = status === 'ufm'
  const [log, setLog] = useState(null) // { ok, entries, brokenAt? }

  useEffect(() => {
    window.proctor.verifyLog().then(setLog)
  }, [])

  return (
    <div className="screen">
      <div className={`card result ${ufm ? 'result-ufm' : ''}`}>
        <p className="eyebrow">{ufm ? 'Unfair means' : 'Exam submitted'}</p>
        <h1>{ufm ? 'You have been marked UFM' : 'Your exam has been submitted'}</h1>
        <p className="lede">
          {ufm ? `Your exam has been rejected. Reason: ${reason}.` : `${reason ? `${reason}. ` : ''}Your answers have been recorded.`}
        </p>
        <p className="score">{score}<span> / {total}</span></p>

        <dl className="facts">
          <div>
            <dt>Lowest integrity</dt>
            <dd>{lowestIntegrity}%</dd>
          </div>
          <div>
            <dt>Event log</dt>
            <dd className={log && !log.ok ? 'error' : ''}>
              {log === null ? 'Checking…' : log.ok ? `Verified · ${log.entries} entries` : `Modified at entry ${log.brokenAt}`}
            </dd>
          </div>
        </dl>

        <p className="muted small">Session record saved to {sessionDir}</p>
        <button className="btn" onClick={() => window.close()}>Close</button>
      </div>
    </div>
  )
}
