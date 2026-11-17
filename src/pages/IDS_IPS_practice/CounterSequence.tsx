export type CounterSequenceFrame = {
  id: number
  no: number
  command: string
  counter: number
  replayed?: boolean
  verdict: "PASS" | "ALERT"
}

export type CounterSequenceAlert = { expected: number; received: number; type: "replay" | "state" | "counter" | "command"; receivedCommand?: string }

type CounterSequenceProps = {
  frames: CounterSequenceFrame[]
  expectedCounter: number
  alert?: CounterSequenceAlert | null
  receivedFrame?: CounterSequenceFrame | null
}

function counterLabel(counter: number) {
  return `${counter} (0x${counter.toString(16).toUpperCase().padStart(2, "0")})`
}

export default function CounterSequence({ frames, expectedCounter, alert, receivedFrame: latestReceived }: CounterSequenceProps) {
  const receivedFrame = latestReceived ?? frames.at(-1)
  return (
    <section className="canlab__console" aria-label="Counter sequence" style={{ minHeight: 292, padding: 20, position: "relative", overflow: "hidden" }}>
      <style>{`@keyframes counter-chip-fade { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }`}</style>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div><strong>Door Frame Structure</strong><p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 12 }}>CAN ID 0x456 · DATA 2 bytes</p></div>
        <strong style={{ color: "var(--state-success)", fontSize: 13 }}>Expected Counter : {counterLabel(expectedCounter)}</strong>
      </header>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", maxWidth: 390, marginTop: 16, border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
        <div style={{ padding: "10px 12px", borderRight: "1px solid var(--border-default)", background: "var(--surface-subtle)" }}><small>COMMAND</small><strong style={{ display: "block", marginTop: 3 }}>{receivedFrame?.command ?? "01"} · {receivedFrame && receivedFrame.command !== "01" ? "UNKNOWN" : "OPEN"}</strong></div>
        <div style={{ padding: "10px 12px", background: "var(--surface-subtle)" }}><small>COUNTER</small><strong style={{ display: "block", marginTop: 3 }}>{receivedFrame ? `0x${receivedFrame.counter.toString(16).toUpperCase().padStart(2, "0")}: ${receivedFrame.counter}` : "0x0B: 11"}</strong></div>
      </div>
      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 26, minHeight: 54 }}>
        {frames.length === 0 && <span style={{ color: "var(--text-secondary)", fontSize: 13 }}>수신된 프레임이 없습니다.</span>}
        {frames.map((frame, index) => <div key={frame.id} style={{ display: "flex", alignItems: "center", gap: 8, animation: "counter-chip-fade .2s ease-out" }}>
          {index > 0 && <span aria-hidden="true" style={{ color: "var(--text-secondary)" }}>→</span>}
          <span style={{ padding: "9px 11px", borderRadius: 999, color: frame.replayed || frame.verdict === "ALERT" ? "#991b1b" : "#195b42", background: frame.replayed || frame.verdict === "ALERT" ? "#fee2e2" : "#e8f3ec", border: `1px solid ${frame.replayed || frame.verdict === "ALERT" ? "#fca5a5" : "#a7d5b5"}`, fontSize: 12, fontWeight: 700 }}>
            {frame.replayed ? "↻ " : ""}Frame {frame.no}: {counterLabel(frame.counter)}
          </span>
        </div>)}
      </div>
      {alert && <div role="alert" style={{ position: "absolute", right: 20, bottom: 18, width: 330, padding: "12px 16px", borderRadius: 10, border: "2px solid #dc2626", background: "#fff7ed", color: "#991b1b", textAlign: "center", boxShadow: "var(--shadow-md)" }}>
        <strong>⚠ {{ replay: "REPLAY DETECTED", state: "STATE ANOMALY", counter: "COUNTER MISMATCH", command: "COMMAND REJECTED" }[alert.type]}</strong>
        <p style={{ margin: "6px 0 0", fontSize: 12 }}>{alert.type === "replay" || alert.type === "counter" ? <>Expected Counter : {counterLabel(alert.expected)}<br />Received Counter : {counterLabel(alert.received)}</> : alert.type === "command" ? <>Expected Command : 01 (OPEN)<br />Received Command : {alert.receivedCommand}</> : <>Current State : OPEN<br />Command : OPEN (already open)</>}</p>
      </div>}
    </section>
  )
}
