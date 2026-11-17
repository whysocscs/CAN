import { useState } from "react"
import "./RulePacketAnalysis.css"

export type CounterValidation = {
  expectedCounter: number | null
  counterResult: "PASS" | "REJECTED" | "NOT_CHECKED"
  stateBefore: "CLOSED" | "OPEN"
  stateAfter: "CLOSED" | "OPEN"
  stateResult: "PASS" | "ANOMALY" | "NOT_CHECKED"
  replayed: boolean
  originalEventId?: number
  reasonCode: string
  phase: string
}

export type RulePacketEvent = {
  id: number
  timestamp: number
  elapsedMs: number
  time: string
  canId: string
  data: string
  verdict: "IDLE" | "ALERT" | "ANOMALY" | "PASS" | "EXECUTED"
  reason: string
  ruleId?: "CAN_ID_WHITELIST" | "CAN_PERIOD" | "CAN_PERIOD_NOT_CHECKED" | "CAN_COUNTER" | "CAN_REPLAY" | "CAN_STATE" | "CAN_COMMAND" | "CAN_NOT_MONITORED"
  period?: { expectedMs: number; observedMs: number | null; checked: boolean; injected: boolean }
  command?: string
  counter?: number
  validation?: CounterValidation
}

const columns = [
  ["canId", "CAN ID"], ["dlc", "DLC"], ["data", "DATA"],
  ["ids", "IDS 판정"], ["execution", "실행 결과"], ["reason", "탐지 근거"],
  ["expected", "기대 주기"], ["observed", "수신 간격"], ["source", "패킷 출처"],
  ["command", "COMMAND"], ["counter", "COUNTER"], ["expectedCounter", "Expected Counter"],
  ["counterResult", "Counter 검사"], ["stateResult", "상태 검사"], ["reasonCode", "판정 코드"],
] as const
type Column = typeof columns[number][0]

const isAlert = (event: RulePacketEvent) => event.verdict === "ALERT" || event.verdict === "ANOMALY"
const isUnchecked = (event: RulePacketEvent) => event.ruleId === "CAN_NOT_MONITORED"
const counterLabel = (counter: number | null | undefined) => counter == null ? "—" : `${counter} (0x${counter.toString(16).toUpperCase().padStart(2, "0")})`

