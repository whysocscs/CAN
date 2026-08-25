import { useEffect, useState } from "react"

const arbitrationNodes = [
  { id: "0x120", label: "Body ECU", bits: "00100100000" },
  { id: "0x128", label: "Dashboard ECU", bits: "00100101000" },
  { id: "0x300", label: "Gateway ECU", bits: "01100000000" },
] as const

export const frameFields = [
  {
    name: "SOF",
    bits: "1 bit",
    description: "Dominant 0으로 프레임의 시작을 알립니다.",
  },
  {
    name: "Identifier",
    bits: "11 bits",
    description: "메시지의 의미와 버스 우선순위를 결정합니다.",
  },
  {
    name: "Control / DLC",
    bits: "6 bits",
    description: "프레임 형식과 Data 필드의 바이트 수를 전달합니다.",
  },
  {
    name: "Data",
    bits: "0 to 64 bits",
    description:
      "ECU가 공유할 실제 제어 값과 상태를 담습니다. 교육 예시에서는 01이 문 잠금 요청입니다.",
  },
  {
    name: "CRC",
    bits: "15 bits",
    description: "수신한 비트가 전송 중 손상되지 않았는지 검사합니다.",
  },
  {
    name: "ACK",
    bits: "1 bit",
    description: "정상 수신한 노드가 Dominant 0을 기록해 응답합니다.",
  },
  {
    name: "EOF",
    bits: "7 bits",
    description: "연속된 Recessive 1로 프레임의 끝을 표시합니다.",
  },
] as const

const frameStepGroups = [
  {
    fields: [0, 1] as readonly number[],
    title: "SOF + Identifier",
    bits: "1 + 11 bits",
    description:
      "SOF가 프레임을 열고, Identifier가 메시지의 의미와 버스 우선순위를 전달합니다.",
  },
  {
    fields: [2, 3] as readonly number[],
    title: "Control / DLC + Data",
    bits: "6 + 0 to 64 bits",
    description:
      "Control과 DLC가 데이터 길이를 알리고, Data 필드가 실제 차량 상태와 제어 값을 운반합니다. 예: 0x101#01.",
  },
  {
    fields: [4, 5, 6] as readonly number[],
    title: "CRC + ACK + EOF",
    bits: "15 + 1 + 7 bits",
    description:
      "CRC로 오류를 검사하고 ACK로 수신을 확인한 뒤, EOF가 프레임을 닫습니다.",
  },
] as const

