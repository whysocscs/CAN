import { useEffect, useRef, useState } from "react"
import CanCommandTerminal from "@/features/can/practice/CanCommandTerminal"
import { IDS_COMPLETIONS } from "@/features/terminal/commandCompletion"
import { idsConsoleTabs } from "./IdsBottomTabs"
import IdsLabFrame from "./IdsLabFrame"
import PeriodTimeline, { type PeriodTimelineFrame } from "./PeriodTimeline"
import RulePacketAnalysis, { type RulePacketEvent } from "./RulePacketAnalysis"

const WHITELIST = ["0x101", "0x200", "0x201"] as const
const MONITORED_CAN_ID = "0x101"
const NORMAL_DATA = "01"
const SPOOFING_DATA = "00"

type Phase = "observe" | "attack" | "quiz" | "complete"
type MonitorVerdict = "PASS" | "ALERT" | "ANOMALY"
type MonitorEntry = RulePacketEvent & { verdict: MonitorVerdict }

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
  const [analysisClearedAt, setAnalysisClearedAt] = useState(0)
  const [analysisRevision, setAnalysisRevision] = useState(0)
  const phaseRef = useRef<Phase>("observe")
  const startedAtRef = useRef(0)
  const lastFrameTimeByCanId = useRef(new Map<string, number>())
  const entryIdRef = useRef(0)

  const changePhase = (next: Phase) => {
    phaseRef.current = next
    setPhase(next)
  }

  const appendEntry = (canId: string, data: string, nextVerdict: MonitorVerdict, reason: string, log = true, metadata: Pick<RulePacketEvent, "period" | "ruleId"> = {}, now = performance.now()) => {
    const timestamp = Date.now()
    const time = `${new Date(timestamp).toLocaleTimeString("ko-KR", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })}.${new Date(timestamp).getMilliseconds().toString().padStart(3, "0")}`
    const entry: MonitorEntry = { id: ++entryIdRef.current, timestamp, elapsedMs: now - startedAtRef.current, time, canId, data, verdict: nextVerdict, reason, ...metadata }
    setMonitor((old) => [...old, entry].slice(-100))
    if (log) setIdsLog((old) => [...old, entry].slice(-100))
  }

  const inspectTargetFrame = (data: string, injected: boolean) => {
    const now = performance.now()
    const previous = lastFrameTimeByCanId.current.get(MONITORED_CAN_ID)
    const interval = previous === undefined ? null : Math.round(now - previous)
    lastFrameTimeByCanId.current.set(MONITORED_CAN_ID, now)
    const shouldCheckPeriod = phaseRef.current === "attack" && interval !== null
    const isAnomaly = shouldCheckPeriod && interval < 80
    const nextVerdict: MonitorVerdict = isAnomaly ? "ANOMALY" : "PASS"
    appendEntry(
      MONITORED_CAN_ID,
      data,
      nextVerdict,
      isAnomaly ? `Period anomaly: expected 100 ms, observed ${interval} ms.` : `CAN ID ${MONITORED_CAN_ID} is allowed.`,
      injected || isAnomaly,
      { ruleId: shouldCheckPeriod ? "CAN_PERIOD" : "CAN_PERIOD_NOT_CHECKED", period: { expectedMs: 100, observedMs: interval, checked: shouldCheckPeriod, injected } },
      now,
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
    lastFrameTimeByCanId.current.clear()
    entryIdRef.current = 0
    setPracticeStarted(true)
    changePhase("observe")
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
    setAnalysisClearedAt(0)
    setAnalysisRevision((value) => value + 1)
  }

  const onTerminalCommand = async (input: string) => {
    if (!practiceStarted) return ["[info] [시작] 버튼을 눌러 관찰을 시작하세요."]
    if (input.trim() === "cat whitelist.yaml") return ["Allowed CAN IDs", "", "0x101 : DOOR", "0x200 : TRUNK", "0x201 : DASHBOARD"]
    const frame = parseCansend(input)
    if (!frame) return ["[error] cansend vcan0 <CAN_ID>#<DATA> 형식으로 입력하세요."]
    if (!WHITELIST.includes(frame.canId as typeof WHITELIST[number])) {
      appendEntry(frame.canId, frame.data, "ALERT", `CAN ID ${frame.canId} is not in whitelist.`, true, { ruleId: "CAN_ID_WHITELIST" })
      setVerdict("ALERT")
      return [`\x1b[31m[ALERT] CAN ID ${frame.canId} is not in whitelist.\x1b[0m`]
    }
    if (phaseRef.current !== "attack") {
      appendEntry(frame.canId, frame.data, "PASS", "공격 실습 단계에서 주기 검사를 수행합니다.", true, { ruleId: "CAN_PERIOD_NOT_CHECKED" })
      setVerdict("PASS")
      return ["[PASS] CAN ID is allowed.", "[info] 공격 실습 단계에서 프레임을 주입하세요."]
    }
    if (frame.canId !== MONITORED_CAN_ID) {
      appendEntry(frame.canId, frame.data, "PASS", `CAN ID ${frame.canId} is not the monitored period target.`, true, { ruleId: "CAN_NOT_MONITORED" })
      setVerdict("PASS")
      return [`[PASS] CAN ID ${frame.canId} is allowed.`, "[info] This frame is not subject to the period check."]
    }
    inspectTargetFrame(frame.data, true)
    return [`[PASS] CAN ID ${frame.canId} is allowed.`, "[info] Period check applied to monitored CAN ID."]
  }

  const submitQuiz = () => {
    const selected = monitor.find((entry) => entry.id === quizSelection)
    if (selected?.verdict === "ANOMALY" && selected.period?.checked) {
      setQuizFeedback(`정답입니다. ${(selected.elapsedMs / 1000).toFixed(3)}초에 수신된 프레임의 간격은 ${selected.period.observedMs}ms로, 기대 주기 100ms를 벗어났습니다.`)
      changePhase("complete")
    } else {
      setQuizFeedback("다시 생각해 보세요. 100ms 간격을 벗어난 프레임을 찾아보세요.")
    }
  }

  const targetEvents = monitor.filter((entry) => entry.period)
  const latestTargetMs = targetEvents.at(-1)?.elapsedMs ?? 0
  const periodWindow = { startMs: Math.max(0, latestTargetMs - 900), endMs: Math.max(1000, latestTargetMs + 100) }
  const activeFrames: PeriodTimelineFrame[] = targetEvents.filter((entry) => entry.elapsedMs >= periodWindow.startMs).map((entry) => ({
    id: entry.id, time: entry.elapsedMs - periodWindow.startMs, canId: entry.canId, data: entry.data,
    injected: entry.period!.injected, observedMs: entry.period!.observedMs, verdict: entry.verdict,
  }))
  const mission = phase === "observe"
    ? "정상 Frame이 어떤 주기로 도착하는지 관찰하세요."
    : phase === "attack"
      ? "정상 ECU와 별개로 Frame을 주입해 주기를 깨뜨리세요."
      : "정상 Frame은 100ms마다 전송됩니다. 어느 Frame이 비정상적으로 삽입되었는지 선택하세요."

  const progress = phase === "complete" ? 100 : phaseIndex(phase) * 50
  return (
    <IdsLabFrame
      ariaLabel="Period-based IDS practice"
      kicker="IDS / IPS 실습 · STEP 2"
      title="주기(Period) 기반 IDS"
      status={[
        { label: "감시 ID", value: MONITORED_CAN_ID },
        { label: "기준 주기", value: "100 ms" },
      ]}
      started={practiceStarted}
      onStart={start}
      main={<>
        <section className="lab-v2__panel">
          <PeriodTimeline frames={activeFrames} windowStartMs={periodWindow.startMs} quizMode={phase === "quiz" || phase === "complete"} quizSelection={quizSelection} onSelect={setQuizSelection} anomaly={anomaly} />
        </section>
        {(phase === "quiz" || phase === "complete") && (
          <section className="lab-v2__panel">
            <header><h2>{phase === "quiz" ? "문제" : "학습 완료"}</h2></header>
            <p>{mission}</p>
            {phase === "quiz" && <button type="button" className="lab-v2__button is-primary" onClick={submitQuiz} disabled={quizSelection === null}>제출</button>}
            {quizFeedback && <p>{quizFeedback}</p>}
            {phase === "complete" && <div className="lab-v2__result">정상 ECU와 별개로 추가 Frame을 삽입하여 주기를 깨뜨리는 단순 Spoofing을 탐지할 수 있다.</div>}
          </section>
        )}
      </>}
      analysis={<RulePacketAnalysis key={analysisRevision} mode="period" periodWindow={periodWindow} events={monitor.filter((entry) => entry.id > analysisClearedAt)} onClear={() => setAnalysisClearedAt(entryIdRef.current)} />}
      guide={{
        progressLabel: "STEP 2 : 주기(Period) 검사",
        progress,
        steps: ["관찰", "공격", "문제"],
        currentStep: phaseIndex(phase),
        mission,
        missionAction: phase === "observe" && practiceStarted && normalFrameCount >= 5
          ? <button type="button" className="lab-v2__button is-primary" onClick={() => changePhase("attack")}>공격 실습으로</button>
          : undefined,
        verdict: {
          title: "IDS 판정",
          label: verdict === "IDLE" ? "대기" : verdict,
          tone: verdict === "ALERT" || verdict === "ANOMALY" ? "danger" : verdict === "PASS" ? "ok" : "neutral",
          note: "100ms 기준에서 80ms 미만 간격을 이상으로 탐지합니다.",
        },
        hint: phase === "attack" ? `Spoofing 명령 형식: cansend vcan0 101#${SPOOFING_DATA}` : "먼저 100ms 간격으로 도착하는 정상 Frame을 관찰하세요.",
      }}
      tabs={idsConsoleTabs({
        onClear: (tab) => {
          if (tab === "terminal") setClearSignal((value) => value + 1)
          if (tab === "monitor") setMonitorClearedAt(entryIdRef.current)
          if (tab === "idsLog") setLogClearedAt(entryIdRef.current)
        },
        terminal: <CanCommandTerminal clearSignal={clearSignal} onCommand={onTerminalCommand} completions={IDS_COMPLETIONS["period-based"]} />,
        monitor: <table className="lab-v2__table"><thead><tr><th>TIME</th><th>CAN ID</th><th>DATA</th><th>IDS</th></tr></thead><tbody>{monitor.filter((entry) => entry.id > monitorClearedAt).map((entry) => <tr key={entry.id}><td>{entry.time}</td><td>{entry.canId}</td><td>{entry.data}</td><td style={{ color: entry.verdict === "PASS" ? "var(--state-success)" : "var(--state-danger)" }}>{entry.verdict}</td></tr>)}</tbody></table>,
        idsLog: <div className="lab-v2__log">{idsLog.filter((entry) => entry.id > logClearedAt).slice().reverse().map((entry) => <p key={entry.id}><b>[{entry.verdict === "ANOMALY" ? "ALERT" : entry.verdict}]</b> {entry.reason}</p>)}</div>,
      })}
    />
  )
}