export default function RulePacketAnalysis({ events, onClear, mode = "rule", periodWindow, expectedCounter }: { events: RulePacketEvent[]; onClear: () => void; mode?: "rule" | "period" | "counter"; periodWindow?: { startMs: number; endMs: number }; expectedCounter?: number }) {
  const [search, setSearch] = useState("")
  const [verdict, setVerdict] = useState("all")
  const [range, setRange] = useState("all")
  const [bucket, setBucket] = useState<{ start: number; end: number } | null>(null)
  const [expanded, setExpanded] = useState<number | null>(null)
  const [fields, setFields] = useState<Column[]>(mode === "counter" ? ["canId", "data", "command", "counter", "expectedCounter", "ids", "reason"] : mode === "period" ? ["canId", "data", "ids", "observed", "reason"] : ["canId", "data", "ids", "execution", "reason"])
  const counterColumns = ["command", "counter", "expectedCounter", "counterResult", "stateResult", "reasonCode"]
  const availableColumns = columns.filter(([key]) => mode === "counter" ? !["execution", "expected", "observed", "source"].includes(key) : !counterColumns.includes(key) && (mode === "period" ? key !== "execution" : !["expected", "observed", "source"].includes(key)))
  const latest = events.at(-1)?.elapsedMs ?? 0
  const matching = events.filter((event) =>
    (verdict === "all" || (isUnchecked(event) ? "not_checked" : isAlert(event) ? "alert" : "pass") === verdict) &&
    (range === "all" || event.elapsedMs >= latest - Number(range) * 1000) &&
    `${event.canId} ${event.data} ${event.reason} ${event.verdict} ${event.command ?? ""} ${event.counter ?? ""} ${event.validation?.reasonCode ?? ""}`.toLowerCase().includes(search.toLowerCase().trim()),
  )
  // Use readable intervals and at most 12 bins, including pauses between packets.
  const minimumInterval = (latest + 1) / 12
  const interval = [5000, 10000, 15000, 30000, 60000, 120000, 300000, 600000]
    .find((duration) => duration >= minimumInterval)
    ?? Math.ceil(minimumInterval / 600000) * 600000
  const firstBin = 0
  const binCount = Math.max(1, Math.floor(latest / interval) + 1)
  const bins = Array.from({ length: binCount }, (_, index) => ({ index: firstBin + index, pass: 0, alert: 0 }))
  matching.forEach((event) => {
    const bin = bins[Math.floor(event.elapsedMs / interval) - firstBin]
    if (bin) bin[isAlert(event) ? "alert" : "pass"] += 1
  })
  const peak = Math.max(1, ...bins.map((bin) => bin.pass + bin.alert))
  const filtered = matching.filter((event) => bucket === null || (event.elapsedMs >= bucket.start && event.elapsedMs < bucket.end))
  const alerts = events.filter(isAlert).length
  const executions = events.filter((event) => event.verdict === "EXECUTED").length
  const latestPeriodMs = events.filter((event) => event.period).at(-1)?.elapsedMs ?? 0
  const chartWindow = periodWindow ?? { startMs: Math.max(0, latestPeriodMs - 900), endMs: Math.max(1000, latestPeriodMs + 100) }
  const value = (event: RulePacketEvent, column: Column) => {
    switch (column) {
      case "canId": return event.canId
      case "dlc": return event.data.length / 2
      case "data": return event.data
      case "ids": return isUnchecked(event) ? "NOT_CHECKED" : isAlert(event) ? "ALERT" : "PASS"
      case "execution": return event.verdict === "EXECUTED" ? "EXECUTED" : "NOT_EXECUTED"
      case "reason": return event.reason
      case "expected": return event.period ? `${event.period.expectedMs} ms` : "—"
      case "observed": return event.period?.observedMs != null ? `${event.period.observedMs} ms` : "—"
      case "source": return event.period ? event.period.injected ? "수동 주입" : "정상 ECU" : "수동 주입"
      case "command": return event.command ?? "—"
      case "counter": return counterLabel(event.counter)
      case "expectedCounter": return counterLabel(event.validation?.expectedCounter)
      case "counterResult": return event.validation?.counterResult ?? "—"
      case "stateResult": return event.validation?.stateResult ?? "—"
      case "reasonCode": return event.validation?.reasonCode ?? "—"
    }
  }

  return <section className={`rule-analysis rule-analysis--${mode}`} aria-label="패킷 분석 대시보드">
    <header className="rule-analysis__header"><div><small>IDS / PACKET DISCOVER</small><h2>패킷 분석</h2><p>{mode === "counter" ? "원본 COMMAND / COUNTER · Replay 및 상태 검증 결과" : mode === "period" ? "최근 100개 CAN 프레임 · 정상 ECU 100ms 주기 · 80ms 미만 간격 탐지" : "CAN 프레임과 화이트리스트 검사 결과를 함께 확인하세요."}</p></div><button type="button" onClick={() => { onClear(); setBucket(null); setExpanded(null) }}>로그 비우기</button></header>
    <div className="rule-analysis__stats">{[[mode === "period" ? "수신 패킷" : "전체 패킷", events.length], ["IDS 통과", events.filter((event) => !isAlert(event) && !isUnchecked(event)).length], ["IDS 탐지", alerts], mode === "counter" ? ["다음 Counter", counterLabel(expectedCounter)] : mode === "period" ? ["기대 주기", "100 ms"] : ["명령 실행", executions]].map(([label, count]) => <div key={label}><span>{label}</span><strong>{count}</strong></div>)}</div>
    <div className="rule-analysis__filters">
      <input aria-label="패킷 검색" placeholder="CAN ID, DATA, 탐지 근거 검색" value={search} onChange={(e) => { setSearch(e.target.value); setBucket(null) }} />
      <select aria-label="IDS 판정 필터" value={verdict} onChange={(e) => { setVerdict(e.target.value); setBucket(null) }}><option value="all">모든 판정</option><option value="pass">PASS</option><option value="alert">ALERT</option>{mode === "counter" && <option value="not_checked">검사 대상 아님</option>}</select>
      <select aria-label="시간 범위" value={range} onChange={(e) => { setRange(e.target.value); setBucket(null) }}><option value="all">전체 시간</option><option value="10">최근 패킷 기준 10초</option><option value="60">최근 패킷 기준 1분</option></select>
    </div>
    {mode === "rule" && <div className="rule-analysis__chart-panel">
      <div className="rule-analysis__chart-heading"><strong>시간별 패킷 수</strong><span><i className="is-pass" /> PASS <i className="is-alert" /> ALERT</span></div>
      <div className="rule-analysis__chart" aria-label="시간별 패킷 발생 그래프">
        <div className="rule-analysis__axis"><span>{peak}</span><span>0</span></div>
        <div className="rule-analysis__bins">{bins.map((bin) => <button key={bin.index} type="button" aria-pressed={bucket?.start === bin.index * interval && bucket?.end === (bin.index + 1) * interval} aria-label={`${bin.index * interval / 1000}초 구간: PASS ${bin.pass}, ALERT ${bin.alert}`} title={`PASS ${bin.pass} / ALERT ${bin.alert}`} onClick={() => setBucket(bucket?.start === bin.index * interval && bucket?.end === (bin.index + 1) * interval ? null : { start: bin.index * interval, end: (bin.index + 1) * interval })}><span className="is-alert" style={{ height: `${bin.alert / peak * 100}%` }} /><span className="is-pass" style={{ height: `${bin.pass / peak * 100}%` }} /></button>)}</div>
      </div>
      <div className="rule-analysis__chart-caption"><span>{firstBin * interval / 1000}초</span><span>실습 경과 시간 · {interval / 1000}초 단위</span><span>{(firstBin + binCount) * interval / 1000}초</span></div>
      {bucket !== null && <button type="button" onClick={() => setBucket(null)}>시간 구간 선택 해제 ({bucket.start / 1000}–{bucket.end / 1000}초)</button>}
    </div>}
    {mode === "period" && <PeriodIntervalChart events={matching.filter((event) => event.elapsedMs >= chartWindow.startMs && event.elapsedMs <= chartWindow.endMs)} window={chartWindow} />}
    {mode === "counter" && <CounterValidationChart events={matching} onSelect={setExpanded} />}
    <div className="rule-analysis__results">
      <aside><strong>표시 필드</strong>{availableColumns.map(([key, label]) => <label key={key}><input type="checkbox" checked={fields.includes(key)} onChange={(e) => setFields((current) => e.target.checked ? [...current, key] : current.filter((field) => field !== key))} />{label}</label>)}</aside>
      <div className="rule-analysis__table-wrap"><div className="rule-analysis__hits"><strong>{filtered.length}개 이벤트</strong><span>행을 펼쳐 원본과 분석 정보 확인</span></div><table><thead><tr><th aria-label="상세" /><th>시간</th>{columns.filter(([key]) => fields.includes(key)).map(([key, label]) => <th key={key}>{label}</th>)}</tr></thead><tbody>{filtered.slice().reverse().map((event) => <PacketRows key={event.id} event={event} fields={fields} value={value} expanded={expanded === event.id} onToggle={() => setExpanded(expanded === event.id ? null : event.id)} />)}</tbody></table>{filtered.length === 0 && <p className="rule-analysis__empty">{events.length === 0 ? "아직 수신된 패킷이 없습니다. Terminal에서 cansend 명령을 실행하세요." : "조건에 맞는 패킷이 없습니다."}</p>}</div>
    </div>
  </section>
}