export function WhyCanVisual({ step }: { step: number }) {
  const state = step === 0 ? "separate" : "shared"
  const facts =
    [
      [
        ["연결 방식", "신호별 전용 배선"],
        ["신호 증가", "배선 · 연결 지점 증가"],
        ["결과", "확장 · 유지보수 복잡"],
      ],
      [
        ["연결 방식", "공용 Bus"],
        ["연결 대상", "여러 ECU"],
        ["효과", "개별 신호 배선 감소"],
      ],
      [
        ["네트워크", "CAN Bus"],
        ["참여 노드", "여러 ECU"],
        ["통신 방식", "공용 통신망"],
      ],
    ][step] ?? []

  const description =
    step === 0
      ? "Body, Dashboard, Engine, Brake ECU 사이에 RPM, Door Status, Brake Warning 등 신호별 전용 배선이 교차해 연결됩니다."
      : step === 1
        ? "동일한 네 ECU가 하나의 공용 CAN Bus에 짧은 분기선으로 연결됩니다."
        : "동일한 네 ECU가 하나의 공용 CAN 통신망에 참여합니다."

  return (
    <div className="can-visual can-visual--why" data-topology={state}>
      <svg
        viewBox="0 0 760 460"
        role="img"
        aria-labelledby="why-can-visual-title why-can-visual-description"
      >
        <title id="why-can-visual-title">
          신호별 전용 배선이 공용 CAN Bus와 Frame 전달 구조로 정리되는 과정
        </title>
        <desc id="why-can-visual-description">
          {description}
        </desc>

        <g className="can-why__legacy-wires" aria-hidden="true">
          <path d="M194 92 C310 54 450 56 566 92" />
          <path d="M194 112 C322 168 438 280 566 338" />
          <path d="M566 132 C450 178 310 274 194 318" />
          <path d="M194 338 C314 374 446 374 566 338" />
          <path d="M178 140 C232 210 232 250 178 314" />
          <g className="can-why__wire-labels">
            <text x="380" y="66" textAnchor="middle">DOOR STATUS</text>
            <text x="430" y="194" textAnchor="middle">BRAKE WARNING</text>
            <text x="334" y="292" textAnchor="middle">RPM</text>
            <text x="380" y="390" textAnchor="middle">VEHICLE SIGNAL</text>
          </g>
        </g>

        <g className="can-why__branches" aria-hidden="true">
          <path d="M154 104 H218 V220" />
          <path d="M606 104 H542 V220" />
          <path d="M154 350 H218 V240" />
          <path d="M606 350 H542 V240" />
        </g>

        <g className="can-why__bus" aria-hidden="true">
          <line x1="188" y1="220" x2="572" y2="220" />
          <line x1="188" y1="240" x2="572" y2="240" />
          <text x="380" y="194" textAnchor="middle">
            CAN BUS
          </text>
          <text x="380" y="274" textAnchor="middle">
            SHARED NETWORK
          </text>
        </g>

        <g className="can-why__broadcast" aria-hidden="true">
          <rect x="324" y="198" width="112" height="64" rx="3" />
          <text x="380" y="223" textAnchor="middle" className="can-why__frame-title">
            CAN Frame
          </text>
          <text x="380" y="244" textAnchor="middle">
            ID 0x101
          </text>
        </g>

        {[
          { x: 46, y: 68, title: "Body ECU", detail: "Door · Lamp" },
          { x: 566, y: 68, title: "Dashboard ECU", detail: "Display · Warning" },
          { x: 46, y: 314, title: "Engine ECU", detail: "RPM · Torque" },
          { x: 566, y: 314, title: "Brake ECU", detail: "Brake · ABS" },
        ].map((node) => (
          <g
            key={node.title}
            className="can-why__node"
          >
            <rect x={node.x} y={node.y} width="148" height="72" rx="3" />
            <text x={node.x + 16} y={node.y + 29}>
              {node.title}
            </text>
            <text
              x={node.x + 16}
              y={node.y + 51}
              className="can-why__node-detail"
            >
              {node.detail}
            </text>
          </g>
        ))}
        <text x="380" y="434" textAnchor="middle" className="can-why__caption">
          {step === 0 ? "개별 신호 배선 개념도" : "공용 CAN Bus 개념도"}
        </text>
      </svg>
      <div className="can-why__facts" aria-live="polite">
        {facts.map(([label, value]) => (
          <span key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </span>
        ))}
      </div>
      <p className="can-visual__state" aria-live="polite">
        {step === 0 &&
          "개별 신호 배선에서는 기능이 늘수록 필요한 배선과 연결 지점도 함께 증가합니다."}
        {step === 1 &&
          "각 ECU는 별도의 장거리 신호선 대신 공용 CAN Bus에 연결됩니다."}
        {step === 2 &&
          "같은 CAN Bus에 연결된 ECU들이 하나의 통신망을 함께 사용합니다. 그렇다면 이 공용 Bus는 누가 관리할까요?"}
      </p>
    </div>
  )
}

const protocolNodes = [
  { x: 42, y: 54, title: "Body ECU", detail: "Door · Lamp" },
  { x: 568, y: 54, title: "Dashboard ECU", detail: "Display · Warning" },
  { x: 42, y: 326, title: "Engine ECU", detail: "RPM · Torque" },
  { x: 568, y: 326, title: "Brake ECU", detail: "Brake · ABS" },
] as const

