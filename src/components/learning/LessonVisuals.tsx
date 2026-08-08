import type { CSSProperties } from "react"
import {
  ArrowRight,
  Broadcast,
  CheckCircle,
  Circuitry,
  ShieldCheck,
  WaveSine,
} from "@phosphor-icons/react"

type ProtocolVisualKind = "overview" | "topology" | "broadcast" | "arbitration" | "signal" | "physical" | "errors" | "quiz"

interface FrameField {
  name: string
  bits: number
  desc: string
  dominant: boolean | null
}

interface FrameStructureVisualProps {
  fields: FrameField[]
  selectedField: FrameField | null
  frameType: "standard" | "extended"
  onSelect: (field: FrameField | null) => void
}

interface ECUNode {
  id: string
  label: string
  fullName: string
  desc: string
  domain: string
  x: number
  y: number
}

interface ECUNetworkVisualProps {
  nodes: ECUNode[]
  selectedNode: ECUNode | null
  onSelect: (node: ECUNode | null) => void
}

const busNodes = ["Body ECU", "Dashboard ECU", "TCU", "Gateway ECU"]

function BusLine({ emphasis = false }: { emphasis?: boolean }) {
  return (
    <div
      className={`lesson-bus-line${emphasis ? " is-active" : ""}`}
      aria-hidden="true"
    >
      <span />
      <span />
    </div>
  )
}

