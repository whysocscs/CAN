import { useEffect, useState } from "react"
import { shouldBlock, type IpsFrame, type IpsRule } from "./IpsBlockingTimeline"
import "./RulePacketAnalysis.css"

const ruleLabels: Record<IpsRule, string> = { none: "규칙 미적용", id: "CAN ID 전체 차단", counter: "Counter 검증 위반 차단", period: "주기 검증 위반 차단" }
const columns = [["canId", "CAN ID"], ["dlc", "DLC"], ["data", "DATA"], ["counter", "COUNTER"], ["ids", "IDS 판정"], ["action", "IPS 처리"], ["delivered", "ECU 전달"], ["rule", "적용 규칙"], ["reason", "처리 근거"]] as const
type Column = typeof columns[number][0]
const action = (frame: IpsFrame, rule: IpsRule) => shouldBlock(frame, rule) ? "BLOCK" : "ALLOW"
const detection = (frame: IpsFrame) => frame.ids === "REPLAY" ? "Replay detected: expected counter 14, received 11." : frame.ids === "PERIOD" ? "Period anomaly: expected 100 ms, observed 50 ms." : "정상 시나리오 패킷 · IDS 통과"
const reason = (frame: IpsFrame, rule: IpsRule) => shouldBlock(frame, rule)
  ? rule === "id" ? `CAN ID ${frame.canId} 전체 차단${frame.kind === "normal" ? " · 정상 패킷 과잉 차단" : ""}` : rule === "counter" ? "Replay 탐지 · Counter 위반 차단" : "주기 이상 탐지 · 주기 위반 차단"
  : frame.kind === "attack" ? rule === "none" ? "차단 규칙 미적용 · 탐지된 공격 허용" : "탐지 유형과 차단 규칙 불일치 · 공격 허용" : "정상 패킷 허용"

