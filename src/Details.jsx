import { useState } from 'react'
import { EXAM } from './exam.js'

// Same rule is enforced again in main (exam:start), which is the authority.
const ENROLLMENT = /^[A-Z0-9/-]{3,24}$/

export default function Details({ initial, onContinue }) {
  const [name, setName] = useState(initial?.name ?? '')
  const [enrollment, setEnrollment] = useState(initial?.enrollment ?? '')
  const [submitted, setSubmitted] = useState(false)

  const cleanName = name.trim().replace(/\s+/g, ' ')
  const nameError = cleanName.length < 2 ? 'Enter your full name as it appears on your ID card.' : ''
  const enrollmentError = ENROLLMENT.test(enrollment) ? '' : 'Enter your enrollment number: 3 to 24 letters, digits, / or -.'

  function submit(event) {
    event.preventDefault()
    setSubmitted(true)
    if (!nameError && !enrollmentError) onContinue({ name: cleanName, enrollment })
  }

  return (
    <form onSubmit={submit} noValidate>
      <h1>Who is taking this exam?</h1>
      <p className="lede">Your name and enrollment number go on your answer sheet and in the session record.</p>

      <div className="exam-card">
        <strong>{EXAM.title}</strong>
        <span>{EXAM.questions.length} questions in {EXAM.durationMin} minutes</span>
      </div>

      <label className="field">
        <span className="field-label">Full name</span>
        <input
          autoFocus
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-invalid={submitted && !!nameError}
          aria-describedby="name-error"
        />
        {submitted && nameError && <span id="name-error" className="field-error">{nameError}</span>}
      </label>

      <label className="field">
        <span className="field-label">Enrollment number</span>
        <input
          className="input-enrollment"
          value={enrollment}
          onChange={(e) => setEnrollment(e.target.value.toUpperCase().replace(/\s/g, ''))}
          maxLength={24}
          spellCheck={false}
          autoComplete="off"
          aria-invalid={submitted && !!enrollmentError}
          aria-describedby="enrollment-error"
        />
        {submitted && enrollmentError && <span id="enrollment-error" className="field-error">{enrollmentError}</span>}
      </label>

      <div className="actions">
        <button type="submit" className="btn btn-primary">Continue to system check</button>
      </div>
    </form>
  )
}
