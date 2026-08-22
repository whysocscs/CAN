import {
  useCallback,
  useEffect,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react"
import {
  ArrowClockwise,
  CircleNotch,
  Code,
  Cpu,
  Lightbulb,
  Play,
  Radio,
  ShieldCheck,
  TerminalWindow,
  Warning,
} from "@phosphor-icons/react"
import type { CanEvent } from "../can/events/types"
import { useCanVehicleStream } from "../vehicle/useCanVehicleStream"
import VehicleNetworkViewport from "../vehicle/VehicleNetworkViewport"
import { VEHICLE_ROUTES } from "../vehicle/vehicleTopology"
import { vehicle } from "../vehicle/vehicleStore"
import {
  createBeginnerCanAttackSession,
  resetBeginnerCanAttackSession,
  runBeginnerCanAttackScript,
  runBeginnerCanAttackTerminal,
} from "./beginnerCanAttackApi"
import type {
  BeginnerCanAttackMonitorFrame,
  BeginnerCanAttackMonitorState,
  BeginnerCanAttackResult,
  BeginnerCanAttackScenario,
  BeginnerCanAttackState,
  BeginnerCanAttackTerminalEntry,
  BeginnerCanAttackUiConfig,
} from "./beginnerCanAttackTypes"
import {
  appendBeginnerMonitorFrames,
  attemptsToBeginnerMonitorFrames,
  beginnerEventMatchesSession,
  beginnerFrameBits,
  capturesToBeginnerMonitorFrames,
  eventToBeginnerMonitorFrame,
  formatBeginnerFrameData,
  parseBeginnerTerminalFrames,
  vehicleRatiosFromBeginnerState,
} from "./beginnerCanAttackUtils"
import "./doorAttackLab.css"

const CONFIG: Record<BeginnerCanAttackScenario, BeginnerCanAttackUiConfig> = {
  spoofing: {
    scenario: "spoofing",
    title: "CAN Spoofing Basics",
    targetSummary: "REAR ECU",
    effectSummary: "TAILGATE",
    routeId: "spoofing",
    targetId: "rear",
    effectId: "tailgate",
    definition:
      "공격자가 정상 송신자의 CAN ID를 사용해 새 상태 프레임을 구성하여 전송합니다. 이 Toy contract에는 source authentication(송신자 인증)이 없습니다.",
    stages: ["목표 확인", "정상 관찰", "Payload 작성", "ECU 수락", "증거"],
    initialScript:
      "# 관찰한 근거로 새 상태 프레임을 작성하세요.\n# cansend vcan0 <ID>#<DATA>",
    hints: [
      "가상 작업 공간의 항목을 먼저 ls로 확인하세요.",
      "candump -L vcan0로 정상 상태 프레임을 관찰하세요.",
      "제공된 message-map 파일을 직접 읽고 ID와 byte 의미를 구분하세요.",
    ],
    objective:
      "관찰한 메시지 계약을 근거로 새 프레임과 원본 재사용의 차이를 설명합니다.",
    accent: "#2563eb",
  },
  replay: {
    scenario: "replay",
    title: "CAN Replay Basics",
    targetSummary: "BODY ECU",
    effectSummary: "LEFT DOOR",
    routeId: "replay",
    targetId: "body",
    effectId: "leftDoor",
    definition:
      "공격자가 이전에 캡처한 유효 프레임을 byte-for-byte(바이트 그대로) 다시 전송합니다. 이 Toy contract에는 freshness protection(신선도 보호)이 없습니다.",
    stages: ["목표 확인", "프레임 캡처", "원본 확인", "재전송", "증거"],
    initialScript:
      "# 관찰한 캡처를 그대로 재생하는 명령을 작성하세요.\n# canplayer -I <FILE> -l <COUNT>",
    hints: [
      "먼저 virtual capture를 생성하는 제한 명령을 찾아 실행하세요.",
      "생성된 항목을 목록에서 확인한 뒤 내용을 직접 관찰하세요.",
      "재생 전 원본의 ID, DLC, DATA가 바뀌지 않았는지 확인하세요.",
    ],
    objective:
      "캡처 provenance(출처)와 동일 바이트 재전송이 필요한 이유를 설명합니다.",
    accent: "#7c3aed",
  },
}

const EMPTY_MONITOR: BeginnerCanAttackMonitorState = {
  frames: [],
  selectedKey: null,
}
const MONITOR_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

type BusyState = "run" | "reset" | "terminal" | null

interface ActionRequest {
  controller: AbortController
  actionGeneration: number
  sessionId: string
  sessionGeneration: number
  scenario: BeginnerCanAttackScenario
}

interface CreateFlight {
  scenario: BeginnerCanAttackScenario
  controller: AbortController
  promise: Promise<void>
}

type MonitorAction =
  | { type: "append"; frames: BeginnerCanAttackMonitorFrame[] }
  | { type: "select"; key: string }
  | { type: "clear" }

function monitorReducer(
  state: BeginnerCanAttackMonitorState,
  action: MonitorAction,
): BeginnerCanAttackMonitorState {
  if (action.type === "clear") return EMPTY_MONITOR
  if (action.type === "select") {
    return state.frames.some((frame) => frame.key === action.key)
      ? { ...state, selectedKey: action.key }
      : state
  }
  return appendBeginnerMonitorFrames(state, action.frames)
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "알 수 없는 오류가 발생했습니다."
}

function applyVehicleState(state: BeginnerCanAttackState["vehicleState"]) {
  const ratios = vehicleRatiosFromBeginnerState(state)
  vehicle.set("doorL", ratios.doorL)
  vehicle.set("doorR", ratios.doorR)
  vehicle.set("tailgate", ratios.tailgate)
}

function stageIndex(scenario: BeginnerCanAttackScenario, stage?: string) {
  const mapping = scenario === "spoofing"
    ? ["RECON", "OBSERVE", "CRAFT", "IMPACT", "EVIDENCE"]
    : ["RECON", "CAPTURE", "EXECUTE", "IMPACT", "EVIDENCE"]
  const index = mapping.indexOf(stage ?? "RECON")
  return index < 0 ? 0 : index
}

function currentTopologyNode(
  config: BeginnerCanAttackUiConfig,
  state?: BeginnerCanAttackState,
) {
  const route = VEHICLE_ROUTES[config.routeId]
  return route[Math.min(stageIndex(config.scenario, state?.stage), route.length - 1)]
}

function sequenceFrames(
  frames: readonly BeginnerCanAttackMonitorFrame[],
  nextSequence: () => number,
) {
  return frames.map((frame) => ({ ...frame, sequence: nextSequence() }))
}

export default function BeginnerCanAttackLabPage({
  scenario,
}: {
  scenario: BeginnerCanAttackScenario
}) {
  const config = CONFIG[scenario]
  const [session, setSession] = useState<BeginnerCanAttackState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<BusyState>(null)
  const [offlineError, setOfflineError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [script, setScript] = useState(config.initialScript)
  const [monitor, dispatchMonitor] = useReducer(monitorReducer, EMPTY_MONITOR)
  const [terminalCommand, setTerminalCommand] = useState("")
  const [terminalEntries, setTerminalEntries] = useState<BeginnerCanAttackTerminalEntry[]>([])
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [hintIndex, setHintIndex] = useState(-1)
  const [lastResult, setLastResult] = useState<BeginnerCanAttackResult | null>(null)
  const mountedRef = useRef(false)
  const scenarioRef = useRef(scenario)
  const lifecycleGenerationRef = useRef(0)
  const actionGenerationRef = useRef(0)
  const sessionRef = useRef<BeginnerCanAttackState | null>(null)
  const createFlightRef = useRef<CreateFlight | null>(null)
  const actionControllerRef = useRef<AbortController | null>(null)
  const busyRef = useRef<BusyState>(null)
  const terminalIdRef = useRef(0)
  const monitorSequenceRef = useRef(0)

  const nextMonitorSequence = useCallback(() => ++monitorSequenceRef.current, [])
  const clearLocalWorkbench = useCallback((nextConfig: BeginnerCanAttackUiConfig) => {
    dispatchMonitor({ type: "clear" })
    setTerminalEntries([])
    setCommandHistory([])
    setHistoryIndex(-1)
    setTerminalCommand("")
    setHintIndex(-1)
    setScript(nextConfig.initialScript)
    setLastResult(null)
    setActionError(null)
    setBusy(null)
    busyRef.current = null
    monitorSequenceRef.current = 0
  }, [])

  const loadSession = useCallback(() => {
    const existing = createFlightRef.current
    if (existing?.scenario === scenario) return existing.promise
    if (existing) {
      existing.controller.abort()
      createFlightRef.current = null
    }

    const controller = new AbortController()
    const lifecycleGeneration = lifecycleGenerationRef.current
    if (mountedRef.current) {
      setLoading(true)
      setOfflineError(null)
      setActionError(null)
    }
    const isCurrent = () =>
      mountedRef.current &&
      !controller.signal.aborted &&
      scenarioRef.current === scenario &&
      lifecycleGenerationRef.current === lifecycleGeneration

    const promise = (async () => {
      try {
        const next = await createBeginnerCanAttackSession(scenario, controller.signal)
        if (!isCurrent() || next.scenario !== scenario) return
        sessionRef.current = next
        applyVehicleState(next.vehicleState)
        setSession(next)
      } catch (error) {
        if (!isCurrent()) return
        sessionRef.current = null
        setSession(null)
        setOfflineError(errorMessage(error))
      } finally {
        if (createFlightRef.current?.controller === controller) {
          createFlightRef.current = null
        }
        if (isCurrent()) setLoading(false)
      }
    })()
    createFlightRef.current = { scenario, controller, promise }
    return promise
  }, [scenario])

  useEffect(() => {
    const changedScenario = scenarioRef.current !== scenario
    mountedRef.current = true
    if (changedScenario) {
      lifecycleGenerationRef.current += 1
      actionGenerationRef.current += 1
      actionControllerRef.current?.abort()
      sessionRef.current = null
      setSession(null)
      clearLocalWorkbench(config)
    }
    scenarioRef.current = scenario
    applyVehicleState({ leftDoor: "closed", rightDoor: "closed", tailgate: "closed" })
    void loadSession()
    return () => {
      mountedRef.current = false
      queueMicrotask(() => {
        if (mountedRef.current) return
        lifecycleGenerationRef.current += 1
        actionGenerationRef.current += 1
        sessionRef.current = null
        createFlightRef.current?.controller.abort()
        actionControllerRef.current?.abort()
      })
    }
  }, [clearLocalWorkbench, config, loadSession, scenario])

  const currentAcceptedEventPredicate = useCallback(
    (event: CanEvent) => beginnerEventMatchesSession(event, sessionRef.current),
    [],
  )

  const handleCanEvents = useCallback((events: CanEvent[]) => {
    const frames = events
      .filter(currentAcceptedEventPredicate)
      .map(eventToBeginnerMonitorFrame)
    dispatchMonitor({
      type: "append",
      frames: sequenceFrames(frames, nextMonitorSequence),
    })
  }, [currentAcceptedEventPredicate, nextMonitorSequence])

  const streamStatus = useCanVehicleStream({
    onEvent: handleCanEvents,
    vehicleEventPredicate: currentAcceptedEventPredicate,
  })

  const beginAction = (kind: Exclude<BusyState, null>): ActionRequest | null => {
    const current = sessionRef.current
    if (!current || busyRef.current) return null
    const controller = new AbortController()
    const request = {
      controller,
      actionGeneration: ++actionGenerationRef.current,
      sessionId: current.sessionId,
      sessionGeneration: current.generation,
      scenario: current.scenario,
    }
    actionControllerRef.current = controller
    busyRef.current = kind
    setBusy(kind)
    setActionError(null)
    return request
  }

  const isActionCurrent = (request: ActionRequest) => {
    const current = sessionRef.current
    return Boolean(
      mountedRef.current &&
        !request.controller.signal.aborted &&
        actionGenerationRef.current === request.actionGeneration &&
        scenarioRef.current === request.scenario &&
        current?.sessionId === request.sessionId &&
        current.generation === request.sessionGeneration,
    )
  }

  const finishAction = (request: ActionRequest) => {
    if (
      !mountedRef.current ||
      request.controller.signal.aborted ||
      actionGenerationRef.current !== request.actionGeneration
    ) return
    if (actionControllerRef.current === request.controller) {
      actionControllerRef.current = null
    }
    busyRef.current = null
    setBusy(null)
  }

  const acceptResult = (
    request: ActionRequest,
    result: BeginnerCanAttackResult,
    source: "terminal" | "run",
  ) => {
    if (
      !isActionCurrent(request) ||
      result.state.scenario !== request.scenario ||
      result.state.sessionId !== request.sessionId ||
      result.state.generation !== request.sessionGeneration
    ) return false
    sessionRef.current = result.state
    setSession(result.state)
    setLastResult(result)
    applyVehicleState(result.state.vehicleState)
    const restFrames = [
      ...attemptsToBeginnerMonitorFrames(result.attempts, source),
      ...capturesToBeginnerMonitorFrames(result.captures),
    ]
    dispatchMonitor({
      type: "append",
      frames: sequenceFrames(restFrames, nextMonitorSequence),
    })
    if (!result.ok) setActionError(result.output || result.code)
    return true
  }

  const handleRun = async () => {
    const request = beginAction("run")
    if (!request) return
    try {
      const result = await runBeginnerCanAttackScript(
        request.scenario,
        request.sessionId,
        script,
        request.controller.signal,
      )
      acceptResult(request, result, "run")
    } catch (error) {
      if (isActionCurrent(request)) setActionError(errorMessage(error))
    } finally {
      finishAction(request)
    }
  }

  const handleReset = async () => {
    const request = beginAction("reset")
    if (!request) return
    try {
      const next = await resetBeginnerCanAttackSession(
        request.scenario,
        request.sessionId,
        request.controller.signal,
      )
      if (
        !isActionCurrent(request) ||
        next.scenario !== request.scenario ||
        next.sessionId !== request.sessionId ||
        next.generation !== request.sessionGeneration + 1
      ) return
      sessionRef.current = next
      applyVehicleState(next.vehicleState)
      setSession(next)
      clearLocalWorkbench(config)
    } catch (error) {
      if (isActionCurrent(request)) setActionError(errorMessage(error))
    } finally {
      finishAction(request)
    }
  }

  const handleTerminalSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!terminalCommand.trim()) return
    const request = beginAction("terminal")
    if (!request) return
    const command = terminalCommand
    try {
      const result = await runBeginnerCanAttackTerminal(
        request.scenario,
        request.sessionId,
        command,
        request.controller.signal,
      )
      if (!acceptResult(request, result, "terminal")) return
      setTerminalEntries((entries) => [...entries, {
        id: ++terminalIdRef.current,
        command,
        output: result.output,
        ok: result.ok,
      }].slice(-30))
      setCommandHistory((history) => [...history, command].slice(-50))
      setHistoryIndex(-1)
      setTerminalCommand("")
      const observed =
        result.attempts.length === 0 && result.captures.length === 0
          ? parseBeginnerTerminalFrames(result.output)
          : []
      dispatchMonitor({
        type: "append",
        frames: sequenceFrames(observed, nextMonitorSequence),
      })
    } catch (error) {
      if (isActionCurrent(request)) setActionError(errorMessage(error))
    } finally {
      finishAction(request)
    }
  }

  const handleTerminalKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return
    event.preventDefault()
    setHistoryIndex((current) => {
      if (commandHistory.length === 0) return -1
      const next = event.key === "ArrowUp"
        ? Math.min(current + 1, commandHistory.length - 1)
        : Math.max(current - 1, -1)
      setTerminalCommand(
        next === -1 ? "" : commandHistory[commandHistory.length - 1 - next],
      )
      return next
    })
  }

  const selectedFrame = monitor.frames.find(
    (frame) => frame.key === monitor.selectedKey,
  ) ?? null
  const selectedBits = selectedFrame ? beginnerFrameBits(selectedFrame.data) : []
  const currentNodeId = currentTopologyNode(config, session ?? undefined)
  const contractStatus = session?.completed
    ? "COMPLETED"
    : session && session.stage !== "RECON"
      ? "OBSERVED"
      : "UNKNOWN"

  return (
    <section className="door-attack-lab beginner-can-attack-lab" aria-labelledby="beginner-can-attack-title">
      <header className="door-attack-lab__header">
        <div>
          <p>CAN ATTACK BASICS · 격리된 Toy ECU 실습</p>
          <h1 id="beginner-can-attack-title">{config.title}</h1>
          <span>{config.definition}</span>
          <strong className="beginner-can-attack-lab__badge">Toy ECU / virtual CAN</strong>
        </div>
        <dl className="door-attack-lab__target-summary">
          <div><dt>Target</dt><dd>{config.targetSummary}</dd></div>
          <div><dt>GLB/Toy effect</dt><dd>{config.effectSummary}</dd></div>
          <div><dt>Contract</dt><dd>{contractStatus}</dd></div>
          <div>
            <dt>CAN stream</dt>
            <dd data-status={streamStatus}>{streamStatus === "open" ? "LIVE" : streamStatus === "connecting" ? "CONNECTING" : "OFFLINE"}</dd>
          </div>
        </dl>
      </header>

      <ol className="door-attack-lab__stages beginner-can-attack-lab__stages" aria-label="공격 단계">
        {config.stages.map((stage, index) => {
          const current = stageIndex(scenario, session?.stage)
          return <li key={stage} data-state={index < current ? "complete" : index === current ? "current" : "next"} aria-current={index === current ? "step" : undefined}><span>{index + 1}</span><strong>{stage}</strong></li>
        })}
      </ol>

      {loading && !offlineError ? (
        <div className="beginner-can-attack-lab__loading" role="status">
          <CircleNotch
            size={17}
            className="door-attack-lab__spin"
            aria-hidden="true"
          />
          세션 연결 중
        </div>
      ) : null}
      {offlineError ? (
        <div className="door-attack-lab__offline" role="alert">
          <Warning size={19} weight="fill" aria-hidden="true" />
          <div><strong>Beginner CAN lab backend 오프라인</strong><span>{offlineError}</span></div>
          <button type="button" onClick={() => void loadSession()} disabled={loading}>세션 다시 연결</button>
        </div>
      ) : null}
      {actionError ? <div className="door-attack-lab__action-error" role="alert">{actionError}</div> : null}

      <div className="door-attack-lab__primary">
        <section className="door-attack-lab__vehicle-flow" aria-labelledby="beginner-vehicle-title">
          <header className="door-attack-lab__panel-heading">
            <div><Cpu size={18} aria-hidden="true" /><span><strong id="beginner-vehicle-title">Vehicle topology</strong><small>{config.targetSummary} → {config.effectSummary} GLB/Toy effect</small></span></div>
            <span className="door-attack-lab__truth-qualifier">교육용 논리 위치 · 실제 OEM 배치 아님</span>
          </header>
          <VehicleNetworkViewport
            route={VEHICLE_ROUTES[config.routeId]}
            targetId={config.targetId}
            effectId={config.effectId}
            currentNodeId={currentNodeId}
            scenarioTitle={config.title}
            accent={config.accent}
          />
        </section>

        <section className="door-attack-lab__editor" role="region" aria-label="Code editor">
          <header className="door-attack-lab__panel-heading"><div><Code size={18} aria-hidden="true" /><span><strong>Restricted lab script</strong><small>comments + scenario final action</small></span></div><span>최대 20 lines</span></header>
          <textarea aria-label="공격 스크립트" value={script} onChange={(event) => setScript(event.target.value)} spellCheck={false} />
          <div className="door-attack-lab__editor-actions">
            <button type="button" className="is-secondary" onClick={() => void handleReset()} disabled={!session || busy !== null}><ArrowClockwise size={15} aria-hidden="true" />{busy === "reset" ? "초기화 중" : "실습 초기화"}</button>
            <button type="button" className="is-primary" onClick={() => void handleRun()} disabled={!session || busy !== null}>{busy === "run" ? <CircleNotch size={15} className="door-attack-lab__spin" aria-hidden="true" /> : <Play size={15} weight="fill" aria-hidden="true" />}{busy === "run" ? "검증 중" : "스크립트 실행"}</button>
          </div>
        </section>

        <section className="door-attack-lab__binary" role="region" aria-label="Binary inspector">
          <header className="door-attack-lab__panel-heading"><div><ShieldCheck size={18} aria-hidden="true" /><span><strong>Binary inspector</strong><small>선택한 frame의 byte / bit view</small></span></div><span>{selectedFrame?.canId ?? "NO FRAME"}</span></header>
          <div className="door-attack-lab__bytes">
            {selectedFrame ? selectedFrame.data.map((byte, index) => <div key={`${selectedFrame.key}-${index}`}><small>BYTE {index}</small><strong>{byte}</strong><code>{selectedBits[index]}</code></div>) : <p className="door-attack-lab__empty">터미널 또는 monitor에서 프레임을 선택하세요.</p>}
          </div>
        </section>

        <section className="door-attack-lab__monitor" role="region" aria-label="Network monitor">
          <header className="door-attack-lab__panel-heading"><div><Radio size={18} aria-hidden="true" /><span><strong>Network monitor</strong><small>REST rejected/capture + accepted live stream</small></span></div><span>{monitor.frames.length} / 300</span></header>
          <div className="door-attack-lab__monitor-scroll">
            <table><caption className="sr-only">Beginner CAN lab observed frames</caption><thead><tr><th>Time</th><th>ID</th><th>DATA</th><th>Source</th><th>Verdict</th></tr></thead><tbody>
              {monitor.frames.length === 0 ? <tr><td colSpan={5}>아직 관찰된 프레임이 없습니다.</td></tr> : monitor.frames.map((frame) => <tr key={frame.key} data-selected={frame.key === monitor.selectedKey}><td>{MONITOR_TIME_FORMATTER.format(new Date(frame.timestamp))}</td><td><button type="button" aria-label={`${frame.canId} ${formatBeginnerFrameData(frame.data)} frame 선택`} onClick={() => dispatchMonitor({ type: "select", key: frame.key })}>{frame.canId}</button></td><td>{formatBeginnerFrameData(frame.data)}</td><td>{frame.source}</td><td>{frame.verdict}</td></tr>)}
            </tbody></table>
          </div>
        </section>
      </div>

      <div className="door-attack-lab__secondary">
        <section className="door-attack-lab__terminal" role="region" aria-label="Virtual terminal">
          <header className="door-attack-lab__panel-heading"><div><TerminalWindow size={18} aria-hidden="true" /><span><strong>Virtual terminal</strong><small>allowlisted in-memory interpreter</small></span></div><span>{busy === "terminal" ? "RUNNING" : "READY"}</span></header>
          <div className="door-attack-lab__terminal-output" aria-live="polite">
            {terminalEntries.length === 0 ? <p>관찰 명령을 직접 입력하세요. 실제 shell/host filesystem에는 연결되지 않습니다.</p> : terminalEntries.map((entry) => <div key={entry.id} data-ok={entry.ok}><code>$ {entry.command}</code><pre>{entry.output}</pre></div>)}
          </div>
          <form className="beginner-can-attack-lab__terminal-form" onSubmit={(event) => void handleTerminalSubmit(event)}><span aria-hidden="true">$</span><input aria-label="제한 터미널 명령" value={terminalCommand} onChange={(event) => setTerminalCommand(event.target.value)} onKeyDown={handleTerminalKeyDown} disabled={!session || busy !== null} autoComplete="off" /><button type="submit" disabled={!session || busy !== null}>명령 실행</button></form>
        </section>

        <div className="door-attack-lab__learning">
          <section role="region" aria-label="Hints"><header><Lightbulb size={17} aria-hidden="true" /><strong>Hints</strong></header><p>{hintIndex < 0 ? "힌트는 정답을 대신하지 않습니다." : config.hints[hintIndex]}</p><button type="button" onClick={() => setHintIndex((index) => Math.min(index + 1, config.hints.length - 1))}>다음 힌트</button></section>
          <section role="region" aria-label="Learning objective"><header><ShieldCheck size={17} aria-hidden="true" /><strong>Learning objective</strong></header><p>{config.objective}</p><p>물리 차량 actuation이 아닌 virtual CAN 입력과 GLB/Toy effect만 검증합니다.</p></section>
          <section role="region" aria-label="Evidence"><header><Radio size={17} aria-hidden="true" /><strong>Evidence / completion</strong></header><dl><div><dt>Stage</dt><dd>{session?.stage ?? (loading ? "LOADING" : "UNAVAILABLE")}</dd></div><div><dt>Attempts</dt><dd>{session?.attemptCount ?? 0}</dd></div><div><dt>Last verdict</dt><dd>{lastResult?.code ?? session?.lastVerdict ?? "NONE"}</dd></div><div><dt>Completed</dt><dd>{session?.completed ? "YES" : "NO"}</dd></div></dl></section>
        </div>
      </div>
    </section>
  )
}
