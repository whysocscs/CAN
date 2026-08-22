// @vitest-environment jsdom

import { cleanup, render, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const canvasState = vi.hoisted(() => ({
  shadows: undefined as unknown,
  orbitProps: undefined as Record<string, unknown> | undefined,
}))

interface CanvasMockProps {
  children: unknown
  shadows: unknown
}

vi.mock("@react-three/fiber", () => ({
  Canvas: ({ children, shadows }: CanvasMockProps) => {
    const findOrbitControls = (
      node: unknown,
    ): Record<string, unknown> | undefined => {
      if (Array.isArray(node)) {
        for (const child of node) {
          const found = findOrbitControls(child)
          if (found) return found
        }
        return undefined
      }
      if (!node || typeof node !== "object" || !("props" in node))
        return undefined
      const element = node as {
        type?: unknown
        props: Record<string, unknown> & { children?: unknown }
      }
      if (element.type === "mock-orbit-controls") return element.props
      const nested = element.props.children
      const candidates = Array.isArray(nested) ? nested : [nested]
      for (const child of candidates) {
        const found = findOrbitControls(child)
        if (found) return found
      }
      return undefined
    }
    canvasState.shadows = shadows
    canvasState.orbitProps = findOrbitControls(children)
    return <div data-testid="canvas-boundary" />
  },
}))

vi.mock("@react-three/drei", () => ({
  Bounds: "mock-bounds",
  Center: "mock-center",
  Html: "mock-html",
  Line: "mock-line",
  OrbitControls: "mock-orbit-controls",
  useGLTF: vi.fn(),
}))

import DoorAttackVehicle from "./DoorAttackVehicle"

describe("DoorAttackVehicle rendering preferences", () => {
  beforeEach(() => {
    canvasState.shadows = undefined
    canvasState.orbitProps = undefined
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  it("uses basic shadows and disables damping for reduced motion", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))

    render(<DoorAttackVehicle />)

    await waitFor(() =>
      expect(canvasState.orbitProps?.enableDamping).toBe(false),
    )
    expect(canvasState.shadows).toBe("basic")
  })
})