function ProtocolBusNetwork({
  mode,
}: {
  mode: "multi-master" | "sending" | "observing" | "message"
}) {
  return (
    <svg viewBox="0 0 760 460" aria-hidden="true">
      <g className="can-protocol__branches">
        <path d="M190 90 H222 V220" />
        <path d="M568 90 H538 V220" />
        <path d="M190 362 H222 V240" />
        <path d="M568 362 H538 V240" />
      </g>
      <g className="can-protocol__bus">
        <line x1="188" y1="220" x2="572" y2="220" />
        <line x1="188" y1="240" x2="572" y2="240" />
        <text x="380" y="198" textAnchor="middle">CAN BUS</text>
        <text x="380" y="273" textAnchor="middle">
          {mode === "multi-master" ? "MULTI-MASTER · NO CENTRAL MASTER" : "SHARED BUS"}
        </text>
      </g>
      {protocolNodes.map((node, index) => {
        const sending = mode === "sending" && index === 2
        const interested = mode === "message" && (index === 0 || index === 3)
        return (
          <g
            key={node.title}
            className={`can-protocol__node${sending ? " is-sending" : ""}${
              interested ? " is-interested" : ""
            }`}
          >
            <rect x={node.x} y={node.y} width="150" height="72" rx="3" />
            <text x={node.x + 16} y={node.y + 29}>{node.title}</text>
            <text x={node.x + 16} y={node.y + 51} className="can-protocol__detail">
              {node.detail}
            </text>
            {mode === "observing" && (
              <text x={node.x + 75} y={node.y + 91} textAnchor="middle" className="can-protocol__status">
                BUS 관찰
              </text>
            )}
            {sending && (
              <text x={node.x + 75} y={node.y + 91} textAnchor="middle" className="can-protocol__status">
                SEND
              </text>
            )}
            {mode === "message" && (
              <text x={node.x + 75} y={node.y + 91} textAnchor="middle" className="can-protocol__status">
                {interested ? "0x101 관심 있음" : "관심 없음"}
              </text>
            )}
          </g>
        )
      })}
      {mode === "sending" && (
        <g className="can-protocol__message is-sending">
          <rect x="329" y="202" width="102" height="56" rx="3" />
          <text x="380" y="226" textAnchor="middle">MESSAGE</text>
          <text x="380" y="246" textAnchor="middle">SENDING</text>
        </g>
      )}
      {mode === "message" && (
        <g className="can-protocol__message">
          <rect x="324" y="198" width="112" height="64" rx="3" />
          <text x="380" y="223" textAnchor="middle">CAN MESSAGE</text>
          <text x="380" y="245" textAnchor="middle">ID 0x101</text>
        </g>
      )}
    </svg>
  )
}

function ProtocolFacts({ facts }: { facts: readonly (readonly [string, string])[] }) {
  return (
    <div className="can-why__facts" aria-live="polite">
      {facts.map(([label, value]) => (
        <span key={label}>
          <small>{label}</small>
          <strong>{value}</strong>
        </span>
      ))}
    </div>
  )
}

export function SharedBusVisual({ step }: { step: number }) {
  const modes = ["multi-master", "sending", "observing"] as const
  const facts = [
    [["구조", "Multi-Master"], ["중앙 Master", "없음"], ["참여", "여러 ECU"]],
    [["Bus 상태", "Idle"], ["송신 노드", "전송 시작"], ["다른 노드", "Bus 관찰"]],
    [["송신", "여러 노드 가능"], ["Bus", "공유"], ["관찰", "모든 참여 노드"]],
  ] as const
  return (
    <div className="can-visual can-visual--protocol" data-step={step}>
      <div role="img" aria-label={
        step === 0
          ? "중앙 Master 없이 네 ECU가 공용 CAN Bus에 참여하는 Multi-Master 구조입니다."
          : step === 1
            ? "Bus가 비어 있을 때 Engine ECU가 전송을 시작하고 다른 노드는 Bus를 관찰합니다."
            : "송신자를 포함한 모든 참여 노드가 같은 Bus 상태를 관찰합니다."
      }>
        <ProtocolBusNetwork mode={modes[step] ?? modes[0]} />
      </div>
      <ProtocolFacts facts={facts[step] ?? facts[0]} />
      <p className="can-visual__state" aria-live="polite">
        {step === 0 && "CAN은 중앙 Master 없이 여러 ECU가 통신에 참여하는 Multi-Master 방식입니다."}
        {step === 1 && "Bus가 비어 있으면 전송할 정보가 있는 ECU가 통신을 시작합니다."}
        {step === 2 && "송신자와 수신자가 고정된 1:1 구조가 아닙니다. 그렇다면 특정 ECU에게 정보를 어떻게 전달할까요?"}
      </p>
    </div>
  )
}

