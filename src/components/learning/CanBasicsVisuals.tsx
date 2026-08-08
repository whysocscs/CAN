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
  const state = step === 0 ? "separate" : step === 1 ? "converging" : "shared"
  const facts =
    [
      [
        ["연결 방식", "ECU 간 직접 연결"],
        ["배선 변화", "노드마다 증가"],
        ["결과", "확장 복잡"],
      ],
      [
        ["연결 방식", "짧은 분기선"],
        ["공용선", "CAN_H · CAN_L"],
        ["변화", "하나의 경로"],
      ],
      [
        ["프레임", "0x101"],
        ["모든 ECU", "프레임 수신"],
        ["Body ECU", "0x101 처리"],
      ],
    ][step] ?? []

  return (
    <div className="can-visual can-visual--why" data-topology={state}>
      <svg
        viewBox="0 0 760 460"
        role="img"
        aria-labelledby="why-can-visual-title why-can-visual-description"
      >
        <title id="why-can-visual-title">
          ECU 배선이 공용 CAN Bus로 수렴하는 과정
        </title>
        <desc id="why-can-visual-description">
          개별 연결에서는 ECU 사이에 많은 배선이 필요하지만 CAN에서는 네 ECU가
          CAN H와 CAN L 두 선을 함께 사용합니다.
        </desc>

        <g className="can-why__legacy-wires" aria-hidden="true">
          <path d="M154 104 C300 72 458 70 606 104" />
          <path d="M154 104 C286 164 462 294 606 350" />
          <path d="M154 350 C286 290 462 164 606 104" />
          <path d="M154 350 C300 382 458 382 606 350" />
          <path d="M154 104 C204 210 204 246 154 350" />
          <path d="M606 104 C556 210 556 246 606 350" />
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
            SHARED CAN BUS
          </text>
          <text x="380" y="274" textAnchor="middle">
            CAN_H · CAN_L
          </text>
        </g>

        <g className="can-why__broadcast" aria-hidden="true">
          <rect x="330" y="208" width="100" height="44" rx="3" />
          <text x="380" y="235" textAnchor="middle">
            ID 0x101
          </text>
        </g>

        {[
          { x: 46, y: 68, title: "Body ECU", detail: "Door · Lamp" },
          { x: 566, y: 68, title: "Dashboard", detail: "Speed · RPM" },
          { x: 46, y: 314, title: "Gateway", detail: "Routing" },
          { x: 566, y: 314, title: "IDS ECU", detail: "Detection" },
        ].map((node) => (
          <g key={node.title} className="can-why__node">
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
          "개별 연결: 장치가 늘수록 배선 경로가 빠르게 증가합니다."}
        {step === 1 && "수렴 중: 각 ECU의 송수신 선이 하나의 경로로 모입니다."}
        {step === 2 &&
          "0x101을 모든 ECU가 수신하고, 해당 ID를 사용하는 Body ECU만 처리합니다."}
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
