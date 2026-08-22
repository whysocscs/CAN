import { useLayoutEffect, useMemo, useRef, useState } from "react"
import {
  ArrowClockwise,
  CaretDown,
  CaretLeft,
  CaretRight,
  Code,
  Keyboard,
  List,
  Monitor,
  Network,
  Play,
  TerminalWindow,
  WarningCircle,
} from "@phosphor-icons/react"
import { FrameStructureVisual } from "@/components/learning/LessonVisuals"
import "./CanFrameSender.css"

type StepKey =
  | "command"
  | "frame"
  | "socketcan"
  | "filter"
  | "message"
  | "payload"
  | "result"

type FilterDecision = "ACCEPT" | "DROP"
type TargetEcu = "Body ECU" | "Dashboard ECU" | "Rear Module"

type ParsedCommand = {
  command: string
  iface: string
  frameExpression: string
  canIdRaw: string
  canId: string
  payloadHex: string
  dataBytes: string[]
  len: number
}

type MessageDefinition = {
  ecu: TargetEcu
  name: string
  values: Record<string, string>
}

type RunAnalysis = {
  parsed: ParsedCommand
  filterResults: Array<{
    ecu: TargetEcu
    decision: FilterDecision
    allowedIds: string[]
  }>
  acceptedEcu: TargetEcu | null
  messageDefinition: MessageDefinition | null
  decodedValue: string | null
  finalResult: string
  stopAfterStep: StepKey
  explanation: string
}

const STEP_SEQUENCE: Array<{ key: StepKey; title: string; short: string }> = [
  { key: "command", title: "STEP 1 : Command Parsing", short: "Command Parsing" },
  { key: "frame", title: "STEP 2 : CAN Frame Build", short: "CAN Frame Build" },
  { key: "socketcan", title: "STEP 3 : SocketCAN Flow", short: "SocketCAN Flow" },
  { key: "filter", title: "STEP 4 : Acceptance Filter", short: "Acceptance Filter" },
  { key: "message", title: "STEP 5 : Message Decode", short: "Message Decode" },
  { key: "payload", title: "STEP 6 : Payload Decode", short: "Payload Decode" },
  { key: "result", title: "STEP 7 : Application Result", short: "Application Result" },
]

const STEP_DESCRIPTIONS: Record<StepKey, string> = {
  command:
    "입력한 cansend 명령을 command, interface, frame expression으로 나누고 CAN ID와 DATA를 추출합니다.",
  frame:
    "추출한 CAN ID와 DATA로 DLC를 계산하고, Classical CAN 2.0 프레임 안에서 어떤 필드가 사용자 입력으로 결정되는지 보여줍니다.",
  socketcan:
    "완성된 frame object가 사용자 공간에서 SocketCAN 경로를 따라 vcan0까지 전달되는 흐름을 시각화합니다.",
  filter:
    "같은 CAN ID가 각 ECU의 acceptance filter에 도달했을 때 어떤 ECU가 ACCEPT 또는 DROP 하는지 비교합니다.",
  message:
    "ACCEPT 한 ECU 내부의 message table에서 현재 CAN ID가 어떤 message type으로 해석되는지 확인합니다.",
  payload:
    "DATA 영역을 payload definition에 대입해 실제 명령 의미로 변환하는 과정을 단계적으로 보여줍니다.",
  result:
    "최종적으로 어떤 ECU가 어떤 명령으로 해석했고, 애플리케이션 레벨에서 어떤 결과가 만들어졌는지 정리합니다.",
}

const STEP_OBSERVATIONS: Record<StepKey, string> = {
  command: "명령 문자열이 공백과 # 구분자를 기준으로 어떻게 분해되는지 확인합니다.",
  frame: "DLC는 직접 입력하지 않고 payload 바이트 길이에서 계산됩니다.",
  socketcan: "프레임은 텍스트가 아니라 struct can_frame에 해당하는 객체처럼 이동합니다.",
  filter: "Acceptance filter는 CAN ID 기준으로 1차 수신 여부를 결정하고, payload 의미 해석은 아직 하지 않습니다.",
  message: "Message decode는 ACCEPT 된 ECU 내부에서 CAN ID를 message name에 매핑하는 단계입니다.",
  payload: "Payload decode는 같은 CAN ID라도 data 값에 따라 결과가 달라질 수 있음을 보여줍니다.",
  result: "여기서 보이는 결과는 교육용 해석 결과이며 실제 ECU 제어 동작 자체를 구현하는 단계는 아닙니다.",
}

const STEP_SUBSTAGE_COUNT: Record<StepKey, number> = {
  command: 10,
  frame: 6,
  socketcan: 5,
  filter: 4,
  message: 4,
  payload: 4,
  result: 3,
}

const ECU_FILTERS: Record<TargetEcu, string[]> = {
  "Body ECU": ["0x101", "0x102"],
  "Dashboard ECU": ["0x201", "0x202"],
  "Rear Module": ["0x301", "0x302"],
}

