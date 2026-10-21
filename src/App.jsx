import { useState } from 'react'
import Setup from './Setup.jsx'
import Rules from './Rules.jsx'
import Exam from './Exam.jsx'
import Result from './Result.jsx'

// setup → rules → exam → result
function App() {
  const [stage, setStage] = useState('setup')
  const [stream, setStream] = useState(null) // camera + mic, acquired on setup, reused in the exam
  const [sessionDir, setSessionDir] = useState('')
  const [result, setResult] = useState(null)

  async function startExam() {
    setSessionDir(await window.proctor.startExam())
    setStage('exam')
  }

  function finish(outcome) {
    stream.getTracks().forEach((track) => track.stop())
    window.proctor.endExam()
    setResult(outcome)
    setStage('result')
  }

  if (stage === 'setup') return <Setup onReady={(media) => { setStream(media); setStage('rules') }} />
  if (stage === 'rules') return <Rules onStart={startExam} />
  if (stage === 'exam') return <Exam stream={stream} onFinish={finish} />
  return <Result {...result} sessionDir={sessionDir} />
}

export default App
