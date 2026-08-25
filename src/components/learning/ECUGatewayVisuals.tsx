export type ECUOverviewNode = {
  id: string
  label: string
  fullName: string
  category: "ecu" | "gateway"
  domain: string
  role: string
  functions: readonly string[]
}

export function ECUOverviewVisual({
  nodes,
  selectedId,
  onSelect,
}: {
  nodes: readonly ECUOverviewNode[]
  selectedId: string
  onSelect: (id: string) => void
}) {
  return (
    <div className="ecu-overview" aria-label="차량 기능을 담당하는 주요 ECU와 네트워크를 연결하는 Gateway ECU">
      <small>VEHICLE CONTROL COMPUTERS</small>
      <div className="ecu-overview__nodes">
        {nodes.map((node) => (
          <button key={node.id} type="button" className={selectedId === node.id ? "is-active" : ""} aria-pressed={selectedId === node.id} onClick={() => onSelect(node.id)}>
            <small>{node.category === "gateway" ? "NETWORK" : node.domain.toUpperCase()}</small>
            <strong>{node.label}</strong>
            <span>{node.functions.join(" · ")}</span>
          </button>
        ))}
      </div>
      <div className="ecu-overview__bus"><span>SHARED CAN NETWORK</span></div>
      <p>각 ECU는 필요한 정보를 받아 자신이 담당하는 차량 기능을 처리합니다.</p>
    </div>
  )
}

const pipelineStages = [
  ["CAN BUS", "CAN_H · CAN_L"],
  ["CAN TRANSCEIVER", "Physical Signal ↔ Logic"],
  ["CAN CONTROLLER", "Frame 처리 · Filtering"],
  ["MCU / ECU SOFTWARE", "Data 의미 해석"],
  ["VEHICLE FUNCTION", "실제 기능 실행"],
] as const

export function ECUPipelineVisual() {
  return (
    <div className="ecu-pipeline" role="img" aria-label="CAN Bus 신호가 Transceiver, CAN Controller, ECU Software를 거쳐 차량 기능으로 변환되는 처리 파이프라인">
      <small>ECU RECEIVE PATH</small>
      <div>
        {pipelineStages.map(([label, detail], index) => (
          <span key={label} className={index === 0 || index === pipelineStages.length - 1 ? "is-edge" : ""}>
            <i>{String(index + 1).padStart(2, "0")}</i><strong>{label}</strong><small>{detail}</small>
          </span>
        ))}
      </div>
      <dl>
        <div><dt>Transceiver</dt><dd>물리 신호 변환</dd></div>
        <div><dt>Controller</dt><dd>CAN 프로토콜 처리</dd></div>
        <div><dt>Software</dt><dd>애플리케이션 로직</dd></div>
        <div><dt>Function</dt><dd>Actuator · 상태 변화</dd></div>
      </dl>
    </div>
  )
}

export function AcceptanceFilterVisual() {
  const frames = [
    ["0x100", false],
    ["0x101", true],
    ["0x200", true],
    ["0x350", false],
  ] as const
  return (
    <div className="acceptance-filter" role="img" aria-label="CAN Controller의 Acceptance Filter가 0x101과 0x200 Identifier를 선택해 ECU Software로 전달합니다.">
      <small>CAN CONTROLLER · ACCEPTANCE FILTER</small>
      <div className="acceptance-filter__input">
        <b>CAN BUS</b>
        {frames.map(([id, accepted]) => <span key={id} className={accepted ? "is-accepted" : "is-rejected"}>{id}<em>{accepted ? "MATCH" : "IGNORE"}</em></span>)}
      </div>
      <div className="acceptance-filter__gate"><strong>IDENTIFIER FILTER</strong><small>Controller configuration</small></div>
      <div className="acceptance-filter__output"><span>0x101 ✓</span><span>0x200 ✓</span><strong>ECU SOFTWARE</strong></div>
      <p><b>CAN ID는 ECU 주소가 아닙니다.</b> 여러 ECU가 같은 Identifier에 관심을 가질 수 있습니다.</p>
    </div>
  )
}

export function ECUActionVisual() {
  return (
    <div className="ecu-action" role="img" aria-label="교육용 CAN Frame 0x101#01을 Body ECU Software가 Door Lock 명령으로 해석해 Door를 잠급니다.">
      <small>EDUCATIONAL EXAMPLE · NOT A CAN STANDARD VALUE</small>
      <div>
        <span><small>CAN FRAME</small><strong>0x101#01</strong><em>Frame received</em></span>
        <i>→</i>
        <span><small>IDENTIFIER</small><strong>0x101</strong><em>Door Command · Filter match</em></span>
        <i>→</i>
        <span><small>DATA</small><strong>01</strong><em>Lock</em></span>
        <i>→</i>
        <span className="is-result"><small>BODY ECU SOFTWARE</small><strong>DOOR</strong><em>LOCKED</em></span>
      </div>
      <p><b>0x101 = Door Command, Data 01 = Lock</b>은 이 학습을 위한 예시이며 CAN 표준에서 정의된 값이 아닙니다.</p>
    </div>
  )
}

