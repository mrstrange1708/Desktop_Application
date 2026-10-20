import { useEffect, useRef, useState } from 'react'

function Check({ done, title, detail, error, children }) {
  return (
    <li className="check">
      <span className={`check-dot ${done ? 'done' : ''}`}>{done && '✓'}</span>
      <div className="check-body">
        <h3>{title}</h3>
        <p className={error ? 'error' : ''}>{error || detail}</p>
        {children}
      </div>
    </li>
  )
}

export default function Setup({ onReady }) {
  const [folder, setFolder] = useState(null)
  const [stream, setStream] = useState(null)
  const [mediaError, setMediaError] = useState('')
  const [screen, setScreen] = useState(null)
  const videoRef = useRef(null)

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream
  }, [stream])

  async function allowMedia() {
    try {
      setStream(await navigator.mediaDevices.getUserMedia({ video: true, audio: true }))
      setMediaError('')
    } catch {
      setMediaError('Camera or microphone was blocked. Allow access in System Settings → Privacy & Security, then try again.')
    }
  }

  const mic = stream?.getAudioTracks()[0]?.label

  return (
    <div className="screen">
      <div className="card">
        <p className="eyebrow">Step 1 of 2</p>
        <h1>Set up your exam</h1>
        <p className="lede">Complete these checks before you read the rules. Required checks are needed to continue.</p>

        <ol className="checks">
          <Check done={!!folder} title="Evidence folder" detail={folder || 'Camera photos, screenshots and the event log are saved here.'}>
            <button className="btn" onClick={async () => setFolder(await window.proctor.pickFolder())}>
              {folder ? 'Change folder' : 'Choose folder'}
            </button>
          </Check>

          <Check
            done={!!stream}
            title="Camera and microphone"
            detail={stream ? `Connected${mic ? ` · ${mic}` : ''}` : 'Used to verify it is you and to detect background noise.'}
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
                  : 'Not allowed. Enable it in System Settings → Privacy & Security → Screen Recording, then restart the app.'
            }
          >
            {screen !== 'granted' && (
              <button className="btn" onClick={async () => setScreen(await window.proctor.screenAccess())}>Check access</button>
            )}
          </Check>
        </ol>

        <div className="card-actions">
          <button className="btn btn-primary" disabled={!folder || !stream} onClick={() => onReady(stream)}>
            Continue to rules
          </button>
        </div>
      </div>
    </div>
  )
}
