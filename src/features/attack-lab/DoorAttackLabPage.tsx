import {
  useCallback,
  useEffect,
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
import {
  appendBoundedEvents,
  formatFrameData,
  frameBits,
  parseTerminalFrames,
} from "./doorLabUtils"
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
    key: event.eventId,
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
  const now = Date.now()
  return attempts.map((attempt, index) => ({
    key: `${source}-${now}-${index}-${attempt.canId}`,
    timestamp: now + index,
    channel: "vcan0",
    canId: attempt.canId,
    data: attempt.data,
    verdict: attempt.verdict,
    source,
  }))
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
  const [frames, setFrames] = useState<MonitorFrame[]>([])
  const [selectedFrame, setSelectedFrame] = useState<MonitorFrame | null>(null)
  const [terminalCommand, setTerminalCommand] = useState("")
  const [terminalEntries, setTerminalEntries] = useState<TerminalEntry[]>([])
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [hintIndex, setHintIndex] = useState(-1)
  const [idsStatus, setIdsStatus] = useState<DoorLabIdsStatus | null>(null)
  const [lastRunAttempts, setLastRunAttempts] = useState<DoorLabFrameAttempt[]>(
    [],
  )

  const loadSession = useCallback(async () => {
    setLoading(true)
    setOfflineError(null)
    setActionError(null)
    try {
      const next = await createDoorLabSession()
      setSession(next)
    } catch (error) {
      setOfflineError(errorMessage(error))
      setSession(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSession()
  }, [loadSession])

  const handleCanEvents = useCallback((events: CanEvent[]) => {
    const incoming = events.map(eventToMonitorFrame)
    setFrames((existing) => appendBoundedEvents(existing, incoming))
    setSelectedFrame((current) => current ?? incoming.at(-1) ?? null)
  }, [])

  const streamStatus = useCanVehicleStream({ onEvent: handleCanEvents })

  const appendMonitorFrames = useCallback((incoming: MonitorFrame[]) => {
    setFrames((existing) => appendBoundedEvents(existing, incoming))
    setSelectedFrame((current) => current ?? incoming[0] ?? null)
  }, [])

  const handleRun = async () => {
    if (!session || busy) return
    setBusy("run")
    setActionError(null)
    try {
      const result = await runDoorLabScript(session.sessionId, script)
      setSession(result.state)
      setIdsStatus(result.idsStatus)
      setLastRunAttempts(result.attempts)
      appendMonitorFrames(attemptsToMonitorFrames(result.attempts, "run"))
      if (result.error) setActionError(result.error)
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const handleReset = async () => {
    if (!session || busy) return
    setBusy("reset")
    setActionError(null)
    try {
      const next = await resetDoorLabSession(session.sessionId)
      applyVehicleState(next.vehicleState)
      setSession(next)
      setFrames([])
      setSelectedFrame(null)
      setTerminalEntries([])
      setIdsStatus(null)
      setLastRunAttempts([])
      setScript(INITIAL_SCRIPT)
      setHintIndex(-1)
    } catch (error) {
      setActionError(errorMessage(error))
    } finally {
      setBusy(null)
    }
  }

  const handleTerminalSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const command = terminalCommand.trim()
    if (!session || !command || busy) return
    setBusy("terminal")
    setActionError(null)
    try {
      const result = await runDoorLabCommand(session.sessionId, command)
      setTerminalEntries((existing) =>
        [
          ...existing,
          { id: Date.now(), command, output: result.output, ok: result.ok },
        ].slice(-30),
      )
      setCommandHistory((existing) => [...existing, command].slice(-50))
      setHistoryIndex(-1)
      setTerminalCommand("")

      let incoming = attemptsToMonitorFrames(result.frames, "terminal")
      if (incoming.length === 0) {
        incoming = parseTerminalFrames(result.output).map(
          (captured, index) => ({
            key: `terminal-capture-${captured.timestamp}-${index}`,
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
      setActionError(errorMessage(error))
    } finally {
      setBusy(null)
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
            <span>교육용 논리 ECU 위치</span>
          </header>
          <DoorAttackVehicle />
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
                <small>accepted stream + 모든 lab attempt</small>
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
                      <td>
                        {new Date(frame.timestamp).toLocaleTimeString("ko-KR", {
                          hour12: false,
                        })}
                      </td>
                      <td>
                        <button
                          type="button"
                          aria-label={`${frame.canId} ${formatFrameData(frame.data)} frame 선택`}
                          onClick={() => setSelectedFrame(frame)}
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
                {lastRunAttempts.map((attempt, index) => (
                  <li key={`${attempt.canId}-${index}`}>
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
