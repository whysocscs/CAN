import { describe, expect, it } from "vitest"
import { realTerminalEnabled } from "./realTerminalConfig"

describe("real terminal frontend gate", () => {
  it.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["TRUE", true],
    [" true ", true],
  ])("maps %j to %s", (value, expected) => {
    expect(realTerminalEnabled(value)).toBe(expected)
  })
})
