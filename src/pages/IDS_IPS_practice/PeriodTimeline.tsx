export type PeriodTimelineFrame = {
  id: number
  time: number
  canId: string
  data: string
  injected: boolean
  verdict: "PASS" | "ALERT" | "ANOMALY"
  observedMs?: number | null
}

type PeriodTimelineProps = {
  frames: PeriodTimelineFrame[]
  quizMode?: boolean
  quizSelection: number | null
  onSelect?: (eventId: number) => void
  anomaly?: { observed: number } | null
  windowStartMs?: number
}

const TICKS = Array.from({ length: 11 }, (_, index) => index * 100)

export default function PeriodTimeline({
  frames,
  quizMode = false,
  quizSelection,
  onSelect,
  anomaly,
  windowStartMs = 0,
}: PeriodTimelineProps) {
  const orderedFrames = [...frames].sort((a, b) => a.time - b.time)

  return (
    <section
      className="canlab__console"
      aria-label="Period timeline"
      style={{ minHeight: 300, padding: 20, position: "relative", overflow: "hidden" }}
    >
      <style>{`@keyframes period-frame-fade { from { opacity: 0; } to { opacity: 1; } }`}</style>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <strong>CAN Period Timeline</strong>
          <p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 12 }}>
            {quizMode ? "실제 탐지 시점 · 1초 수신 기록" : "최근 1초 수신 기록"}
          </p>
        </div>
        <strong style={{ color: "var(--state-success)", fontSize: 13 }}>Expected Period : 100 ms</strong>
      </header>

      <div style={{ position: "relative", height: 174, margin: "28px 26px 0" }}>
        <div style={{ position: "absolute", top: 62, left: 0, right: 0, borderTop: "2px solid var(--border-strong)" }} />
        {TICKS.map((tick) => (
          <div key={tick} style={{ position: "absolute", left: `${tick / 10}%`, top: 53, transform: "translateX(-50%)", textAlign: "center" }}>
            <i style={{ display: "block", height: 18, borderLeft: "1px solid var(--border-strong)" }} />
            <small style={{ display: "block", marginTop: 10, color: "var(--text-secondary)", fontSize: 10 }}>{((windowStartMs + tick) / 1000).toFixed(2)}s</small>
          </div>
        ))}
        {orderedFrames.map((frame, index) => {
          const previous = orderedFrames[index - 1]
          const gap = frame.observedMs !== undefined ? frame.observedMs : previous ? Math.round(frame.time - previous.time) : null
          const selected = quizSelection === frame.id
          const detected = frame.verdict === "ANOMALY" || frame.verdict === "ALERT"
          const markerColor = detected ? "#dc2626" : frame.injected ? "#d97706" : "#3f7f63"
          return (
            <div key={frame.id} style={{ position: "absolute", left: `${Math.min(100, Math.max(0, frame.time / 10))}%`, top: 48, transform: "translateX(-50%)", textAlign: "center", animation: "period-frame-fade 0.2s ease-out" }}>
              {gap !== null && <small style={{ position: "absolute", bottom: 38, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", color: detected ? "#b91c1c" : "var(--text-secondary)", fontSize: 10 }}>{gap} ms</small>}
              <button
                type="button"
                aria-label={`${((windowStartMs + frame.time) / 1000).toFixed(2)} seconds frame`}
                data-event-id={frame.id}
                data-verdict={frame.verdict}
                title={`패킷 ${frame.id} · ${((windowStartMs + frame.time) / 1000).toFixed(3)}초 · ${frame.verdict}`}
                onClick={() => quizMode && onSelect?.(frame.id)}
                disabled={!quizMode}
                style={{ width: 25, height: 25, padding: 0, borderRadius: "50%", border: selected ? "3px solid #1d4ed8" : "2px solid #fff", background: markerColor, color: "#fff", fontWeight: 800, cursor: quizMode ? "pointer" : "default", boxShadow: "0 0 0 1px rgba(15, 23, 42, .3)" }}
              >
                {frame.injected ? "×" : "●"}
              </button>
              <small style={{ display: "block", marginTop: 6, color: markerColor, fontSize: 10 }}>{frame.canId}</small>
            </div>
          )
        })}
      </div>

      {anomaly && !quizMode && (
        <div role="alert" style={{ position: "absolute", inset: "auto 50% 22px auto", transform: "translateX(50%)", width: 320, padding: "12px 16px", background: "#fff7ed", border: "2px solid #dc2626", borderRadius: 10, color: "#991b1b", textAlign: "center", boxShadow: "var(--shadow-md)" }}>
          <strong>⚠ PERIOD ANOMALY</strong>
          <p style={{ margin: "6px 0 0", fontSize: 12 }}>Expected Period : 100 ms<br />Observed : {anomaly.observed} ms</p>
        </div>
      )}
    </section>
  )
}
