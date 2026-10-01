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
  CircleNotch,
  Code,
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
import {
  applyVehicleFlowEffect,
  parseVehicleFlowTraces,
  type VehicleFlowPlaybackMode,
  type VehicleFlowTrace,
} from "../vehicle/vehicleFlowTypes"
import { VEHICLE_ROUTES } from "../vehicle/vehicleTopology"
import { useVehicleFlowPlayback } from "../vehicle/useVehicleFlowPlayback"
import { vehicle } from "../vehicle/vehicleStore"
import {
  createBeginnerCanAttackSession,
  resolveBeginnerCanAttackStreamUrl,
  resetBeginnerCanAttackSession,
  runBeginnerCanAttackScript,
  runBeginnerCanAttackTerminal,
} from "./beginnerCanAttackApi"
import type {
  BeginnerCanAttackIdsStatus,
  BeginnerCanAttackMonitorFrame,
  BeginnerCanAttackMonitorState,
  BeginnerCanAttackResult,
  BeginnerCanAttackScenario,
  BeginnerCanAttackStage,
  BeginnerCanAttackState,
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
import { deriveAttackStageIndex } from "./attackLabStage"
import LabScriptGuide from "./LabScriptGuide"
import { BEGINNER_CAN_ATTACK_CONFIG } from "./attackLabScenarioData"
import { LabIntroButton } from "../lab-layout/LabIntroGate"
import LabTabs from "../lab-layout/LabTabs"
import { ATTACK_LAB_COMPLETIONS, completeCommand } from "../terminal/commandCompletion"
import {
  ATTACK_LAB_PREDICTION_PROMPTS,
  ATTACK_LAB_PRINCIPLE_QUESTIONS,
} from "./attackLabLearning"
import "./doorAttackLab.css"

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
  origin: AttackLabActionOrigin
  actionId: string
  predictionBeforeAction: string
  guidanceMode: AttackLabGuidanceMode
}

interface CreateFlight {
  scenario: BeginnerCanAttackScenario
  controller: AbortController
  promise: Promise<void>
}

interface PendingBeginnerFlow {
  runKey: string
  scenario: BeginnerCanAttackScenario
  sessionId: string
  sessionGeneration: number
  actionGeneration: number
  state: BeginnerCanAttackState["vehicleState"]
}

type MonitorAction = {
  type: "append"
  frames: BeginnerCanAttackMonitorFrame[]
} | { type: "select"; key: string } | { type: "clear" } | { type: "deselect" }

function monitorReducer(
  state: BeginnerCanAttackMonitorState,
  action: MonitorAction,
): BeginnerCanAttackMonitorState {
  if (action.type === "clear") return EMPTY_MONITOR
  if (action.type === "deselect") return { ...state, selectedKey: null }
  if (action.type === "select") {
    return state.frames.some((frame) => frame.key === action.key)
      ? { ...state, selectedKey: action.key }
      : state
  }
  return appendBeginnerMonitorFrames(state, action.frames)
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "알 수 없는 오류가 발생했습니다."
}

function applyVehicleState(state: BeginnerCanAttackState["vehicleState"]) {
  const ratios = vehicleRatiosFromBeginnerState(state)
  vehicle.set("doorL", ratios.doorL)
  vehicle.set("doorR", ratios.doorR)
  vehicle.set("tailgate", ratios.tailgate)
}

const STAGE_INDEX_BY_SCENARIO: Record<BeginnerCanAttackScenario, Partial<Record<BeginnerCanAttackStage, number>>> =
  {
    spoofing: { RECON: 0, OBSERVE: 1, CRAFT: 2, EVIDENCE: 4 },
    replay: { RECON: 0, CAPTURE: 1, EXECUTE: 2, EVIDENCE: 4 },
  }

function stageIndex(
  scenario: BeginnerCanAttackScenario,
  stage: BeginnerCanAttackStage = "RECON",
) {
  return STAGE_INDEX_BY_SCENARIO[scenario][stage] ?? 0
}

