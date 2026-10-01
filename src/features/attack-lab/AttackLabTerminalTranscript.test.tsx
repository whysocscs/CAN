// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { cleanup, render, screen, within } from "@testing-library/react"
import { afterEach, describe, expect, it } from "vitest"
import type { AttackLabTerminalTranscript as TranscriptEntry } from "./attackLabFeedback"
import AttackLabTerminalTranscript from "./AttackLabTerminalTranscript"

describe("AttackLabTerminalTranscript", () => {
  afterEach(cleanup)

  it("renders stdout, silent cansend, and stderr from the classified stream only", () => {
    const entries: TranscriptEntry[] = [
      {
        command: "candump -L vcan0",
        stream: "stdout",
        text: "(1721000000.100000) vcan0 701#00",
      },
      {
        command: "cansend vcan0 learner-frame",
        stream: "silent",
        text: "",
      },
      {
        command: "canplayer -I missing.log -l 1",
        stream: "stderr",
        text: "virtual canplayer preflight failed",
      },
    ]

    render(<AttackLabTerminalTranscript entries={entries} />)

    const transcript = screen.getByRole("region", {
      name: "Virtual terminal transcript",
    })
    const rows = within(transcript).getAllByTestId("attack-terminal-entry")
    expect(rows).toHaveLength(3)
    expect(rows[0]).toHaveAttribute("data-stream", "stdout")
    expect(rows[1]).toHaveAttribute("data-stream", "silent")
    expect(rows[2]).toHaveAttribute("data-stream", "stderr")
    expect(rows[1]).toHaveTextContent("$ cansend vcan0 learner-frame")
    expect(rows[1]).not.toHaveTextContent("EXECUTED")
    expect(rows[1]).not.toHaveTextContent("COUNTER_REJECTED")
    expect(rows[2]).toHaveTextContent("virtual canplayer preflight failed")
  })
})