export function ProtocolConceptVisual({ kind }: { kind: ProtocolVisualKind }) {
  if (kind === "overview") {
    return (
      <div className="lesson-visual lesson-visual--overview">
        <Circuitry size={34} weight="light" aria-hidden="true" />
        <strong>Controller Area Network</strong>
        <p>하나의 버스에서 여러 제어기가 같은 메시지를 공유합니다.</p>
        <div className="lesson-overview-specs">
          <span>
            <small>표준</small>
            <b>ISO 11898</b>
          </span>
          <span>
            <small>속도</small>
            <b>최대 1 Mbps</b>
          </span>
          <span>
            <small>노드</small>
            <b>최대 127개</b>
          </span>
          <span>
            <small>길이</small>
            <b>최대 40m</b>
          </span>
        </div>
      </div>
    )
  }

  if (kind === "topology") {
    return (
      <div className="lesson-visual lesson-visual--bus">
        <div className="lesson-bus-nodes">
          {busNodes.map((node) => (
            <span key={node}>
              <i aria-hidden="true" />
              <b>{node}</b>
              <small>Controller + Transceiver</small>
            </span>
          ))}
        </div>
        <BusLine emphasis />
        <p>CAN_H / CAN_L</p>
      </div>
    )
  }

  if (kind === "broadcast") {
    return (
      <div className="lesson-visual lesson-visual--broadcast">
        <div className="lesson-message-source">
          <Broadcast size={30} weight="light" aria-hidden="true" />
          <span>Body ECU</span>
          <code>0x101&nbsp;&nbsp;01 00 00 00</code>
        </div>
        <div className="lesson-broadcast-route" aria-hidden="true">
          <span />
        </div>
        <div className="lesson-message-targets">
          {["Dashboard", "Gateway", "TCU"].map((target, index) => (
            <span key={target} className={index === 0 ? "is-accepted" : ""}>
              <b>{target}</b>
              <small>{index === 0 ? "0x101 처리" : "수신 후 무시"}</small>
            </span>
          ))}
        </div>
      </div>
    )
  }

  if (kind === "arbitration" || kind === "quiz") {
    const ids = ["0x001", "0x100", "0x400", "0x7FF"]
    return (
      <div className="lesson-visual lesson-visual--arbitration">
        <div className="lesson-arbitration-heading">
          <span>동시 전송</span>
          <span>버스 점유 결과</span>
        </div>
        {ids.map((id, index) => (
          <div key={id} className={index === 0 ? "is-winner" : ""}>
            <code>{id}</code>
            <span>{index === 0 ? "우선순위 최고" : "전송 대기"}</span>
            <b>{index === 0 ? "계속 전송" : "중재에서 양보"}</b>
          </div>
        ))}
      </div>
    )
  }

  if (kind === "signal" || kind === "physical") {
    return (
      <div className="lesson-visual lesson-visual--signal">
        <div className="lesson-signal-title">
          <WaveSine size={28} weight="light" aria-hidden="true" />
          <span>
            {kind === "signal"
              ? "Dominant 0 / Recessive 1"
              : "차동 신호와 120Ω 종단"}
          </span>
        </div>
        <svg
          viewBox="0 0 640 250"
          role="img"
          aria-label="CAN H와 CAN L 차동 신호 파형"
        >
          <line
            x1="56"
            y1="56"
            x2="606"
            y2="56"
            className="lesson-signal-grid"
          />
          <line
            x1="56"
            y1="125"
            x2="606"
            y2="125"
            className="lesson-signal-grid"
          />
          <line
            x1="56"
            y1="194"
            x2="606"
            y2="194"
            className="lesson-signal-grid"
          />
          <text x="8" y="60">
            3.5V
          </text>
          <text x="8" y="129">
            2.5V
          </text>
          <text x="8" y="198">
            1.5V
          </text>
          <path
            d="M56 125 H150 V56 H250 V125 H340 V56 H448 V125 H606"
            className="lesson-signal-high"
          />
          <path
            d="M56 125 H150 V194 H250 V125 H340 V194 H448 V125 H606"
            className="lesson-signal-low"
          />
          <text x="520" y="46" className="lesson-signal-high-label">
            CAN_H
          </text>
          <text x="520" y="218" className="lesson-signal-low-label">
            CAN_L
          </text>
          {kind === "physical" && (
            <>
              <rect
                x="56"
                y="102"
                width="12"
                height="46"
                rx="1"
                className="lesson-terminator"
              />
              <rect
                x="594"
                y="102"
                width="12"
                height="46"
                rx="1"
                className="lesson-terminator"
              />
              <text x="38" y="92" className="lesson-terminator-label">
                120Ω
              </text>
              <text x="574" y="92" className="lesson-terminator-label">
                120Ω
              </text>
            </>
          )}
        </svg>
      </div>
    )
  }

  return (
    <div className="lesson-visual lesson-visual--errors">
      <ShieldCheck size={34} weight="light" aria-hidden="true" />
      <strong>프레임을 다섯 번 확인합니다</strong>
      <div>
        {["CRC", "Bit", "Form", "Stuff", "ACK"].map((check, index) => (
          <span key={check}>
            <CheckCircle
              size={19}
              weight={index === 0 ? "fill" : "regular"}
              aria-hidden="true"
            />
            <b>{check}</b>
          </span>
        ))}
      </div>
    </div>
  )
}

export function FrameStructureVisual({
  fields,
  selectedField,
  frameType,
  onSelect,
}: FrameStructureVisualProps) {
  return (
    <div className="lesson-visual lesson-visual--frame">
      <div className="lesson-frame-heading">
        <span>
          {frameType === "standard" ? "Standard Frame" : "Extended Frame"}
        </span>
        <code>{frameType === "standard" ? "11-bit ID" : "29-bit ID"}</code>
      </div>
      <div className="lesson-frame-strip" aria-label="CAN 프레임 필드">
        {fields.map((field) => {
          const weight =
            field.bits === 64
              ? 8
              : field.bits === 15
                ? 3
                : field.bits === 11
                  ? 2
                  : 1
          const selected = selectedField?.name === field.name
          const style = { "--field-weight": weight } as CSSProperties
          return (
            <button
              type="button"
              key={field.name}
              className={selected ? "is-selected" : ""}
              style={style}
              aria-pressed={selected}
              onClick={() => onSelect(selected ? null : field)}
            >
              <b>{field.name.replace("\n", " ")}</b>
              <small>{field.bits}b</small>
            </button>
          )
        })}
      </div>
      <div className="lesson-frame-detail" aria-live="polite">
        {selectedField ? (
          <>
            <div>
              <strong>{selectedField.name.replace("\n", " ")}</strong>
              <code>
                {selectedField.bits} bit{selectedField.bits > 1 ? "s" : ""}
              </code>
            </div>
            <p>{selectedField.desc}</p>
            {selectedField.dominant !== null && (
              <span>
                {selectedField.dominant ? "Dominant (0)" : "Recessive (1)"}
              </span>
            )}
          </>
        ) : (
          <p>
            필드를 선택하면 비트 수와 역할을 이 자리에서 확인할 수 있습니다.
          </p>
        )}
      </div>
    </div>
  )
}

