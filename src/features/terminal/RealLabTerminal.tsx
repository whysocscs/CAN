import { useEffect, useRef, useState } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal as Xterm } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"

export type LabTerminalStatus = "connecting" | "open" | "offline"

export type ObservedCanFrame = {
  channel: string
  canId: string
  data: string[]
}

type RealLabTerminalProps = {
  labId: string
  clearSignal: number
  reconnectSignal: number
  pendingCommand?: string | null
  onCommandHandled?: () => void
  onCommandObserved?: (command: string) => void
  onCanFrame?: (frame: ObservedCanFrame) => void | Promise<void>
  onStatusChange?: (status: LabTerminalStatus) => void
}

type CanFrameMessage = ObservedCanFrame & { type: "can-frame" }

function terminalSocketUrl(labId: string): string {
  const explicitUrl = import.meta.env.VITE_LAB_TERMINAL_URL?.trim()
  if (explicitUrl) {
    const separator = explicitUrl.includes("?") ? "&" : "?"
    return `${explicitUrl}${separator}lab=${encodeURIComponent(labId)}`
  }

  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
  return `${protocol}//${window.location.host}/ws/lab-terminal?lab=${encodeURIComponent(labId)}`
}

function isCanFrameMessage(value: unknown): value is CanFrameMessage {
  if (!value || typeof value !== "object") return false
  const message = value as Partial<CanFrameMessage>
  return (
    message.type === "can-frame"
    && typeof message.channel === "string"
    && typeof message.canId === "string"
    && Array.isArray(message.data)
    && message.data.every((byte) => typeof byte === "string")
  )
}

