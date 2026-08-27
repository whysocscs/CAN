// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { useEffect, type ReactNode } from "react"
import { cleanup, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as THREE from "three"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const normalState = vi.hoisted(() => ({
  canvasMounts: 0,
  canvasProps: undefined as Record<string, unknown> | undefined,
  orbitProps: undefined as Record<string, unknown> | undefined,
  camera: undefined as THREE.PerspectiveCamera | undefined,
  controls: undefined as
    | { target: THREE.Vector3; update: ReturnType<typeof vi.fn> }
    | undefined,
  overviewResets: [] as Array<{
    camera: [number, number, number]
    target: [number, number, number]
  }>,
  useGLTF: vi.fn(),
}))

vi.mock("@xterm/xterm", () => ({ Terminal: vi.fn() }))
vi.mock("@xterm/addon-fit", () => ({ FitAddon: vi.fn() }))

vi.mock("@react-three/fiber", async () => {
  const React = await import("react")
  return {
    Canvas: ({
      children,
      ...props
    }: {
      children: ReactNode
    }) => {
      useEffect(() => {
        normalState.canvasMounts += 1
      }, [])
      normalState.canvasProps = props
      const renderedChildren = React.Children.toArray(children).filter(
        (child) =>
          !React.isValidElement(child) || typeof child.type !== "string",
      )
      return <div data-testid="normal-can-canvas">{renderedChildren}</div>
    },
    useThree: (selector: (state: unknown) => unknown) =>
      selector({ camera: normalState.camera, controls: normalState.controls }),
  }
})

vi.mock("@react-three/drei", async () => {
  const React = await import("react")
  const Wrapper = ({ children }: { children?: ReactNode }) => (
    <div>{children}</div>
  )
  const boundsApi = {
    refresh: vi.fn(() => {
      normalState.overviewResets.push({
        camera: normalState.camera!.position.toArray(),
        target: normalState.controls!.target.toArray(),
      })
      return boundsApi
    }),
    reset: vi.fn(),
    fit: vi.fn(),
  }
  boundsApi.reset.mockReturnValue(boundsApi)
  boundsApi.fit.mockReturnValue(boundsApi)
  return {
    Bounds: Wrapper,
    Center: Wrapper,
    Html: Wrapper,
    Line: () => null,
    OrbitControls: (props: Record<string, unknown>) => {
      normalState.orbitProps = props
      return null
    },
    useBounds: () => boundsApi,
    useGLTF: Object.assign(normalState.useGLTF, { preload: vi.fn() }),
  }
})

import { SHARED_VEHICLE_MODEL_PATH } from "@/features/vehicle/SharedVehicleScene"
import CanPracticeOnlyPage from "./CanPracticeOnlyPage"

describe("CanPracticeOnlyPage vehicle scene", () => {
  const clonedScenes: THREE.Group[] = []
  let sourceMaterial: THREE.MeshStandardMaterial

  beforeEach(() => {
    normalState.canvasMounts = 0
    normalState.canvasProps = undefined
    normalState.orbitProps = undefined
    normalState.camera = new THREE.PerspectiveCamera()
    normalState.camera.position.set(-3, 2, 8)
    normalState.controls = { target: new THREE.Vector3(), update: vi.fn() }
    normalState.overviewResets = []
    normalState.useGLTF.mockReset()
    clonedScenes.length = 0
    sourceMaterial = new THREE.MeshStandardMaterial({ color: "#334455" })
    const sourceScene = new THREE.Group()
    const sourceMesh = new THREE.Mesh(new THREE.BoxGeometry(), sourceMaterial)
    sourceMesh.name = "BODY_SHELL"
    sourceScene.add(sourceMesh)
    vi.spyOn(sourceScene, "clone").mockImplementation(() => {
      const clone = new THREE.Group()
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(), sourceMaterial)
      mesh.name = "BODY_SHELL"
      clone.add(mesh)
      clonedScenes.push(clone)
      return clone
    })
    normalState.useGLTF.mockReturnValue({ scene: sourceScene })
    vi.stubGlobal(
      "matchMedia",
      vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    )
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("turns xray off truthfully while preserving labels, bus, auto-rotate, and reset controls", async () => {
    const user = userEvent.setup()
    render(<CanPracticeOnlyPage />)
    const labels = screen.getByRole("button", { name: /ECU Name/ })
    const bus = screen.getByRole("button", { name: /CAN Bus/ })
    const rotation = screen.getByRole("button", { name: "회전" })
    const reset = screen.getByRole("button", { name: /Reset View/ })

    expect(labels).toHaveAttribute("aria-pressed", "true")
    expect(bus).toHaveAttribute("aria-pressed", "true")
    expect(normalState.useGLTF).toHaveBeenCalledWith(
      SHARED_VEHICLE_MODEL_PATH,
    )
    expect(normalState.canvasProps).toMatchObject({
      shadows: true,
      dpr: [1, 1.5],
      camera: {
        position: [5.8, 3.8, 7.6],
        fov: 38,
        near: 0.05,
        far: 100,
      },
    })
    expect(normalState.orbitProps).toMatchObject({
      makeDefault: true,
      minDistance: 3,
      maxDistance: 10,
      minPolarAngle: 0.32,
      maxPolarAngle: Math.PI - 0.32,
    })
    const initialMesh = clonedScenes[0]?.getObjectByName("BODY_SHELL") as
      | THREE.Mesh
      | undefined
    expect(initialMesh?.material).toMatchObject({
      transparent: true,
      opacity: 0.4,
    })

    await user.click(labels)
    await user.click(bus)

    expect(labels).toHaveAttribute("aria-pressed", "false")
    expect(bus).toHaveAttribute("aria-pressed", "false")
    const opaqueMesh = clonedScenes.at(-1)?.getObjectByName("BODY_SHELL") as
      | THREE.Mesh
      | undefined
    expect(opaqueMesh?.material).not.toBe(sourceMaterial)
    expect(opaqueMesh?.material).toMatchObject({
      transparent: false,
      opacity: 1,
      depthWrite: true,
    })
    expect(sourceMaterial).toMatchObject({ transparent: false, opacity: 1 })

    await user.click(rotation)
    expect(rotation).toHaveAttribute("aria-pressed", "true")
    expect(normalState.orbitProps?.autoRotate).toBe(true)

    await waitFor(() => expect(normalState.overviewResets).toHaveLength(1))
    normalState.camera!.position.set(-9, 1, 2)
    normalState.controls!.target.set(3, 2, 1)
    await user.click(reset)
    await waitFor(() => expect(normalState.overviewResets).toHaveLength(2))
    expect(normalState.camera!.position.toArray()).toEqual([5.8, 3.8, 7.6])
    expect(normalState.controls!.target.toArray()).toEqual([0, 0, 0])
    expect(normalState.canvasMounts).toBe(1)
    expect(rotation).toHaveAttribute("aria-pressed", "true")
  })
})