function CounterValidationChart({ events, onSelect }: { events: RulePacketEvent[]; onSelect: (id: number) => void }) {
  const samples = events.filter((event) => event.counter !== undefined && event.validation?.expectedCounter != null && event.validation.counterResult !== "NOT_CHECKED")
  const values = samples.flatMap((event) => [event.counter!, event.validation!.expectedCounter!])
  const minimum = Math.max(0, Math.min(...values, 10) - 1)
  const maximum = Math.max(...values, 14) + 1
  const x = (index: number) => 48 + index / Math.max(1, samples.length - 1) * 500
  const y = (counter: number) => 112 - (counter - minimum) / (maximum - minimum) * 90
  return <div className="rule-analysis__chart-panel rule-analysis__period-chart">
    <div className="rule-analysis__chart-heading"><strong>Counter 검증</strong><span>기대값 · 수신값 · 탐지 패킷</span></div>
    <p>각 패킷을 검사한 시점의 Expected / Received Counter입니다. 점을 선택하면 상세 정보가 열립니다.</p>
    {samples.length === 0 ? <p>검사된 패킷이 없습니다.</p> : <svg viewBox="0 0 600 150" role="img" aria-label="Counter 검증 그래프: 기대값과 수신값 비교">
      <text x="5" y="24">{maximum}</text><text x="5" y="116">{minimum}</text>
      <polyline points={samples.map((event, index) => `${x(index)},${y(event.validation!.expectedCounter!)}`).join(" ")} fill="none" stroke="#56ab98" strokeWidth="2" strokeDasharray="6 4" />
      <polyline points={samples.map((event, index) => `${x(index)},${y(event.counter!)}`).join(" ")} fill="none" stroke="#2588c2" strokeWidth="2" />
      {samples.map((event, index) => <g key={event.id}>
        <circle cx={x(index)} cy={y(event.validation!.expectedCounter!)} r="3" fill="#56ab98" />
        <circle cx={x(index)} cy={y(event.counter!)} r="5" fill={isAlert(event) ? "#d86460" : "#2588c2"} data-event-id={event.id} data-expected-counter={event.validation!.expectedCounter} data-received-counter={event.counter} role="button" tabIndex={0} aria-label={`패킷 ${event.id}: Expected ${event.validation!.expectedCounter}, Received ${event.counter}, ${event.validation!.reasonCode}`} onClick={() => onSelect(event.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(event.id) } }}><title>{`패킷 ${event.id} · Expected ${counterLabel(event.validation!.expectedCounter)} · Received ${counterLabel(event.counter)} · ${event.validation!.reasonCode}`}</title></circle>
        {(index % Math.max(1, Math.ceil(samples.length / 10)) === 0 || index === samples.length - 1) && <text x={x(index)} y="142" textAnchor="middle">#{event.id}</text>}
      </g>)}
    </svg>}
    <div className="rule-analysis__chart-caption"><span>수신 순서</span><span>초록 점선: 기대값 · 파랑: 수신값 · 빨강: 탐지</span></div>
  </div>
}

