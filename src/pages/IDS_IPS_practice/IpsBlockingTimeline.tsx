export type IpsRule = "none" | "id" | "counter" | "period"
export type IpsFrameKind = "normal" | "attack"
export type IpsFrame = { id: string; time: number; canId: string; data: string; kind: IpsFrameKind; counter?: number; ids: "REPLAY" | "PERIOD" | "PASS" }

type Props = {
  frames: IpsFrame[]
  activeRule: IpsRule
  selectedFrameId: string | null
  onSelectFrame: (frame: IpsFrame) => void
  onOpenFrame: (frame: IpsFrame | null) => void
}

export function shouldBlock(frame: IpsFrame, rule: IpsRule) {
  return rule === "id" || (rule === "counter" && frame.ids === "REPLAY") || (rule === "period" && frame.ids === "PERIOD")
}

export default function IpsBlockingTimeline({ frames, activeRule, selectedFrameId, onSelectFrame, onOpenFrame }: Props) {
  const ticks = [0, 100, 200, 300, 400, 500]
  const scenarioCanId = frames[0]?.canId ?? "-"

  return <section className="canlab__console" aria-label="IPS scenario timeline" style={{ minHeight: 315, padding: 20, overflow: "visible" }}>
    <style>{`@keyframes ips-frame-fade { from { opacity: 0; } to { opacity: 1; } }`}</style>
    <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}><div><strong>IDS / IPS Decision Timeline</strong><p style={{ margin: "4px 0 0", color: "var(--text-secondary)", fontSize: 12 }}>CAN ID {scenarioCanId} · 고정 시나리오 0.0 ~ 0.5초</p></div><small style={{ color: "var(--text-secondary)" }}>빨간 공격 Frame을 선택해 IPS 규칙을 적용하세요.</small></header>
    <div style={{ height: 180, marginTop: 30, padding: "0 48px" }}>
      <div style={{ position: "relative", height: "100%" }}>
        <div style={{ position: "absolute", top: 70, left: 0, right: 0, borderTop: "2px solid var(--border-strong)" }} />
        {ticks.map((tick) => <div key={tick} style={{ position: "absolute", left: `${tick / 5}%`, top: 63, transform: "translateX(-50%)", textAlign: "center" }}><i style={{ display: "block", height: 14, borderLeft: "1px solid var(--border-strong)" }} /><small style={{ display: "block", marginTop: 9, color: "var(--text-secondary)", fontSize: 11, whiteSpace: "nowrap" }}>{(tick / 1000).toFixed(1)}s</small></div>)}
        {frames.map((frame, index) => {
          const blocked = shouldBlock(frame, activeRule)
          const attack = frame.kind === "attack"
          const counterLabel = frame.counter === undefined ? null : `Counter ${frame.counter}`
          const blockedMarker = <span aria-label="Blocked frame" style={{ position: "relative", display: "block", width: 22, height: 22, borderRadius: "50%", border: "2px solid #991b1b", background: "transparent", boxSizing: "border-box" }}><i style={{ position: "absolute", width: 27, borderTop: "2px solid #991b1b", top: 8, left: -5, transform: "rotate(-45deg)", transformOrigin: "center" }} /></span>
          const attackMarker = <button type="button" aria-label={`${frame.ids} attack frame`} aria-pressed={selectedFrameId === frame.id} onClick={() => { onSelectFrame(frame); onOpenFrame(frame) }} style={{ width: 22, height: 22, padding: 0, borderRadius: "50%", border: "3px solid #dc2626", background: "#fff", color: "#dc2626", fontWeight: 800, lineHeight: 1, cursor: "pointer", boxSizing: "border-box", outline: selectedFrameId === frame.id ? "2px solid #2588c2" : undefined, outlineOffset: 3 }}>×</button>
          const normalMarker = <span aria-label="Normal frame" style={{ display: "block", width: 14, height: 14, borderRadius: "50%", background: "#3f7f63" }} />
          const marker = <button type="button" aria-label={`패킷 ${index + 1}: ${frame.ids}, ${blocked ? "BLOCK" : "ALLOW"}`} aria-pressed={selectedFrameId === frame.id} onClick={() => { onSelectFrame(frame); onOpenFrame(null) }} style={{ display: "block", padding: 0, border: 0, background: "transparent", cursor: "pointer", borderRadius: "50%", outline: selectedFrameId === frame.id ? "2px solid #2588c2" : undefined, outlineOffset: 3 }}>{blocked ? blockedMarker : normalMarker}</button>
          const markerContent = attack && !blocked ? attackMarker : marker
          return <div key={frame.id} style={{ position: "absolute", left: `${frame.time / 5}%`, top: 0, transform: "translateX(-50%)", width: 1, height: "100%", animation: `ips-frame-fade .3s ease-out ${index * .3}s both` }}>
            {counterLabel && <small style={{ position: "absolute", top: 24, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", textAlign: "center", fontSize: 11, color: attack || blocked ? "#991b1b" : "var(--text-secondary)" }}>{counterLabel}</small>}
            <span style={{ position: "absolute", top: attack || blocked ? 59 : 63, left: "50%", transform: "translateX(-50%)" }}>{markerContent}</span>
            <small style={{ position: "absolute", top: 113, left: "50%", transform: "translateX(-50%)", whiteSpace: "nowrap", textAlign: "center", fontSize: 11, color: blocked ? "#991b1b" : "var(--text-secondary)" }}>{(frame.time / 1000).toFixed(frame.time % 100 === 0 ? 1 : 2)}s</small>
          </div>
        })}
      </div>
    </div>
  </section>
}
