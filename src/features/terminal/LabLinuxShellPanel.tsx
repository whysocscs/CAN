import { useState } from "react"
import { ArrowClockwise, TerminalWindow } from "@phosphor-icons/react"
import RealLabTerminal, {
  type LabTerminalStatus,
  type ObservedCanFrame,
} from "./RealLabTerminal"

interface LabLinuxShellPanelProps {
  labId: string
  title?: string
  pendingCommand?: string | null
  onCommandHandled?: () => void
  onCommandObserved?: (command: string) => void
  onCanFrame?: (frame: ObservedCanFrame) => void | Promise<void>
}

export default function LabLinuxShellPanel({
  labId,
  title = "Linux Shell",
  pendingCommand,
  onCommandHandled,
  onCommandObserved,
  onCanFrame,
}: LabLinuxShellPanelProps) {
  const [clearSignal, setClearSignal] = useState(0)
  const [reconnectSignal, setReconnectSignal] = useState(0)
  const [status, setStatus] = useState<LabTerminalStatus>("connecting")

  return (
    <section className="lab-linux-shell" aria-label={`${title} 실습 터미널`}>
      <header className="lab-linux-shell__toolbar">
        <span>
          <TerminalWindow size={17} aria-hidden="true" />
          <strong>{title}</strong>
          <small>격리 컨테이너 · {labId}</small>
        </span>
        <span className={`canlab__terminal-status is-${status === "open" ? "connected" : status}`}>
          <i />
          {status === "open" ? "연결됨" : status === "offline" ? "연결 끊김" : "연결 중"}
        </span>
        <button
          type="button"
          onClick={() => {
            if (status === "offline") setReconnectSignal((value) => value + 1)
            else setClearSignal((value) => value + 1)
          }}
        >
          {status === "offline" ? <><ArrowClockwise size={13} /> 재연결</> : "화면 비우기"}
        </button>
      </header>
      <RealLabTerminal
        labId={labId}
        clearSignal={clearSignal}
        reconnectSignal={reconnectSignal}
        pendingCommand={pendingCommand}
        onCommandHandled={onCommandHandled}
        onCommandObserved={onCommandObserved}
        onCanFrame={onCanFrame}
        onStatusChange={setStatus}
      />
    </section>
  )
}
