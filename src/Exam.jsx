import { useEffect, useRef, useState } from 'react'
import { EXAM, RULES } from './exam.js'
import { CALIBRATION_FRAMES, FRAME_MS, analyzeFrame, calibrate, createSustainGate, rmsDb } from './audio.js'
import { integrityScore } from './integrity.js'
import { FACE_CHECK_MS, createFaceRule, loadFaceDetector } from './face.js'
import logo from './assets/logo.svg'

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
// A failed camera capture is itself evidence (camera covered / unplugged), so it gets logged.
async function captureEvidence(video) {
  window.proctor.captureScreen()
  try {
    if (!video?.videoWidth) throw new Error('no camera frame')
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth
    canvas.height = video.videoHeight
    canvas.getContext('2d').drawImage(video, 0, 0)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.8))
    await window.proctor.saveCamera(new Uint8Array(await blob.arrayBuffer()))
  } catch (error) {
    window.proctor.log({ type: 'capture-error', source: 'camera', message: error.message })
  }
}

const clock = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`

export default function Exam({ candidate, stream, onFinish }) {
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState({})
  const [warnings, setWarnings] = useState(0)
  const [banner, setBanner] = useState('')
  const [calibrating, setCalibrating] = useState(true)
  const [confirming, setConfirming] = useState(false)
  const [events, setEvents] = useState([]) // every logged event, pushed back from main
  const [faces, setFaces] = useState(undefined) // undefined = loading, null = detector unavailable
  const [faceWarnings, setFaceWarnings] = useState(0)
  const videoRef = useRef(null)
  const ended = useRef(false)
  const warningCount = useRef(0)
  const faceWarningCount = useRef(0)
  const lowestIntegrity = useRef(100)

  // Re-computed on every render; the exam clock re-renders 4×/s, so the decay animates on its own.
  const integrity = integrityScore(events, Date.now())
  lowestIntegrity.current = Math.min(lowestIntegrity.current, integrity)

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
    onFinish({ status, reason, score, total: EXAM.questions.length, lowestIntegrity: lowestIntegrity.current })
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

  useEffect(() => window.proctor.onEvent(({ type, at }) => {
    setEvents((list) => [...list, { type, at: Date.parse(at) }])
  }), [])

  // Rule: leaving the window starts a short grace countdown, coming back cancels it.
  useEffect(() => {
    const away = () => startFocus(RULES.focusGraceS) // main logs focus changes itself
    const back = () => startFocus(null)
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

  // Camera + screen evidence: once the camera has a frame, then every snapshotEveryS
  useEffect(() => {
    const video = videoRef.current
    const first = () => captureEvidence(video)
    video.addEventListener('loadeddata', first, { once: true })
    const id = setInterval(() => captureEvidence(video), RULES.snapshotEveryS * 1000)
    return () => {
      video.removeEventListener('loadeddata', first)
      clearInterval(id)
    }
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

  // Rule: no face for a while, or a second person in view → warning; the last allowed warning is UFM.
  useEffect(() => {
    const video = videoRef.current
    const rule = createFaceRule()
    let detector = null
    let id = null
    let cancelled = false

    loadFaceDetector().then((loaded) => {
      if (cancelled) return loaded.close()
      detector = loaded
      id = setInterval(() => {
        if (!video.videoWidth) return
        const count = detector.detectForVideo(video, performance.now()).detections.length
        setFaces(count)
        const kind = rule(count, Date.now())
        if (!kind) return

        const n = ++faceWarningCount.current
        setFaceWarnings(n)
        window.proctor.log({ type: 'face-warning', kind, n })
        if (n >= RULES.maxFaceWarnings) ufm(`Camera rule broken ${n} times (${kind})`)
        else setBanner(`Warning ${n} of ${RULES.maxFaceWarnings}: ${kind} in camera. Stay alone and in view.`)
      }, FACE_CHECK_MS)
    }).catch((error) => {
      setFaces(null)
      window.proctor.log({ type: 'capture-error', source: 'face-detector', message: error.message })
    })

    return () => {
      cancelled = true
      clearInterval(id)
      detector?.close()
    }
  }, [])

  // Autosave: answers.json in the session folder is rewritten on every change.
  useEffect(() => {
    window.proctor.saveAnswers(answers)
  }, [answers])

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
        <div className="exam-who">
          <img src={logo} alt="" width="34" height="34" />
          <div>
            <strong>{EXAM.title}</strong>
            <span>{candidate.name}, {candidate.enrollment}</span>
          </div>
        </div>
        <ul className="monitor" aria-label="Monitoring">
          <li className={faces === undefined ? 'is-pending' : faces === 1 ? '' : faces > 1 ? 'is-alert' : 'is-warn'}>
            {faces === undefined ? 'Camera starting'
              : faces === null ? 'Face check off'
                : faces === 1 ? 'Camera' : faces === 0 ? 'No face' : `${faces} faces`}
            {faceWarnings > 0 && ` ${faceWarnings}/${RULES.maxFaceWarnings}`}
          </li>
          <li className={calibrating ? 'is-pending' : warnings ? 'is-warn' : ''}>
            {calibrating ? 'Microphone: stay quiet' : 'Microphone'}
            {warnings > 0 && ` ${warnings}/${RULES.maxAudioWarnings}`}
          </li>
          <li className={integrity >= 80 ? '' : integrity >= 50 ? 'is-warn' : 'is-alert'} title="Drops with every flagged event and recovers over time">
            Integrity {integrity}
          </li>
        </ul>
        <span className={`timer ${seconds < 300 ? 'timer-low' : ''}`} aria-label="Time left">{clock(seconds)}</span>
        <video ref={videoRef} className="cam" autoPlay muted playsInline />
      </header>

      <div className="exam-body">
        <main className="question">
          {banner && <p className="notice" role="alert">{banner}</p>}
          <p className="q-num">Question {index + 1} of {total}</p>
          <h2>{question.text}</h2>
          <div className="options" role="radiogroup">
            {question.options.map((option, k) => {
              const chosen = answers[question.id] === k
              return (
                <label key={k} className={`option ${chosen ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name={question.id}
                    checked={chosen}
                    onChange={() => setAnswers({ ...answers, [question.id]: k })}
                  />
                  <span className={`bubble ${chosen ? 'is-filled' : ''}`}>{'ABCDEFGH'[k]}</span>
                  {option}
                </label>
              )
            })}
          </div>
          <div className="q-actions">
            <button className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>Previous</button>
            <button
              className="btn btn-quiet"
              disabled={answers[question.id] === undefined}
              onClick={() => setAnswers(({ [question.id]: _, ...rest }) => rest)}
            >
              Clear answer
            </button>
            {index < total - 1
              ? <button className="btn btn-primary" onClick={() => setIndex(index + 1)}>Next question</button>
              : <button className="btn btn-primary" onClick={() => setConfirming(true)}>Submit exam</button>}
          </div>
        </main>

        <aside className="answer-sheet" aria-label="Answer sheet">
          <h3>Answer sheet</h3>
          <div className="answer-grid">
            {EXAM.questions.map((q, k) => (
              <button
                key={q.id}
                className={`${answers[q.id] !== undefined ? 'answered' : ''} ${k === index ? 'current' : ''}`}
                onClick={() => setIndex(k)}
                aria-label={`Question ${k + 1}${answers[q.id] !== undefined ? ', answered' : ''}`}
                aria-current={k === index ? 'true' : undefined}
              >
                {k + 1}
              </button>
            ))}
          </div>
          <p>{answered} of {total} answered. Filled bubbles are answered.</p>
          <button className="btn btn-primary" onClick={() => setConfirming(true)}>Submit exam</button>
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