export function MessageBasedVisual({ step }: { step: number }) {
  const facts = [
    [["주소 기반", "목적지 지정"], ["CAN", "메시지 공유"], ["전달 범위", "같은 Bus"]],
    [["Identifier", "CAN ID"], ["예시", "0x101"], ["의미", "메시지 구분"]],
    [["메시지", "ID 0x101"], ["같은 Bus", "메시지 관찰"], ["관심 있는 ECU", "선택 · 처리"]],
  ] as const
  return (
    <div className="can-visual can-visual--protocol" data-step={step}>
      {step === 0 && (
        <div className="can-message-model" role="img" aria-label="목적지를 지정하는 일대일 주소 기반 통신과 같은 Bus에 메시지를 공유하는 CAN 통신을 비교합니다.">
          <section className="is-muted">
            <small>ADDRESS-BASED</small>
            <div><strong>ECU A</strong><span>→</span><strong>ECU B</strong></div>
            <p>목적지 지정</p>
          </section>
          <section>
            <small>CAN · MESSAGE-BASED</small>
            <div><strong>A</strong><strong>B</strong><strong>C</strong><strong>D</strong></div>
            <i />
            <p>같은 Bus에 메시지 공유</p>
          </section>
        </div>
      )}
      {step === 1 && (
        <div className="can-message-card" role="img" aria-label="CAN ID 0x101이 메시지 종류를 식별하는 CAN Message 카드입니다.">
          <small>CAN MESSAGE</small>
          <span>IDENTIFIER</span>
          <strong>0x101</strong>
          <p>MESSAGE ID · NOT ECU ADDRESS</p>
        </div>
      )}
      {step === 2 && (
        <div role="img" aria-label="ID 0x101 메시지를 모든 ECU가 관찰하고 Body ECU와 Brake ECU가 관심 있는 메시지로 선택합니다.">
          <ProtocolBusNetwork mode="message" />
        </div>
      )}
      <ProtocolFacts facts={facts[step] ?? facts[0]} />
      <p className="can-visual__state" aria-live="polite">
        {step === 0 && "CAN은 목적지 ECU를 지정하는 대신 같은 Bus에 메시지를 공유합니다."}
        {step === 1 && "CAN ID는 ECU 주소가 아니라 메시지의 종류를 구분하는 Identifier입니다."}
        {step === 2 && "여러 ECU가 같은 ID에 관심을 가질 수 있습니다. 그런데 여러 ECU가 동시에 전송하려고 하면 어떻게 될까요?"}
      </p>
    </div>
  )
}

export function BusAccessVisual({ step }: { step: number }) {
  const facts = [
    [["ECU A", "0x120"], ["ECU B", "0x300"], ["상태", "동시 전송"]],
    [["Dominant", "0"], ["Recessive", "1"], ["동시에 전송", "0 우선"]],
    [["승리", "0x120"], ["다른 노드", "전송 중단"], ["이후", "Bus가 비면 재시도"]],
  ] as const
  return (
    <div className="can-visual can-visual--protocol" data-step={step}>
      <div className="can-access" role="img" aria-label={
        step === 0
          ? "Body ECU의 0x120과 Engine ECU의 0x300 메시지가 동시에 전송을 시작합니다."
          : step === 1
            ? "Dominant 0과 Recessive 1이 동시에 전송되면 Bus에는 Dominant 0이 남습니다."
            : "0x120은 전송을 계속하고 0x300은 중단한 뒤 Bus가 비면 재시도합니다."
      }>
        {step === 0 && <>
          <div><small>BODY ECU</small><strong>0x120</strong><em>TRANSMIT</em></div>
          <span className="can-access__bus">CAN BUS</span>
          <div><small>ENGINE ECU</small><strong>0x300</strong><em>TRANSMIT</em></div>
        </>}
        {step === 1 && <div className="can-access__logic">
          <span><small>DOMINANT</small><strong>0</strong></span>
          <b>+</b>
          <span><small>RECESSIVE</small><strong>1</strong></span>
          <b>→</b>
          <span className="is-result"><small>BUS</small><strong>0</strong></span>
        </div>}
        {step === 2 && <div className="can-access__result">
          <span className="is-winner"><code>0x120</code><strong>CONTINUE</strong><small>WINNER</small></span>
          <span><code>0x300</code><strong>STOP</strong><small>RETRY LATER</small></span>
        </div>}
      </div>
      <ProtocolFacts facts={facts[step] ?? facts[0]} />
      <p className="can-visual__state" aria-live="polite">
        {step === 0 && "Multi-Master Bus에서는 둘 이상의 ECU가 동시에 전송을 시작할 수 있습니다."}
        {step === 1 && "Dominant 0이 Recessive 1보다 Bus에서 우선하는 논리 규칙으로 중재합니다."}
        {step === 2 && "중재는 승리한 메시지를 손상시키지 않습니다. 전송을 멈춘 노드는 Bus가 비면 다시 시도합니다. 그렇다면 전송 도중 데이터가 잘못되면 어떻게 될까요?"}
      </p>
    </div>
  )
}

