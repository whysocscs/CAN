import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react"
import {
  ArrowClockwise,
  CaretRight,
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
import {
  applyVehicleFlowEffect,
  parseVehicleFlowTraces,
  type VehicleFlowPlaybackMode,
  type VehicleFlowTrace,
} from "../vehicle/vehicleFlowTypes"
import { useVehicleFlowPlayback } from "../vehicle/useVehicleFlowPlayback"
import { vehicle } from "../vehicle/vehicleStore"
import {
  createDoorLabSession,
  resetDoorLabSession,
  runDoorLabCommand,
  runDoorLabScript,
} from "./doorLabApi"
import type {
  DoorLabFrameAttempt,
  DoorLabIdsStatus,
  DoorLabSessionState,
  DoorLabVehicleState,
} from "./doorLabTypes"
import { formatFrameData, frameBits, parseTerminalFrames } from "./doorLabUtils"
import {
  appendAttackLabActivity,
  appendAttackLabTranscript,
  classifyAttackLabFeedback,
  classifyTerminalTranscript,
  type AttackLabActionOrigin,
  type AttackLabActionResult,
  type AttackLabActivityEntry,
  type AttackLabTerminalTranscript as TranscriptEntry,
} from "./attackLabFeedback"
import AttackLabActivityLog from "./AttackLabActivityLog"
import AttackLabFeedbackPanel from "./AttackLabFeedbackPanel"
import AttackLabGuidancePanel, {
  type AttackLabGuidanceMode,
} from "./AttackLabGuidancePanel"
import AttackLabLearningCheck from "./AttackLabLearningCheck"
import AttackLabTerminalTranscript from "./AttackLabTerminalTranscript"
import AttackStageRail from "./AttackStageRail"
import {
  ATTACK_LAB_PREDICTION_PROMPTS,
  ATTACK_LAB_PRINCIPLE_QUESTIONS,
} from "./attackLabLearning"
import { deriveAttackStageIndex } from "./attackLabStage"
import DoorAttackVehicle from "./DoorAttackVehicle"
import LabScriptGuide from "./LabScriptGuide"
import "./doorAttackLab.css"

const STAGES = [
  "정찰",
  "캡처",
  "분석",
  "Replay 실패",
  "프레임 제작",
  "IDS 검증",
  "증거",
] as const
const INITIAL_SCRIPT = `# 관찰한 규칙으로 프레임 시퀀스를 완성하세요.
interval_ms=
# cansend vcan0 <ID>#<PAYLOAD>`
const HINTS = [
  "먼저 baseline.log와 door-open.log의 반복되는 필드와 변하는 필드를 구분하세요.",
  "연속 프레임에서 한 바이트가 어떻게 변하고 다른 바이트가 함께 변하는지 표로 적어 보세요.",
  "한 번에 하나의 가설만 시험하고 BLOCKED reason을 다음 입력의 근거로 사용하세요.",
] as const
const DOOR_LAB_ID = "door-blackbox-v1"
const MONITOR_LIMIT = 300
const MONITOR_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: false,
})

interface MonitorFrame {
  key: string
  timestamp: number
  channel: string
  canId: string
  data: string[]
  verdict: string
  source: "CAN stream" | "terminal" | "run"
}

interface ActionRequest {
  controller: AbortController
  generation: number
  sessionId: string
  sessionGeneration: number
  origin: AttackLabActionOrigin
  actionId: string
  predictionBeforeAction: string
  guidanceMode: AttackLabGuidanceMode
}

interface CreateFlight {
  controller: AbortController
  promise: Promise<void>
}

interface PendingDoorFlow {
  runKey: string
  sessionId: string
  sessionGeneration: number
  actionGeneration: number
  state: DoorLabVehicleState
}

interface MonitorState {
  frames: MonitorFrame[]
  selectedKey: string | null
}

interface AppendMonitorAction {
  type: "append"
  frames: MonitorFrame[]
}

interface SelectMonitorAction {
  type: "select"
  key: string
}

type MonitorAction = AppendMonitorAction | SelectMonitorAction | {
  type: "clear"
} | {
  type: "deselect"
}

const EMPTY_MONITOR: MonitorState = { frames: [], selectedKey: null }