function PacketRows({ event, fields, value, expanded, onToggle }: { event: RulePacketEvent; fields: Column[]; value: (event: RulePacketEvent, column: Column) => string | number; expanded: boolean; onToggle: () => void }) {
  const ruleId = event.ruleId ?? "CAN_ID_WHITELIST"
  const ruleLabel = { CAN_ID_WHITELIST: "CAN ID whitelist · 0x101 / 0x200 / 0x201", CAN_PERIOD: "CAN 주기 검사 · 기대 100ms / 80ms 미만 탐지", CAN_PERIOD_NOT_CHECKED: "주기 검사 미적용", CAN_COUNTER: "Counter 순서 검증", CAN_REPLAY: "과거 Counter 재전송 탐지", CAN_STATE: "열린 도어의 OPEN 명령 탐지", CAN_COMMAND: "COMMAND 검증", CAN_NOT_MONITORED: "검사 대상이 아닌 CAN ID" }[ruleId]
  return <>
    <tr>
      <td><button type="button" aria-label={`패킷 ${event.id} 상세`} aria-expanded={expanded} onClick={onToggle}>{expanded ? "−" : "+"}</button></td>
      <td><time dateTime={new Date(event.timestamp).toISOString()}>{event.time}</time><small>+{(event.elapsedMs / 1000).toFixed(3)}s</small></td>
      {columns.filter(([key]) => fields.includes(key)).map(([key]) => <td key={key}>{key === "ids" ? <span className={`rule-analysis__badge ${isUnchecked(event) ? "is-unchecked" : isAlert(event) ? "is-alert" : "is-pass"}`}>{value(event, key)}</span> : value(event, key)}</td>)}
    </tr>
    {expanded && <tr><td colSpan={fields.length + 2}><div className="rule-analysis__detail">
      <dl>
        <dt>이벤트 ID</dt><dd>{event.id}</dd><dt>인터페이스</dt><dd>vcan0</dd>
        <dt>적용 규칙</dt><dd>{ruleLabel}</dd><dt>원본 프레임</dt><dd>{event.canId.slice(2)}#{event.data}</dd>
        <dt>탐지 근거</dt><dd>{event.reason}</dd>
        {event.validation && <>
          <dt>COMMAND</dt><dd>{value(event, "command")}</dd><dt>Received Counter</dt><dd>{value(event, "counter")}</dd><dt>Expected Counter</dt><dd>{value(event, "expectedCounter")}</dd>
          <dt>Counter 검사</dt><dd>{value(event, "counterResult")}</dd><dt>상태 검사</dt><dd>{value(event, "stateResult")}</dd>
          <dt>도어 상태</dt><dd>{event.validation.stateBefore} → {event.validation.stateAfter}</dd><dt>판정 코드</dt><dd>{event.validation.reasonCode}</dd>
          <dt>실습 단계</dt><dd>{event.validation.phase}</dd>{event.validation.originalEventId !== undefined && <><dt>Replay 원본</dt><dd>패킷 {event.validation.originalEventId}</dd></>}
        </>}
        {event.period ? <><dt>기대 주기</dt><dd>{value(event, "expected")}</dd><dt>수신 간격</dt><dd>{value(event, "observed")}</dd><dt>주기 검사</dt><dd>{event.period.checked ? "적용" : "미적용"}</dd><dt>패킷 출처</dt><dd>{value(event, "source")}</dd></> : !event.validation && <><dt>실행 결과</dt><dd>{value(event, "execution")}</dd></>}
      </dl>
      <pre>{JSON.stringify({ timestamp: new Date(event.timestamp).toISOString(), event: { id: event.id, elapsed_ms: event.elapsedMs }, can: { interface: "vcan0", id: event.canId, dlc: event.data.length / 2, data: event.data, ...(event.validation ? { command: event.command, counter: event.counter } : {}) }, ids: { status: value(event, "ids"), rule: ruleId, description: event.reason, ...(event.validation ? { expected_counter: event.validation.expectedCounter, received_counter: event.counter, counter_result: event.validation.counterResult, state_result: event.validation.stateResult, reason_code: event.validation.reasonCode } : {}), ...(event.period ? { expected_period_ms: event.period.expectedMs, observed_interval_ms: event.period.observedMs, period_check_applied: event.period.checked } : {}) }, ...(event.validation ? { state: { before: event.validation.stateBefore, after: event.validation.stateAfter }, replay: { replayed: event.validation.replayed, original_event_id: event.validation.originalEventId }, lab: { phase: event.validation.phase } } : event.period ? { source: value(event, "source") } : { execution: value(event, "execution") }) }, null, 2)}</pre>
    </div></td></tr>}
  </>
}