export function ReliabilityVisual({
  step,
  checkpointAnswer,
  reducedMotion,
}: {
  step: number
  checkpointAnswer: string | null
  reducedMotion: boolean
}) {
  const [errorStage, setErrorStage] = useState<"detected" | "retry">("detected")
  useEffect(() => {
    if (step !== 1 || reducedMotion) {
      setErrorStage(step === 1 ? "retry" : "detected")
      return
    }
    setErrorStage("detected")
    const timer = window.setTimeout(() => setErrorStage("retry"), 620)
    return () => window.clearTimeout(timer)
  }, [reducedMotion, step])

  const facts = [
    [["감시", "Bus 상태"], ["검증", "전송 데이터"], ["목적", "오류 감지"]],
    [["1", "오류 감지"], ["2", "전송 무효화"], ["3", "재시도"]],
    [["기본 상태", "Error Active"], ["오류 누적", "Error Passive"], ["임계 초과", "Bus Off"]],
  ] as const
  return (
    <div className="can-visual can-visual--protocol" data-step={step} data-error-stage={errorStage}>
      {step === 0 && <div className="can-reliability__checks" role="img" aria-label="노드가 Bit monitoring, CRC, Format check, ACK 방식으로 오류를 감지합니다.">
        {[["BIT MONITORING", "Bus 상태"], ["CRC", "전송 데이터"], ["FORMAT CHECK", "형식"], ["ACK", "수신 확인"]].map(([label, detail]) => (
          <span key={label}><small>{label}</small><strong>{detail}</strong></span>
        ))}
      </div>}
      {step === 1 && <div className="can-reliability__flow" role="img" aria-label="전송 중 오류를 감지하면 메시지를 무효화하고 Bus가 다시 사용 가능할 때 재시도합니다.">
        <span className="is-complete">TRANSMIT</span><i>→</i>
        <span className="is-alert">ERROR DETECTED</span><i>→</i>
        <span className="is-alert">INVALID</span><i>→</i>
        <span className={errorStage === "retry" ? "is-active" : ""}>RETRY</span>
      </div>}
      {step === 2 && <div className="can-reliability__confinement" role="img" aria-label="오류가 누적되면 노드 상태가 Error Active에서 Error Passive를 거쳐 Bus Off로 제한됩니다.">
        <small>FAULT CONFINEMENT</small>
        <div><span><b>01</b><strong>Error Active</strong><em>기본 참여 상태</em></span><i>→</i><span><b>02</b><strong>Error Passive</strong><em>오류 누적</em></span><i>→</i><span><b>03</b><strong>Bus Off</strong><em>통신 참여 중단</em></span></div>
        {checkpointAnswer && <p>{checkpointAnswer.includes("공용 Bus") ? "PROTOCOL CHECK · PASS" : "PROTOCOL CHECK · REVIEW"}</p>}
      </div>}
      <ProtocolFacts facts={facts[step] ?? facts[0]} />
      <p className="can-visual__state" aria-live="polite">
        {step === 0 && "세부 필드 배치보다 CAN이 여러 방식으로 통신 오류를 감지한다는 점에 집중합니다."}
        {step === 1 && (errorStage === "retry" ? "잘못된 전송을 무효화하고 Bus가 비면 재전송을 시도합니다." : "오류를 감지한 노드가 잘못된 전송을 무효화합니다.")}
        {step === 2 && "Fault Confinement는 반복 오류 노드가 전체 Bus를 계속 방해하지 못하도록 참여를 단계적으로 제한합니다."}
      </p>
    </div>
  )
}