export function FrameComparisonVisual() {
  return (
    <div className="lesson-visual lesson-visual--comparison">
      <div className="lesson-comparison-columns">
        <section>
          <strong>Standard</strong>
          <b>11-bit</b>
          <span>최대 0x7FF</span>
          <span>IDE = 0</span>
          <span>일반 차량 네트워크</span>
        </section>
        <span className="lesson-comparison-divider" aria-hidden="true">
          VS
        </span>
        <section>
          <strong>Extended</strong>
          <b>29-bit</b>
          <span>최대 0x1FFFFFFF</span>
          <span>IDE = 1</span>
          <span>확장 ID 시스템</span>
        </section>
      </div>
    </div>
  )
}

export function FrameQuizVisual() {
  return (
    <div className="lesson-visual lesson-visual--frame-quiz">
      <span>CAN ID</span>
      <code>0x200#A51200FF</code>
      <div>
        <b>DLC</b>
        <strong>4 bytes</strong>
      </div>
      <p>DLC는 뒤따르는 데이터 필드의 바이트 수를 알려줍니다.</p>
    </div>
  )
}

export function FrameMessageVisual() {
  return (
    <div
      className="lesson-visual lesson-visual--frame-message"
      role="img"
      aria-label="교육용 CAN 프레임 0x101#01을 Identifier, DLC, Data로 해석한 예시"
    >
      <span className="lesson-frame-message__label">교육용 Frame 예시</span>
      <code>0x101#01</code>
      <dl>
        <div>
          <dt>Identifier</dt>
          <dd>0x101</dd>
          <small>메시지 의미 · 중재 우선순위</small>
        </div>
        <div>
          <dt>DLC</dt>
          <dd>1 byte</dd>
          <small>뒤따르는 Data 길이</small>
        </div>
        <div>
          <dt>Data</dt>
          <dd>01</dd>
          <small>교육용 문 잠금 요청</small>
        </div>
      </dl>
      <p>
        모든 ECU가 Frame을 듣고, 0x101을 처리하도록 설계된 ECU만 Data를
        해석합니다.
      </p>
    </div>
  )
}

export function FrameIntegrityVisual() {
  const checks = [
    {
      name: "CRC",
      detail: "수신 중 비트 손상 검사",
      state: "Frame valid",
    },
    {
      name: "ACK",
      detail: "정상 수신 노드의 응답",
      state: "Dominant 0",
    },
    {
      name: "EOF",
      detail: "Frame 종료 표시",
      state: "7 × Recessive 1",
    },
  ]

  return (
    <div
      className="lesson-visual lesson-visual--frame-integrity"
      role="img"
      aria-label="CRC로 오류를 검사하고 ACK로 정상 수신을 확인한 뒤 EOF로 프레임을 종료하는 흐름"
    >
      {checks.map((check, index) => (
        <div key={check.name}>
          <span>{String(index + 1).padStart(2, "0")}</span>
          <strong>{check.name}</strong>
          <small>{check.detail}</small>
          <code>{check.state}</code>
        </div>
      ))}
      <p>
        CRC가 맞지 않으면 ACK가 기록되지 않고, 송신 노드는 오류 처리 뒤 재전송을
        시도합니다.
      </p>
    </div>
  )
}

type ECUProcessingStage = "receive" | "filter" | "act"