function monitorReducer(
  state: MonitorState,
  action: MonitorAction,
): MonitorState {
  if (action.type === "clear") return EMPTY_MONITOR
  if (action.type === "deselect") return { ...state, selectedKey: null }
  if (action.type === "select") {
    return state.frames.some((frame) => frame.key === action.key)
      ? { ...state, selectedKey: action.key }
      : state
  }
  if (action.frames.length === 0) return state

  const byKey = new Map(state.frames.map((frame) => [frame.key, frame]))
  for (const frame of action.frames) byKey.set(frame.key, frame)
  const frames = [...byKey.values()]
    .sort((left, right) => left.timestamp - right.timestamp)
    .slice(-MONITOR_LIMIT)
  const selectedKey =
    state.selectedKey && frames.some((frame) => frame.key === state.selectedKey)
      ? state.selectedKey
      : (frames.at(-1)?.key ?? null)

  return { frames, selectedKey }
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "알 수 없는 오류가 발생했습니다."
}

function applyVehicleState(state: DoorLabVehicleState) {
  vehicle.set("doorL", state.leftDoor === "open" ? 1 : 0)
  vehicle.set("doorR", state.rightDoor === "open" ? 1 : 0)
}

function eventToMonitorFrame(event: CanEvent): MonitorFrame {
  return {
    key: `event:${event.lab?.attemptId ?? event.eventId}`,
    timestamp: event.timestamp,
    channel: event.channel,
    canId: event.frame.canId,
    data: event.frame.data,
    verdict:
      event.reasonCode ??
      event.processing?.executionResult ??
      event.monitoring?.status ??
      "OBSERVED",
    source: "CAN stream",
  }
}

function attemptsToMonitorFrames(
  attempts: readonly DoorLabFrameAttempt[],
  source: "terminal" | "run",
): MonitorFrame[] {
  return attempts.flatMap((attempt) =>
    attempt.verdict === "EXECUTED"
      ? []
      : [
          {
            key: `attempt:${attempt.attemptId}`,
            timestamp: attempt.timestamp,
            channel: "vcan0",
            canId: attempt.canId,
            data: attempt.data,
            verdict: attempt.verdict,
            source,
          },
        ],
  )
}

function formatMonitorTime(timestamp: number): string {
  return MONITOR_TIME_FORMATTER.format(new Date(timestamp))
}