export function SignalVisual({
  step,
  onStepChange,
}: {
  step: number
  onStepChange: (step: number) => void
}) {
  const comparison = step === 2
  const bit: 0 | 1 = step === 0 ? 1 : 0
  const dominant = bit === 0

  return (
    <div
      className="can-visual can-visual--signal"
      data-bit={bit}
      data-mode={comparison ? "comparison" : "single"}
    >
      {comparison ? (
        <div
          className="can-signal__comparison"
          role="img"
          aria-label="Body ECU가 dominant 0을 보내고 Dashboard ECU가 recessive 1을 보내면 버스 값은 dominant 0이 됩니다."
        >
          <span>
            <small>Body ECU 전송</small>
            <strong>0</strong>
            <em>Dominant</em>
          </span>
          <span>
            <small>Dashboard ECU 전송</small>
            <strong>1</strong>
            <em>Recessive</em>
          </span>
          <span className="is-result">
            <small>버스에서 읽힌 값</small>
            <strong>0</strong>
            <em>Dominant wins</em>
          </span>
        </div>
      ) : (
        <div className="can-signal__controls" aria-label="CAN 버스 비트 선택">
          <button
            type="button"
            aria-pressed={dominant}
            className={dominant ? "is-active" : ""}
            onClick={() => onStepChange(1)}
          >
            <span>0</span>
            Dominant
          </button>
          <button
            type="button"
            aria-pressed={!dominant}
            className={!dominant ? "is-active" : ""}
            onClick={() => onStepChange(0)}
          >
            <span>1</span>
            Recessive
          </button>
        </div>
      )}

      <svg
        viewBox="0 0 720 330"
        role="img"
        aria-labelledby="signal-visual-title signal-visual-description"
      >
        <title id="signal-visual-title">CAN H와 CAN L의 전압 상태</title>
        <desc id="signal-visual-description">
          {comparison
            ? "두 ECU가 동시에 0과 1을 전송하면 CAN H는 3.5볼트, CAN L은 1.5볼트가 되고 버스는 dominant 0으로 판정됩니다."
            : dominant
              ? "Dominant 0에서 CAN H는 3.5볼트, CAN L은 1.5볼트입니다."
              : "Recessive 1에서 CAN H와 CAN L은 모두 2.5볼트입니다."}
        </desc>
        <g className="can-signal__grid" aria-hidden="true">
          <line x1="82" y1="70" x2="666" y2="70" />
          <line x1="82" y1="165" x2="666" y2="165" />
          <line x1="82" y1="260" x2="666" y2="260" />
          <text x="18" y="76">
            3.5V
          </text>
          <text x="18" y="171">
            2.5V
          </text>
          <text x="18" y="266">
            1.5V
          </text>
        </g>
        <g className="can-signal__recessive" aria-hidden="true">
          <path d="M82 165 H666" className="is-high" />
          <path d="M82 165 H666" className="is-low" />
        </g>
        <g className="can-signal__dominant" aria-hidden="true">
          <path d="M82 165 H188 V70 H548 V165 H666" className="is-high" />
          <path d="M82 165 H188 V260 H548 V165 H666" className="is-low" />
        </g>
        <text x="576" y="52" className="can-signal__high-label">
          CAN_H
        </text>
        <text x="576" y="291" className="can-signal__low-label">
          CAN_L
        </text>
        <g className="can-signal__bit" aria-hidden="true">
          <rect x="316" y="132" width="116" height="66" rx="3" />
          <text x="374" y="158" textAnchor="middle">
            BUS BIT
          </text>
          <text x="374" y="187" textAnchor="middle">
            {bit}
          </text>
        </g>
      </svg>

      <div className="can-signal__readout">
        <span>
          <small>CAN_H</small>
          <strong>{dominant ? "3.5 V" : "2.5 V"}</strong>
        </span>
        <span>
          <small>CAN_L</small>
          <strong>{dominant ? "1.5 V" : "2.5 V"}</strong>
        </span>
        <span>
          <small>버스 판정</small>
          <strong>{dominant ? "Dominant 0" : "Recessive 1"}</strong>
        </span>
      </div>

      {comparison && (
        <p className="can-signal__rule" role="status">
          동시에 0과 1이 전송되면 버스에서는 Dominant 0이 관찰됩니다.
        </p>
      )}
    </div>
  )
}

