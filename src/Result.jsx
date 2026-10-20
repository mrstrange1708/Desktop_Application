export default function Result({ status, reason, score, total, sessionDir }) {
  const ufm = status === 'ufm'

  return (
    <div className="screen">
      <div className={`card result ${ufm ? 'result-ufm' : ''}`}>
        <p className="eyebrow">{ufm ? 'Unfair means' : 'Exam submitted'}</p>
        <h1>{ufm ? 'You have been marked UFM' : 'Your exam has been submitted'}</h1>
        <p className="lede">
          {ufm ? `Your exam has been rejected. Reason: ${reason}.` : `${reason ? `${reason}. ` : ''}Your answers have been recorded.`}
        </p>
        <p className="score">{score}<span> / {total}</span></p>
        <p className="muted small">Session record saved to {sessionDir}</p>
        <button className="btn" onClick={() => window.close()}>Close</button>
      </div>
    </div>
  )
}