const MESSAGE_DEFINITIONS: Record<string, MessageDefinition> = {
  "0x101": {
    ecu: "Body ECU",
    name: "BODY_COMMAND",
    values: {
      "00": "DOOR_LOCK",
      "01": "UNLOCK",
    },
  },
  "0x102": {
    ecu: "Body ECU",
    name: "LIGHT_COMMAND",
    values: {
      "00": "LIGHT_OFF",
      "01": "LIGHT_ON",
    },
  },
  "0x201": {
    ecu: "Dashboard ECU",
    name: "CLUSTER_SPEED",
    values: {
      "32": "SPEED_50",
      "50": "SPEED_80",
    },
  },
  "0x202": {
    ecu: "Dashboard ECU",
    name: "CLUSTER_WARNING",
    values: {
      "00": "WARN_LAMP_OFF",
      "01": "WARN_LAMP_ON",
    },
  },
  "0x301": {
    ecu: "Rear Module",
    name: "REAR_COMMAND",
    values: {
      "00": "TRUNK_CLOSE",
      "01": "TRUNK_OPEN",
    },
  },
  "0x302": {
    ecu: "Rear Module",
    name: "TAIL_LAMP_COMMAND",
    values: {
      "00": "TAIL_LAMP_OFF",
      "01": "TAIL_LAMP_ON",
    },
  },
}

const FILTER_TARGETS: TargetEcu[] = ["Body ECU", "Dashboard ECU", "Rear Module"]

const BASE_FRAME_FIELDS = [
  { name: "SOF", bits: 1, dominant: true as boolean | null },
  { name: "ID\n[10:0]", bits: 11, dominant: null as boolean | null },
  { name: "RTR", bits: 1, dominant: false as boolean | null },
  { name: "IDE", bits: 1, dominant: false as boolean | null },
  { name: "R0", bits: 1, dominant: true as boolean | null },
  { name: "DLC", bits: 4, dominant: null as boolean | null },
  { name: "Data", bits: 64, dominant: null as boolean | null },
  { name: "CRC", bits: 15, dominant: null as boolean | null },
  { name: "CRC\nDel", bits: 1, dominant: false as boolean | null },
  { name: "ACK", bits: 1, dominant: null as boolean | null },
  { name: "ACK\nDel", bits: 1, dominant: false as boolean | null },
  { name: "EOF", bits: 7, dominant: false as boolean | null },
]

function formatCanId(canIdRaw: string) {
  return `0x${canIdRaw.toUpperCase()}`
}

function formatPayload(bytes: string[]) {
  return bytes.length ? bytes.join(" ") : "(empty)"
}

function getObservation(step: StepKey, analysis: RunAnalysis | null) {
  if (!analysis) return "아직 실행된 명령이 없습니다. Terminal에서 cansend 명령을 입력해 흐름을 시작하세요."

  if (analysis.stopAfterStep === "filter" && getStepIndex(step) > getStepIndex("filter")) {
    return "모든 ECU가 현재 CAN ID를 DROP 했기 때문에 이후 단계는 skip 상태로 표시됩니다."
  }

  if (analysis.stopAfterStep === "message" && getStepIndex(step) > getStepIndex("message")) {
    return "수신 ECU는 있었지만 현재 mock message table에 정의가 없어 이후 단계는 skip 상태로 표시됩니다."
  }

  return STEP_OBSERVATIONS[step]
}

function buildFrameFields(analysis: RunAnalysis) {
  return BASE_FRAME_FIELDS.map((field) => {
    let desc = ""

    if (field.name === "SOF") desc = "프레임의 시작 비트입니다."
    if (field.name === "ID\n[10:0]") desc = `입력한 CAN ID ${analysis.parsed.canId}가 들어갑니다.`
    if (field.name === "RTR") desc = "데이터 프레임이므로 0으로 취급합니다."
    if (field.name === "IDE") desc = "Standard Frame이므로 0입니다."
    if (field.name === "R0") desc = "예약 비트입니다."
    if (field.name === "DLC") desc = `DATA 길이 ${analysis.parsed.len} byte로부터 DLC ${analysis.parsed.len}가 계산됩니다.`
    if (field.name === "Data") desc = `사용자 입력 DATA ${formatPayload(analysis.parsed.dataBytes)}가 payload 영역에 배치됩니다.`
    if (field.name === "CRC") desc = "오류 검출용 CRC 영역입니다."
    if (field.name === "CRC\nDel") desc = "CRC delimiter입니다."
    if (field.name === "ACK") desc = "수신 노드의 응답 비트 영역입니다."
    if (field.name === "ACK\nDel") desc = "ACK delimiter입니다."
    if (field.name === "EOF") desc = "프레임 종료 비트 영역입니다."

    return {
      ...field,
      desc,
    }
  })
}

function parseCansendCommand(input: string): ParsedCommand {
  const trimmed = input.trim()

  if (!trimmed) {
    throw new Error('명령이 비어 있습니다. 예: "cansend vcan0 101#01"')
  }

  const parts = trimmed.split(/\s+/)
  if (parts.length !== 3) {
    throw new Error('형식이 올바르지 않습니다. 예: "cansend vcan0 101#01"')
  }

  const [command, iface, frameExpression] = parts

  if (command !== "cansend") {
    throw new Error('이 페이지는 "cansend" 명령만 처리합니다.')
  }

  if (!frameExpression.includes("#")) {
    throw new Error('frame expression에 "#" 구분자가 필요합니다. 예: "101#01"')
  }

  const [canIdRaw, payloadHexRaw] = frameExpression.split("#")
  const payloadHex = (payloadHexRaw ?? "").toUpperCase()

  if (!canIdRaw || !/^[0-9A-Fa-f]+$/.test(canIdRaw)) {
    throw new Error("CAN ID는 16진수여야 합니다.")
  }

  if (!/^[0-9A-Fa-f]*$/.test(payloadHex)) {
    throw new Error("DATA는 16진수 byte 문자열이어야 합니다.")
  }

  if (payloadHex.length % 2 !== 0) {
    throw new Error("DATA 길이는 byte 단위여야 하므로 짝수 자리 16진수여야 합니다.")
  }

  if (payloadHex.length / 2 > 8) {
    throw new Error("Classical CAN payload는 최대 8 byte까지만 허용합니다.")
  }

  const dataBytes = payloadHex.match(/.{1,2}/g) ?? []

  return {
    command,
    iface,
    frameExpression,
    canIdRaw: canIdRaw.toUpperCase(),
    canId: formatCanId(canIdRaw),
    payloadHex,
    dataBytes,
    len: dataBytes.length,
  }
}