export function ArbitrationVisual({
  step,
  mode = "lesson",
  selectedId = null,
}: {
  step: number
  mode?: "lesson" | "checkpoint"
  selectedId?: string | null
}) {
  const compareIndex = step === 0 ? -1 : step === 1 ? 1 : 7
  const checkpointResolved = mode === "checkpoint" && selectedId !== null
  const checkpointPending = mode === "checkpoint" && !checkpointResolved

  return (
    <div className="can-visual can-visual--arbitration" data-step={step}>
      <div className="can-arbitration__axis" aria-hidden="true">
        <span>Identifier MSB</span>
        <span>Identifier LSB</span>
      </div>
      <div
        className="can-arbitration__rows"
        role="img"
        aria-label={
          mode === "checkpoint" && !checkpointResolved
            ? "0x120, 0x128, 0x300 세 identifier 중 중재 승리 노드를 고르는 문제입니다."
            : step === 0
              ? "세 ECU가 동시에 identifier 전송을 시작합니다."
              : step === 1
                ? "0x300 노드가 recessive 1을 보냈지만 dominant 0을 감지해 중재에서 탈락합니다."
                : "0x128 노드도 같은 이유로 탈락하고 가장 낮은 identifier 0x120이 승리합니다."
        }
      >
        {arbitrationNodes.map((node, nodeIndex) => {
          const lost =
            (step >= 1 && nodeIndex === 2) || (step >= 2 && nodeIndex === 1)
          const winner = step >= 2 && nodeIndex === 0
          const lossIndex = nodeIndex === 2 ? 1 : nodeIndex === 1 ? 7 : -1
          const selectedAnswer = selectedId === node.id
          const wrongAnswer = selectedAnswer && nodeIndex !== 0

          return (
            <div
              key={node.id}
              className={`can-arbitration__row${lost ? " is-lost" : ""}${
                winner ? " is-winner" : ""
              }${selectedAnswer ? " is-selected-answer" : ""}${
                wrongAnswer ? " is-answer-wrong" : ""
              }`}
            >
              <span className="can-arbitration__node">
                <strong>{node.label}</strong>
                <code>{node.id}</code>
              </span>
              <span className="can-arbitration__bits" aria-hidden="true">
                {node.bits.split("").map((value, bitIndex) => (
                  <i
                    key={`${node.id}-${bitIndex}`}
                    className={`${
                      bitIndex === compareIndex ? "is-comparing" : ""
                    }${bitIndex === lossIndex && lost ? " is-loss-bit" : ""}`}
                  >
                    {value}
                  </i>
                ))}
              </span>
              <span className="can-arbitration__status">
                {mode === "checkpoint" && !checkpointResolved
                  ? "선택 대기"
                  : winner
                    ? "WINNER"
                    : lost
                      ? `BIT ${10 - lossIndex}에서 양보`
                      : "전송 중"}
              </span>
            </div>
          )
        })}
      </div>

      <div className="can-arbitration__bus">
        <span>버스에서 읽힌 값</span>
        <code>
          {arbitrationNodes[0].bits.split("").map((value, bitIndex) => (
            <i
              key={`bus-${bitIndex}`}
              className={bitIndex === compareIndex ? "is-comparing" : ""}
            >
              {checkpointPending
                ? "·"
                : bitIndex <= compareIndex || compareIndex < 0
                  ? value
                  : "·"}
            </i>
          ))}
        </code>
      </div>

      <p className="can-visual__state" aria-live="polite">
        {mode === "checkpoint" && !checkpointResolved
          ? "Identifier를 비교하고 왼쪽 문제에서 승리 노드를 선택하세요."
          : mode === "checkpoint" && selectedId === "0x120"
            ? "정답입니다. 0x120이 더 이른 dominant 0을 유지합니다."
            : mode === "checkpoint"
              ? `${selectedId}은 중재 도중 양보합니다. 0x120이 버스를 차지합니다.`
              : step === 0
                ? "세 노드가 같은 순간에 identifier 전송을 시작합니다."
                : step === 1
                  ? "0x300은 1을 보냈지만 버스의 0을 읽고 전송을 멈춥니다."
                  : "0x120이 더 이른 dominant 0을 유지해 가장 먼저 버스를 차지합니다."}
      </p>
    </div>
  )
}

export function FrameVisual({
  step,
  onStepChange,
}: {
  step: number
  onStepChange: (step: number) => void
}) {
  const activeStep = Math.max(0, Math.min(step, frameStepGroups.length - 1))
  const group = frameStepGroups[activeStep]
  const activeFields: readonly number[] = group.fields
  const groupForField = (fieldIndex: number) =>
    frameStepGroups.findIndex((candidate) =>
      candidate.fields.some((index) => index === fieldIndex),
    )

  return (
    <div className="can-visual can-visual--frame">
      <div className="can-frame__strip" aria-label="CAN Standard Frame 필드">
        {frameFields.map((item, index) => {
          const active = activeFields.some((fieldIndex) => fieldIndex === index)
          return (
            <button
              key={item.name}
              type="button"
              className={active ? "is-active" : ""}
              aria-pressed={active}
              onClick={() => onStepChange(groupForField(index))}
            >
              <span>{item.name}</span>
              <small>{item.bits}</small>
            </button>
          )
        })}
      </div>

      <div className="can-frame__focus" aria-live="polite">
        <span className="can-frame__index">
          {String(activeStep + 1).padStart(2, "0")} /{" "}
          {String(frameStepGroups.length).padStart(2, "0")}
        </span>
        <div>
          <h3>{group.title}</h3>
          <code>{group.bits}</code>
        </div>
        <p>{group.description}</p>
        <dl className="can-frame__field-notes">
          {activeFields.map((fieldIndex) => {
            const field = frameFields[fieldIndex]
            return (
              <div key={field.name}>
                <dt>{field.name}</dt>
                <dd>{field.description}</dd>
              </div>
            )
          })}
        </dl>
      </div>

      <div className="can-frame__controls">
        <button
          type="button"
          disabled={activeStep === 0}
          onClick={() => onStepChange(activeStep - 1)}
        >
          이전 구간
        </button>
        <span aria-hidden="true" />
        <button
          type="button"
          disabled={activeStep === frameStepGroups.length - 1}
          onClick={() => onStepChange(activeStep + 1)}
        >
          다음 구간
        </button>
      </div>
    </div>
  )
}

