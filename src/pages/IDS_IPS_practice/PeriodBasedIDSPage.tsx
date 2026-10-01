import { useEffect, useRef, useState } from "react"
import { Badge } from "@fluentui/react-components"
import { Play } from "@phosphor-icons/react"
import CanCommandTerminal from "@/features/can/practice/CanCommandTerminal"
import IdsBottomTabs from "./IdsBottomTabs"
import PeriodTimeline, { type PeriodTimelineFrame } from "./PeriodTimeline"

const WHITELIST = ["0x101", "0x200", "0x201"] as const
const MONITORED_CAN_ID = "0x101"
const NORMAL_DATA = "01"
const SPOOFING_DATA = "00"
const QUIZ_FRAMES: PeriodTimelineFrame[] = [
  { id: 1, time: 0, canId: MONITORED_CAN_ID, data: NORMAL_DATA, injected: false, verdict: "PASS" },
  { id: 2, time: 100, canId: MONITORED_CAN_ID, data: NORMAL_DATA, injected: false, verdict: "PASS" },
  { id: 3, time: 150, canId: MONITORED_CAN_ID, data: SPOOFING_DATA, injected: true, verdict: "ANOMALY" },
  { id: 4, time: 200, canId: MONITORED_CAN_ID, data: NORMAL_DATA, injected: false, verdict: "PASS" },
  { id: 5, time: 300, canId: MONITORED_CAN_ID, data: NORMAL_DATA, injected: false, verdict: "PASS" },
]

type Phase = "observe" | "attack" | "quiz" | "complete"
type MonitorVerdict = "PASS" | "ALERT" | "ANOMALY"
type MonitorEntry = { id: number; time: string; canId: string; data: string; verdict: MonitorVerdict; reason: string }