function toFinalResult(decodedValue: string | null) {
  if (!decodedValue) return "Application not executed"
  if (decodedValue === "UNLOCK") return "DOOR_UNLOCK"
  return decodedValue
}

function analyzeCommand(input: string): RunAnalysis {
  const parsed = parseCansendCommand(input)

  const filterResults = FILTER_TARGETS.map((ecu) => {
    const allowedIds = ECU_FILTERS[ecu]
    return {
      ecu,
      allowedIds,
      decision: (allowedIds.includes(parsed.canId) ? "ACCEPT" : "DROP") as FilterDecision,
    }
  })

  const accepted = filterResults.find((item) => item.decision === "ACCEPT") ?? null
  if (!accepted) {
    return {
      parsed,
      filterResults,
      acceptedEcu: null,
      messageDefinition: null,
      decodedValue: null,
      finalResult: "Application not executed",
      stopAfterStep: "filter",
      explanation: `No ECU accepted CAN ID ${parsed.canId}. Message decode, payload decode, application execution are skipped.`,
    }
  }

  const messageDefinition = MESSAGE_DEFINITIONS[parsed.canId] ?? null
  if (!messageDefinition) {
    return {
      parsed,
      filterResults,
      acceptedEcu: accepted.ecu,
      messageDefinition: null,
      decodedValue: null,
      finalResult: "Message definition not found",
      stopAfterStep: "message",
      explanation: `${accepted.ecu} accepted ${parsed.canId}, but no mock message definition exists for this CAN ID.`,
    }
  }

  const payloadKey = parsed.payloadHex || "EMPTY"
  const decodedValue = messageDefinition.values[payloadKey] ?? "UNKNOWN_PAYLOAD_VALUE"

  return {
    parsed,
    filterResults,
    acceptedEcu: accepted.ecu,
    messageDefinition,
    decodedValue,
    finalResult: toFinalResult(decodedValue),
    stopAfterStep: "result",
    explanation: `${accepted.ecu} accepted ${parsed.canId}, matched ${messageDefinition.name}, and decoded payload ${payloadKey} as ${decodedValue}.`,
  }
}

function getStepIndex(step: StepKey) {
  return STEP_SEQUENCE.findIndex((item) => item.key === step)
}

function StageHeadline({
  step,
}: {
  step: (typeof STEP_SEQUENCE)[number]
}) {
  return (
    <div className="senderlab__stage-headline">
      <strong>{step.title}</strong>
      <span>{STEP_DESCRIPTIONS[step.key]}</span>
    </div>
  )
}

function StoppedScene({
  title,
  body,
}: {
  title: string
  body: string
}) {
  return (
    <div className="senderlab__scene senderlab__scene--stopped">
      <div className="senderlab__stopped-box">
        <strong>{title}</strong>
        <p>{body}</p>
      </div>
    </div>
  )
}

type CommandTimelineLayout = {
  source: [number, number, number]
  split: number
  fieldGap: number
  framePeek: number
  moveUp: number
}

