import { useEffect, useRef, useState } from "react"
import { Badge } from "@fluentui/react-components"
import { Play } from "@phosphor-icons/react"
import CanCommandTerminal from "@/features/can/practice/CanCommandTerminal"
import RulePacketAnalysis, { type RulePacketEvent, type CounterValidation } from "./RulePacketAnalysis"
import CounterSequence, { type CounterSequenceFrame, type CounterSequenceAlert } from "./CounterSequence"

const MONITORED_CAN_ID = "0x456"
const NORMAL_FRAMES = [10, 11, 12, 13]
const ANSWERS = [
  { id: "counter", text: "재전송된 패킷의 카운터 값이 이미 지나간 값(11)과 중복되었기 때문" },
  { id: "whitelist", text: "CAN ID가 화이트리스트에 등록되어 있지 않았기 때문" },
  { id: "period", text: "프레임이 100ms 주기보다 빠르게 도착했기 때문" },
  { id: "length", text: "DATA 길이가 정상 프레임과 달랐기 때문" },
]

type Phase = "observe" | "replay" | "quiz" | "state" | "complete"
type DoorState = "CLOSED" | "OPEN"
type Verdict = "PASS" | "ALERT"
type MonitorFrame = CounterSequenceFrame & RulePacketEvent & { validation: CounterValidation }

