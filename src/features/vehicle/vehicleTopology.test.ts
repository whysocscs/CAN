import { describe, expect, it } from "vitest"
import { HINGES } from "./hinges"
import { VEHICLE_ROUTES, VEHICLE_TOPOLOGY } from "./vehicleTopology"

describe("vehicle topology contract", () => {
  it("keeps node IDs unique and every supported route reference valid", () => {
    const ids = VEHICLE_TOPOLOGY.map((node) => node.id)
    const knownIds = new Set(ids)

    expect(knownIds.size).toBe(ids.length)
    expect(VEHICLE_ROUTES).toEqual({
      door: ["obd", "ids", "gateway", "body", "leftDoor"],
      spoofing: ["obd", "ids", "gateway", "rear", "tailgate"],
      replay: ["obd", "ids", "gateway", "body", "leftDoor"],
    })
    expect(
      Object.values(VEHICLE_ROUTES)
        .flat()
        .every((id) => knownIds.has(id)),
    ).toBe(true)
  })

  it("distinguishes educational logical anchors from exact GLB effect pivots", () => {
    const logicalNodes = VEHICLE_TOPOLOGY.filter(
      (node) => node.kind === "logical",
    )
    const leftDoor = VEHICLE_TOPOLOGY.find((node) => node.id === "leftDoor")
    const tailgate = VEHICLE_TOPOLOGY.find((node) => node.id === "tailgate")

    expect(logicalNodes).toHaveLength(5)
    expect(logicalNodes.every((node) => node.truth === "toy-logical")).toBe(
      true,
    )
    expect(leftDoor).toMatchObject({
      kind: "effect",
      truth: "glb-effect-anchor",
      anchor: HINGES.doorL.pivot,
    })
    expect(tailgate).toMatchObject({
      kind: "effect",
      truth: "glb-effect-anchor",
      anchor: HINGES.tailgate.pivot,
    })
  })

  it("does not invent OEM mounting locations in learner-facing copy", () => {
    const copy = VEHICLE_TOPOLOGY.map((node) =>
      [node.label, node.role, node.truthDetail].join(" "),
    ).join(" ")

    expect(copy).not.toMatch(
      /driver footwell|B-pillar|centre tunnel|center tunnel|rear floor|운전석 발밑|B필러|센터 터널|리어 플로어/i,
    )
  })

  it("maps compact callout labels only to scenario targets and effects", () => {
    expect(
      VEHICLE_TOPOLOGY.map(({ id, calloutLabel }) => [id, calloutLabel]),
    ).toEqual([
      ["obd", undefined],
      ["ids", undefined],
      ["gateway", undefined],
      ["body", "Toy Body ECU"],
      ["rear", "Toy Rear ECU"],
      ["leftDoor", "GLB Left Door"],
      ["tailgate", "GLB Tailgate"],
    ])
  })
})
