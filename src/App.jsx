import { useState } from 'react'
import Shell from './Shell.jsx'
import Details from './Details.jsx'
import Setup from './Setup.jsx'
import Rules from './Rules.jsx'
import Exam from './Exam.jsx'
import Result from './Result.jsx'

const stopMedia = (media) => media?.getTracks().forEach((track) => track.stop())

// details → setup → rules → exam → result
function App() {
  const [stage, setStage] = useState('details')
  const [candidate, setCandidate] = useState(null) // { name, enrollment }
  const [stream, setStream] = useState(null) // camera + mic, acquired on setup, reused in the exam
  const [sessionDir, setSessionDir] = useState('')
  const [result, setResult] = useState(null)

  async function startExam() {
    setSessionDir(await window.proctor.startExam(candidate))
    setStage('exam')
  }

  function finish(outcome) {
    stopMedia(stream)
    window.proctor.endExam()
    setResult(outcome)
    setStage('result')
  }

  function backToSetup() {
    stopMedia(stream)
    setStream(null)
    setStage('setup')
  }

  if (stage === 'details') {
    return (
      <Shell step={1}>
        <Details initial={candidate} onContinue={(details) => { setCandidate(details); setStage('setup') }} />
      </Shell>
    )
  }
  if (stage === 'setup') {
    return (
      <Shell step={2}>
        <Setup onBack={() => setStage('details')} onReady={(media) => { setStream(media); setStage('rules') }} />
      </Shell>
    )
  }
  if (stage === 'rules') {
    return (
      <Shell step={3}>
        <Rules candidate={candidate} onBack={backToSetup} onStart={startExam} />
      </Shell>
    )
  }
  if (stage === 'exam') return <Exam candidate={candidate} stream={stream} onFinish={finish} />
  return (
    <Shell wide>
      <Result {...result} candidate={candidate} sessionDir={sessionDir} />
    </Shell>
  )
}

export default App
