import { useState } from 'react'

function App() {
  const [reply, setReply] = useState('')
  const { electron, chrome, node } = window.proctor.versions

  return (
    <main className="page">
      <h1>Exam Proctor</h1>
      <p className="muted">Electron {electron} · Chrome {chrome} · Node {node}</p>
      <button onClick={async () => setReply(await window.proctor.ping())}>Ping main process</button>
      {reply && <p>{reply}</p>}
    </main>
  )
}

export default App