function StepCommandTimeline({ analysis, substage, onAdvance }: {
  analysis: RunAnalysis
  substage: number
  onAdvance: () => void
}) {
  const phase = Math.min(Math.max(substage, 1), STEP_SUBSTAGE_COUNT.command)
  const viewportRef = useRef<HTMLDivElement>(null)
  const tokenRefs = [useRef<HTMLElement>(null), useRef<HTMLElement>(null), useRef<HTMLElement>(null)]
  const idRef = useRef<HTMLElement>(null)
  const dataRef = useRef<HTMLElement>(null)
  const [layout, setLayout] = useState<CommandTimelineLayout | null>(null)
  const [fieldX, setFieldX] = useState<[number, number] | null>(null)

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const tokens = tokenRefs.map((ref) => ref.current)
    const canId = idRef.current
    const data = dataRef.current
    if (!viewport || tokens.some((token) => !token) || !canId || !data) return

    const measure = () => {
      const viewportRect = viewport.getBoundingClientRect()
      const widths = tokens.map((token) => token!.getBoundingClientRect().width)
      const presentation = window.getComputedStyle(viewport)
      const readPresentationNumber = (property: string) =>
        Number.parseFloat(presentation.getPropertyValue(property))
      const gap = readPresentationNumber("--step1-command-gap")
      const fieldClearance = readPresentationNumber("--step1-field-clearance")
      const framePeek = readPresentationNumber("--step1-frame-peek")
      const moveUpRatio = readPresentationNumber("--step1-move-up-ratio")
      const moveUpMax = readPresentationNumber("--step1-move-up-max")
      const totalWidth = widths[0] + widths[1] + widths[2] + gap * 2
      const start = -totalWidth / 2
      const maxSplit = Math.max(0, (viewportRect.width - Math.max(...widths) - 32) / 2)
      const preferredSplit = Math.max(widths[0], widths[2]) / 2 + widths[1] / 2 + gap * 2
      const fieldWidths = [canId.getBoundingClientRect().width, data.getBoundingClientRect().width]
      setLayout({
        source: [start + widths[0] / 2, start + widths[0] + gap + widths[1] / 2, start + widths[0] + widths[1] + gap * 2 + widths[2] / 2],
        split: Math.min(maxSplit, preferredSplit),
        fieldGap: Math.min(Math.max(0, (viewportRect.width - Math.max(...fieldWidths) - 32) / 2), Math.max(...fieldWidths) / 2 + fieldClearance),
        framePeek,
        moveUp: Math.min(moveUpMax, viewportRect.height * moveUpRatio),
      })
    }

    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    return () => observer.disconnect()
  }, [analysis.parsed.command, analysis.parsed.iface, analysis.parsed.frameExpression])

  useLayoutEffect(() => {
    const viewport = viewportRef.current
    const canId = idRef.current
    const data = dataRef.current
    if (phase < 8 || !viewport || !canId || !data) {
      setFieldX(null)
      return
    }

    let animationFrame = 0
    let stopTimer = 0
    const syncFieldX = () => {
      const viewportCenter = viewport.getBoundingClientRect().left + viewport.clientWidth / 2
      const next: [number, number] = [
        canId.getBoundingClientRect().left + canId.getBoundingClientRect().width / 2 - viewportCenter,
        data.getBoundingClientRect().left + data.getBoundingClientRect().width / 2 - viewportCenter,
      ]
      setFieldX((current) =>
        current && Math.abs(current[0] - next[0]) < 0.5 && Math.abs(current[1] - next[1]) < 0.5
          ? current
          : next,
      )
      animationFrame = window.requestAnimationFrame(syncFieldX)
    }

    syncFieldX()
    stopTimer = window.setTimeout(() => window.cancelAnimationFrame(animationFrame), 1400)
    return () => {
      window.cancelAnimationFrame(animationFrame)
      window.clearTimeout(stopTimer)
    }
  }, [phase, layout])

  const transform = (index: number) => {
    if (!layout) return "translate(-50%, -50%)"
    const x = phase === 1 ? layout.source[index] : phase >= 6 && index === 2 ? 0 : (index - 1) * layout.split
    const y = phase >= 3 && phase <= 5 ? -layout.moveUp : 0

    return `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
  }

  return (
    <div ref={viewportRef} className={`senderlab__scene senderlab__command-timeline is-phase-${phase}`}>
      <code ref={tokenRefs[0]} className="senderlab__timeline-token senderlab__timeline-token--command" style={{ transform: transform(0) }}>{analysis.parsed.command}</code>
      <code ref={tokenRefs[1]} className="senderlab__timeline-token senderlab__timeline-token--interface" style={{ transform: transform(1) }}>{analysis.parsed.iface}</code>
      <code ref={tokenRefs[2]} className="senderlab__timeline-token senderlab__timeline-token--frame" style={{ transform: transform(2) }}>
        <span ref={idRef} className="senderlab__timeline-id" style={{ transform: phase >= 7 && layout ? `translateX(${-layout.fieldGap}px)` : "translateX(0)" }}>{analysis.parsed.canIdRaw}</span>
        <span className="senderlab__timeline-divider" style={{ transform: "translateX(0)" }}>#</span>
        <span ref={dataRef} className="senderlab__timeline-data" style={{ transform: phase >= 7 && layout ? `translateX(${layout.fieldGap}px)` : "translateX(0)" }}>{analysis.parsed.payloadHex || "EMPTY"}</span>
      </code>
      {(["Command", "Interface", "Frame expression"] as const).map((label, index) => (
        <div key={label} className={`senderlab__timeline-guide senderlab__timeline-guide--${index}`} style={{ transform: transform(index) }}><i /><span>{label}</span></div>
      ))}
      <div className="senderlab__timeline-field senderlab__timeline-field--id" style={fieldX ? { left: `calc(50% + ${fieldX[0]}px)`, transform: "translateX(-50%)" } : undefined}><i /><strong>CAN ID</strong><code>0x{analysis.parsed.canIdRaw}</code></div>
      <div className="senderlab__timeline-field senderlab__timeline-field--data" style={fieldX ? { left: `calc(50% + ${fieldX[1]}px)`, transform: "translateX(-50%)" } : undefined}><i /><strong>DATA</strong><code>{analysis.parsed.payloadHex || "EMPTY"}</code></div>
      <div className="senderlab__timeline-complete"><strong>STEP 1 COMPLETE</strong><button type="button" onClick={onAdvance}>STEP 2 이동</button></div>
    </div>
  )
}

function StepFrameStage({
  analysis,
  substage,
}: {
  analysis: RunAnalysis
  substage: number
}) {
  const frameFields = buildFrameFields(analysis)
  const selectedField =
    substage >= 6
      ? frameFields.find((field) => field.name === "Data") ?? null
      : substage >= 5
        ? frameFields.find((field) => field.name === "DLC") ?? null
        : substage >= 4
          ? frameFields.find((field) => field.name === "ID\n[10:0]") ?? null
          : null

  return (
    <div className="senderlab__scene senderlab__scene--frame">
      <div className={`senderlab__frame-build-row ${substage >= 1 ? "is-on" : ""}`}>
        <code>{analysis.parsed.canId}</code>
        <CaretRight size={18} />
        <code>{formatPayload(analysis.parsed.dataBytes)}</code>
      </div>

      <div className={`senderlab__mini-frame ${substage >= 2 ? "is-on" : ""}`}>
        <div>
          <span>CAN ID</span>
          <code>{analysis.parsed.canId}</code>
        </div>
        <div>
          <span>DLC</span>
          <code>{substage >= 4 ? analysis.parsed.len : "?"}</code>
        </div>
        <div>
          <span>DATA</span>
          <code>{formatPayload(analysis.parsed.dataBytes)}</code>
        </div>
      </div>

      <div className={`senderlab__dlc-calc ${substage >= 3 ? "is-on" : ""}`}>
        <span>DATA</span>
        <code>{formatPayload(analysis.parsed.dataBytes)}</code>
        <small>{analysis.parsed.len} Byte</small>
        <b>DLC = {analysis.parsed.len}</b>
      </div>

      <div className={`senderlab__frame-lesson ${substage >= 4 ? "is-on" : ""}`}>
        <FrameStructureVisual
          fields={frameFields}
          selectedField={selectedField}
          frameType="standard"
          onSelect={() => {}}
        />
      </div>

      <div className={`senderlab__frame-emphasis ${substage >= 6 ? "is-on" : ""}`}>
        <span>CAN 기초 페이지와 동일한 프레임 도식에서 ID, DLC, DATA만 현재 입력값 기준으로 집중해서 확인합니다.</span>
      </div>
    </div>
  )
}

function StepSocketStage({
  analysis,
  substage,
}: {
  analysis: RunAnalysis
  substage: number
}) {
  const frameTokenClass =
    substage >= 5
      ? "is-vcan"
      : substage >= 4
        ? "is-kernel"
        : substage >= 3
          ? "is-socket"
          : substage >= 2
            ? "is-struct"
            : "is-app"

  return (
    <div className="senderlab__scene senderlab__scene--socket">
      <div className="senderlab__socket-stack">
        {["cansend", "struct can_frame", "SocketCAN", "Linux Kernel", "vcan0"].map(
          (label, index) => (
            <div key={label} className={substage >= index + 1 ? "is-on" : ""}>
              <span>{label}</span>
            </div>
          ),
        )}
        <div className={`senderlab__frame-token ${frameTokenClass}`}>
          <code>{analysis.parsed.canId}</code>
          <small>DLC {analysis.parsed.len}</small>
          <code>{formatPayload(analysis.parsed.dataBytes)}</code>
        </div>
      </div>
      <p className={`senderlab__scene-note ${substage >= 5 ? "is-on" : ""}`}>
        vcan0는 실제 차량 배선이 아니라 Linux 기반 Virtual CAN Interface입니다.
      </p>
    </div>
  )
}

function StepFilterStage({
  analysis,
  substage,
}: {
  analysis: RunAnalysis
  substage: number
}) {
  return (
    <div className="senderlab__scene senderlab__scene--filter">
      <div className={`senderlab__incoming-frame ${substage >= 1 ? "is-on" : ""}`}>
        <code>{analysis.parsed.canId}</code>
      </div>
      <div className={`senderlab__filter-lanes ${substage >= 2 ? "is-on" : ""}`}>
        {analysis.filterResults.map((item) => (
          <div
            key={item.ecu}
            className={
              item.decision === "ACCEPT" && substage >= 3
                ? "is-accept"
                : substage >= 3
                  ? "is-drop"
                  : ""
            }
          >
            <strong>{item.ecu}</strong>
            <small>Allowed: {item.allowedIds.join(", ")}</small>
            <code>{analysis.parsed.canId}</code>
            <b>{substage >= 3 ? item.decision : "..."}</b>
          </div>
        ))}
      </div>
      <div className={`senderlab__filter-summary ${substage >= 4 ? "is-on" : ""}`}>
        <span>
          {analysis.acceptedEcu
            ? `${analysis.acceptedEcu}만 CAN ID ${analysis.parsed.canId}를 ACCEPT 했습니다.`
            : `No ECU accepted CAN ID ${analysis.parsed.canId}.`}
        </span>
      </div>
    </div>
  )
}

function StepMessageStage({
  analysis,
  substage,
}: {
  analysis: RunAnalysis
  substage: number
}) {
  if (!analysis.acceptedEcu || !analysis.messageDefinition) {
    return (
      <StoppedScene
        title="Message Decode skipped"
        body={
          analysis.acceptedEcu
            ? "현재 mock message table에 정의가 없어 이 단계는 진행되지 않습니다."
            : "No target ECU. Acceptance filter 단계에서 모든 ECU가 DROP 했습니다."
        }
      />
    )
  }

  return (
    <div className="senderlab__scene senderlab__scene--message">
      <div className={`senderlab__message-incoming ${substage >= 1 ? "is-on" : ""}`}>
        <span>Incoming CAN ID</span>
        <code>{analysis.parsed.canId}</code>
      </div>
      <div className={`senderlab__message-table ${substage >= 2 ? "is-on" : ""}`}>
        <strong>{analysis.acceptedEcu} Message Table</strong>
        {Object.entries(MESSAGE_DEFINITIONS)
          .filter(([, definition]) => definition.ecu === analysis.acceptedEcu)
          .map(([canId, definition]) => (
            <div key={canId} className={canId === analysis.parsed.canId && substage >= 3 ? "is-match" : ""}>
              <code>{canId}</code>
              <b>{definition.name}</b>
              <small>{canId === analysis.parsed.canId && substage >= 3 ? "MATCH" : ""}</small>
            </div>
          ))}
      </div>
      <div className={`senderlab__message-result ${substage >= 4 ? "is-on" : ""}`}>
        <span>Message Type</span>
        <b>{analysis.messageDefinition.name}</b>
      </div>
    </div>
  )
}

function StepPayloadStage({
  analysis,
  substage,
}: {
  analysis: RunAnalysis
  substage: number
}) {
  if (!analysis.acceptedEcu || !analysis.messageDefinition) {
    return (
      <StoppedScene
        title="Payload Decode skipped"
        body="Message decode 단계까지 도달하지 못했기 때문에 payload table을 조회하지 않습니다."
      />
    )
  }

  const payloadRows = Object.entries(analysis.messageDefinition.values)

  return (
    <div className="senderlab__scene senderlab__scene--payload">
      <div className={`senderlab__payload-incoming ${substage >= 1 ? "is-on" : ""}`}>
        <span>DATA</span>
        <code>{formatPayload(analysis.parsed.dataBytes)}</code>
        <small>DATA[0..n]</small>
      </div>
      <div className={`senderlab__payload-table ${substage >= 2 ? "is-on" : ""}`}>
        <strong>{analysis.messageDefinition.name}</strong>
        {payloadRows.map(([value, label]) => (
          <div key={value} className={value === analysis.parsed.payloadHex && substage >= 3 ? "is-match" : ""}>
            <code>{value}</code>
            <b>{label}</b>
            <small>{value === analysis.parsed.payloadHex && substage >= 3 ? "MATCH" : ""}</small>
          </div>
        ))}
      </div>
      <div className={`senderlab__payload-result ${substage >= 4 ? "is-on" : ""}`}>
        <span>Decoded Value</span>
        <b>{analysis.decodedValue ?? "UNKNOWN_PAYLOAD_VALUE"}</b>
      </div>
    </div>
  )
}

function StepResultStage({
  analysis,
  substage,
}: {
  analysis: RunAnalysis
  substage: number
}) {
  return (
    <div className="senderlab__scene senderlab__scene--result">
      <div className={`senderlab__process-complete ${substage >= 1 ? "is-on" : ""}`}>
        <strong>PROCESS COMPLETE</strong>
        <div className="senderlab__result-summary">
          <div>
            <span>CAN ID</span>
            <code>{analysis.parsed.canId}</code>
          </div>
          <div>
            <span>Target</span>
            <b>{analysis.acceptedEcu ?? "None"}</b>
          </div>
          <div>
            <span>Message</span>
            <b>{analysis.messageDefinition?.name ?? "Skipped"}</b>
          </div>
          <div>
            <span>Payload</span>
            <code>{formatPayload(analysis.parsed.dataBytes)}</code>
          </div>
          <div>
            <span>Decoded</span>
            <b>{analysis.decodedValue ?? "Skipped"}</b>
          </div>
        </div>
      </div>
      <div className={`senderlab__result-final ${substage >= 2 ? "is-on" : ""}`}>
        <code>{analysis.finalResult}</code>
      </div>
      <div className={`senderlab__result-note ${substage >= 3 ? "is-on" : ""}`}>
        <span>{analysis.explanation}</span>
      </div>
    </div>
  )
}

function StepStage({
  stepKey,
  analysis,
  substage,
  onAdvance,
}: {
  stepKey: StepKey
  analysis: RunAnalysis
  substage: number
  onAdvance: () => void
}) {
  switch (stepKey) {
    case "command":
      return <StepCommandTimeline analysis={analysis} substage={substage} onAdvance={onAdvance} />
    case "frame":
      return <StepFrameStage analysis={analysis} substage={substage} />
    case "socketcan":
      return <StepSocketStage analysis={analysis} substage={substage} />
    //case "filter":
      //return <StepFilterStage analysis={analysis} substage={substage} />
    //case "message":
      //return <StepMessageStage analysis={analysis} substage={substage} />
    //case "payload":
      //return <StepPayloadStage analysis={analysis} substage={substage} />
    //case "result":
      //return <StepResultStage analysis={analysis} substage={substage} />
  }
}

export default function CanFrameSenderPage() {
  const [commandInput, setCommandInput] = useState("cansend vcan0 101#01")
  const [analysis, setAnalysis] = useState<RunAnalysis | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(0)
  const [substage, setSubstage] = useState(0)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [lastSubmittedCommand, setLastSubmittedCommand] = useState("cansend vcan0 101#01")
  const [guideOpen, setGuideOpen] = useState(
    () => typeof window === "undefined" || window.innerWidth > 800,
  )

  const currentStep = STEP_SEQUENCE[currentStepIndex]

  const progress = analysis ? Math.round(((currentStepIndex + 1) / STEP_SEQUENCE.length) * 100) : 0
  const canMovePrev = currentStepIndex > 0
  const canMoveNext =
    !!analysis &&
    currentStepIndex < STEP_SEQUENCE.length - 1 &&
    (currentStep.key !== "command" || substage >= STEP_SUBSTAGE_COUNT.command)
  const currentObservation = useMemo(
    () => getObservation(currentStep.key, analysis),
    [analysis, currentStep.key],
  )

  const submitCommand = () => {
    try {
      const nextAnalysis = analyzeCommand(commandInput)
      setAnalysis(nextAnalysis)
      setErrorMessage(null)
      setCurrentStepIndex(0)
      setSubstage(1)
      setLastSubmittedCommand(commandInput.trim())
    } catch (error) {
      setAnalysis(null)
      setErrorMessage(
        error instanceof Error ? error.message : "입력을 해석하는 중 알 수 없는 오류가 발생했습니다.",
      )
      setSubstage(0)
    }
  }

  const replayStep = () => {
    if (!analysis) return
    setSubstage(1)
  }

  const moveStep = (direction: -1 | 1) => {
    if (!analysis) return
    const nextIndex = currentStepIndex + direction
    if (nextIndex < 0 || nextIndex >= STEP_SEQUENCE.length) return
    setCurrentStepIndex(nextIndex)
    setSubstage(1)
  }

  const advanceViewport = () => {
    if (!analysis) return
    if (currentStep.key === "command") {
      if (substage < STEP_SUBSTAGE_COUNT.command) {
        setSubstage((current) => current + 1)
      }
      return
    }
    const maxSubstage = STEP_SUBSTAGE_COUNT[currentStep.key]

    if (substage < maxSubstage) {
      setSubstage((current) => current + 1)
      return
    }

    if (currentStepIndex < STEP_SEQUENCE.length - 1) {
      moveStep(1)
    }
  }

  const terminalLines = analysis
    ? [
        `> ${lastSubmittedCommand}`,
        `[parse] CAN ID ${analysis.parsed.canId} / DATA ${formatPayload(analysis.parsed.dataBytes)} / DLC ${analysis.parsed.len}`,
        `[filter] ${
          analysis.acceptedEcu ? `${analysis.acceptedEcu} ACCEPT` : `all DROP for ${analysis.parsed.canId}`
        }`,
        `[result] ${analysis.finalResult}`,
      ]
    : ['입력 대기 중... 예: "cansend vcan0 101#01"']

  return (
    <main className="canlab canlab--embedded senderlab-page" aria-label="CAN Frame 송신기 실습">
      <aside className="canlab__sidebar">
        <div className="canlab__brand">
          <strong>CANLite</strong>
          <span>LOCAL LAB</span>
        </div>
        <div className="canlab__side-progress" aria-label="학습 진행률">
          <i style={{ width: `${Math.max(progress, 25)}%` }} />
          <span>{progress}%</span>
        </div>
        <nav className="canlab__nav" aria-label="CAN 실습 탐색">
          <p>CAN 실습</p>
          <a href="#sender-stage" className="is-active">
            <TerminalWindow size={18} />
            CAN Frame 송신기
          </a>
          <a href="#sender-terminal">
            <Code size={18} />
            명령 입력
          </a>
          <a href="#sender-stage">
            <Monitor size={18} />
            단계 애니메이션
          </a>
          <a href="#sender-guide">
            <Network size={18} />
            현재 상태
          </a>
        </nav>
        <div className="canlab__side-note">
          <Keyboard size={18} />
          <p>
            <strong>Mock Sender Lab</strong>
            FastAPI와 SocketCAN 연동 전 단계에서 cansend 입력이 어떤 frame 해석 과정을 거치는지
            프론트엔드만으로 학습하는 페이지입니다.
          </p>
        </div>
      </aside>

      <section className="canlab__shell">
        <header className="canlab__header">
          <div className="canlab__crumb">
            <span>홈</span>
            <CaretRight size={13} />
            <span>CAN 실습</span>
            <CaretRight size={13} />
            <strong>CAN Frame 송신기</strong>
          </div>
          <div className="canlab__header-status">
            <span>
              <i /> 프론트엔드 프리뷰
            </span>
            <button type="button" aria-label="실습 메뉴">
              <List size={19} />
            </button>
          </div>
        </header>

        <div className="canlab__layout">
          <section className="canlab__workbench" aria-label="CAN Frame 송신기 작업 영역">
            <section className="canlab__vehicle-panel" id="sender-stage">
              <div className="canlab__panel-bar">
                <div>
                  <span>Frame Viewport</span>
                  <small>Classical CAN 2.0 Flow Stage</small>
                </div>
                <div className="canlab__vehicle-controls" aria-label="단계 제어">
                  <button type="button" onClick={() => moveStep(-1)} disabled={!canMovePrev}>
                    <CaretLeft size={14} /> 이전 STEP
                  </button>
                  <button type="button" onClick={replayStep} disabled={!analysis}>
                    <ArrowClockwise size={14} /> Replay
                  </button>
                  <button type="button" onClick={() => moveStep(1)} disabled={!canMoveNext}>
                    다음 STEP <CaretRight size={14} />
                  </button>
                </div>
              </div>

              <div className="canlab__vehicle-stage senderstage">
                <div
                  className={`senderstage__canvas senderstage__canvas--single ${analysis ? "is-clickable" : ""}`}
                  onClick={(event) => {
                    const interactiveTarget = event.target instanceof Element
                      ? event.target.closest("button, a, input, select, textarea, [role='button']")
                      : null
                    if (interactiveTarget && interactiveTarget !== event.currentTarget) return
                    advanceViewport()
                  }}
                  role={analysis ? "button" : undefined}
                  tabIndex={analysis ? 0 : undefined}
                  onKeyDown={(event) => {
                    if (!analysis) return
                    const interactiveTarget = event.target instanceof Element
                      ? event.target.closest("button, a, input, select, textarea, [role='button']")
                      : null
                    if (interactiveTarget && interactiveTarget !== event.currentTarget) return
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault()
                      advanceViewport()
                    }
                  }}
                >
                  <div className="senderstage__title">
                    <StageHeadline step={currentStep} />
                  </div>

                  {analysis ? (
                    <StepStage
                      stepKey={currentStep.key}
                      analysis={analysis}
                      substage={substage}
                      onAdvance={() => moveStep(1)}
                    />
                  ) : (
                    <div className="senderlab__idle-stage">
                      <strong>아직 실행된 명령이 없습니다.</strong>
                      <p>
                        아래 Terminal에서 <code>cansend vcan0 101#01</code> 같은 명령을 입력하고
                        SEND를 누르면 이 위치에서 단계별 애니메이션이 시작됩니다.
                      </p>
                    </div>
                  )}
                </div>

                <div className="canlab__vehicle-badge">Single Step Focus · Parse / Filter / Decode</div>
                <div className="canlab__vehicle-actions">
                  <strong>{currentStep.title}</strong>
                  <ul>
                    <li>{currentObservation}</li>
                    <li>{analysis ? analysis.explanation : "명령 실행 전에는 프레임 흐름이 표시되지 않습니다."}</li>
                  </ul>
                </div>
                <div className="canlab__vehicle-state canlab__vehicle-state--dynamic">
                  <i /> {analysis ? `${currentStep.short} · viewport 클릭으로 진행` : "입력 대기 중"}
                </div>
              </div>
            </section>

            <section className="canlab__console" id="sender-terminal" aria-label="CAN 명령 입력">
              <div className="canlab__tabs" role="tablist" aria-label="CAN Frame 송신기 console">
                <button className="is-active" type="button" role="tab" aria-selected="true">
                  <TerminalWindow size={15} /> Terminal
                </button>
              </div>

              <div className="canlab__terminal-pane" role="tabpanel">
                <div className="canlab__console-toolbar">
                  <strong>Terminal</strong>
                  <span className="canlab__terminal-status is-connected">
                    <i />
                    Mock Sender Ready
                  </span>
                </div>

                <div className="senderlab__terminal-output" aria-live="polite">
                  {terminalLines.map((line) => (
                    <div key={line} className="senderlab__terminal-line">
                      {line}
                    </div>
                  ))}
                  {errorMessage && (
                    <div className="senderlab__terminal-line senderlab__terminal-line--error">
                      [error] {errorMessage}
                    </div>
                  )}
                </div>

                <form
                  className="canlab__command-form senderlab__command-form"
                  onSubmit={(event) => {
                    event.preventDefault()
                    submitCommand()
                  }}
                >
                  <label htmlFor="senderlab-command">Command</label>
                  <input
                    id="senderlab-command"
                    value={commandInput}
                    onChange={(event) => setCommandInput(event.target.value)}
                    placeholder="cansend vcan0 101#01"
                  />
                  <button type="submit">
                    <Play size={13} weight="fill" />
                    SEND
                  </button>
                </form>

                {errorMessage && (
                  <div className="senderlab__error" role="alert">
                    <WarningCircle size={18} weight="fill" />
                    <div>
                      <strong>입력 오류</strong>
                      <p>{errorMessage}</p>
                    </div>
                  </div>
                )}
              </div>
            </section>
          </section>

          <aside className="canlab__guide senderlab__guide" id="sender-guide" aria-label="현재 단계 안내">
            <button
              type="button"
              className="canlab__guide-top"
              aria-expanded={guideOpen}
              onClick={() => setGuideOpen((value) => !value)}
            >
              <span>
                <strong>CAN Frame 송신기</strong>
                <small>{currentStep.title}</small>
              </span>
              <CaretDown size={16} />
            </button>

            <div className="canlab__guide-body" hidden={!guideOpen}>
              <div className="canlab__guide-progress">
                <span>진행률</span>
                <b>{progress}%</b>
                <i>
                  <em style={{ width: `${progress}%` }} />
                </i>
              </div>

              <section className="canlab__status-box">
                <h2>현재 STEP</h2>
                <dl>
                  <div>
                    <dt>단계</dt>
                    <dd>{currentStep.title}</dd>
                  </div>
                  <div>
                    <dt>상태</dt>
                    <dd>{analysis ? "클릭 대기" : "미실행"}</dd>
                  </div>
                </dl>
              </section>

              <section className="canlab__status-box">
                <h2>현재 입력</h2>
                <dl>
                  <div>
                    <dt>Command</dt>
                    <dd>{analysis ? lastSubmittedCommand : "-"}</dd>
                  </div>
                  <div>
                    <dt>CAN ID</dt>
                    <dd>{analysis ? analysis.parsed.canId : "-"}</dd>
                  </div>
                  <div>
                    <dt>DLC</dt>
                    <dd>{analysis ? String(analysis.parsed.len) : "-"}</dd>
                  </div>
                  <div>
                    <dt>DATA</dt>
                    <dd>{analysis ? formatPayload(analysis.parsed.dataBytes) : "-"}</dd>
                  </div>
                </dl>
              </section>

              <section className="canlab__status-box">
                <h2>관찰 포인트</h2>
                <dl>
                  <div>
                    <dt>Note</dt>
                    <dd>{currentObservation}</dd>
                  </div>
                  <div>
                    <dt>Result</dt>
                    <dd>{analysis ? analysis.finalResult : "-"}</dd>
                  </div>
                  <div>
                    <dt>Filter</dt>
                    <dd>{analysis?.acceptedEcu ?? "Not accepted yet"}</dd>
                  </div>
                </dl>
              </section>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
