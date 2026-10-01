import { useEffect, useRef, useState } from "react"
import { Badge } from "@fluentui/react-components"
import { Play } from "@phosphor-icons/react"
import CanCommandTerminal from "@/features/can/practice/CanCommandTerminal"
import IdsBottomTabs from "./IdsBottomTabs"
import CounterSequence, { type CounterSequenceFrame } from "./CounterSequence"

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
type MonitorFrame = CounterSequenceFrame & { time: string; canId: string; data: string; reason: string }

function parseCansend(command: string) {
  const match = command.trim().match(/^cansend\s+vcan0\s+([0-9a-f]{1,3})#([0-9a-f]{4})$/i)
  if (!match) return null
  return { canId: `0x${match[1].padStart(3, "0").toLowerCase()}`, command: match[2].slice(0, 2).toUpperCase(), counter: Number.parseInt(match[2].slice(2, 4), 16) }
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
  const [idsLog, setIdsLog] = useState<MonitorFrame[]>([])
  const [lastAcceptedCounter, setLastAcceptedCounter] = useState<number | null>(null)
  const [expectedCounter, setExpectedCounter] = useState(10)
  const [doorState, setDoorState] = useState<DoorState>("CLOSED")
  const [verdict, setVerdict] = useState<"IDLE" | Verdict>("IDLE")
  const [alert, setAlert] = useState<{ expected: number; received: number; type: "replay" | "state" } | null>(null)
  const [quizAnswer, setQuizAnswer] = useState<string | null>(null)
  const [answers, setAnswers] = useState(ANSWERS)
  const [quizFeedback, setQuizFeedback] = useState("")
  const [clearSignal, setClearSignal] = useState(0)
  const [monitorClearedAt, setMonitorClearedAt] = useState(0)
  const [logClearedAt, setLogClearedAt] = useState(0)
  const phaseRef = useRef<Phase>("observe")
  const timerRef = useRef<number | null>(null)
  const startedAtRef = useRef(0)
  const lastAcceptedRef = useRef<number | null>(null)
  const expectedRef = useRef(10)
  const frameIdRef = useRef(0)
  const capturedFrameRef = useRef(false)

  const setCurrentPhase = (next: Phase) => { phaseRef.current = next; setPhase(next) }
  const stopNormalFrames = () => { if (timerRef.current !== null) { window.clearInterval(timerRef.current); timerRef.current = null } }
  const appendRecord = (frame: Omit<MonitorFrame, "id" | "time">, includeLog = true) => {
    const entry = { ...frame, id: ++frameIdRef.current, time: ((performance.now() - startedAtRef.current) / 1000).toFixed(3) }
    setMonitor((current) => [...current, entry])
    if (includeLog) setIdsLog((current) => [...current, entry])
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
    const record = appendRecord(base, false)
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
    capturedFrameRef.current = false
    setPracticeStarted(true)
    setCurrentPhase("observe")
    setFrames([])
    setMonitor([])
    setIdsLog([])
    setLastAcceptedCounter(null)
    setExpectedCounter(10)
    setDoorState("CLOSED")
    setVerdict("IDLE")
    setAlert(null)
    setQuizAnswer(null)
    setAnswers(shuffle(ANSWERS))
    setQuizFeedback("")
    setClearSignal((value) => value + 1)
    setMonitorClearedAt(0)
    setLogClearedAt(0)
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
    const record = appendRecord(base)
    appendChip(record)
    acceptCounter(counter)
    setDoorState("OPEN")
    setVerdict("PASS")
  }

  const handleMonitoredFrame = (command: string, counter: number, replayed: boolean) => {
    const no = frameIdRef.current + 1
    const data = `${command}${counter.toString(16).toUpperCase().padStart(2, "0")}`
    if (counter !== expectedRef.current) {
      const replay = lastAcceptedRef.current !== null && counter <= lastAcceptedRef.current
      const reason = replay ? `Replay detected: expected counter ${expectedRef.current}, received ${counter}.` : `Counter mismatch: expected counter ${expectedRef.current}, received ${counter}.`
      const record = appendRecord({ no, canId: MONITORED_CAN_ID, command, counter, data, replayed, verdict: "ALERT", reason })
      appendChip(record)
      setVerdict("ALERT")
      setAlert({ expected: expectedRef.current, received: counter, type: "replay" })
      if (replay) setCurrentPhase("quiz")
      return [`\x1b[31m[ALERT] ${reason}\x1b[0m`]
    }
    const record = appendRecord({ no, canId: MONITORED_CAN_ID, command, counter, data, replayed, verdict: "PASS", reason: `Counter ${counter} matches expected.` })
    appendChip(record)
    acceptCounter(counter)
    setVerdict("PASS")
    if (phaseRef.current === "state" && command === "01" && doorState === "OPEN") {
      const stateAlert = { ...record, id: ++frameIdRef.current, verdict: "ALERT" as const, reason: "State anomaly: door is already OPEN." }
      setIdsLog((current) => [...current, stateAlert])
      setVerdict("ALERT")
      setAlert({ expected: expectedRef.current, received: counter, type: "state" })
      setCurrentPhase("complete")
      return [`[PASS] Counter ${counter} matches expected.`, "\x1b[31m[ALERT] State anomaly: door is already OPEN.\x1b[0m"]
    }
    if (command === "01") setDoorState("OPEN")
    return [`[PASS] Counter ${counter} matches expected.`]
  }

  const onTerminalCommand = async (input: string) => {
    if (!practiceStarted) return ["[info] [시작] 버튼을 눌러 실습을 시작하세요."]
    if (input.trim() === "candump -L vcan0 > capture.log") {
      if (phaseRef.current !== "replay") return ["[info] Replay 실습 단계에서 Frame 2를 캡처하세요."]
      capturedFrameRef.current = true
      return ["captured Frame 2 (vcan0 456#010B) to capture.log"]
    }
    if (input.trim() === "canplayer -I capture.log -l 1") {
      if (phaseRef.current !== "replay") return ["[info] Replay 실습 단계에서 캡처를 재전송하세요."]
      if (!capturedFrameRef.current) return ["[info] 먼저 candump -L vcan0 > capture.log로 Frame 2를 캡처하세요."]
      return handleMonitoredFrame("01", 11, true)
    }
    const frame = parseCansend(input)
    if (!frame) return ["[error] cansend vcan0 <CAN_ID>#<COMMAND><COUNTER> 형식으로 입력하세요."]
    if (frame.canId !== MONITORED_CAN_ID) {
      const info = { id: ++frameIdRef.current, no: 0, time: ((performance.now() - startedAtRef.current) / 1000).toFixed(3), canId: frame.canId, command: frame.command, counter: frame.counter, data: `${frame.command}${frame.counter.toString(16).padStart(2, "0").toUpperCase()}`, verdict: "PASS" as const, reason: `CAN ID ${frame.canId} is not monitored.` }
      setIdsLog((current) => [...current, info])
      return [`[INFO] CAN ID ${frame.canId} is not monitored.`]
    }
    if (phaseRef.current !== "replay" && phaseRef.current !== "state") return ["[info] 관찰이 끝난 뒤 Replay 실습을 진행하세요."]
    return handleMonitoredFrame(frame.command, frame.counter, phaseRef.current === "replay")
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
  const mission = phase === "observe" ? "정상 Frame의 Counter가 어떻게 증가하는지 관찰하세요." : phase === "replay" ? "Frame 2를 캡처해서 Replay 공격하세요." : phase === "quiz" ? "공격이 탐지된 이유를 고르세요." : "이미 열린 도어를 또 여는 명령을 보내 보세요. Counter는 마지막 값 다음 숫자를 사용하세요."

  return <main className="canlab canlab--embedded" aria-label="Counter and status IDS practice"><section className="canlab__shell" style={{ padding: 24 }}>
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 310px", gap: 18 }}><section>
      <CounterSequence frames={frames} expectedCounter={expectedCounter} alert={alert} />
      {phase === "quiz" && <section className="canlab__status-box" style={{ marginTop: 12 }}><strong>{mission}</strong><div style={{ display: "grid", gap: 8, marginTop: 12 }}>{answers.map((answer) => <label key={answer.id} style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}><input type="radio" name="counter-quiz" checked={quizAnswer === answer.id} onChange={() => setQuizAnswer(answer.id)} />{answer.text}</label>)}</div><button type="button" className="is-primary" style={{ marginTop: 12, background: "#c92a22", borderColor: "#c92a22" }} onClick={submitQuiz} disabled={!quizAnswer}>제출</button>{quizFeedback && <><p>{quizFeedback}</p>{quizAnswer === "counter" && <button type="button" onClick={openDoorForStateCheck}>상태 검증으로</button>}</>}</section>}
      {phase === "complete" && <section className="canlab__status-box" style={{ marginTop: 12 }}><strong>학습 완료</strong><p>카운터를 정확히 맞춰도 현재 상태와 맞지 않는 명령은 상태 검증으로 걸러낼 수 있습니다.</p><p>카운터가 매번 증가하므로, 캡처해 두었다가 다시 보낸 과거 프레임은 카운터가 과거 값이라 탐지됩니다.</p></section>}
      <div style={{ marginTop: 12 }}><IdsBottomTabs onClear={(tab) => { if (tab === "terminal") setClearSignal((value) => value + 1); if (tab === "monitor") setMonitorClearedAt(frameIdRef.current); if (tab === "idsLog") setLogClearedAt(frameIdRef.current) }} terminal={<CanCommandTerminal clearSignal={clearSignal} onCommand={onTerminalCommand} />} monitor={<div className="canlab__data-pane"><table><thead><tr><th>NO</th><th>TIME</th><th>CAN ID</th><th>DATA</th><th>IDS</th></tr></thead><tbody>{monitor.filter((entry) => entry.id > monitorClearedAt).map((entry) => <tr key={entry.id}><td>{entry.no}</td><td>{entry.time}</td><td>{entry.canId}</td><td>{entry.data}</td><td style={{ color: entry.verdict === "PASS" ? "var(--state-success)" : "var(--state-danger)" }}>{entry.verdict}</td></tr>)}</tbody></table></div>} idsLog={<div className="canlab__data-pane">{idsLog.filter((entry) => entry.id > logClearedAt).slice().reverse().map((entry) => <p key={entry.id}><b>[{entry.verdict === "PASS" && entry.reason.startsWith("CAN ID") ? "INFO" : entry.verdict}]</b> {entry.reason}</p>)}</div>} /></div>
    </section><aside className="canlab__guide" aria-label="Counter and status IDS 안내"><div className="canlab__guide-body" style={{ display: "block" }}>
      <div className="canlab__guide-progress"><span>STEP 3 : 카운터/상태 검증</span><b>{phase === "complete" ? "100%" : `${Math.round((currentStage / 3) * 100)}%`}</b><i><em style={{ width: `${phase === "complete" ? 100 : Math.round((currentStage / 3) * 100)}%` }} /></i></div>
      <section className="canlab__steps"><h2>진행 단계</h2>{["관찰", "Replay", "문제", "상태"].map((label, index) => <article key={label} className={currentStage === index ? "is-current" : ""}><div><p>{index + 1}. {label}</p></div></article>)}</section>
      <section className="canlab__status-box"><h2>현재 미션</h2><p>{mission}</p>{phase === "observe" && canEnterReplay && <button type="button" className="is-primary" style={{ background: "#c92a22", borderColor: "#c92a22" }} onClick={() => setCurrentPhase("replay")}>Replay 실습으로</button>}</section>
      <section className="canlab__status-box"><h2>현재 상태</h2><Badge appearance="filled" color={doorState === "OPEN" ? "warning" : "informative"}>DOOR : {doorState}</Badge><p>마지막 수락 Counter : {lastAcceptedCounter === null ? "-" : counterText(lastAcceptedCounter)}</p></section>
      <section className="canlab__hint"><h2>힌트</h2><p>{phase === "replay" ? "CAN Monitor에서 Frame 2의 ID와 DATA를 확인한 뒤 캡처하고 재전송하세요." : phase === "state" ? "COMMAND 01과 Counter 15를 사용하세요." : "Counter는 이전 값보다 하나씩 증가합니다."}</p></section>
      <div className="door-attack-lab__editor-actions" style={{ marginTop: 16 }}><button type="button" className="is-primary" style={{ background: "#c92a22", borderColor: "#c92a22" }} onClick={start}><Play size={15} weight="fill" aria-hidden="true" />{practiceStarted ? "다시 시작" : "시작"}</button></div>
    </div></aside></div>
  </section></main>
}