function currentTopologyNode(
  config: BeginnerCanAttackUiConfig,
  state?: BeginnerCanAttackState,
) {
  const route = VEHICLE_ROUTES[config.routeId]
  return route[
    Math.min(stageIndex(config.scenario, state?.stage), route.length - 1)
  ]
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
  const config = BEGINNER_CAN_ATTACK_CONFIG[scenario]
  const [session, setSession] = useState<BeginnerCanAttackState | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<BusyState>(null)
  const [offlineError, setOfflineError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [script, setScript] = useState(config.initialScript)
  const [monitor, dispatchMonitor] = useReducer(monitorReducer, EMPTY_MONITOR)
  const [terminalCommand, setTerminalCommand] = useState("")
  const [completionMatches, setCompletionMatches] = useState<string[]>([])
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
  const [lastResult, setLastResult] = useState<BeginnerCanAttackResult | null>(
    null,
  )
  const [idsStatus, setIdsStatus] = useState<BeginnerCanAttackIdsStatus | null>(
    null,
  )
  const mountedRef = useRef(false)
  const scenarioRef = useRef(scenario)
  const lifecycleGenerationRef = useRef(0)
  const actionGenerationRef = useRef(0)
  const sessionRef = useRef<BeginnerCanAttackState | null>(null)
  const createFlightRef = useRef<CreateFlight | null>(null)
  const actionControllerRef = useRef<AbortController | null>(null)
  const busyRef = useRef<BusyState>(null)
  const monitorSequenceRef = useRef(0)
  const pendingFlowRef = useRef<PendingBeginnerFlow | null>(null)
  const flow = useVehicleFlowPlayback({
    onEffect: applyVehicleFlowEffect,
    onComplete: (runKey) => {
      const pending = pendingFlowRef.current
      const current = sessionRef.current
      if (
        !mountedRef.current ||
        !pending ||
        pending.runKey !== runKey ||
        pending.scenario !== scenarioRef.current ||
        pending.sessionId !== current?.sessionId ||
        pending.sessionGeneration !== current.generation ||
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

  const nextMonitorSequence = useCallback(
    () => ++monitorSequenceRef.current,
    [],
  )
  const clearLocalWorkbench = useCallback(
    (nextConfig: BeginnerCanAttackUiConfig) => {
      dispatchMonitor({ type: "clear" })
      clearLearningState()
      setCommandHistory([])
      setHistoryIndex(-1)
      setTerminalCommand("")
      setHintIndex(-1)
      setScript(nextConfig.initialScript)
      setLastResult(null)
      setIdsStatus(null)
      setActionError(null)
      setBusy(null)
      busyRef.current = null
      monitorSequenceRef.current = 0
    },
    [clearLearningState],
  )

  const loadSession = useCallback(() => {
    const existing = createFlightRef.current
    if (existing?.scenario === scenario) return existing.promise
    if (existing) {
      existing.controller.abort()
      createFlightRef.current = null
    }

    flow.clear()
    setFlowPlaybackMode(null)
    pendingFlowRef.current = null
    clearLearningState()

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
        const next = await createBeginnerCanAttackSession(
          scenario,
          controller.signal,
        )
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
  }, [clearLearningState, flow.clear, scenario])

  useEffect(() => {
    const changedScenario = scenarioRef.current !== scenario
    mountedRef.current = true
    if (changedScenario) {
      lifecycleGenerationRef.current += 1
      actionGenerationRef.current += 1
      actionControllerRef.current?.abort()
      flow.clear()
      setFlowPlaybackMode(null)
      pendingFlowRef.current = null
      sessionRef.current = null
      setSession(null)
      clearLocalWorkbench(config)
    }
    scenarioRef.current = scenario
    applyVehicleState({
      leftDoor: "closed",
      rightDoor: "closed",
      tailgate: "closed",
    })
    void loadSession()
    return () => {
      mountedRef.current = false
      queueMicrotask(() => {
        if (mountedRef.current) return
        lifecycleGenerationRef.current += 1
        actionGenerationRef.current += 1
        flow.cancel()
        pendingFlowRef.current = null
        sessionRef.current = null
        createFlightRef.current?.controller.abort()
        actionControllerRef.current?.abort()
      })
    }
  }, [
    clearLocalWorkbench,
    config,
    flow.cancel,
    flow.clear,
    loadSession,
    scenario,
  ])

  const currentAcceptedEventPredicate = useCallback(
    (event: CanEvent) => beginnerEventMatchesSession(event, sessionRef.current),
    [],
  )

  const handleCanEvents = useCallback(
    (events: CanEvent[]) => {
      const frames = events
        .filter(currentAcceptedEventPredicate)
        .map(eventToBeginnerMonitorFrame)
      dispatchMonitor({
        type: "append",
        frames: sequenceFrames(frames, nextMonitorSequence),
      })
    },
    [currentAcceptedEventPredicate, nextMonitorSequence],
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
    url: resolveBeginnerCanAttackStreamUrl(),
    onEvent: handleCanEvents,
    vehicleEventPredicate: currentReplayVehiclePredicate,
  })

  const beginAction = (
    kind: Exclude<BusyState, null>,
  ): ActionRequest | null => {
    const current = sessionRef.current
    if (
      !current ||
      (kind === "reset"
        ? busyRef.current === "reset"
        : busyRef.current !== null || flow.isActive)
    )
      return null
    if (kind === "reset") actionControllerRef.current?.abort()
    const controller = new AbortController()
    const actionGeneration = ++actionGenerationRef.current
    const origin: AttackLabActionOrigin = kind === "run" ? "script" : "terminal"
    const predictionBeforeAction = predictionDraft
    const request = {
      controller,
      actionGeneration,
      sessionId: current.sessionId,
      sessionGeneration: current.generation,
      scenario: current.scenario,
      origin,
      actionId: `${current.scenario}:${current.sessionId}:${current.generation}:${origin}:${actionGeneration}`,
      predictionBeforeAction,
      guidanceMode,
    }
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
      setLastResult(null)
      setIdsStatus(null)
    }
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
    finalState: BeginnerCanAttackState["vehicleState"],
  ) => {
    const playbackMode =
      request.guidanceMode === "guided" ? "step" : "auto"
    pendingFlowRef.current = {
      runKey: action.actionId,
      scenario: request.scenario,
      sessionId: request.sessionId,
      sessionGeneration: request.sessionGeneration,
      actionGeneration: request.actionGeneration,
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

  const acceptResult = (
    request: ActionRequest,
    result: BeginnerCanAttackResult,
    source: "terminal" | "run",
    commandLabel: string,
  ) => {
    if (
      !isActionCurrent(request) ||
      result.state.scenario !== request.scenario ||
      result.state.sessionId !== request.sessionId ||
      result.state.generation !== request.sessionGeneration
    )
      return false
    const traces = parseVehicleFlowTraces(result.flowTraces)
    sessionRef.current = result.state
    setSession(result.state)
    setLastResult(result)
    if (result.idsStatus !== null) setIdsStatus(result.idsStatus)
    const restFrames = [
      ...attemptsToBeginnerMonitorFrames(result.attempts, source),
      ...capturesToBeginnerMonitorFrames(result.captures),
    ]
    dispatchMonitor({
      type: "append",
      frames: sequenceFrames(restFrames, nextMonitorSequence),
    })
    if (!traces) {
      flow.clear()
      setFlowPlaybackMode(null)
      pendingFlowRef.current = null
      applyVehicleState(result.state.vehicleState)
      setLastAction(null)
      setSelectedActivityId(null)
      setPredictionBeforeAction("")
      setExplanation("")
      setConfirmed(false)
      setActionError(
        "공격 흐름을 표시하지 못해 최종 차량 상태만 동기화했습니다.",
      )
      return true
    }

    const action: AttackLabActionResult = {
      actionId: request.actionId,
      scenario: request.scenario,
      origin: request.origin,
      commandLabel,
      ok: result.ok,
      resultCode: result.code,
      rawOutput: result.output,
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
    playAction(action, traces, request, result.state.vehicleState)
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
      acceptResult(request, result, "run", "Lab script")
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
    applyVehicleState({
      leftDoor: "closed",
      rightDoor: "closed",
      tailgate: "closed",
    })
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
      )
        return
      sessionRef.current = next
      flow.clear()
      setFlowPlaybackMode(null)
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
      if (!acceptResult(request, result, "terminal", command)) return
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
    if (event.key === "Tab") {
      event.preventDefault()
      const { value, matches } = completeCommand(
        terminalCommand,
        ATTACK_LAB_COMPLETIONS[scenario],
      )
      setTerminalCommand(value)
      setCompletionMatches(value === terminalCommand ? matches : [])
      return
    }
    setCompletionMatches([])
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

  const selectedFrame =
    monitor.frames.find((frame) => frame.key === monitor.selectedKey) ?? null
  const selectedBits = selectedFrame
    ? beginnerFrameBits(selectedFrame.data)
    : []
  const currentNodeId = currentTopologyNode(config, session ?? undefined)
  const contractStatus = session?.completed
    ? "COMPLETED"
    : session && session.stage !== "RECON"
      ? "OBSERVED"
      : "UNKNOWN"
  const currentStageIndex = deriveAttackStageIndex({
    scenario,
    backendStage: session?.stage,
    playback: flow.snapshot,
  })
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

  const editorPanel = (
    <section
      className="door-attack-lab__editor"
      role="region"
      aria-label="Code editor"
    >
      <header className="door-attack-lab__panel-heading">
        <div>
          <Code size={18} aria-hidden="true" />
          <span>
            <strong>Restricted lab script</strong>
            <small>comments + scenario final action</small>
          </span>
        </div>
        <span>최대 20 lines</span>
      </header>
      <LabScriptGuide mode={scenario} />
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
  )

  const binaryPanel = (
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
            <small>선택한 frame의 byte / bit view</small>
          </span>
        </div>
        <span>{selectedFrame?.canId ?? "NO FRAME"}</span>
      </header>
      <div className="door-attack-lab__bytes">
        {selectedFrame ? (
          selectedFrame.data.map((byte, index) => (
            <div key={`${selectedFrame.key}-${index}`}>
              <small>BYTE {index}</small>
              <strong>{byte}</strong>
              <code>{selectedBits[index]}</code>
            </div>
          ))
        ) : (
          <p className="door-attack-lab__empty">
            터미널 또는 monitor에서 프레임을 선택하세요.
          </p>
        )}
      </div>
    </section>
  )

  const monitorPanel = (
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
            <small>REST rejected/capture + accepted live stream</small>
          </span>
        </div>
        <span>{monitor.frames.length} / 300</span>
      </header>
      <div className="door-attack-lab__monitor-scroll">
        <table>
          <caption className="sr-only">
            Beginner CAN lab observed frames
          </caption>
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
            {monitor.frames.length === 0 ? (
              <tr>
                <td colSpan={5}>아직 관찰된 프레임이 없습니다.</td>
              </tr>
            ) : (
              monitor.frames.map((frame) => (
                <tr
                  key={frame.key}
                  data-selected={frame.key === monitor.selectedKey}
                >
                  <td>
                    {MONITOR_TIME_FORMATTER.format(
                      new Date(frame.timestamp),
                    )}
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label={`${frame.canId} ${formatBeginnerFrameData(frame.data)} frame 선택`}
                      onClick={() => selectMonitorFrame(frame.key)}
                    >
                      {frame.canId}
                    </button>
                  </td>
                  <td>{formatBeginnerFrameData(frame.data)}</td>
                  <td>{frame.source}</td>
                  <td>{frame.verdict}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  )

  const terminalPanel = (
    <section
      className="door-attack-lab__terminal"
      role="region"
      aria-label="Virtual terminal"
    >
      <header className="door-attack-lab__panel-heading">
        <div>
          <TerminalWindow size={18} aria-hidden="true" />
          <span>
            <strong>Virtual terminal</strong>
            <small>allowlisted in-memory interpreter · Tab 자동완성</small>
          </span>
        </div>
        <span>{busy === "terminal" ? "RUNNING" : "READY"}</span>
      </header>
      <AttackLabTerminalTranscript
        entries={terminalEntries}
        emptyMessage="관찰 명령을 직접 입력하세요. 실제 shell/host filesystem에는 연결되지 않습니다."
      />
      {completionMatches.length > 1 ? (
        <p className="lab-v2__completion" aria-live="polite">
          {completionMatches.map((match) => match.trimEnd()).join("    ")}
        </p>
      ) : null}
      <form
        className="beginner-can-attack-lab__terminal-form"
        onSubmit={(event) => void handleTerminalSubmit(event)}
      >
        <span aria-hidden="true">$</span>
        <input
          aria-label="제한 터미널 명령"
          placeholder="허용된 명령 입력 · Tab 자동완성 · ↑↓ 기록"
          value={terminalCommand}
          onChange={(event) => {
            setTerminalCommand(event.target.value)
            setCompletionMatches([])
          }}
          onKeyDown={handleTerminalKeyDown}
          disabled={!session || busy !== null || flow.isActive}
          autoComplete="off"
        />
        <button
          type="submit"
          disabled={!session || busy !== null || flow.isActive}
        >
          명령 실행
        </button>
      </form>
    </section>
  )

  const learningPanel = (
    <div className="door-attack-lab__learning">
      <AttackLabLearningCheck
        predictionDraft={predictionDraft}
        predictionBeforeAction={predictionBeforeAction}
        explanation={explanation}
        technicalComplete={technicalComplete}
        reviewReady={reviewReady}
        evidenceSelected={evidenceSelected}
        confirmed={confirmed}
        expectationPrompt={ATTACK_LAB_PREDICTION_PROMPTS[scenario]}
        principleQuestion={ATTACK_LAB_PRINCIPLE_QUESTIONS[scenario]}
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
      <section role="region" aria-label="Hints">
        <header>
          <Lightbulb size={17} aria-hidden="true" />
          <strong>Hints</strong>
        </header>
        <p>
          {hintIndex < 0
            ? "힌트는 정답을 대신하지 않습니다."
            : config.hints[hintIndex]}
        </p>
        <button
          type="button"
          onClick={() =>
            setHintIndex((index) =>
              Math.min(index + 1, config.hints.length - 1),
            )
          }
        >
          다음 힌트
        </button>
      </section>
      <section role="region" aria-label="Learning objective">
        <header>
          <ShieldCheck size={17} aria-hidden="true" />
          <strong>Learning objective</strong>
        </header>
        <p>{config.objective}</p>
        <p>{config.definition}</p>
        <p>
          물리 차량 actuation이 아닌 virtual CAN 입력과 GLB/Toy effect만
          검증합니다.
        </p>
      </section>
      <section role="region" aria-label="Evidence">
        <header>
          <Radio size={17} aria-hidden="true" />
          <strong>Evidence / completion</strong>
        </header>
        <dl>
          <div>
            <dt>Stage</dt>
            <dd>
              {session?.stage ?? (loading ? "LOADING" : "UNAVAILABLE")}
            </dd>
          </div>
          <div>
            <dt>Attempts</dt>
            <dd>{session?.attemptCount ?? 0}</dd>
          </div>
          <div>
            <dt>Last verdict</dt>
            <dd>
              {busy && busy !== "reset"
                ? "PENDING"
                : (lastResult?.code ?? session?.lastVerdict ?? "NONE")}
            </dd>
          </div>
          <div>
            <dt>Toy IDS</dt>
            <dd>{idsStatus ?? "PENDING"}</dd>
          </div>
          <div>
            <dt>Toy 기술 결과 달성</dt>
            <dd>{technicalComplete ? "달성" : "미달성"}</dd>
          </div>
        </dl>
      </section>
      <AttackLabFeedbackPanel feedback={feedback} />
      <AttackLabActivityLog
        entries={activity}
        selectedId={selectedActivityId}
        onSelect={selectActivity}
      />
    </div>
  )

  return (
    <section
      className="door-attack-lab beginner-can-attack-lab lab-v2"
      aria-labelledby="beginner-can-attack-title"
    >
      <p className="sr-only" aria-live="polite">
        {resultSummary}
      </p>
      <header className="lab-v2__bar">
        <div className="lab-v2__title">
          <p>CAN ATTACK BASICS · 격리된 Toy ECU 실습</p>
          <h1 id="beginner-can-attack-title">{config.title}</h1>
          <small>Toy ECU / virtual CAN</small>
        </div>
        <dl className="lab-v2__status">
          <div>
            <dt>Target</dt>
            <dd>{config.targetSummary}</dd>
          </div>
          <div>
            <dt>GLB/Toy effect</dt>
            <dd>{config.effectSummary}</dd>
          </div>
          <div>
            <dt>Contract</dt>
            <dd>{contractStatus}</dd>
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
        <LabIntroButton />
      </header>


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
          <div>
            <strong>Beginner CAN lab backend 오프라인</strong>
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

      <div className="lab-v2__workbench lab-v2__workbench--aligned">
        <div className="lab-v2__main">
          <section
            className="door-attack-lab__vehicle-flow"
            aria-label="Vehicle topology"
          >
            <VehicleNetworkViewport
              route={VEHICLE_ROUTES[config.routeId]}
              targetId={config.targetId}
              effectId={config.effectId}
              currentNodeId={currentNodeId}
              scenarioTitle={config.title}
              accent={config.accent}
              playback={flow.snapshot}
              presentation={feedback?.flow}
              playbackPaused={flow.isPaused}
              onPlaybackPause={flow.pause}
              onPlaybackResume={flow.resume}
              onPlaybackNextStep={flow.nextStep}
              showTargetMap={false}
              playbackMode={
                flowPlaybackMode ??
                (guidanceMode === "guided" ? "step" : "auto")
              }
            />
            <span className="door-attack-lab__truth-qualifier">
              교육용 논리 위치 · 실제 OEM 배치 아님
            </span>
          </section>
        </div>

        <aside className="lab-v2__side lab-v2__side--guide-top" aria-label="실습 안내와 도구">
          <AttackLabGuidancePanel
            scenario={scenario}
            stageIndex={currentStageIndex}
            mode={guidanceMode}
            disabled={busy !== null || flow.isActive}
            onModeChange={setGuidanceMode}
          />
          <LabTabs
            label="실습 도구"
            tabs={[
              { id: "terminal", label: "Terminal", icon: TerminalWindow, content: terminalPanel },
              { id: "script", label: "Script", icon: Code, content: editorPanel },
              {
                id: "monitor",
                label: "Monitor",
                icon: Radio,
                badge: monitor.frames.length,
                content: monitorPanel,
              },
              { id: "binary", label: "Binary", icon: ShieldCheck, content: binaryPanel },
              { id: "review", label: "학습 확인", icon: Lightbulb, content: learningPanel },
            ]}
          />
        </aside>
      </div>
    </section>
  )
}
