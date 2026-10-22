import logo from './assets/logo.svg'

const STEPS = ['Your details', 'System check', 'Rules']

// Brand bar + (optional) step sequence + one sheet of paper for the content.
export default function Shell({ step, wide, children }) {
  return (
    <div className="shell">
      <header className="shell-bar">
        <div className="brand">
          <img src={logo} alt="" width="30" height="30" />
          Exam Proctor
        </div>
        {step && (
          <ol className="steps" aria-label="Progress">
            {STEPS.map((name, i) => {
              const n = i + 1
              return (
                <li key={name} className={n === step ? 'is-current' : n < step ? 'is-done' : ''} aria-current={n === step ? 'step' : undefined}>
                  <span className="step-dot">{n < step ? '✓' : n}</span>
                  {name}
                </li>
              )
            })}
          </ol>
        )}
      </header>
      <main className="shell-main">
        <div className={`sheet ${wide ? 'sheet-wide' : ''}`}>{children}</div>
      </main>
    </div>
  )
}