function PeriodIntervalChart({ events, window }: { events: RulePacketEvent[]; window: { startMs: number; endMs: number } }) {
  const samples = events.filter((event) => event.period?.observedMs != null)
  const maxMs = Math.max(150, ...samples.map((event) => event.period!.observedMs!))
  const first = window.startMs
  const span = window.endMs - window.startMs
  const x = (event: RulePacketEvent) => 48 + (event.elapsedMs - first) / span * 500
  const y = (ms: number) => 112 - ms / maxMs * 90
  return <div className="rule-analysis__chart-panel rule-analysis__period-chart">
    <div className="rule-analysis__chart-heading"><strong>실제 수신 간격</strong><span>타임라인과 동일한 1초 구간 · 기대 100ms</span></div>
    {samples.length === 0 ? <p>두 번째 대상 패킷부터 실제 수신 간격이 표시됩니다.</p> : <svg viewBox="0 0 600 150" role="img" aria-label="수신 간격 그래프: 기대 100ms, 탐지 기준 80ms 미만">
      <line x1="48" x2="550" y1={y(100)} y2={y(100)} stroke="#56ab98" strokeDasharray="6 4" />
      <text x="555" y={y(100) + 4}>100ms</text>
      <line x1="48" x2="550" y1={y(80)} y2={y(80)} stroke="#d86460" strokeDasharray="3 4" />
      <text x="555" y={y(80) + 4}>80ms</text>
      <text x="5" y="24">{maxMs}ms</text><text x="16" y="116">0ms</text>
      <polyline points={samples.map((event) => `${x(event)},${y(event.period!.observedMs!)}`).join(" ")} fill="none" stroke="#2588c2" strokeWidth="2" />
      {samples.map((event) => <circle key={event.id} data-event-id={event.id} data-verdict={event.verdict} cx={x(event)} cy={y(event.period!.observedMs!)} r="4" fill={isAlert(event) ? "#d86460" : "#56ab98"}><title>{`패킷 ${event.id} · ${(event.elapsedMs / 1000).toFixed(3)}초 · ${event.period!.observedMs} ms · ${event.verdict}`}</title></circle>)}
      {Array.from({ length: 11 }, (_, index) => <text key={index} x={48 + index * 50} y="142" textAnchor="middle">{((first + index * 100) / 1000).toFixed(2)}s</text>)}
    </svg>}
  </div>
}