type ErrorStage = "flag" | "retry"

export function AckErrorVisual({
  step,
  checkpointAnswer,
  reducedMotion,
}: {
  step: number
  checkpointAnswer: string | null
  reducedMotion: boolean
}) {
  const [errorStage, setErrorStage] = useState<ErrorStage>("flag")

  useEffect(() => {
    if (step !== 1) {
      setErrorStage("flag")
      return
    }

    if (reducedMotion) {
      setErrorStage("retry")
      return
    }

    setErrorStage("flag")
    const timer = window.setTimeout(() => setErrorStage("retry"), 620)
    return () => window.clearTimeout(timer)
  }, [reducedMotion, step])

  if (step === 2) {
    return (
      <ArbitrationVisual
        step={checkpointAnswer === null ? 0 : 2}
        mode="checkpoint"
        selectedId={checkpointAnswer}
      />
    )
  }

  const phase = step === 0 ? "ack" : "error"
  const sequence =
    phase === "ack"
      ? [
          { label: "프레임 정상 수신", state: "complete" },
          { label: "ACK slot 0", state: "active" },
          { label: "전송 완료", state: "pending" },
        ]
      : [
          { label: "오류 감지", state: "complete" },
          {
            label: "Error flag",
            state: errorStage === "flag" ? "active" : "complete",
          },
          {
            label: "자동 재전송",
            state: errorStage === "retry" ? "active" : "pending",
          },
        ]

  return (
    <div
      className="can-visual can-visual--ack"
      data-phase={phase}
      data-error-stage={errorStage}
    >
      <div
        className="can-ack__network"
        role="img"
        aria-label={
          phase === "ack"
            ? "수신 ECU가 ACK 슬롯에 dominant 0을 기록합니다."
            : errorStage === "flag"
              ? "오류를 감지한 ECU가 error flag를 보내 현재 프레임을 중단합니다."
              : "error flag로 프레임이 중단된 뒤 송신 ECU가 다시 전송합니다."
        }
      >
        <div className="can-ack__node">
          <small>송신 노드</small>
          <strong>Body ECU</strong>
          <code>0x120</code>
        </div>
        <div className="can-ack__bus" aria-hidden="true">
          <span className="can-ack__frame">FRAME</span>
          <i />
          <span className="can-ack__ack-bit">ACK 0</span>
          <span className="can-ack__error-flag">ERROR FLAG</span>
          <span className="can-ack__retry">RETRANSMIT</span>
        </div>
        <div className="can-ack__node">
          <small>수신 노드</small>
          <strong>Dashboard ECU</strong>
          <code>{phase === "error" ? "CRC mismatch" : "Frame valid"}</code>
        </div>
      </div>

      <ol className="can-ack__sequence">
        {sequence.map((item, index) => (
          <li
            key={item.label}
            className={`is-${item.state}${
              phase === "error" && index === 2 && item.state === "active"
                ? " is-retry"
                : ""
            }`}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {item.label}
          </li>
        ))}
      </ol>

      <p className="can-visual__state" aria-live="polite">
        {phase === "ack" &&
          "정상 수신 노드는 ACK 슬롯을 dominant 0으로 바꿉니다."}
        {phase === "error" &&
          errorStage === "flag" &&
          "Error flag가 현재 프레임을 즉시 중단합니다."}
        {phase === "error" &&
          errorStage === "retry" &&
          "버스가 비면 송신 노드가 중단된 프레임을 다시 전송합니다."}
      </p>
    </div>
  )
}
