import { useState } from 'react'
import { EXAM, RULES } from './exam.js'

export default function Rules({ onStart }) {
  const [agreed, setAgreed] = useState(false)
  const [starting, setStarting] = useState(false)

  return (
    <div className="screen">
      <div className="card">
        <p className="eyebrow">Step 2 of 2</p>
        <h1>Exam rules</h1>
        <p className="lede">
          {EXAM.title} · {EXAM.questions.length} questions · {EXAM.durationMin} minutes.
          Breaking a rule marks you as <strong>UFM (unfair means)</strong>: the exam ends immediately and your score is 0.
        </p>

        <ol className="rules">
          <li>The exam runs full screen. You cannot switch to other apps or windows.</li>
          <li>If the exam window loses focus for more than <strong>{RULES.focusGraceS} seconds</strong>, you are marked UFM.</li>
          <li>If you try to quit, you have <strong>{RULES.quitGraceS} seconds</strong> to return. Not returning, or trying to quit again, is UFM.</li>
          <li>Keep your surroundings quiet. Talking, music or loud noise gives a warning; the <strong>{ordinal(RULES.maxAudioWarnings)} warning</strong> is UFM.</li>
          <li>Copy, cut, paste, right-click and screenshots are disabled.</li>
          <li>Your camera and screen are captured every {RULES.snapshotEveryS} seconds and saved with an event log.</li>
          <li>Stay in front of the camera for the whole exam.</li>
        </ol>

        <label className="agree">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
          I have read the rules and agree to be monitored.
        </label>

        <div className="card-actions">
          <button
            className="btn btn-primary"
            disabled={!agreed || starting}
            onClick={() => { setStarting(true); onStart() }}
          >
            {starting ? 'Starting…' : 'Start exam'}
          </button>
        </div>
      </div>
    </div>
  )
}

const ordinal = (n) => n + (['th', 'st', 'nd', 'rd'][n] ?? 'th')