export default function RealLabTerminal({
  labId,
  clearSignal,
  reconnectSignal,
  pendingCommand,
  onCommandHandled,
  onCommandObserved,
  onCanFrame,
  onStatusChange,
}: RealLabTerminalProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Xterm | null>(null)
  const socketRef = useRef<WebSocket | null>(null)
  const sendCommandRef = useRef<(command: string) => boolean>(() => false)
  const clearSignalRef = useRef(clearSignal)
  const onCommandHandledRef = useRef(onCommandHandled)
  const onCommandObservedRef = useRef(onCommandObserved)
  const onCanFrameRef = useRef(onCanFrame)
  const onStatusChangeRef = useRef(onStatusChange)
  const [status, setStatus] = useState<LabTerminalStatus>("connecting")

  onCommandHandledRef.current = onCommandHandled
  onCommandObservedRef.current = onCommandObserved
  onCanFrameRef.current = onCanFrame
  onStatusChangeRef.current = onStatusChange

  useEffect(() => {
    if (clearSignalRef.current === clearSignal) return
    clearSignalRef.current = clearSignal
    terminalRef.current?.clear()
    const socket = socketRef.current
    if (socket?.readyState === 1) socket.send(new TextEncoder().encode("\x0c"))
  }, [clearSignal])

  useEffect(() => {
    if (!pendingCommand || status !== "open") return
    if (sendCommandRef.current(pendingCommand)) onCommandHandledRef.current?.()
  }, [pendingCommand, status])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const terminal = new Xterm({
      allowTransparency: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily:
        '"JetBrains Mono Variable", "Noto Sans KR Variable", monospace',
      fontSize: 12,
      lineHeight: 1.35,
      scrollback: 5000,
      theme: {
        background: "#0d1715",
        black: "#26342f",
        blue: "#8daaba",
        brightBlack: "#70817a",
        brightBlue: "#aabec9",
        brightCyan: "#9bc7be",
        brightGreen: "#a9c9ad",
        brightMagenta: "#c2b1c8",
        brightRed: "#d6a096",
        brightWhite: "#edf2ee",
        brightYellow: "#d9c494",
        cursor: "#d7e3db",
        cyan: "#78aaa0",
        foreground: "#d4ded7",
        green: "#86b393",
        magenta: "#aa9aae",
        red: "#c9857c",
        selectionBackground: "#324b44",
        white: "#c7d1cb",
        yellow: "#bfa86f",
      },
    })
    const fitAddon = new FitAddon()
    const updateStatus = (nextStatus: LabTerminalStatus) => {
      setStatus(nextStatus)
      onStatusChangeRef.current?.(nextStatus)
    }

    terminal.loadAddon(fitAddon)
    terminal.open(mount)
    terminalRef.current = terminal
    terminal.writeln("\x1b[38;2;132;183;157m격리된 CANLite Linux Lab에 연결 중...\x1b[0m")
    updateStatus("connecting")

    if (typeof WebSocket === "undefined") {
      terminal.writeln("\x1b[31m[offline] 이 브라우저에서는 WebSocket을 사용할 수 없습니다.\x1b[0m")
      updateStatus("offline")
      return () => {
        terminal.dispose()
        if (terminalRef.current === terminal) terminalRef.current = null
      }
    }

    const socket = new WebSocket(terminalSocketUrl(labId))
    const encoder = new TextEncoder()
    socket.binaryType = "arraybuffer"
    socketRef.current = socket
    let observedLine = ""
    let disposed = false

    const observeInput = (data: string) => {
      if (data.startsWith("\x1b")) return
      for (const character of data) {
        if (character === "\r" || character === "\n") {
          const command = observedLine.trim()
          observedLine = ""
          if (command) onCommandObservedRef.current?.(command)
        } else if (character === "\u007f" || character === "\b") {
          observedLine = observedLine.slice(0, -1)
        } else if (character === "\u0003") {
          observedLine = ""
        } else if (character >= " ") {
          observedLine += character
        }
      }
    }

    const sendInput = (data: string) => {
      if (socket.readyState !== WebSocket.OPEN) return false
      socket.send(encoder.encode(data))
      return true
    }

    sendCommandRef.current = (command) => {
      if (!sendInput(`${command}\r`)) return false
      onCommandObservedRef.current?.(command)
      return true
    }

    const fitTerminal = () => {
      try {
        fitAddon.fit()
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({
            type: "resize",
            cols: terminal.cols,
            rows: terminal.rows,
          }))
        }
      } catch {
        // 접힌 탭은 너비가 0일 수 있다. ResizeObserver가 보이는 시점에 재시도한다.
      }
    }

    socket.addEventListener("open", () => {
      if (disposed) return
      updateStatus("open")
      fitTerminal()
      terminal.focus()
    })
    socket.addEventListener("message", (event) => {
      if (disposed) return
      if (typeof event.data === "string") {
        try {
          const message: unknown = JSON.parse(event.data)
          if (isCanFrameMessage(message)) {
            void onCanFrameRef.current?.({
              channel: message.channel,
              canId: message.canId,
              data: message.data,
            })
          }
        } catch {
          terminal.write(event.data)
        }
        return
      }

      if (event.data instanceof ArrayBuffer) {
        terminal.write(new Uint8Array(event.data))
        return
      }

      if (event.data instanceof Blob) {
        void event.data.arrayBuffer().then((buffer) => {
          if (!disposed) terminal.write(new Uint8Array(buffer))
        })
      }
    })
    socket.addEventListener("close", () => {
      if (disposed) return
      updateStatus("offline")
      terminal.writeln("\r\n\x1b[31m[offline] 실습 쉘 연결이 종료되었습니다. 재연결을 눌러주세요.\x1b[0m")
    })

    const inputSubscription = terminal.onData((data) => {
      if (!sendInput(data)) return
      observeInput(data)
    })
    const resizeObserver = new ResizeObserver(fitTerminal)
    resizeObserver.observe(mount)
    window.requestAnimationFrame(fitTerminal)

    return () => {
      disposed = true
      resizeObserver.disconnect()
      inputSubscription.dispose()
      sendCommandRef.current = () => false
      socket.close()
      terminal.dispose()
      if (socketRef.current === socket) socketRef.current = null
      if (terminalRef.current === terminal) terminalRef.current = null
    }
  }, [labId, reconnectSignal])

  return (
    <div
      className="canlab__shell-terminal"
      aria-label="실제 Linux CAN 실습 터미널"
      ref={mountRef}
    />
  )
}
