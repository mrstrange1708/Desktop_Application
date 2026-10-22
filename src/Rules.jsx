import { useState } from 'react'
import { EXAM, RULES } from './exam.js'

export default function Rules({ candidate, onStart, onBack }) {
  const [agreed, setAgreed] = useState(false)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  // Main re-runs the system check and may refuse to start.
  async function start() {
    setStarting(true)
    setError('')
    try {
      await onStart()
    } catch (e) {
      setError(e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''))
      setStarting(false)
    }
  }

  return (
    <>
      <h1>Read the rules</h1>
      <p className="lede">
        {EXAM.title}: {EXAM.questions.length} questions in {EXAM.durationMin} minutes. Breaking a rule
        marks you as UFM (unfair means): the exam ends straight away and your score is 0.
      </p>

      <ol className="rules">
        <li>The exam fills the screen. You cannot switch to other apps or windows.</li>
        <li>If the exam window loses focus for more than {RULES.focusGraceS} seconds, you are marked UFM.</li>
        <li>If you try to quit, you have {RULES.quitGraceS} seconds to return. Not returning, or trying to quit again, is UFM.</li>
        <li>Stay alone and in front of the camera. No face for 5 seconds (and every further 5 seconds), or another person in view, gives a warning. The {ordinal(RULES.maxFaceWarnings)} warning is UFM.</li>
        <li>Keep your surroundings quiet. Talking, music or loud noise gives a warning. The {ordinal(RULES.maxAudioWarnings)} warning is UFM.</li>
        <li>Copy, paste, right-click, keyboard shortcuts and screenshots are turned off.</li>
        <li>Only one display may be connected, and screen-sharing, messaging or AI apps must stay closed.</li>
        <li>Your camera and screen are captured every {RULES.snapshotEveryS} seconds and saved with an event log. An integrity score tracks every flagged event and appears in your result.</li>
      </ol>

      <label className="agree">
        <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
        <span>I, {candidate.name} ({candidate.enrollment}), have read these rules and agree to be monitored during this exam.</span>
      </label>

      {error && <p className="form-error" role="alert">{error}</p>}

      <div className="actions">
        <button className="btn btn-quiet" onClick={onBack} disabled={starting}>Back</button>
        <button className="btn btn-primary" disabled={!agreed || starting} onClick={start}>
          {starting ? 'Starting…' : 'Start exam'}
        </button>
      </div>
    </>
  )
}

const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][n] ?? 'th')
