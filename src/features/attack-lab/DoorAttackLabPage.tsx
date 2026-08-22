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
import DoorAttackVehicle from "./DoorAttackVehicle"
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

interface TerminalEntry {
  id: number
  command: string
  output: string
  ok: boolean
}

interface ActionRequest {
  controller: AbortController
  generation: number
  sessionId: string
  sessionGeneration: number
}

interface CreateFlight {
  controller: AbortController
  promise: Promise<void>
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

type MonitorAction =
  | AppendMonitorAction
  | SelectMonitorAction
  | { type: "clear" }

const EMPTY_MONITOR: MonitorState = { frames: [], selectedKey: null }

function monitorReducer(
  state: MonitorState,
  action: MonitorAction,
): MonitorState {
  if (action.type === "clear") return EMPTY_MONITOR
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
    key: `event:${event.eventId}`,
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

function StageRail({ current }: { current?: string }) {
  const currentIndex = Math.max(
    0,
    STAGES.indexOf(current as typeof STAGES[number]),
  )
  return (
    <ol className="door-attack-lab__stages" aria-label="공격 단계">
      {STAGES.map((stage, index) => {
        const state =
          index < currentIndex
            ? "complete"
            : index === currentIndex
              ? "current"
              : "next"
        return (
          <li
            key={stage}
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span>{index + 1}</span>
            <strong>{stage}</strong>
          </li>
        )
      })}
    </ol>
  )
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
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([])
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
  const terminalEntryIdRef = useRef(0)

  const loadSession = useCallback(() => {
    if (createFlightRef.current) return createFlightRef.current.promise

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
  }, [])

  useEffect(() => {
    mountedRef.current = true
    void loadSession()
    return () => {
      mountedRef.current = false
      queueMicrotask(() => {
        if (mountedRef.current) return
        lifecycleGenerationRef.current += 1
        actionGenerationRef.current += 1
        sessionIdRef.current = null
        sessionGenerationRef.current = null
        createFlightRef.current?.controller.abort()
        actionControllerRef.current?.abort()
      })
    }
  }, [loadSession])

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

  const streamStatus = useCanVehicleStream({
    onEvent: handleCanEvents,
    vehicleEventPredicate: currentAcceptedEventPredicate,
  })

  const appendMonitorFrames = useCallback((incoming: MonitorFrame[]) => {
    dispatchMonitor({ type: "append", frames: incoming })
  }, [])

  const beginAction = (
    kind: NonNullable<typeof busy>,
  ): ActionRequest | null => {
    const sessionId = sessionIdRef.current
    const sessionGeneration = sessionGenerationRef.current
    if (!sessionId || sessionGeneration === null || busyRef.current) return null
    const controller = new AbortController()
    const generation = ++actionGenerationRef.current
    actionControllerRef.current = controller
    busyRef.current = kind
    setBusy(kind)
    setActionError(null)
    return { controller, generation, sessionId, sessionGeneration }
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
      if (result.error) setActionError(result.error)
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
      applyVehicleState(next.vehicleState)
      setSession(next)
      dispatchMonitor({ type: "clear" })
      setTerminalEntries([])
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
      setTerminalEntries((existing) =>
        [
          ...existing,
          {
            id: ++terminalEntryIdRef.current,
            command,
            output: result.output,
            ok: result.ok,
          },
        ].slice(-30),
      )
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

  return (
    <section
      className="door-attack-lab"
      aria-labelledby="door-attack-lab-title"
    >
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

      <StageRail current={session?.stage} />

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
          <DoorAttackVehicle currentStage={session?.stage} />
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
          <textarea
            aria-label="공격 스크립트"
            value={script}
            onChange={(event) => setScript(event.target.value)}
            spellCheck={false}
          />
          <div className="door-attack-lab__editor-actions">
            <button
              type="button"
              className="is-secondary"
              onClick={() => void handleReset()}
              disabled={!session || busy !== null}
            >
              <ArrowClockwise size={15} aria-hidden="true" />
              {busy === "reset" ? "초기화 중" : "실습 초기화"}
            </button>
            <button
              type="button"
              className="is-primary"
              onClick={() => void handleRun()}
              disabled={!session || busy !== null}
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
                          onClick={() =>
                            dispatchMonitor({ type: "select", key: frame.key })
                          }
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
          <div className="door-attack-lab__terminal-output" aria-live="polite">
            <p>
              허용 명령으로 기록을 관찰하세요. 예: <code>ls</code>,{" "}
              <code>cat baseline.log</code>, <code>candump -L vcan0</code>
            </p>
            {terminalEntries.map((entry) => (
              <div key={entry.id} data-ok={entry.ok ? "true" : "false"}>
                <strong>$ {entry.command}</strong>
                <pre>{entry.output}</pre>
              </div>
            ))}
          </div>
          <form onSubmit={(event) => void handleTerminalSubmit(event)}>
            <span aria-hidden="true">$</span>
            <input
              aria-label="제한 터미널 명령"
              value={terminalCommand}
              onChange={(event) => setTerminalCommand(event.target.value)}
              onKeyDown={handleTerminalKeyDown}
              autoComplete="off"
            />
            <button
              type="submit"
              aria-label="명령 실행"
              disabled={!session || !terminalCommand.trim() || busy !== null}
            >
              <CaretRight size={15} weight="bold" aria-hidden="true" />
            </button>
          </form>
        </section>

        <aside className="door-attack-lab__learning">
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
                <dt>Proof</dt>
                <dd>{session?.completed ? "COMPLETE" : "NOT YET"}</dd>
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
        </aside>
      </div>
    </section>
  )
}
