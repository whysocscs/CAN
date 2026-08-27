import { useEffect, useRef } from "react"
import { FitAddon } from "@xterm/addon-fit"
import { Terminal as Xterm } from "@xterm/xterm"
import "@xterm/xterm/css/xterm.css"

interface CanCommandTerminalProps {
  clearSignal: number
  onCommand: (command: string) => Promise<string[]>
}

/**
 * 정상 CAN 실습의 명령 입력기다.
 *
 * 이 컴포넌트는 xterm의 입력·크기·정리만 맡는다. 명령의 허용 범위와 CAN API
 * 호출은 페이지가 결정하므로, 여기에서 문자열을 셸로 실행하지 않는다.
 */
export default function CanCommandTerminal({
  clearSignal,
  onCommand,
}: CanCommandTerminalProps) {
  const mountRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Xterm | null>(null)
  const onCommandRef = useRef(onCommand)

  // 콜백이 바뀔 때마다 xterm을 재생성하면 입력 중인 줄과 스크롤이 사라진다.
  onCommandRef.current = onCommand

  useEffect(() => {
    terminalRef.current?.clear()
    terminalRef.current?.write("$ ")
  }, [clearSignal])

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const terminal = new Xterm({
      allowTransparency: false,
      convertEol: true,
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
    let commandLine = ""
    let running = false

    terminal.loadAddon(fitAddon)
    terminal.open(mount)
    terminalRef.current = terminal
    terminal.writeln("\x1b[38;2;132;183;157mCANLite 교육용 CAN Terminal\x1b[0m")
    terminal.writeln(
      "\x1b[38;2;153;171;163m명령 예: cansend vcan0 101#00\x1b[0m",
    )
    terminal.write("$ ")

    const fitTerminal = () => {
      try {
        fitAddon.fit()
      } catch {
        // 접힌 탭은 너비가 0일 수 있다. 다시 보일 때 ResizeObserver가 재시도한다.
      }
    }

    const inputSubscription = terminal.onData((data) => {
      // 한 명령의 응답이 끝나기 전에 다음 명령을 섞으면 프롬프트 순서가 틀어진다.
      if (running) return

      if (data === "\r") {
        const command = commandLine.trim()
        terminal.write("\r\n")
        commandLine = ""
        if (!command) {
          terminal.write("$ ")
          return
        }

        running = true
        void onCommandRef
          .current(command)
          .then((lines) => lines.forEach((line) => terminal.writeln(line)))
          .catch(() =>
            terminal.writeln(
              "\x1b[31m[error] 명령 처리 중 오류가 발생했습니다.\x1b[0m",
            ),
          )
          .finally(() => {
            running = false
            terminal.write("$ ")
          })
        return
      }

      if (data === "\u007f") {
        if (commandLine.length > 0) {
          commandLine = commandLine.slice(0, -1)
          terminal.write("\b \b")
        }
        return
      }

      if (data >= " ") {
        commandLine += data
        terminal.write(data)
      }
    })
    const resizeObserver = new ResizeObserver(fitTerminal)
    resizeObserver.observe(mount)
    window.requestAnimationFrame(() => {
      fitTerminal()
      terminal.focus()
    })

    return () => {
      resizeObserver.disconnect()
      inputSubscription.dispose()
      terminal.dispose()
      if (terminalRef.current === terminal) terminalRef.current = null
    }
  }, [])

  return (
    <div
      className="canlab__shell-terminal"
      aria-label="교육용 CAN 명령 터미널"
      ref={mountRef}
    />
  )
}
