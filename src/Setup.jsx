import { useEffect, useRef, useState } from 'react'

// One row: a bubble that fills in when the check passes, what it is, and the action.
function Check({ done, title, detail, error, children }) {
  return (
    <li className="check">
      <span className={`bubble ${done ? 'is-filled is-ok' : ''}`} aria-hidden="true">{done && '✓'}</span>
      <div className="check-text">
        <h3>{title}</h3>
        <p className={error ? 'error' : ''}>{error || detail}</p>
      </div>
      <div className="check-action">{children}</div>
    </li>
  )
}

export default function Setup({ onReady, onBack }) {
  const [folder, setFolder] = useState(null)
  const [stream, setStream] = useState(null)
  const [mediaError, setMediaError] = useState('')
  const [screen, setScreen] = useState(null)
  const [system, setSystem] = useState(null) // { displays, restricted } from main
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  async function allowMedia() {
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: true, audio: true }))
      setMediaError('')
    } catch {
      setMediaError('Camera or microphone is blocked. Allow access in System Settings → Privacy & Security, then try again.')
    }
  }

  const mic = stream?.getAudioTracks()[0]?.label
  const systemIssues = system && [
    system.displays > 1 && `Disconnect extra displays (${system.displays} connected).`,
    system.restricted.length > 0 && `Quit these apps: ${system.restricted.join(', ')}.`,
  ].filter(Boolean).join(' ')
  const systemOk = system !== null && !systemIssues

  return (
    <>
      <h1>Check your setup</h1>
      <p className="lede">Everything here stays on this computer. The first, second and last checks are required.</p>

      <ol className="checks">
        <Check done={!!folder} title="Session folder" detail={folder || 'Camera photos, screenshots, your answers and the event log are saved here.'}>
          <button className="btn" onClick={async () => setFolder(await window.proctor.pickFolder())}>
            {folder ? 'Change folder' : 'Choose folder'}
          </button>
        </Check>

        <Check
          done={!!stream}
          title="Camera and microphone"
          detail={stream ? `Connected${mic ? `: ${mic}` : ''}` : 'Used to see that you are present and alone, and to hear background noise.'}
          error={mediaError}
        >
          {stream
            ? <video ref={videoRef} className="preview" autoPlay muted playsInline />
            : <button className="btn" onClick={allowMedia}>Allow access</button>}
        </Check>

        <Check
          done={screen === 'granted'}
          title="Screen capture (recommended)"
          detail={
            screen === null ? 'Lets the proctor record what is on your screen.'
              : screen === 'granted' ? 'Allowed'
                : 'Not allowed. Turn it on in System Settings → Privacy & Security → Screen Recording, then restart the app.'
          }
        >
          {screen !== 'granted' && (
            <button className="btn" onClick={async () => setScreen(await window.proctor.screenAccess())}>Check access</button>
          )}
        </Check>

        <Check
          done={systemOk}
          title="Displays and apps"
          detail={system === null ? 'One display only, and no screen-sharing, messaging or AI apps open.' : systemOk ? 'One display, no restricted apps open' : ''}
          error={systemIssues}
        >
          {!systemOk && (
            <button className="btn" onClick={async () => setSystem(await window.proctor.systemCheck())}>
              {system ? 'Check again' : 'Run check'}
            </button>
          )}
        </Check>
      </ol>

      <div className="actions">
        <button className="btn btn-quiet" onClick={() => { stream?.getTracks().forEach((t) => t.stop()); onBack() }}>Back</button>
        <button className="btn btn-primary" disabled={!folder || !stream || !systemOk} onClick={() => onReady(stream)}>
          Continue to rules
        </button>
      </div>
    </>
  )
}