export default function DoorAttackLabPage() {
  const [session, setSession] = useState<DoorLabSessionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<"run" | "reset" | "terminal" | null>(null)
  const [offlineError, setOfflineError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [script, setScript] = useState(INITIAL_SCRIPT)
  const [monitor, dispatchMonitor] = useReducer(monitorReducer, EMPTY_MONITOR)
  const [terminalCommand, setTerminalCommand] = useState("")
  const [terminalEntries, setTerminalEntries] = useState<TranscriptEntry[]>([])
  const [activity, setActivity] = useState<AttackLabActivityEntry[]>([])
  const [selectedActivityId, setSelectedActivityId] = useState<string | null>(
    null,
  )
  const [lastAction, setLastAction] = useState<AttackLabActionResult | null>(
    null,
  )
  const [predictionDraft, setPredictionDraft] = useState("")
  const [predictionBeforeAction, setPredictionBeforeAction] = useState("")
  const [explanation, setExplanation] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [guidanceMode, setGuidanceMode] =
    useState<AttackLabGuidanceMode>("guided")
  const [flowPlaybackMode, setFlowPlaybackMode] =
    useState<VehicleFlowPlaybackMode | null>(null)
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [hintIndex, setHintIndex] = useState(-1)
  const [idsStatus, setIdsStatus] = useState<DoorLabIdsStatus | null>(null)
  const [lastRunAttempts, setLastRunAttempts] = useState<DoorLabFrameAttempt[]>(
    [],
  )
  const mountedRef = useRef(false)
  const lifecycleGenerationRef = useRef(0)
  const actionGenerationRef = useRef(0)
  const sessionIdRef = useRef<string | null>(null)
  const sessionGenerationRef = useRef<number | null>(null)
  const createFlightRef = useRef<CreateFlight | null>(null)
  const actionControllerRef = useRef<AbortController | null>(null)
  const busyRef = useRef<typeof busy>(null)
  const pendingFlowRef = useRef<PendingDoorFlow | null>(null)
  const flow = useVehicleFlowPlayback({
    onEffect: applyVehicleFlowEffect,
    onComplete: (runKey) => {
      const pending = pendingFlowRef.current
      if (
        !mountedRef.current ||
        !pending ||
        pending.runKey !== runKey ||
        pending.sessionId !== sessionIdRef.current ||
        pending.sessionGeneration !== sessionGenerationRef.current ||
        pending.actionGeneration !== actionGenerationRef.current
      )
        return
      applyVehicleState(pending.state)
      pendingFlowRef.current = null
    },
  })

  const clearLearningState = useCallback(() => {
    setTerminalEntries([])
    setActivity([])
    setSelectedActivityId(null)
    setLastAction(null)
    setPredictionDraft("")
    setPredictionBeforeAction("")
    setExplanation("")
    setConfirmed(false)
  }, [])

  const loadSession = useCallback(() => {
    if (createFlightRef.current) return createFlightRef.current.promise
    flow.clear()
    setFlowPlaybackMode(null)
    pendingFlowRef.current = null
    clearLearningState()

    const controller = new AbortController()
    const generation = lifecycleGenerationRef.current
    if (mountedRef.current) {
      setLoading(true)
      setOfflineError(null)
      setActionError(null)
    }

    const isCurrent = () =>
      mountedRef.current &&
      !controller.signal.aborted &&
      lifecycleGenerationRef.current === generation

    const promise = (async () => {
      try {
        const next = await createDoorLabSession(controller.signal)
        if (!isCurrent()) return
        sessionIdRef.current = next.sessionId
        sessionGenerationRef.current = next.generation
        applyVehicleState(next.vehicleState)
        setSession(next)
      } catch (error) {
        if (!isCurrent()) return
        sessionIdRef.current = null
        sessionGenerationRef.current = null
        setOfflineError(errorMessage(error))
        setSession(null)
      } finally {
        if (createFlightRef.current?.controller === controller) {
          createFlightRef.current = null
        }
        if (isCurrent()) setLoading(false)
      }
    })()

    createFlightRef.current = { controller, promise }
    return promise
  }, [clearLearningState, flow.clear])

  useEffect(() => {
    mountedRef.current = true
    void loadSession()
    return () => {
      mountedRef.current = false
      queueMicrotask(() => {
        if (mountedRef.current) return
        lifecycleGenerationRef.current += 1
        actionGenerationRef.current += 1
        flow.cancel()
        pendingFlowRef.current = null
        sessionIdRef.current = null
        sessionGenerationRef.current = null
        createFlightRef.current?.controller.abort()
        actionControllerRef.current?.abort()
      })
    }
  }, [flow.cancel, loadSession])

  const currentAcceptedEventPredicate = useCallback(
    (event: CanEvent) =>
      event.lab?.labId === DOOR_LAB_ID &&
      event.lab.sessionId === sessionIdRef.current &&
      event.lab.generation === sessionGenerationRef.current &&
      event.processing?.filterResult === "ACCEPT" &&
      event.processing?.executionResult === "EXECUTED",
    [],
  )

  const handleCanEvents = useCallback(
    (events: CanEvent[]) => {
      const incoming = events
        .filter(currentAcceptedEventPredicate)
        .map(eventToMonitorFrame)
      dispatchMonitor({ type: "append", frames: incoming })
    },
    [currentAcceptedEventPredicate],
  )

  const currentReplayVehiclePredicate = useCallback(
    (event: CanEvent) =>
      event.replay === true &&
      busyRef.current === null &&
      pendingFlowRef.current === null &&
      currentAcceptedEventPredicate(event),
    [currentAcceptedEventPredicate],
  )

  const streamStatus = useCanVehicleStream({
    onEvent: handleCanEvents,
    vehicleEventPredicate: currentReplayVehiclePredicate,
  })

  const appendMonitorFrames = useCallback((incoming: MonitorFrame[]) => {
    dispatchMonitor({ type: "append", frames: incoming })
  }, [])

  const beginAction = (
    kind: NonNullable<typeof busy>,
  ): ActionRequest | null => {
    const sessionId = sessionIdRef.current
    const sessionGeneration = sessionGenerationRef.current
    if (
      !sessionId ||
      sessionGeneration === null ||
      (kind === "reset"
        ? busyRef.current === "reset"
        : busyRef.current !== null) ||
      (kind !== "reset" && flow.isActive)
    )
      return null
    if (kind === "reset") actionControllerRef.current?.abort()
    const controller = new AbortController()
    const generation = ++actionGenerationRef.current
    const origin: AttackLabActionOrigin = kind === "run" ? "script" : "terminal"
    const actionId = `door:${sessionId}:${sessionGeneration}:${origin}:${generation}`
    const predictionBeforeAction = predictionDraft
    actionControllerRef.current = controller
    busyRef.current = kind
    setBusy(kind)
    setActionError(null)
    if (kind !== "reset") {
      flow.clear()
      setFlowPlaybackMode(null)
      pendingFlowRef.current = null
      setLastAction(null)
      setSelectedActivityId(null)
      dispatchMonitor({ type: "deselect" })
      setPredictionBeforeAction("")
      setExplanation("")
      setConfirmed(false)
      setIdsStatus(null)
      setLastRunAttempts([])
    }
    return {
      controller,
      generation,
      sessionId,
      sessionGeneration,
      origin,
      actionId,
      predictionBeforeAction,
      guidanceMode,
    }
  }

  const isActionCurrent = (request: ActionRequest) =>
    mountedRef.current &&
    !request.controller.signal.aborted &&
    actionGenerationRef.current === request.generation &&
    sessionIdRef.current === request.sessionId &&
    sessionGenerationRef.current === request.sessionGeneration

  const finishAction = (request: ActionRequest) => {
    if (
      !mountedRef.current ||
      request.controller.signal.aborted ||
      actionGenerationRef.current !== request.generation ||
      sessionIdRef.current !== request.sessionId
    )
      return
    if (actionControllerRef.current === request.controller) {
      actionControllerRef.current = null
    }
    busyRef.current = null
    setBusy(null)
  }

  const playAction = (
    action: AttackLabActionResult,
    traces: VehicleFlowTrace[],
    request: ActionRequest,
    finalState: DoorLabVehicleState,
  ) => {
    const playbackMode =
      request.guidanceMode === "guided" ? "step" : "auto"
    pendingFlowRef.current = {
      runKey: action.actionId,
      sessionId: request.sessionId,
      sessionGeneration: request.sessionGeneration,
      actionGeneration: request.generation,
      state: finalState,
    }
    if (!flow.play({ runKey: action.actionId, traces, playbackMode })) {
      flow.clear()
      setFlowPlaybackMode(null)
      pendingFlowRef.current = null
      applyVehicleState(finalState)
      return
    }
    setFlowPlaybackMode(playbackMode)
  }

  const recordAction = ({
    request,
    commandLabel,
    ok,
    resultCode,
    rawOutput,
    rawTraces,
    finalState,
  }: {
    request: ActionRequest
    commandLabel: string
    ok: boolean
    resultCode: string
    rawOutput: string
    rawTraces: unknown
    finalState: DoorLabVehicleState
  }) => {
    const traces = parseVehicleFlowTraces(rawTraces)
    if (!traces) {
      flow.clear()
      setFlowPlaybackMode(null)
      pendingFlowRef.current = null
      applyVehicleState(finalState)
      setLastAction(null)
      setSelectedActivityId(null)
      setPredictionBeforeAction("")
      setExplanation("")
      setConfirmed(false)
      setActionError(
        "공격 흐름을 표시하지 못해 최종 차량 상태만 동기화했습니다.",
      )
      return false
    }

    const action: AttackLabActionResult = {
      actionId: request.actionId,
      scenario: "door",
      origin: request.origin,
      commandLabel,
      ok,
      resultCode,
      rawOutput,
      traces,
    }
    setLastAction(action)
    setTerminalEntries((entries) =>
      appendAttackLabTranscript(entries, classifyTerminalTranscript(action)),
    )
    setActivity((entries) => appendAttackLabActivity(entries, action))
    setSelectedActivityId(null)
    setPredictionBeforeAction(request.predictionBeforeAction)
    setExplanation("")
    setConfirmed(false)
    playAction(action, traces, request, finalState)
    return true
  }

  const handleRun = async () => {
    const request = beginAction("run")
    if (!request) return
    try {
      const result = await runDoorLabScript(
        request.sessionId,
        script,
        request.controller.signal,
      )
      if (
        !isActionCurrent(request) ||
        result.state.sessionId !== request.sessionId ||
        result.state.generation !== request.sessionGeneration
      )
        return
      setSession(result.state)
      setIdsStatus(result.idsStatus)
      setLastRunAttempts(result.attempts)
      appendMonitorFrames(attemptsToMonitorFrames(result.attempts, "run"))
      const resultCode =
        result.error ??
        result.attempts.at(-1)?.verdict ??
        (result.state.completed ? "EXECUTED" : "OK")
      recordAction({
        request,
        commandLabel: "Door lab script",
        ok:
          result.error === null &&
          result.attempts.every((attempt) => attempt.verdict === "EXECUTED"),
        resultCode,
        rawOutput: result.error ?? "",
        rawTraces: result.flowTraces,
        finalState: result.state.vehicleState,
      })
    } catch (error) {
      if (isActionCurrent(request)) setActionError(errorMessage(error))
    } finally {
      finishAction(request)
    }
  }

  const handleReset = async () => {
    const request = beginAction("reset")
    if (!request) return
    const wasPlaying = flow.isActive
    flow.cancel()
    if (!wasPlaying) {
      flow.clear()
      setFlowPlaybackMode(null)
    }
    pendingFlowRef.current = null
    clearLearningState()
    applyVehicleState({ leftDoor: "closed", rightDoor: "closed" })
    try {
      const next = await resetDoorLabSession(
        request.sessionId,
        request.controller.signal,
      )
      if (
        !isActionCurrent(request) ||
        next.sessionId !== request.sessionId ||
        next.generation !== request.sessionGeneration + 1
      )
        return
      sessionGenerationRef.current = next.generation
      flow.clear()
      setFlowPlaybackMode(null)
      applyVehicleState(next.vehicleState)
      setSession(next)
      dispatchMonitor({ type: "clear" })
      clearLearningState()
      setTerminalCommand("")
      setCommandHistory([])
      setHistoryIndex(-1)
      setIdsStatus(null)
      setLastRunAttempts([])
      setScript(INITIAL_SCRIPT)
      setHintIndex(-1)
    } catch (error) {
      if (isActionCurrent(request)) setActionError(errorMessage(error))
    } finally {
      finishAction(request)
    }
  }

  const handleTerminalSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const command = terminalCommand.trim()
    if (!command) return
    const request = beginAction("terminal")
    if (!request) return
    try {
      const result = await runDoorLabCommand(
        request.sessionId,
        command,
        request.controller.signal,
      )
      if (
        !isActionCurrent(request) ||
        result.state.sessionId !== request.sessionId ||
        result.state.generation !== request.sessionGeneration
      )
        return
      setSession(result.state)
      if (result.idsStatus !== null) setIdsStatus(result.idsStatus)
      setCommandHistory((existing) => [...existing, command].slice(-50))
      setHistoryIndex(-1)
      setTerminalCommand("")

      let incoming = attemptsToMonitorFrames(result.frames, "terminal")
      if (incoming.length === 0) {
        incoming = parseTerminalFrames(result.output).map(
          (captured, index) => ({
            key: `capture:${captured.timestamp}:${captured.channel}:${captured.frame.canId}:${formatFrameData(captured.frame.data)}:${index}`,
            timestamp: captured.timestamp * 1000,
            channel: captured.channel,
            canId: captured.frame.canId,
            data: captured.frame.data,
            verdict: "OBSERVED",
            source: "terminal" as const,
          }),
        )
      }
      appendMonitorFrames(incoming)
      recordAction({
        request,
        commandLabel: command,
        ok: result.ok,
        resultCode: result.code,
        rawOutput: result.output,
        rawTraces: result.flowTraces,
        finalState: result.state.vehicleState,
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
      const next =
        event.key === "ArrowUp"
          ? Math.min(current + 1, commandHistory.length - 1)
          : Math.max(current - 1, -1)
      setTerminalCommand(
        next === -1 ? "" : commandHistory[commandHistory.length - 1 - next],
      )
      return next
    })
  }

  const frames = monitor.frames
  const selectedFrame =
    frames.find((frame) => frame.key === monitor.selectedKey) ?? null
  const selectedBits = selectedFrame
    ? frameBits(selectedFrame.data).split(" ")
    : []
  const feedback = useMemo(
    () =>
      lastAction
        ? classifyAttackLabFeedback({
            result: lastAction,
            playback: flow.snapshot,
          })
        : null,
    [flow.snapshot, lastAction],
  )
  const latestActivity = useMemo(
    () => activity.find((entry) => entry.id === lastAction?.actionId) ?? null,
    [activity, lastAction?.actionId],
  )
  const latestAttemptIds = useMemo(
    () =>
      lastAction?.traces.flatMap((trace) =>
        trace.attemptId ? [trace.attemptId] : [],
      ) ?? [],
    [lastAction],
  )
  const technicalComplete = useMemo(
    () => lastAction?.traces.some((trace) => trace.effectApplied) ?? false,
    [lastAction],
  )
  const reviewReady =
    lastAction !== null &&
    (lastAction.traces.length === 0
      ? flow.snapshot.phase === "idle"
      : flow.snapshot.phase === "complete")
  const evidenceSelected = useMemo(() => {
    const monitorMatches = Boolean(
      selectedFrame &&
        latestAttemptIds.some((attemptId) =>
          selectedFrame.key.includes(attemptId),
        ),
    )
    const activityMatches = Boolean(
      latestActivity &&
        !latestActivity.frameEmitted &&
        selectedActivityId === latestActivity.id,
    )
    return monitorMatches || activityMatches
  }, [latestActivity, latestAttemptIds, selectedActivityId, selectedFrame])
  const resultSummary = useMemo(
    () =>
      lastAction
        ? `${lastAction.resultCode} 구조화 결과가 Activity에 기록되었습니다.`
        : "",
    [lastAction],
  )
  const selectMonitorFrame = useCallback((key: string) => {
    dispatchMonitor({ type: "select", key })
    setConfirmed(false)
  }, [])
  const selectActivity = useCallback((id: string) => {
    setSelectedActivityId(id)
    setConfirmed(false)
  }, [])
  const currentStageIndex = deriveAttackStageIndex({
    scenario: "door",
    backendStage: session?.stage,
    playback: flow.snapshot,
  })

  return (
    <section
      className="door-attack-lab"
      aria-labelledby="door-attack-lab-title"
    >
      <p className="sr-only" aria-live="polite">
        {resultSummary}
      </p>
      <header className="door-attack-lab__header">
        <div>
          <p>BLACK-BOX CAN · 격리된 Toy ECU 실습</p>
          <h1 id="door-attack-lab-title">Door Attack Workbench</h1>
          <span>
            관찰한 증거로 메시지 계약을 추론하고 왼쪽 문 상태 프레임을
            검증합니다.
          </span>
        </div>
        <dl className="door-attack-lab__target-summary">
          <div>
            <dt>Target</dt>
            <dd>BODY ECU</dd>
          </div>
          <div>
            <dt>Contract</dt>
            <dd>{session?.messageContractStatus ?? "UNKNOWN"}</dd>
          </div>
          <div>
            <dt>CAN stream</dt>
            <dd data-status={streamStatus}>
              {streamStatus === "open"
                ? "LIVE"
                : streamStatus === "connecting"
                  ? "CONNECTING"
                  : "OFFLINE"}
            </dd>
          </div>
        </dl>
      </header>

      <AttackStageRail stages={STAGES} currentIndex={currentStageIndex} />

      <AttackLabGuidancePanel
        scenario="door"
        stageIndex={currentStageIndex}
        mode={guidanceMode}
        disabled={busy !== null || flow.isActive}
        onModeChange={setGuidanceMode}
      />

      {offlineError ? (
        <div className="door-attack-lab__offline" role="alert">
          <Warning size={19} weight="fill" aria-hidden="true" />
          <div>
            <strong>Door lab backend 오프라인</strong>
            <span>{offlineError}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadSession()}
            disabled={loading}
          >
            세션 다시 연결
          </button>
        </div>
      ) : null}

      {actionError ? (
        <div className="door-attack-lab__action-error" role="alert">
          {actionError}
        </div>
      ) : null}

      <div className="door-attack-lab__primary">
        <section
          className="door-attack-lab__vehicle-flow"
          aria-labelledby="vehicle-flow-title"
        >
          <header className="door-attack-lab__panel-heading">
            <div>
              <Cpu size={18} aria-hidden="true" />
              <span>
                <strong id="vehicle-flow-title">Vehicle flow</strong>
                <small>Toy Body ECU → Left Door</small>
              </span>
            </div>
            <span className="door-attack-lab__truth-qualifier">
              교육용 논리 위치 · 실제 OEM 배치 아님
            </span>
          </header>
          <DoorAttackVehicle
            currentStage={session?.stage}
            playback={flow.snapshot}
            presentation={feedback?.flow}
            playbackPaused={flow.isPaused}
            onPlaybackPause={flow.pause}
            onPlaybackResume={flow.resume}
            onPlaybackNextStep={flow.nextStep}
            playbackMode={
              flowPlaybackMode ??
              (guidanceMode === "guided" ? "step" : "auto")
            }
          />
        </section>

        <section
          className="door-attack-lab__editor"
          role="region"
          aria-label="Code editor"
        >
          <header className="door-attack-lab__panel-heading">
            <div>
              <Code size={18} aria-hidden="true" />
              <span>
                <strong>Lab script</strong>
                <small>허용된 interval_ms / cansend 형식</small>
              </span>
            </div>
            <span>최대 20 lines</span>
          </header>
          <LabScriptGuide mode="door" />
          <textarea
            aria-label="공격 스크립트"
            value={script}
            onChange={(event) => setScript(event.target.value)}
            spellCheck={false}
            disabled={flow.isActive}
          />
          <div className="door-attack-lab__editor-actions">
            <button
              type="button"
              className="is-secondary"
              onClick={() => void handleReset()}
              disabled={!session || busy === "reset"}
            >
              <ArrowClockwise size={15} aria-hidden="true" />
              {busy === "reset" ? "초기화 중" : "실습 초기화"}
            </button>
            <button
              type="button"
              className="is-primary"
              onClick={() => void handleRun()}
              disabled={!session || busy !== null || flow.isActive}
            >
              {busy === "run" ? (
                <CircleNotch
                  size={15}
                  className="door-attack-lab__spin"
                  aria-hidden="true"
                />
              ) : (
                <Play size={15} weight="fill" aria-hidden="true" />
              )}
              {busy === "run" ? "검증 중" : "스크립트 실행"}
            </button>
          </div>
        </section>

        <section
          className="door-attack-lab__binary"
          role="region"
          aria-label="Binary inspector"
        >
          <header className="door-attack-lab__panel-heading">
            <div>
              <ShieldCheck size={18} aria-hidden="true" />
              <span>
                <strong>Binary inspector</strong>
                <small>선택한 frame의 byte view</small>
              </span>
            </div>
            <span>{selectedFrame?.canId ?? "NO FRAME"}</span>
          </header>
          {selectedFrame ? (
            <div className="door-attack-lab__bytes">
              {selectedFrame.data.map((byte, index) => (
                <div key={`${selectedFrame.key}-${index}`}>
                  <small>BYTE {index}</small>
                  <strong>{byte.toUpperCase()}</strong>
                  <code>{selectedBits[index]}</code>
                </div>
              ))}
            </div>
          ) : (
            <p className="door-attack-lab__empty">
              Network monitor에서 frame을 선택하세요.
            </p>
          )}
        </section>

        <section
          className="door-attack-lab__monitor"
          role="region"
          aria-label="Network monitor"
        >
          <header className="door-attack-lab__panel-heading">
            <div>
              <Radio size={18} aria-hidden="true" />
              <span>
                <strong>Network monitor</strong>
                <small>accepted stream + rejected / observed attempt</small>
              </span>
            </div>
            <span>{frames.length} / 300</span>
          </header>
          <div className="door-attack-lab__monitor-scroll">
            <table>
              <caption>CAN 관찰 및 시도 프레임</caption>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>ID</th>
                  <th>DATA</th>
                  <th>Source</th>
                  <th>Verdict</th>
                </tr>
              </thead>
              <tbody>
                {frames.length === 0 ? (
                  <tr>
                    <td colSpan={5}>아직 관찰된 frame이 없습니다.</td>
                  </tr>
                ) : (
                  frames.map((frame) => (
                    <tr
                      key={frame.key}
                      data-selected={
                        selectedFrame?.key === frame.key ? "true" : "false"
                      }
                    >
                      <td>{formatMonitorTime(frame.timestamp)}</td>
                      <td>
                        <button
                          type="button"
                          aria-label={`${frame.canId} ${formatFrameData(frame.data)} frame 선택`}
                          onClick={() => selectMonitorFrame(frame.key)}
                        >
                          {frame.canId}
                        </button>
                      </td>
                      <td>{formatFrameData(frame.data)}</td>
                      <td>{frame.source}</td>
                      <td>{frame.verdict}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <div className="door-attack-lab__secondary">
        <section
          className="door-attack-lab__terminal"
          role="region"
          aria-label="Restricted terminal"
        >
          <header className="door-attack-lab__panel-heading">
            <div>
              <TerminalWindow size={18} aria-hidden="true" />
              <span>
                <strong>Restricted terminal</strong>
                <small>REST virtual shell · host shell 아님</small>
              </span>
            </div>
            <span>vcan0 sandbox</span>
          </header>
          <AttackLabTerminalTranscript
            entries={terminalEntries}
            emptyMessage="허용 명령으로 기록을 관찰하세요. 실제 host shell은 실행되지 않습니다."
          />
          <form onSubmit={(event) => void handleTerminalSubmit(event)}>
            <span aria-hidden="true">$</span>
            <input
              aria-label="제한 터미널 명령"
              value={terminalCommand}
              onChange={(event) => setTerminalCommand(event.target.value)}
              onKeyDown={handleTerminalKeyDown}
              autoComplete="off"
              disabled={!session || busy !== null || flow.isActive}
            />
            <button
              type="submit"
              aria-label="명령 실행"
              disabled={
                !session ||
                !terminalCommand.trim() ||
                busy !== null ||
                flow.isActive
              }
            >
              <CaretRight size={15} weight="bold" aria-hidden="true" />
            </button>
          </form>
        </section>

        <aside className="door-attack-lab__learning">
          <AttackLabLearningCheck
            predictionDraft={predictionDraft}
            predictionBeforeAction={predictionBeforeAction}
            explanation={explanation}
            technicalComplete={technicalComplete}
            reviewReady={reviewReady}
            evidenceSelected={evidenceSelected}
            confirmed={confirmed}
            expectationPrompt={ATTACK_LAB_PREDICTION_PROMPTS.door}
            principleQuestion={ATTACK_LAB_PRINCIPLE_QUESTIONS.door}
            actualRows={feedback?.actualRows ?? []}
            onPredictionChange={(value) => {
              setPredictionDraft(value)
              setConfirmed(false)
            }}
            onExplanationChange={(value) => {
              setExplanation(value)
              setConfirmed(false)
            }}
            onConfirm={() => setConfirmed(true)}
          />
          <section aria-labelledby="hints-title">
            <header>
              <Lightbulb size={17} aria-hidden="true" />
              <h2 id="hints-title">Hints</h2>
            </header>
            <p>
              {hintIndex < 0
                ? "필요할 때 한 단계씩 확인하세요. 정답 값은 제공하지 않습니다."
                : HINTS[hintIndex]}
            </p>
            <button
              type="button"
              onClick={() =>
                setHintIndex((current) =>
                  Math.min(current + 1, HINTS.length - 1),
                )
              }
              disabled={hintIndex === HINTS.length - 1}
            >
              다음 힌트
            </button>
          </section>
          <section role="region" aria-label="Evidence">
            <header>
              <ShieldCheck size={17} aria-hidden="true" />
              <h2>Evidence</h2>
            </header>
            <dl>
              <div>
                <dt>Stage</dt>
                <dd>{session?.stage ?? (loading ? "LOADING" : "OFFLINE")}</dd>
              </div>
              <div>
                <dt>Toy IDS</dt>
                <dd>{idsStatus ?? "PENDING"}</dd>
              </div>
              <div>
                <dt>Attempts</dt>
                <dd>{session?.attemptCount ?? 0}</dd>
              </div>
              <div>
                <dt>Toy 기술 결과 달성</dt>
                <dd>{technicalComplete ? "달성" : "미달성"}</dd>
              </div>
            </dl>
            {session?.evidence.length ? (
              <ul>
                {session.evidence.map((item, index) => (
                  <li key={`${item.kind}-${index}`}>
                    {item.kind}: {item.status}
                  </li>
                ))}
              </ul>
            ) : (
              <p>검증된 evidence가 아직 없습니다.</p>
            )}
            {lastRunAttempts.length ? (
              <ul aria-label="최근 실행 판정">
                {lastRunAttempts.map((attempt) => (
                  <li key={attempt.attemptId}>
                    {attempt.canId}: {attempt.verdict}
                  </li>
                ))}
              </ul>
            ) : null}
          </section>
          <AttackLabFeedbackPanel feedback={feedback} />
          <AttackLabActivityLog
            entries={activity}
            selectedId={selectedActivityId}
            onSelect={selectActivity}
          />
        </aside>
      </div>
    </section>
  )
}
