import { useState } from "react"
import "./RulePacketAnalysis.css"

export type RulePacketEvent = {
  id: number
  timestamp: number
  elapsedMs: number
  time: string
  canId: string
  data: string
  verdict: "IDLE" | "ALERT" | "PASS" | "EXECUTED"
  reason: string
}

const columns = [
  ["canId", "CAN ID"], ["dlc", "DLC"], ["data", "DATA"],
  ["ids", "IDS 판정"], ["execution", "실행 결과"], ["reason", "탐지 근거"],
] as const
type Column = typeof columns[number][0]

export default function RulePacketAnalysis({ events, onClear }: { events: RulePacketEvent[]; onClear: () => void }) {
  const [search, setSearch] = useState("")
  const [verdict, setVerdict] = useState("all")
  const [range, setRange] = useState("all")
  const [bucket, setBucket] = useState<number | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [fields, setFields] = useState<Column[]>(["canId", "data", "ids", "execution", "reason"])
  const latest = events.at(-1)?.elapsedMs ?? 0
  const matching = events.filter((event) =>
    (verdict === "all" || (event.verdict === "ALERT" ? "alert" : "pass") === verdict) &&
    (range === "all" || event.elapsedMs >= latest - Number(range) * 1000) &&
    `${event.canId} ${event.data} ${event.reason} ${event.verdict}`.toLowerCase().includes(search.toLowerCase().trim()),
  )
  // Limit the chart to 24 bins while retaining every packet in the aggregation.
  const interval = Math.max(1000, Math.ceil((latest + 1) / 24000) * 1000)
  const binCount = Math.max(1, Math.floor(latest / interval) + 1)
  const bins = Array.from({ length: binCount }, (_, index) => ({ index, pass: 0, alert: 0 }))
  matching.forEach((event) => { bins[Math.floor(event.elapsedMs / interval)][event.verdict === "ALERT" ? "alert" : "pass"] += 1 })
  const peak = Math.max(1, ...bins.map((bin) => bin.pass + bin.alert))
  const filtered = matching.filter((event) => bucket === null || Math.floor(event.elapsedMs / interval) === bucket)
  const alerts = events.filter((event) => event.verdict === "ALERT").length
  const executions = events.filter((event) => event.verdict === "EXECUTED").length
  const value = (event: RulePacketEvent, column: Column) => {
    switch (column) {
      case "canId": return event.canId
      case "dlc": return event.data.length / 2
      case "data": return event.data
      case "ids": return event.verdict === "ALERT" ? "ALERT" : "PASS"
      case "execution": return event.verdict === "EXECUTED" ? "EXECUTED" : "NOT_EXECUTED"
      case "reason": return event.reason
    }
  }

  return <section className="rule-analysis" aria-label="패킷 분석 대시보드">
    <header className="rule-analysis__header"><div><small>IDS / PACKET DISCOVER</small><h2>패킷 분석</h2><p>CAN 프레임과 화이트리스트 검사 결과를 함께 확인하세요.</p></div><button type="button" onClick={() => { onClear(); setBucket(null); setExpanded(null) }}>로그 비우기</button></header>
    <div className="rule-analysis__stats">{[["전체 패킷", events.length], ["IDS 통과", events.length - alerts], ["IDS 탐지", alerts], ["명령 실행", executions]].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
    <div className="rule-analysis__filters">
      <input aria-label="패킷 검색" placeholder="CAN ID, DATA, 탐지 근거 검색" value={search} onChange={(e) => { setSearch(e.target.value); setBucket(null) }} />
      <select aria-label="IDS 판정 필터" value={verdict} onChange={(e) => { setVerdict(e.target.value); setBucket(null) }}><option value="all">모든 판정</option><option value="pass">PASS</option><option value="alert">ALERT</option></select>
      <select aria-label="시간 범위" value={range} onChange={(e) => { setRange(e.target.value); setBucket(null) }}><option value="all">전체 시간</option><option value="10">최근 패킷 기준 10초</option><option value="60">최근 패킷 기준 1분</option></select>
    </div>
    <div className="rule-analysis__chart-panel">
      <div className="rule-analysis__chart-heading"><strong>시간별 패킷 수</strong><span><i className="is-pass" /> PASS <i className="is-alert" /> ALERT</span></div>
      <div className="rule-analysis__chart" aria-label="시간별 패킷 발생 그래프">
        <div className="rule-analysis__axis"><span>{peak}</span><span>0</span></div>
        <div className="rule-analysis__bins">{bins.map((bin) => <button key={bin.index} type="button" aria-pressed={bucket === bin.index} aria-label={`${bin.index * interval / 1000}초 구간: PASS ${bin.pass}, ALERT ${bin.alert}`} title={`PASS ${bin.pass} / ALERT ${bin.alert}`} onClick={() => setBucket(bucket === bin.index ? null : bin.index)}><span className="is-alert" style={{ height: `${bin.alert / peak * 100}%` }} /><span className="is-pass" style={{ height: `${bin.pass / peak * 100}%` }} /></button>)}</div>
      </div>
      <div className="rule-analysis__chart-caption"><span>0초</span><span>실습 경과 시간 · {interval / 1000}초 단위</span><span>{binCount * interval / 1000}초</span></div>
      {bucket !== null && <button type="button" onClick={() => setBucket(null)}>시간 구간 선택 해제 ({bucket * interval / 1000}–{(bucket + 1) * interval / 1000}초)</button>}
    </div>
    <div className="rule-analysis__results">
      <aside><strong>표시 필드</strong>{columns.map(([key, label]) => <label key={key}><input type="checkbox" checked={fields.includes(key)} onChange={(e) => setFields((current) => e.target.checked ? [...current, key] : current.filter((field) => field !== key))} />{label}</label>)}</aside>
      <div className="rule-analysis__table-wrap"><div className="rule-analysis__hits"><strong>{filtered.length}개 이벤트</strong><span>행을 펼쳐 원본과 분석 정보 확인</span></div><table><thead><tr><th aria-label="상세" /><th>시간</th>{columns.filter(([key]) => fields.includes(key)).map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{filtered.slice().reverse().map((event) => <PacketRows key={event.id} event={event} fields={fields} value={value} expanded={expanded === event.id} onToggle={() => setExpanded(expanded === event.id ? null : event.id)} />)}</tbody></table>{filtered.length === 0 && <p className="rule-analysis__empty">{events.length === 0 ? "아직 수신된 패킷이 없습니다. Terminal에서 cansend 명령을 실행하세요." : "조건에 맞는 패킷이 없습니다."}</p>}</div>
    </div>
  </section>
}

function PacketRows({ event, fields, value, expanded, onToggle }: { event: RulePacketEvent; fields: Column[]; value: (event: RulePacketEvent, column: Column) => string | number; expanded: boolean; onToggle: () => void }) {
  return <><tr><td><button type="button" aria-label={`패킷 ${event.id} 상세`} aria-expanded={expanded} onClick={onToggle}>{expanded ? "−" : "+"}</button></td><td><time dateTime={new Date(event.timestamp).toISOString()}>{event.time}</time><small>+{(event.elapsedMs / 1000).toFixed(3)}s</small></td>{columns.filter(([key]) => fields.includes(key)).map(([key]) => <td key={key}>{key === "ids" ? <span className={`rule-analysis__badge ${event.verdict === "ALERT" ? "is-alert" : "is-pass"}`}>{value(event, key)}</span> : value(event, key)}</td>)}</tr>{expanded && <tr><td colSpan={fields.length + 2}><div className="rule-analysis__detail"><dl><dt>이벤트 ID</dt><dd>{event.id}</dd><dt>인터페이스</dt><dd>vcan0</dd><dt>적용 규칙</dt><dd>CAN ID whitelist · 0x101 / 0x200 / 0x201</dd><dt>원본 프레임</dt><dd>{event.canId.slice(2)}#{event.data}</dd><dt>탐지 근거</dt><dd>{event.reason}</dd><dt>실행 결과</dt><dd>{value(event, "execution")}</dd></dl><pre>{JSON.stringify({ timestamp: new Date(event.timestamp).toISOString(), event: { id: event.id, elapsed_ms: event.elapsedMs }, can: { interface: "vcan0", id: event.canId, dlc: event.data.length / 2, data: event.data }, ids: { status: value(event, "ids"), rule: "CAN_ID_WHITELIST", description: event.reason }, execution: value(event, "execution") }, null, 2)}</pre></div></td></tr>}</>
}
