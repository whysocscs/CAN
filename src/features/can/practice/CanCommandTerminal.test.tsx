// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const terminalState = vi.hoisted(() => ({
  handler: null as ((data: string) => void) | null,
  fit: vi.fn(),
  loadAddon: vi.fn(),
  open: vi.fn(),
  clear: vi.fn(),
  write: vi.fn(),
  writeln: vi.fn(),
  focus: vi.fn(),
  inputDispose: vi.fn(),
  dispose: vi.fn(),
}))

vi.mock("@xterm/xterm", () => ({
  Terminal: class Terminal {
    loadAddon = terminalState.loadAddon
    open = terminalState.open
    clear = terminalState.clear
    write = terminalState.write
    writeln = terminalState.writeln
    focus = terminalState.focus
    dispose = terminalState.dispose

    onData(handler: (data: string) => void) {
      terminalState.handler = handler
      return { dispose: terminalState.inputDispose }
    }
  },
}))

vi.mock("@xterm/addon-fit", () => ({
  FitAddon: class FitAddon {
    fit = terminalState.fit
  },
}))

import CanCommandTerminal from "./CanCommandTerminal"

describe("CanCommandTerminal", () => {
  beforeEach(() => {
    terminalState.handler = null
    Object.values(terminalState).forEach((value) => {
      if (typeof value === "function" && "mockClear" in value) value.mockClear()
    })
    vi.stubGlobal(
      "ResizeObserver",
      class ResizeObserver {
        observe() {}
        disconnect() {}
      },
    )
    vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("keeps xterm lifecycle separate while forwarding one complete command", async () => {
    const onCommand = vi.fn(async () => ["vcan0 is available"])
    const { rerender, unmount } = render(
      <CanCommandTerminal clearSignal={0} onCommand={onCommand} />,
    )

    expect(terminalState.open).toHaveBeenCalledOnce()
    expect(terminalState.fit).toHaveBeenCalled()

    act(() => {
      terminalState.handler?.("p")
      terminalState.handler?.("w")
      terminalState.handler?.("d")
      terminalState.handler?.("\r")
    })

    await waitFor(() => expect(onCommand).toHaveBeenCalledWith("pwd"))
    await waitFor(() => {
      expect(terminalState.writeln).toHaveBeenCalledWith("vcan0 is available")
    })

    rerender(<CanCommandTerminal clearSignal={1} onCommand={onCommand} />)
    expect(terminalState.clear).toHaveBeenCalledOnce()
    expect(terminalState.write).toHaveBeenCalledWith("$ ")

    unmount()
    expect(terminalState.inputDispose).toHaveBeenCalledOnce()
    expect(terminalState.dispose).toHaveBeenCalledOnce()
  })
})