function parseCansend(command: string) {
  const match = command.trim().match(/^cansend\s+vcan0\s+([0-9a-f]{1,3})#([0-9a-f]{4})$/i)
  if (!match) return null
  return { canId: `0x${match[1].padStart(3, "0").toLowerCase()}`, command: match[2].slice(0, 2).toUpperCase(), counter: Number.parseInt(match[2].slice(2, 4), 16), data: match[2].toUpperCase() }
}

function counterText(counter: number) {
  return `${counter} (0x${counter.toString(16).toUpperCase().padStart(2, "0")})`
}

function shuffle<T>(items: T[]) {
  const copied = [...items]
  for (let index = copied.length - 1; index > 0; index -= 1) {
    const next = Math.floor(Math.random() * (index + 1))
    ;[copied[index], copied[next]] = [copied[next], copied[index]]
  }
  return copied
}

export default function CounterStatusCheckIDSPage() {
  const [practiceStarted, setPracticeStarted] = useState(false)
  const [phase, setPhase] = useState<Phase>("observe")
  const [frames, setFrames] = useState<CounterSequenceFrame[]>([])
  const [monitor, setMonitor] = useState<MonitorFrame[]>([])
  const [lastAcceptedCounter, setLastAcceptedCounter] = useState<number | null>(null)
  const [expectedCounter, setExpectedCounter] = useState(10)
  const [doorState, setDoorState] = useState<DoorState>("CLOSED")
  const [verdict, setVerdict] = useState<"IDLE" | Verdict>("IDLE")
  const [alert, setAlert] = useState<CounterSequenceAlert | null>(null)
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null)
  const [answers, setAnswers] = useState(ANSWERS)
  const [quizFeedback, setQuizFeedback] = useState("")
  const [clearSignal, setClearSignal] = useState(0)
  const [logClearedAt, setLogClearedAt] = useState(0)
  const [consoleTab, setConsoleTab] = useState<"terminal" | "dashboard">("terminal")
  const [runRevision, setRunRevision] = useState(0)
  const phaseRef = useRef<Phase>("observe")
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const lastAcceptedRef = useRef<number | null>(null)
  const expectedRef = useRef(10)
  const doorStateRef = useRef<DoorState>("CLOSED")
  const frameIdRef = useRef(0)
  const historicalFramesRef = useRef<MonitorFrame[]>([])
  const selectedHistoricalFrame = useRef<MonitorFrame | null>(null)

  const setCurrentPhase = (next: Phase) => { phaseRef.current = next; setPhase(next) }
  const stopNormalFrames = () => { if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null } }
  const updateDoorState = (next: DoorState) => { doorStateRef.current = next; setDoorState(next) }
  const appendRecord = (frame: Omit<MonitorFrame, "id" | "time" | "timestamp" | "elapsedMs" | "validation">, validation: Partial<CounterValidation> = {}) => {
    const timestamp = Date.now()
    const elapsedMs = performance.now() - startedAtRef.current
    const entry: MonitorFrame = {
      ...frame, ruleId: frame.ruleId ?? "CAN_COUNTER", id: ++frameIdRef.current, timestamp, elapsedMs,
      time: `${new Date(timestamp).toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}.${new Date(timestamp).getMilliseconds().toString().padStart(3, "0")}`,
      validation: {
        expectedCounter: expectedRef.current, counterResult: frame.counter === expectedRef.current ? "PASS" : "REJECTED",
        stateBefore: doorStateRef.current, stateAfter: doorStateRef.current, stateResult: "NOT_CHECKED",
        replayed: Boolean(frame.replayed), reasonCode: "COUNTER_MATCH", phase: phaseRef.current, ...validation,
      },
    }
    setMonitor((current) => [...current, entry])
    return entry
  }
  const appendChip = (frame: CounterSequenceFrame) => setFrames((current) => [...current, frame])
  const acceptCounter = (counter: number) => {
    lastAcceptedRef.current = counter
    expectedRef.current = counter + 1
    setLastAcceptedCounter(counter)
    setExpectedCounter(counter + 1)
  }
  const emitNormalFrame = (counter: number) => {
    const no = frameIdRef.current + 1
    const base = { no, canId: MONITORED_CAN_ID, command: "01", counter, data: `01${counter.toString(16).padStart(2, "0").toUpperCase()}`, verdict: "PASS" as const, reason: `Counter ${counter} matches expected.` }
    const record = appendRecord(base)
    historicalFramesRef.current.push(record)
    appendChip(record)
    acceptCounter(counter)
    setVerdict("PASS")
  }

  useEffect(() => () => stopNormalFrames(), [])

  const start = () => {
    stopNormalFrames()
    startedAtRef.current = performance.now()
    lastAcceptedRef.current = null
    expectedRef.current = 10
    frameIdRef.current = 0
    historicalFramesRef.current = []
    selectedHistoricalFrame.current = null
    setPracticeStarted(true)
    setCurrentPhase("observe")
    setFrames([])
    setMonitor([])
    setLastAcceptedCounter(null)
    setExpectedCounter(10)
    updateDoorState("CLOSED")
    setVerdict("IDLE")
    setAlert(null)
    setQuizAnswer(null)
    setAnswers(shuffle(ANSWERS))
    setQuizFeedback("")
    setClearSignal((value) => value + 1)
    setLogClearedAt(0)
    setRunRevision((value) => value + 1)
    let index = 0
    const emit = () => {
      const counter = NORMAL_FRAMES[index]
      if (counter === undefined) { stopNormalFrames(); return }
      emitNormalFrame(counter)
      index += 1
      if (index === NORMAL_FRAMES.length) stopNormalFrames()
    }
    emit()
    timerRef.current = window.setInterval(emit, 1000)
  }

  const openDoorForStateCheck = () => {
    setCurrentPhase("state")
    setAlert(null)
    const counter = expectedRef.current
    const no = frameIdRef.current + 1
    const base = { no, canId: MONITORED_CAN_ID, command: "01", counter, data: `01${counter.toString(16).padStart(2, "0").toUpperCase()}`, verdict: "PASS" as const, reason: `Counter ${counter} matches expected.` }
    const record = appendRecord(base, { stateAfter: "OPEN", stateResult: "PASS" })
    appendChip(record)
    acceptCounter(counter)
    updateDoorState("OPEN")
    setVerdict("PASS")
  }

  const handleMonitoredFrame = (frame: Pick<MonitorFrame, "canId" | "command" | "counter" | "data">, replayed: boolean) => {
    const { canId, command, counter, data } = frame
    const no = frameIdRef.current + 1
    const statePhase = phaseRef.current === "state"
    if (statePhase && command !== "01") {
      const reason = `Command rejected: expected 01 (OPEN), received ${command}.`
      appendRecord({ no, canId, command, counter, data, verdict: "ALERT", reason, ruleId: "CAN_COMMAND" }, { counterResult: "NOT_CHECKED", reasonCode: "COMMAND_REJECTED" })
      setVerdict("ALERT")
      setAlert({ expected: expectedRef.current, received: counter, type: "command", receivedCommand: command })
      return [`\x1b[31m[ALERT] ${reason}\x1b[0m`]
    }
    if (counter !== expectedRef.current) {
      const replay = lastAcceptedRef.current !== null && counter <= lastAcceptedRef.current
      const reason = replay ? `Replay detected: expected counter ${expectedRef.current}, received ${counter}.` : `Counter mismatch: expected counter ${expectedRef.current}, received ${counter}.`
      const original = historicalFramesRef.current.find((entry) => entry.canId === canId && entry.data === data)
      const record = appendRecord({ no, canId, command, counter, data, replayed, verdict: "ALERT", reason, ruleId: replay ? "CAN_REPLAY" : "CAN_COUNTER" }, { replayed: replay || replayed, originalEventId: replay ? original?.id : undefined, reasonCode: replay ? "REPLAY_DETECTED" : "COUNTER_MISMATCH" })
      if (!statePhase) appendChip(record)
      setVerdict("ALERT")
      setAlert({ expected: expectedRef.current, received: counter, type: replay ? "replay" : "counter" })
      if (replay && !statePhase) setCurrentPhase("quiz")
      return [`\x1b[31m[ALERT] ${reason}\x1b[0m`]
    }
    const stateAnomaly = statePhase && command === "01" && doorStateRef.current === "OPEN"
    const expected = expectedRef.current
    const record = appendRecord({ no, canId, command, counter, data, replayed, verdict: stateAnomaly ? "ALERT" : "PASS", ruleId: stateAnomaly ? "CAN_STATE" : "CAN_COUNTER", reason: stateAnomaly ? "State anomaly: door is already OPEN." : `Counter ${counter} matches expected.` }, { stateAfter: command === "01" ? "OPEN" : doorStateRef.current, stateResult: stateAnomaly ? "ANOMALY" : statePhase ? "PASS" : "NOT_CHECKED", reasonCode: stateAnomaly ? "STATE_ANOMALY" : "COUNTER_MATCH" })
    appendChip(record)
    acceptCounter(counter)
    setVerdict("PASS")
    if (stateAnomaly) {
      setVerdict("ALERT")
      setAlert({ expected, received: counter, type: "state" })
      setCurrentPhase("complete")
      return [`[PASS] Counter ${counter} matches expected.`, "\x1b[31m[ALERT] State anomaly: door is already OPEN.\x1b[0m"]
    }
    setAlert(null)
    if (command === "01") updateDoorState("OPEN")
    return [`[PASS] Counter ${counter} matches expected.`]
  }

  const onTerminalCommand = async (input: string) => {
    if (!practiceStarted) return ["[info] [시작] 버튼을 눌러 실습을 시작하세요."]
    if (input.trim() === "candump -L vcan0 > capture.log") {
      if (phaseRef.current !== "replay") return ["[info] Replay 실습 단계에서 Frame 2를 캡처하세요."]
      selectedHistoricalFrame.current = historicalFramesRef.current.find((frame) => frame.no === 2) ?? null
      const captured = selectedHistoricalFrame.current
      if (!captured) return ["[info] Frame 2 is not available to capture."]
      return [`captured Frame ${captured.no} (vcan0 ${captured.canId.slice(2)}#${captured.data}) to capture.log`]
    }
    if (input.trim() === "canplayer -I capture.log -l 1") {
      if (phaseRef.current !== "replay") return ["[info] Replay 실습 단계에서 캡처를 재전송하세요."]
      if (!selectedHistoricalFrame.current) return ["[info] 먼저 candump -L vcan0 > capture.log로 Frame 2를 캡처하세요."]
      return handleMonitoredFrame(selectedHistoricalFrame.current, true)
    }
    const frame = parseCansend(input)
    if (!frame) return ["[error] cansend vcan0 <CAN_ID>#<COMMAND><COUNTER> 형식으로 입력하세요."]
    if (frame.canId !== MONITORED_CAN_ID) {
      appendRecord({ no: frameIdRef.current + 1, ...frame, verdict: "PASS", reason: `CAN ID ${frame.canId} is not monitored.`, ruleId: "CAN_NOT_MONITORED" }, { expectedCounter: null, counterResult: "NOT_CHECKED", reasonCode: "CAN_NOT_MONITORED" })
      return [`[INFO] CAN ID ${frame.canId} is not monitored.`]
    }
    if (phaseRef.current !== "replay" && phaseRef.current !== "state") return ["[info] 관찰이 끝난 뒤 Replay 실습을 진행하세요."]
    if (phaseRef.current === "replay") {
      const historicalFrame = historicalFramesRef.current.find((entry) => entry.canId === frame.canId && entry.data === frame.data)
      if (!historicalFrame) return ["[info] Replay must reuse the CAN ID and DATA of a historical frame."]
      selectedHistoricalFrame.current = historicalFrame
      return handleMonitoredFrame(historicalFrame, true)
    }
    return handleMonitoredFrame(frame, false)
  }

  const submitQuiz = () => {
    if (quizAnswer === "counter") {
      setQuizFeedback("정답입니다. 카운터는 매번 증가해야 하는데, 재전송된 프레임은 이미 지나간 값을 가지고 있어 예측값과 달랐습니다.")
    } else {
      setQuizFeedback("다시 생각해 보세요. 이 공격은 ID도 정상이고 주기도 정상 범위였습니다. 무엇이 달랐을까요?")
    }
  }

  const currentStage = phase === "observe" ? 0 : phase === "replay" ? 1 : phase === "quiz" ? 2 : 3
  const canEnterReplay = lastAcceptedCounter === 13
  const frameStructureFrame = phase === "observe" || phase === "replay"
    ? historicalFramesRef.current.find((frame) => frame.no === 2) ?? monitor.at(-1)
    : monitor.filter((frame) => frame.canId === MONITORED_CAN_ID).at(-1)
  const mission = phase === "observe" ? "정상 Frame의 Counter가 어떻게 증가하는지 관찰하세요." : phase === "replay" ? "Frame 2의 원본 DATA 010B를 cansend vcan0 456#010B로 재전송하세요." : phase === "quiz" ? "공격이 탐지된 이유를 고르세요." : "이미 열린 도어를 또 여는 명령을 보내 보세요. Counter는 마지막 값 다음 숫자를 사용하세요."

  return <main className="canlab canlab--embedded" aria-label="Counter and status IDS practice"><section className="canlab__shell" style={{ padding: 24 }}>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 310px", gap: 18 }}><section>
      <CounterSequence frames={frames} receivedFrame={frameStructureFrame} expectedCounter={expectedCounter} alert={alert} />
      {phase === "quiz" && <section className="canlab__status-box" style={{ marginTop: 12 }}><strong>{mission}</strong><div style={{ display: "grid", gap: 8, marginTop: 12 }}>{answers.map((answer) => <label key={answer.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}><input type="radio" name="counter-quiz" checked={quizAnswer === answer.id} onChange={() => setQuizAnswer(answer.id)} />{answer.text}</label>)}</div><button type="button" className="is-primary" style={{ marginTop: 12, background: "#c92a22", borderColor: "#c92a22" }} onClick={submitQuiz} disabled={!quizAnswer}>제출</button>{quizFeedback && <><p>{quizFeedback}</p>{quizAnswer === "counter" && <button type="button" onClick={openDoorForStateCheck}>상태 검증으로</button>}</>}</section>}
      {phase === "complete" && <section className="canlab__status-box" style={{ marginTop: 12 }}><strong>학습 완료</strong><p>카운터를 정확히 맞춰도 현재 상태와 맞지 않는 명령은 상태 검증으로 걸러낼 수 있습니다.</p><p>카운터가 매번 증가하므로, 캡처해 두었다가 다시 보낸 과거 프레임은 카운터가 과거 값이라 탐지됩니다.</p></section>}
      <section className="canlab__console rule-analysis-console" aria-label="IDS 실습 콘솔" style={{ marginTop: 12, minHeight: 310 }}>
        <div className="canlab__tabs" role="tablist" aria-label="IDS 실습 결과 보기">
          {(["terminal", "dashboard"] as const).map((tab) => <button key={tab} id={`counter-tab-${tab}`} type="button" role="tab" aria-selected={consoleTab === tab} aria-controls={`counter-panel-${tab}`} className={consoleTab === tab ? "is-active" : ""} onClick={() => setConsoleTab(tab)}>{tab === "terminal" ? "Terminal" : "대시보드"}</button>)}
        </div>
        <div id="counter-panel-terminal" role="tabpanel" aria-labelledby="counter-tab-terminal" hidden={consoleTab !== "terminal"} style={{ display: consoleTab === "terminal" ? "block" : "none", minHeight: 258, maxHeight: 258, overflow: "auto" }}>
          <div className="canlab__console-toolbar"><strong>Terminal</strong><span>vcan0 · COMMAND + COUNTER</span><button type="button" onClick={() => setClearSignal((value) => value + 1)}>화면 비우기</button></div>
          <CanCommandTerminal clearSignal={clearSignal} onCommand={onTerminalCommand} exampleCommand="cansend vcan0 456#010B" />
        </div>
        <div id="counter-panel-dashboard" role="tabpanel" aria-labelledby="counter-tab-dashboard" hidden={consoleTab !== "dashboard"} style={{ display: consoleTab === "dashboard" ? "block" : "none", maxHeight: 680, overflow: "auto" }}>
          <RulePacketAnalysis key={runRevision} mode="counter" expectedCounter={expectedCounter} events={monitor.filter((entry) => entry.id > logClearedAt)} onClear={() => setLogClearedAt(frameIdRef.current)} />
        </div>
      </section>
    </section><aside className="canlab__guide" aria-label="Counter and status IDS 안내"><div className="canlab__guide-body" style={{ display: "block" }}>
      <div className="canlab__guide-progress"><span>STEP 3 : 카운터/상태 검증</span><b>{phase === "complete" ? "100%" : `${Math.round((currentStage / 3) * 100)}%`}</b><i><em style={{ width: `${phase === "complete" ? 100 : Math.round((currentStage / 3) * 100)}%` }} /></i></div>
      <section className="canlab__steps"><h2>진행 단계</h2>{["관찰", "Replay", "문제", "상태"].map((label, index) => <article key={label} className={currentStage === index ? "is-current" : ""}><div><p>{index + 1}. {label}</p></div></article>)}</section>
      <section className="canlab__status-box"><h2>현재 미션</h2><p>{mission}</p>{phase === "observe" && canEnterReplay && <button type="button" className="is-primary" style={{ background: "#c92a22", borderColor: "#c92a22" }} onClick={() => setCurrentPhase("replay")}>Replay 실습으로</button>}</section>
      <section className="canlab__status-box"><h2>현재 상태</h2><Badge appearance="filled" color={doorState === "OPEN" ? "warning" : "informative"}>DOOR : {doorState}</Badge><p>마지막 수락 Counter : {lastAcceptedCounter === null ? "-" : counterText(lastAcceptedCounter)}</p></section>
      <section className="canlab__hint"><h2>힌트</h2><p>{phase === "replay" ? "Frame 2 Replay: cansend vcan0 456#010B (COMMAND 01, COUNTER 0x0B / 11)" : phase === "state" ? `COMMAND 01과 Counter ${counterText(expectedCounter)}를 사용하세요. 명령: cansend vcan0 456#01${expectedCounter.toString(16).toUpperCase().padStart(2, "0")}` : "Counter는 이전 값보다 하나씩 증가합니다."}</p></section>
      <div className="door-attack-lab__editor-actions" style={{ marginTop: 16 }}><button type="button" className="is-primary" style={{ background: "#c92a22", borderColor: "#c92a22" }} onClick={start}><Play size={15} weight="fill" aria-hidden="true" />{practiceStarted ? "다시 시작" : "시작"}</button></div>
    </div></aside></div>
  </section></main>
}