const ecuProcessingDetails = {
  receive: {
    input: "CAN_H / CAN_L",
    decision: "전압 차이를 bit로 변환",
    result: "Frame 수신 대기",
    description:
      "Transceiver가 CAN_H와 CAN_L의 전기 신호를 Controller가 읽을 수 있는 비트로 바꿉니다.",
  },
  filter: {
    input: "Identifier 0x101",
    decision: "Body ECU 필터와 일치",
    result: "Controller → Software",
    description:
      "CAN Controller가 Identifier를 확인해 Body ECU가 받아야 할 Frame만 제어 소프트웨어로 넘깁니다.",
  },
  act: {
    input: "Data 01",
    decision: "교육용 잠금 명령으로 해석",
    result: "Door: Locked",
    description:
      "교육용 Toy ECU에서 Data 01은 Door Locked 상태로 해석되어 차량 상태를 바꿉니다.",
  },
} as const

export function ECUProcessingVisual({ stage }: { stage: ECUProcessingStage }) {
  const detail = ecuProcessingDetails[stage]
  const stages: Array<{
    key: ECUProcessingStage
    label: string
    detail: string
  }> = [
    {
      key: "receive",
      label: "CAN Transceiver",
      detail: "전기 신호 ↔ bit",
    },
    {
      key: "filter",
      label: "CAN Controller",
      detail: "ID 필터 · 오류 처리",
    },
    {
      key: "act",
      label: "ECU Software",
      detail: "Data 해석 · 기능 실행",
    },
  ]
  const activeIndex = stages.findIndex((item) => item.key === stage)

  return (
    <div
      className="lesson-visual lesson-visual--ecu-process"
      data-stage={stage}
      role="img"
      aria-label={detail.description}
    >
      <div className="lesson-ecu-process__bus" aria-hidden="true">
        <span>CAN_H</span>
        <i />
        <span>CAN_L</span>
        <code>0x101 · 01</code>
      </div>
      <div className="lesson-ecu-process__stages">
        {stages.map((item, index) => (
          <div
            key={item.key}
            className={`${index < activeIndex ? "is-complete" : ""}${
              index === activeIndex ? " is-active" : ""
            }`}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            <strong>{item.label}</strong>
            <small>{item.detail}</small>
          </div>
        ))}
      </div>
      <dl className="lesson-ecu-process__readout">
        <div>
          <dt>입력</dt>
          <dd>{detail.input}</dd>
        </div>
        <div>
          <dt>판단</dt>
          <dd>{detail.decision}</dd>
        </div>
        <div>
          <dt>결과</dt>
          <dd>{detail.result}</dd>
        </div>
      </dl>
      <p>{detail.description}</p>
    </div>
  )
}

type GatewayPolicyState = "boundary" | "allowed" | "blocked"

const gatewayPolicyDetails = {
  boundary: {
    message: "서로 다른 CAN 영역",
    policy: "영역 경계 설정",
    result: "분리 유지",
    description:
      "Gateway는 진단 CAN과 Body CAN처럼 분리된 영역의 경계에 놓입니다.",
  },
  allowed: {
    message: "0x101 · 01",
    policy: "Body CAN 전달 허용",
    result: "Body ECU로 전달",
    description:
      "교육용 정책 예시에서 허용된 0x101#01은 Gateway를 지나 Body CAN으로 전달됩니다.",
  },
  blocked: {
    message: "0x700 · 01",
    policy: "교육용 정책 불일치",
    result: "Gateway에서 차단",
    description:
      "정책 밖의 메시지는 Gateway에서 멈추며 Body CAN으로 전달되지 않습니다.",
  },
} as const

export function GatewayPolicyVisual({ state }: { state: GatewayPolicyState }) {
  const detail = gatewayPolicyDetails[state]

  return (
    <div
      className="lesson-visual lesson-visual--gateway-policy"
      data-state={state}
      role="img"
      aria-label={detail.description}
    >
      <div className="lesson-gateway-policy__network">
        <div>
          <small>DIAGNOSTIC CAN</small>
          <strong>Training OBD-II</strong>
          <code>{detail.message}</code>
        </div>
        <section aria-hidden="true">
          <i />
          <strong>Gateway</strong>
          <small>정책 확인</small>
        </section>
        <div>
          <small>BODY CAN</small>
          <strong>Body ECU</strong>
          <code>{detail.result}</code>
        </div>
      </div>
      <dl className="lesson-gateway-policy__readout">
        <div>
          <dt>입력</dt>
          <dd>{detail.message}</dd>
        </div>
        <div>
          <dt>Gateway 정책</dt>
          <dd>{detail.policy}</dd>
        </div>
        <div>
          <dt>결과</dt>
          <dd>{detail.result}</dd>
        </div>
      </dl>
      <p>{detail.description}</p>
    </div>
  )
}

