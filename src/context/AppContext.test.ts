// @vitest-environment jsdom

import { describe, expect, it } from "vitest"
import { routeForCanBasicsHash } from "./AppContext"

describe("routeForCanBasicsHash", () => {
  it("restores every CAN basics lesson from its concept hash", () => {
    expect(routeForCanBasicsHash("#why-can/2")).toBe("can-basics/protocol")
    expect(routeForCanBasicsHash("#frame-control-data")).toBe(
      "can-basics/frame",
    )
    expect(routeForCanBasicsHash("#gateway-routing-policy")).toBe(
      "can-basics/ecu",
    )
    expect(routeForCanBasicsHash("#unrelated")).toBeNull()
  })
})
