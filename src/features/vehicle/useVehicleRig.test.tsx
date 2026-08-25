// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as THREE from "three"
import { HINGES } from "./hinges"
import { vehicle } from "./vehicleStore"

const fiber = vi.hoisted(() => ({
  frame: undefined as ((state: unknown, delta: number) => void) | undefined,
}))

vi.mock("@react-three/fiber", () => ({
  useFrame: (callback: (state: unknown, delta: number) => void) => {
    fiber.frame = callback
  },
}))

import { useVehicleRig } from "./useVehicleRig"

describe("useVehicleRig reduced-motion mode", () => {
  beforeEach(() => {
    fiber.frame = undefined
    vehicle.reset()
  })

  afterEach(() => cleanup())

  it("applies the target rotation immediately when easing is disabled", () => {
    const scene = new THREE.Scene()

    function ImmediateProbe() {
      useVehicleRig(scene, { immediate: true })
      return null
    }

    render(<ImmediateProbe />)
    vehicle.openDoor("L")
    fiber.frame?.({}, 0.001)

    expect(scene.getObjectByName("HINGE_doorL")?.rotation.y).toBeCloseTo(
      HINGES.doorL.openAngle,
    )
  })

  it("preserves the numeric stiffness overload for existing callers", () => {
    const scene = new THREE.Scene()

    function EasedProbe() {
      useVehicleRig(scene, 6)
      return null
    }

    render(<EasedProbe />)
    vehicle.openDoor("L")
    fiber.frame?.({}, 0.001)

    const angle = scene.getObjectByName("HINGE_doorL")?.rotation.y ?? 0
    expect(angle).toBeGreaterThan(0)
    expect(angle).toBeLessThan(HINGES.doorL.openAngle)
  })
})