export function ECUNetworkVisual({
  nodes,
  selectedNode,
  onSelect,
}: ECUNetworkVisualProps) {
  const gateway = nodes.find((node) => node.id === "gateway")
  return (
    <div className="lesson-visual lesson-visual--ecu-network">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        {gateway &&
          nodes
            .filter((node) => node.id !== "gateway")
            .map((node) => (
              <line
                key={node.id}
                x1={node.x}
                y1={node.y}
                x2={gateway.x}
                y2={gateway.y}
                className={selectedNode?.id === node.id ? "is-active" : ""}
              />
            ))}
      </svg>
      {nodes.map((node) => {
        const style = {
          "--node-x": `${node.x}%`,
          "--node-y": `${node.y * 0.68}%`,
        } as CSSProperties
        const selected = selectedNode?.id === node.id
        return (
          <button
            key={node.id}
            type="button"
            className={`${node.id === "gateway" ? "is-gateway" : ""}${
              selected ? " is-selected" : ""
            }`}
            style={style}
            aria-pressed={selected}
            onClick={() => onSelect(selected ? null : node)}
          >
            <i aria-hidden="true" />
            <span>{node.label}</span>
          </button>
        )
      })}
      <div className="lesson-ecu-detail" aria-live="polite">
        {selectedNode ? (
          <>
            <strong>{selectedNode.label}</strong>
            <span>{selectedNode.fullName}</span>
            <p>{selectedNode.desc}</p>
          </>
        ) : (
          <p>ECU 노드를 선택해 역할과 연결 위치를 확인하세요.</p>
        )}
      </div>
    </div>
  )
}

export function GatewayFlowVisual() {
  return (
    <div className="lesson-visual lesson-visual--gateway">
      <div className="lesson-gateway-source">
        <span>Telematics</span>
        <span>Infotainment</span>
        <span>Diagnostics</span>
      </div>
      <div className="lesson-gateway-route" aria-hidden="true" />
      <div className="lesson-gateway-core">
        <ShieldCheck size={34} weight="light" aria-hidden="true" />
        <strong>Gateway ECU</strong>
        <small>검사 · 필터 · 라우팅</small>
      </div>
      <div className="lesson-gateway-route" aria-hidden="true" />
      <div className="lesson-gateway-target">
        <span>Body CAN</span>
        <span>Chassis CAN</span>
      </div>
    </div>
  )
}

export function ECUPriorityVisual() {
  const rows = [
    ["Gateway ECU", "메시지 경계 제어", "최고"],
    ["IDS ECU", "이상 행동 탐지", "최고"],
    ["TCU", "외부 통신 연결", "높음"],
    ["OBD-II", "물리적 버스 접근", "높음"],
    ["Body ECU", "차체 기능 제어", "중간"],
  ]
  return (
    <div className="lesson-visual lesson-visual--ecu-priority">
      {rows.map(([name, role, priority]) => (
        <div key={name}>
          <strong>{name}</strong>
          <span>{role}</span>
          <b>{priority}</b>
        </div>
      ))}
    </div>
  )
}

export function CourseCompleteVisual() {
  return (
    <div className="lesson-visual lesson-visual--complete">
      <div>
        {["CAN 프로토콜", "CAN 프레임", "ECU와 Gateway"].map((item) => (
          <span key={item}>
            <CheckCircle size={22} weight="fill" aria-hidden="true" />
            <b>{item}</b>
          </span>
        ))}
      </div>
      <ArrowRight size={28} aria-hidden="true" />
      <strong>정상 CAN 송수신</strong>
    </div>
  )
}