export function VehicleNetworkVisual() {
  return (
    <div className="vehicle-networks" role="img" aria-label="OBD-II Diagnostic Port가 Diagnostic Network에 연결되고 Gateway가 Body CAN과 Powertrain CAN을 연결하는 차량 네트워크 예시">
      <small>VEHICLE NETWORK DOMAINS · EXAMPLE TOPOLOGY</small>
      <div className="vehicle-networks__diagnostic"><span><strong>OBD-II</strong><small>Diagnostic Port · Interface</small></span><i>↓</i><b>DIAGNOSTIC NETWORK</b></div>
      <div className="vehicle-networks__gateway"><small>NETWORK INTERCONNECTION</small><strong>GATEWAY ECU</strong><span>Routing · Forwarding</span></div>
      <div className="vehicle-networks__domains">
        <section><b>BODY CAN</b><span>Body ECU</span><span>Instrument Cluster</span></section>
        <section><b>POWERTRAIN CAN</b><span>Engine ECU</span><span>Brake ECU</span></section>
      </div>
      <p>차량 구현에 따라 CAN · CAN FD · LIN · Ethernet 등의 네트워크를 연결할 수 있습니다.</p>
    </div>
  )
}

export type GatewayRoutingMode = "allowed" | "blocked"

export function GatewayRoutingVisual({ mode, onChange }: { mode: GatewayRoutingMode; onChange: (mode: GatewayRoutingMode) => void }) {
  const allowed = mode === "allowed"
  return (
    <div className="gateway-routing" data-mode={mode}>
      <div className="gateway-routing__tabs" role="group" aria-label="교육용 Gateway 정책 상태 선택">
        <button type="button" aria-pressed={allowed} className={allowed ? "is-active" : ""} onClick={() => onChange("allowed")}>허용 예시</button>
        <button type="button" aria-pressed={!allowed} className={!allowed ? "is-active" : ""} onClick={() => onChange("blocked")}>차단 예시</button>
      </div>
      <small>교육용 GATEWAY ROUTING / POLICY 예시</small>
      <div className="gateway-routing__flow">
        <section><small>SOURCE</small><strong>Diagnostic CAN</strong><code>{allowed ? "0x101#01" : "0x700#01"}</code></section>
        <i>→</i>
        <section className="is-gateway"><small>GATEWAY ECU</small><strong>ROUTING / POLICY</strong><code>{allowed ? "MATCH" : "NO MATCH"}</code></section>
        <i className={allowed ? "" : "is-stopped"}>{allowed ? "→" : "×"}</i>
        <section className={allowed ? "is-forwarded" : "is-dropped"}><small>DESTINATION · BODY CAN</small><strong>{allowed ? "FORWARD" : "DROP"}</strong><code>{allowed ? "Delivered" : "Not delivered"}</code></section>
      </div>
      <dl><div><dt>입력</dt><dd>{allowed ? "0x101#01" : "0x700#01"}</dd></div><div><dt>규칙</dt><dd>{allowed ? "Match" : "No Match"}</dd></div><div><dt>결과</dt><dd>{allowed ? "Forward" : "Drop"}</dd></div></dl>
      <p>구현에 따라 Source·Destination·Identifier·Direction·Vehicle state·Diagnostic session·Security policy 등을 사용할 수 있습니다.</p>
    </div>
  )
}

export function EndToEndFlowVisual() {
  const stages = ["CAN BUS", "TRANSCEIVER", "CAN CONTROLLER", "ACCEPTANCE FILTER", "ECU SOFTWARE", "VEHICLE FUNCTION"]
  return (
    <div className="ecu-end-to-end" role="img" aria-label="CAN Bus에서 도착한 Frame이 ECU 내부 처리로 차량 기능이 되고 필요하면 Gateway를 통해 다른 네트워크로 전달되는 전체 흐름">
      <small>FRAME → VEHICLE ACTION</small>
      <div className="ecu-end-to-end__gateway"><span>OTHER NETWORK</span><i>↑</i><strong>GATEWAY</strong><i>↑</i></div>
      <div className="ecu-end-to-end__pipeline">{stages.map((stage, index) => <span key={stage}><i>{index + 1}</i><strong>{stage}</strong></span>)}</div>
      <p>Frame 수신 → 신호 변환 → Controller 처리 → Identifier Filtering → Data 해석 → 차량 기능 실행 → 필요 시 Gateway 전달</p>
    </div>
  )
}
