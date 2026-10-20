import { useEffect, useRef, useState } from 'react'
import { EXAM, RULES } from './exam.js'
import { CALIBRATION_FRAMES, FRAME_MS, analyzeFrame, calibrate, createSustainGate, rmsDb } from './audio.js'

// Wall-clock countdown. start(seconds) begins it, start(null) cancels it; onExpire runs once at 0.
function useCountdown(onExpire) {
  const [deadline, setDeadline] = useState(null)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (deadline === null) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [deadline])

  const left = deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
  useEffect(() => {
    if (left === 0) onExpire()
  }, [left])

  function start(seconds) {
    setNow(Date.now())
    setDeadline(seconds === null ? null : Date.now() + seconds * 1000)
  }
  return [left, start]
}

// One camera frame + one screenshot of every display, saved by main into the session folder.
async function captureEvidence(video) {
  window.proctor.captureScreen()
  if (!video?.videoWidth) return
  const canvas = document.createElement('canvas')
  canvas.width = video.videoWidth
  canvas.height = video.videoHeight
  canvas.getContext('2d').drawImage(video, 0, 0)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
  window.proctor.saveCamera(new Uint8Array(await blob.arrayBuffer()))
}

const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function Exam({ stream, onFinish }) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [warnings, setWarnings] = useState(0)
  const [banner, setBanner] = useState('')
  const [calibrating, setCalibrating] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const videoRef = useRef(null)
  const ended = useRef(false)
  const warningCount = useRef(0)

  const [timeLeft, startTimer] = useCountdown(() => end('submitted', 'Time is up'))
  const [focusLeft, startFocus] = useCountdown(() => ufm(`Left the exam window for more than ${RULES.focusGraceS} seconds`))
  const [quitLeft, startQuit] = useCountdown(() => ufm('Tried to quit the exam'))
  const quitOpen = useRef(false)
  quitOpen.current = quitLeft !== null

  function end(status, reason) {
    if (ended.current) return
    ended.current = true
    const score = status === 'ufm' ? 0 : EXAM.questions.filter((q) => answers[q.id] === q.answer).length
    window.proctor.log({ type: status, reason, score })
    onFinish({ status, reason, score, total: EXAM.questions.length })
  }

  function ufm(reason) {
    captureEvidence(videoRef.current)
    end('ufm', reason)
  }

  // Camera thumbnail + exam clock
  useEffect(() => {
    videoRef.current.srcObject = stream
    startTimer(EXAM.durationMin * 60)
  }, [stream])

  // Rule: leaving the window starts a short grace countdown, coming back cancels it.
  useEffect(() => {
    const away = () => {
      window.proctor.log({ type: 'focus-lost' })
      startFocus(RULES.focusGraceS)
    }
    const back = () => {
      window.proctor.log({ type: 'focus-back' })
      startFocus(null)
    }
    window.addEventListener('blur', away)
    window.addEventListener('focus', back)
    return () => {
      window.removeEventListener('blur', away)
      window.removeEventListener('focus', back)
    }
  }, [])

  // Rule: a quit attempt gets a return countdown; a second attempt while it runs is UFM.
  useEffect(() => window.proctor.onQuitAttempt(() => {
    window.proctor.log({ type: 'quit-attempt' })
    if (quitOpen.current) ufm('Insisted on quitting the exam')
    else startQuit(RULES.quitGraceS)
  }), [])

  // Rule: no copy / cut / paste / right-click / text selection / drag.
  useEffect(() => {
    const block = (e) => e.preventDefault()
    const events = ['copy', 'cut', 'paste', 'contextmenu', 'selectstart', 'dragstart', 'drop']
    events.forEach((type) => document.addEventListener(type, block))
    return () => events.forEach((type) => document.removeEventListener(type, block))
  }, [])

  // Periodic camera + screen evidence
  useEffect(() => {
    const id = setInterval(() => captureEvidence(videoRef.current), RULES.snapshotEveryS * 1000)
    return () => clearInterval(id)
  }, [])

  // Rule: background audio → warning; the last allowed warning is UFM.
  useEffect(() => {
    const ctx = new AudioContext()
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 2048
    ctx.createMediaStreamSource(stream).connect(analyser)
    const samples = new Float32Array(analyser.fftSize)
    const spectrum = new Float32Array(analyser.frequencyBinCount)
    const levels = []
    const gate = createSustainGate()
    let floorDb = null

    const id = setInterval(() => {
      analyser.getFloatTimeDomainData(samples)
      analyser.getFloatFrequencyData(spectrum)
      if (floorDb === null) {
        levels.push(rmsDb(samples))
        if (levels.length < CALIBRATION_FRAMES) return
        floorDb = calibrate(levels)
        setCalibrating(false)
        return
      }
      const hit = analyzeFrame(samples, spectrum, ctx.sampleRate, floorDb)
      const kind = hit.music ? 'music' : hit.speech ? 'talking' : hit.loud ? 'loud noise' : null
      if (!gate(kind !== null)) return

      const n = ++warningCount.current
      setWarnings(n)
      window.proctor.log({ type: 'audio-warning', kind, n })
      if (n >= RULES.maxAudioWarnings) ufm(`Background audio detected ${n} times (${kind})`)
      else setBanner(`Warning ${n} of ${RULES.maxAudioWarnings}: ${kind} detected. Keep your surroundings quiet.`)
    }, FRAME_MS)

    return () => {
      clearInterval(id)
      ctx.close()
    }
  }, [stream])

  useEffect(() => {
    if (!banner) return
    const t = setTimeout(() => setBanner(''), 6000)
    return () => clearTimeout(t)
  }, [banner])

  const question = EXAM.questions[index]
  const total = EXAM.questions.length
  const answered = EXAM.questions.filter((q) => answers[q.id] !== undefined).length
  const seconds = timeLeft ?? EXAM.durationMin * 60

  return (
    <div className="exam">
      <header className="exam-bar">
        <div>
          <span className="exam-title">{EXAM.title}</span>
          <span className="muted"> · {answered} of {total} answered</span>
        </div>
        <div className="bar-right">
          <span className={`chip ${warnings ? 'chip-warn' : ''}`}>
            {calibrating ? 'Calibrating mic — stay quiet' : `Audio warnings ${warnings}/${RULES.maxAudioWarnings}`}
          </span>
          <span className={`timer ${seconds < 300 ? 'timer-low' : ''}`}>{clock(seconds)}</span>
          <video ref={videoRef} className="cam" autoPlay muted playsInline />
        </div>
      </header>

      {banner && <div className="banner" role="alert">{banner}</div>}

      <div className="exam-body">
        <main className="question">
          <p className="q-num">Question {index + 1} of {total}</p>
          <h2>{question.text}</h2>
          <div className="options" role="radiogroup">
            {question.options.map((option, k) => (
              <label key={k} className={`option ${answers[question.id] === k ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name={question.id}
                  checked={answers[question.id] === k}
                  onChange={() => setAnswers({ ...answers, [question.id]: k })}
                />
                <span className="option-key">{'ABCDEFGH'[k]}</span>
                {option}
              </label>
            ))}
          </div>
          <div className="q-actions">
            <button className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button>
            <button
              className="btn"
              disabled={answers[question.id] === undefined}
              onClick={() => setAnswers(({ [question.id]: _, ...rest }) => rest)}
            >
              Clear response
            </button>
            {index < total - 1
              ? <button className="btn btn-primary" onClick={() => setIndex(index + 1)}>Save &amp; next</button>
              : <button className="btn btn-primary" onClick={() => setConfirming(true)}>Submit exam</button>}
          </div>
        </main>

        <aside className="palette">
          <h3>Questions</h3>
          <div className="palette-grid">
            {EXAM.questions.map((q, k) => (
              <button
                key={q.id}
                className={`${answers[q.id] !== undefined ? 'answered' : ''} ${k === index ? 'current' : ''}`}
                onClick={() => setIndex(k)}
                aria-label={`Question ${k + 1}`}
              >
                {k + 1}
              </button>
            ))}
          </div>
          <div className="legend">
            <span><i className="answered" />Answered</span>
            <span><i />Not answered</span>
          </div>
          <button className="btn btn-primary btn-block" onClick={() => setConfirming(true)}>Submit exam</button>
        </aside>
      </div>

      {confirming && (
        <div className="overlay">
          <div className="modal" role="dialog" aria-modal="true">
            <h2>Submit your exam?</h2>
            <p>You have answered {answered} of {total} questions. You cannot change answers after submitting.</p>
            <div className="modal-actions">
              <button className="btn" onClick={() => setConfirming(false)}>Keep working</button>
              <button className="btn btn-primary" onClick={() => end('submitted')}>Submit</button>
            </div>
          </div>
        </div>
      )}

      {quitLeft !== null && (
        <div className="overlay">
          <div className="modal" role="alertdialog" aria-modal="true">
            <h2>Leaving the exam?</h2>
            <p>Quitting now marks you as UFM and rejects your exam. Return to the exam within</p>
            <p className="count">{quitLeft}</p>
            <div className="modal-actions">
              <button className="btn btn-danger" onClick={() => ufm('Quit the exam')}>Quit anyway</button>
              <button className="btn btn-primary" autoFocus onClick={() => startQuit(null)}>Return to exam</button>
            </div>
          </div>
        </div>
      )}

      {focusLeft !== null && (
        <div className="overlay">
          <div className="modal" role="alertdialog" aria-modal="true">
            <h2>Come back to the exam</h2>
            <p>You left the exam window. You will be marked UFM in</p>
            <p className="count">{focusLeft}</p>
          </div>
        </div>
      )}
    </div>
  )
}