function parseCansend(command: string) {
  const match = command.trim().match(/^cansend\s+vcan0\s+([0-9a-f]{1,3})#([0-9a-f]{2,16})$/i)
  if (!match) return null
  return { canId: `0x${match[1].padStart(3, "0").toLowerCase()}`, data: match[2].toUpperCase() }
}

function phaseIndex(phase: Phase) {
  return phase === "observe" ? 0 : phase === "attack" ? 1 : 2
}

export default function PeriodBasedIDSPage() {
  const [practiceStarted, setPracticeStarted] = useState(false)
  const [phase, setPhase] = useState<Phase>("observe")
  const [frames, setFrames] = useState<PeriodTimelineFrame[]>([])
  const [monitor, setMonitor] = useState<MonitorEntry[]>([])
  const [idsLog, setIdsLog] = useState<MonitorEntry[]>([])
  const [normalFrameCount, setNormalFrameCount] = useState(0)
  const [verdict, setVerdict] = useState<"IDLE" | MonitorVerdict>("IDLE")
  const [anomaly, setAnomaly] = useState<{ observed: number } | null>(null)
  const [quizSelection, setQuizSelection] = useState<number | null>(null)
  const [quizFeedback, setQuizFeedback] = useState("")
  const [clearSignal, setClearSignal] = useState(0)
  const [monitorClearedAt, setMonitorClearedAt] = useState(0)
  const [logClearedAt, setLogClearedAt] = useState(0)
  const phaseRef = useRef<Phase>("observe")
  const startedAtRef = useRef(0)
  const timelineStartedAtRef = useRef(0)
  const lastFrameTimeByCanId = useRef(new Map<string, number>())
  const entryIdRef = useRef(0)
  const frameIdRef = useRef(0)

  const changePhase = (next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }

  const appendEntry = (canId: string, data: string, nextVerdict: MonitorVerdict, reason: string, log = true) => {
    const entry = { id: ++entryIdRef.current, time: ((performance.now() - startedAtRef.current) / 1000).toFixed(3), canId, data, verdict: nextVerdict, reason }
    setMonitor((old) => [...old, entry].slice(-100))
    if (log) setIdsLog((old) => [...old, entry].slice(-100))
  }

  const appendTimelineFrame = (canId: string, data: string, injected: boolean, nextVerdict: MonitorVerdict, now: number) => {
    if (!timelineStartedAtRef.current || now - timelineStartedAtRef.current >= 1000) {
      timelineStartedAtRef.current = now
      setFrames([{ id: ++frameIdRef.current, time: 0, canId, data, injected, verdict: nextVerdict }])
      return
    }
    setFrames((old) => [...old, { id: ++frameIdRef.current, time: now - timelineStartedAtRef.current, canId, data, injected, verdict: nextVerdict }])
  }

  const inspectTargetFrame = (data: string, injected: boolean) => {
    const now = performance.now()
    const previous = lastFrameTimeByCanId.current.get(MONITORED_CAN_ID)
    const interval = previous === undefined ? null : Math.round(now - previous)
    lastFrameTimeByCanId.current.set(MONITORED_CAN_ID, now)
    const shouldCheckPeriod = phaseRef.current === "attack" && interval !== null
    const isAnomaly = shouldCheckPeriod && interval < 80
    const nextVerdict: MonitorVerdict = isAnomaly ? "ANOMALY" : "PASS"
    appendTimelineFrame(MONITORED_CAN_ID, data, injected, nextVerdict, now)
    appendEntry(
      MONITORED_CAN_ID,
      data,
      nextVerdict,
      isAnomaly ? `Period anomaly: expected 100 ms, observed ${interval} ms.` : `CAN ID ${MONITORED_CAN_ID} is allowed.`,
      injected || isAnomaly,
    )
    setVerdict(nextVerdict)
    if (!injected) setNormalFrameCount((count) => count + 1)
    if (isAnomaly) {
      setAnomaly({ observed: interval })
      changePhase("quiz")
    }
  }

  useEffect(() => {
    if (!practiceStarted || (phase !== "observe" && phase !== "attack")) return
    const timer = window.setInterval(() => inspectTargetFrame(NORMAL_DATA, false), 100)
    return () => window.clearInterval(timer)
  }, [practiceStarted, phase])

  useEffect(() => () => {
    phaseRef.current = "complete"
  }, [])

  const start = () => {
    const now = performance.now()
    startedAtRef.current = now
    timelineStartedAtRef.current = now
    lastFrameTimeByCanId.current.clear()
    entryIdRef.current = 0
    frameIdRef.current = 0
    setPracticeStarted(true)
    changePhase("observe")
    setFrames([])
    setMonitor([])
    setIdsLog([])
    setNormalFrameCount(0)
    setVerdict("IDLE")
    setAnomaly(null)
    setQuizSelection(null)
    setQuizFeedback("")
    setClearSignal((value) => value + 1)
    setMonitorClearedAt(0)
    setLogClearedAt(0)
  }

  const onTerminalCommand = async (input: string) => {
    if (!practiceStarted) return ["[info] [시작] 버튼을 눌러 관찰을 시작하세요."]
    if (input.trim() === "cat whitelist.yaml") return ["Allowed CAN IDs", "", "0x101 : DOOR", "0x200 : TRUNK", "0x201 : DASHBOARD"]
    const frame = parseCansend(input)
    if (!frame) return ["[error] cansend vcan0 <CAN_ID>#<DATA> 형식으로 입력하세요."]
    if (!WHITELIST.includes(frame.canId as typeof WHITELIST[number])) {
      appendEntry(frame.canId, frame.data, "ALERT", `CAN ID ${frame.canId} is not in whitelist.`)
      setVerdict("ALERT")
      return [`\x1b[31m[ALERT] CAN ID ${frame.canId} is not in whitelist.\x1b[0m`]
    }
    if (phaseRef.current !== "attack") {
      appendEntry(frame.canId, frame.data, "PASS", "공격 실습 단계에서 주기 검사를 수행합니다.")
      setVerdict("PASS")
      return ["[PASS] CAN ID is allowed.", "[info] 공격 실습 단계에서 프레임을 주입하세요."]
    }
    if (frame.canId !== MONITORED_CAN_ID) {
      appendEntry(frame.canId, frame.data, "PASS", `CAN ID ${frame.canId} is not the monitored period target.`)
      setVerdict("PASS")
      return [`[PASS] CAN ID ${frame.canId} is allowed.`, "[info] This frame is not subject to the period check."]
    }
    inspectTargetFrame(frame.data, true)
    return [`[PASS] CAN ID ${frame.canId} is allowed.`, "[info] Period check applied to monitored CAN ID."]
  }

  const submitQuiz = () => {
    if (quizSelection === 150) {
      setQuizFeedback("정답입니다. 0.1초와 0.2초 사이에 100ms 주기를 벗어난 프레임이 끼어 있습니다.")
      changePhase("complete")
    } else {
      setQuizFeedback("다시 생각해 보세요. 100ms 간격을 벗어난 프레임을 찾아보세요.")
    }
  }

  const activeFrames = phase === "quiz" || phase === "complete" ? QUIZ_FRAMES : frames
  const mission = phase === "observe"
    ? "정상 Frame이 어떤 주기로 도착하는지 관찰하세요."
    : phase === "attack"
      ? "정상 ECU와 별개로 Frame을 주입해 주기를 깨뜨리세요."
      : "정상 Frame은 100ms마다 전송됩니다. 어느 Frame이 비정상적으로 삽입되었는지 선택하세요."

  return (
    <main className="canlab canlab--embedded" aria-label="Period-based IDS practice">
      <section className="canlab__shell" style={{ padding: 24 }}>
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 310px", gap: 18 }}>
          <section>
            <PeriodTimeline frames={activeFrames} quizMode={phase === "quiz" || phase === "complete"} quizSelection={quizSelection} onSelect={setQuizSelection} anomaly={anomaly} />
            {(phase === "quiz" || phase === "complete") && (
              <section className="canlab__status-box" style={{ marginTop: 12 }}>
                <strong>{mission}</strong>
                {phase === "quiz" && <button type="button" className="is-primary" style={{ marginLeft: 12, background: "#c92a22", borderColor: "#c92a22" }} onClick={submitQuiz} disabled={quizSelection === null}>제출</button>}
                {quizFeedback && <p>{quizFeedback}</p>}
                {phase === "complete" && <p>정상 ECU와 별개로 추가 Frame을 삽입하여 주기를 깨뜨리는 단순 Spoofing을 탐지할 수 있다.</p>}
              </section>
            )}
            <div style={{ marginTop: 12 }}>
              <IdsBottomTabs
                onClear={(tab) => {
                  if (tab === "terminal") setClearSignal((value) => value + 1)
                  if (tab === "monitor") setMonitorClearedAt(entryIdRef.current)
                  if (tab === "idsLog") setLogClearedAt(entryIdRef.current)
                }}
                terminal={<CanCommandTerminal clearSignal={clearSignal} onCommand={onTerminalCommand} />}
                monitor={<div className="canlab__data-pane"><table><thead><tr><th>TIME</th><th>CAN ID</th><th>DATA</th><th>IDS</th></tr></thead><tbody>{monitor.filter((entry) => entry.id > monitorClearedAt).map((entry) => <tr key={entry.id}><td>{entry.time}</td><td>{entry.canId}</td><td>{entry.data}</td><td style={{ color: entry.verdict === "PASS" ? "var(--state-success)" : "var(--state-danger)" }}>{entry.verdict}</td></tr>)}</tbody></table></div>}
                idsLog={<div className="canlab__data-pane">{idsLog.filter((entry) => entry.id > logClearedAt).slice().reverse().map((entry) => <p key={entry.id}><b>[{entry.verdict === "ANOMALY" ? "ALERT" : entry.verdict}]</b> {entry.reason}</p>)}</div>}
              />
            </div>
          </section>

          <aside className="canlab__guide" aria-label="Period-based IDS 안내">
            <div className="canlab__guide-body" style={{ display: "block" }}>
              <div className="canlab__guide-progress"><span>STEP 2 : 주기(Period) 검사</span><b>{phase === "complete" ? "100%" : `${phaseIndex(phase) * 50}%`}</b><i><em style={{ width: `${phase === "complete" ? 100 : phaseIndex(phase) * 50}%` }} /></i></div>
              <section className="canlab__steps"><h2>진행 단계</h2>{["관찰", "공격", "문제"].map((label, index) => <article key={label} className={phaseIndex(phase) === index ? "is-current" : ""}><div><p>{index + 1}. {label}</p></div></article>)}</section>
              <section className="canlab__status-box"><h2>현재 미션</h2><p>{mission}</p>{phase === "observe" && practiceStarted && normalFrameCount >= 5 && <button type="button" className="is-primary" style={{ background: "#c92a22", borderColor: "#c92a22" }} onClick={() => changePhase("attack")}>공격 실습으로</button>}</section>
              <section className="canlab__status-box"><h2>IDS 판정</h2><Badge appearance="filled" color={verdict === "ALERT" || verdict === "ANOMALY" ? "danger" : verdict === "PASS" ? "success" : "informative"}>{verdict === "IDLE" ? "대기" : verdict}</Badge><p>100ms 기준에서 80ms 미만 간격을 이상으로 탐지합니다.</p></section>
              <section className="canlab__hint"><h2>힌트</h2><p>{phase === "attack" ? `Spoofing 명령 형식: cansend vcan0 101#${SPOOFING_DATA}` : "먼저 100ms 간격으로 도착하는 정상 Frame을 관찰하세요."}</p></section>
              <div className="door-attack-lab__editor-actions" style={{ marginTop: 16 }}><button type="button" className="is-primary" style={{ background: "#c92a22", borderColor: "#c92a22" }} onClick={start}><Play size={15} weight="fill" aria-hidden="true" />{practiceStarted ? "다시 시작" : "시작"}</button></div>
            </div>
          </aside>
        </div>
      </section>
    </main>
  )
}