export default function IpsPacketAnalysis({ frames, rule, onClear, selectedFrameId, selectionRevision, onShowAll }: { frames: IpsFrame[]; rule: IpsRule; onClear: () => void; selectedFrameId: string | null; selectionRevision: number; onShowAll: () => void }) {
  const [search, setSearch] = useState("")
  const [idsFilter, setIdsFilter] = useState("all")
  const [actionFilter, setActionFilter] = useState("all")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [fields, setFields] = useState<Column[]>(["canId", "data", "ids", "action", "delivered", "reason"])
  useEffect(() => {
    setExpanded(selectedFrameId)
    setSearch("")
    setIdsFilter("all")
    setActionFilter("all")
  }, [selectedFrameId, selectionRevision])
  const entries = frames.map((frame, index) => ({ frame, no: index + 1 }))
  const matching = entries.filter(({ frame }) =>
    (selectedFrameId === null || frame.id === selectedFrameId) &&
    (idsFilter === "all" || (frame.ids === "PASS" ? "pass" : "alert") === idsFilter) &&
    (actionFilter === "all" || action(frame, rule) === actionFilter) &&
    `${frame.canId} ${frame.data} ${frame.counter ?? ""} ${frame.ids} ${action(frame, rule)} ${reason(frame, rule)} ${ruleLabels[rule]}`.toLowerCase().includes(search.trim().toLowerCase()),
  )
  const blocked = frames.filter((frame) => shouldBlock(frame, rule)).length
  const overblocked = frames.filter((frame) => frame.kind === "normal" && shouldBlock(frame, rule)).length
  const leaked = frames.filter((frame) => frame.kind === "attack" && !shouldBlock(frame, rule)).length
  const value = (frame: IpsFrame, field: Column): string | number => {
    switch (field) {
      case "canId": return frame.canId
      case "dlc": return frame.data.length / 2
      case "data": return frame.data
      case "counter": return frame.counter === undefined ? "—" : `${frame.counter} (0x${frame.counter.toString(16).toUpperCase().padStart(2, "0")})`
      case "ids": return frame.ids === "PASS" ? "PASS" : `ALERT · ${frame.ids}`
      case "action": return action(frame, rule)
      case "delivered": return shouldBlock(frame, rule) ? "NOT_DELIVERED" : "DELIVERED"
      case "rule": return ruleLabels[rule]
      case "reason": return reason(frame, rule)
    }
  }
  return <section className="rule-analysis" aria-label="IPS 패킷 분석 대시보드">
    <header className="rule-analysis__header"><div><small>IPS / PACKET DISCOVER</small><h2>패킷 분석</h2><p>고정 시나리오 · 현재 적용 규칙 기준으로 패킷 처리 결과를 재평가합니다.</p></div><button type="button" onClick={() => { onClear(); setExpanded(null) }}>로그 비우기</button></header>
    <div className="rule-analysis__stats">{[["수신 패킷", frames.length], ["IPS 허용", frames.length - blocked], ["IPS 차단", blocked], ["IDS 탐지", frames.filter((frame) => frame.ids !== "PASS").length]].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
    <p aria-live="polite">적용 규칙: {ruleLabels[rule]} · 정상 패킷 차단 {overblocked}개 · 공격 패킷 허용 {leaked}개</p>
    <div className="rule-analysis__hits" aria-live="polite"><span>{selectedFrameId === null ? "타임라인의 패킷을 클릭하면 상세 정보가 표시됩니다." : `선택한 패킷: #${entries.find((entry) => entry.frame.id === selectedFrameId)?.no ?? "—"}`}</span>{selectedFrameId !== null && <button type="button" onClick={onShowAll}>전체 패킷 보기</button>}</div>
    <div className="rule-analysis__filters">
      <input aria-label="패킷 검색" placeholder="CAN ID, DATA, 탐지 유형, 처리 근거 검색" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select aria-label="IDS 판정 필터" value={idsFilter} onChange={(e) => setIdsFilter(e.target.value)}><option value="all">모든 IDS 판정</option><option value="pass">PASS</option><option value="alert">ALERT</option></select>
      <select aria-label="IPS 처리 필터" value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}><option value="all">모든 IPS 처리</option><option value="ALLOW">ALLOW</option><option value="BLOCK">BLOCK</option></select>
    </div>
    <div className="rule-analysis__results">
      <aside><strong>표시 필드</strong>{columns.map(([key, label]) => <label key={key}><input type="checkbox" checked={fields.includes(key)} onChange={(e) => setFields((current) => e.target.checked ? [...current, key] : current.filter((field) => field !== key))} />{label}</label>)}</aside>
      <div className="rule-analysis__table-wrap"><div className="rule-analysis__hits"><strong>{matching.length}개 이벤트</strong><span>행을 펼쳐 원본과 차단 근거 확인</span></div>
        <table><thead><tr><th aria-label="상세" /><th>시나리오 시간</th>{columns.filter(([key]) => fields.includes(key)).map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{matching.slice().reverse().map(({ frame, no }) => <IpsPacketRows key={frame.id} frame={frame} no={no} rule={rule} fields={fields} value={value} expanded={expanded === frame.id} onToggle={() => setExpanded(expanded === frame.id ? null : frame.id)} />)}</tbody></table>
        {matching.length === 0 && <p className="rule-analysis__empty">{frames.length === 0 ? "시작 또는 규칙 적용 시 시나리오 패킷이 표시됩니다." : "조건에 맞는 패킷이 없습니다."}</p>}
      </div>
    </div>
  </section>
}

function IpsPacketRows({ frame, no, rule, fields, value, expanded, onToggle }: { frame: IpsFrame; no: number; rule: IpsRule; fields: Column[]; value: (frame: IpsFrame, field: Column) => string | number; expanded: boolean; onToggle: () => void }) {
  const blocked = shouldBlock(frame, rule)
  return <>
    <tr><td><button type="button" aria-label={`패킷 ${no} 상세`} aria-expanded={expanded} onClick={onToggle}>{expanded ? "−" : "+"}</button></td><td>{(frame.time / 1000).toFixed(2)}s</td>{columns.filter(([key]) => fields.includes(key)).map(([key]) => <td key={key}>{key === "ids" || key === "action" ? <span className={`rule-analysis__badge ${(key === "ids" ? frame.ids !== "PASS" : blocked) ? "is-alert" : "is-pass"}`}>{value(frame, key)}</span> : value(frame, key)}</td>)}</tr>
    {expanded && <tr><td colSpan={fields.length + 2}><div className="rule-analysis__detail"><dl>
      <dt>이벤트 ID</dt><dd>{frame.id}</dd><dt>원본 프레임</dt><dd>{frame.canId.slice(2)}#{frame.data}</dd><dt>COMMAND</dt><dd>{frame.data.slice(0, 2)}</dd><dt>COUNTER</dt><dd>{value(frame, "counter")}</dd>
      <dt>IDS 탐지</dt><dd>{detection(frame)}</dd><dt>IPS 처리</dt><dd>{value(frame, "action")}</dd><dt>적용 규칙</dt><dd>{ruleLabels[rule]}</dd><dt>처리 근거</dt><dd>{reason(frame, rule)}</dd><dt>ECU 전달</dt><dd>{value(frame, "delivered")}</dd>
      {frame.ids === "REPLAY" && <><dt>Expected Counter</dt><dd>14 (0x0E)</dd><dt>Received Counter</dt><dd>{value(frame, "counter")}</dd></>}
      {frame.ids === "PERIOD" && <><dt>기대 주기</dt><dd>100 ms</dd><dt>수신 간격</dt><dd>50 ms</dd></>}
    </dl><pre>{JSON.stringify({ event: { id: frame.id, scenario_time_ms: frame.time }, can: { interface: "vcan0", id: frame.canId, dlc: frame.data.length / 2, data: frame.data, command: frame.data.slice(0, 2), counter: frame.counter }, ids: { status: frame.ids === "PASS" ? "PASS" : "ALERT", detection: frame.ids, description: detection(frame), ...(frame.ids === "REPLAY" ? { expected_counter: 14, received_counter: frame.counter } : frame.ids === "PERIOD" ? { expected_period_ms: 100, observed_interval_ms: 50 } : {}) }, ips: { action: action(frame, rule), rule, reason: reason(frame, rule), ecu_delivered: !blocked }, simulation: true }, null, 2)}</pre></div></td></tr>}
  </>
}
