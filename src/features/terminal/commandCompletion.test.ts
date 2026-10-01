import { describe, expect, it } from "vitest"
import { completeCommand } from "./commandCompletion"

const candidates = ["candump vcan0", "candump -L vcan0", "cansend vcan0 ", "cat capture.log"]

describe("completeCommand", () => {
  it("completes a unique match to the full command", () => {
    expect(completeCommand("cans", candidates)).toEqual({
      value: "cansend vcan0 ",
      matches: ["cansend vcan0 "],
    })
  })

  it("extends to the longest shared prefix and reports every match", () => {
    expect(completeCommand("ca", candidates)).toEqual({
      value: "ca",
      matches: candidates,
    })
    expect(completeCommand("cand", candidates)).toEqual({
      value: "candump ",
      matches: ["candump vcan0", "candump -L vcan0"],
    })
  })

  it("ignores case but keeps the candidate spelling", () => {
    expect(completeCommand("CAT", candidates).value).toBe("cat capture.log")
  })

  it("leaves unknown or already complete input unchanged", () => {
    expect(completeCommand("rm", candidates)).toEqual({ value: "rm", matches: [] })
    expect(completeCommand("cat capture.log", candidates)).toEqual({
      value: "cat capture.log",
      matches: [],
    })
  })
})
