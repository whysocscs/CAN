// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { useEffect, type ReactNode } from "react"
import {
  act,
  cleanup,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import * as THREE from "three"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const scene = new THREE.Group()
const canvasState = vi.hoisted(() => ({
  mounts: 0,
  camera: undefined as THREE.PerspectiveCamera | undefined,
  controls: undefined as {
    target: THREE.Vector3
    update: ReturnType<typeof vi.fn>
  } | undefined,
  frameCallbacks: [] as Array<(state: unknown, delta: number) => void>,
  orbitProps: undefined as Record<string, unknown> | undefined,
  boundsRefit: undefined as (() => void) | undefined,
}))
const gltf = vi.hoisted(() => ({ useGLTF: vi.fn() }))

vi.mock("@react-three/fiber", async () => {
  const React = await import("react")
  return {
    Canvas: ({ children }: { children: ReactNode }) => {
      useEffect(() => {
        canvasState.mounts += 1
      }, [])
      const sceneChildren = React.Children.toArray(children).slice(5)
      return React.createElement(
        "div",
        { "data-testid": "canvas-boundary" },
        sceneChildren,
      )
    },
    useFrame: (callback: (state: unknown, delta: number) => void) => {
      canvasState.frameCallbacks.push(callback)
    },
    useThree: (selector: (state: unknown) => unknown) =>
      selector({ camera: canvasState.camera, controls: canvasState.controls }),
  }
})

vi.mock("@react-three/drei", async () => {
  const React = await import("react")
  const Wrapper = ({ children }: { children?: ReactNode }) =>
    React.createElement("div", null, children)
  const Bounds = ({ children }: { children?: ReactNode }) => {
    useEffect(() => {
      canvasState.boundsRefit = () => {
        canvasState.camera?.position.set(9, 9, 9)
        canvasState.controls?.target.set(9, 9, 9)
      }
      return () => {
        canvasState.boundsRefit = undefined
      }
    }, [])
    return React.createElement("div", null, children)
  }
  return {
    Bounds,
    Html: Wrapper,
    Line: () => null,
    OrbitControls: (props: Record<string, unknown>) => {
      canvasState.orbitProps = props
      return null
    },
    useGLTF: gltf.useGLTF,
  }
})

vi.mock("./useVehicleRig", () => ({ useVehicleRig: vi.fn() }))

import VehicleNetworkViewport, {
  type VehicleNetworkViewportProps,
} from "./VehicleNetworkViewport"

function renderDoorViewport(props: Partial<VehicleNetworkViewportProps> = {}) {
  const defaultProps = {
    route: ["obd", "ids", "gateway", "body", "leftDoor"],
    targetId: "body",
    effectId: "leftDoor",
    scenarioTitle: "Door spoofing route",
    accent: "#d94b4b",
  } satisfies VehicleNetworkViewportProps

  return render(<VehicleNetworkViewport {...defaultProps} {...props} />)
}

describe("VehicleNetworkViewport", () => {
  beforeEach(() => {
    scene.clear()
    gltf.useGLTF.mockReset()
    gltf.useGLTF.mockReturnValue({ scene })
    canvasState.mounts = 0
    canvasState.camera = new THREE.PerspectiveCamera()
    canvasState.camera.position.set(-5.6, 3.1, 7.2)
    canvasState.controls = { target: new THREE.Vector3(), update: vi.fn() }
    canvasState.frameCallbacks = []
    canvasState.orbitProps = undefined
    canvasState.boundsRefit = undefined
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("renders number-only Canvas pins and complete truthful descriptions outside Canvas", () => {
    renderDoorViewport()

    const canvas = screen.getByTestId("canvas-boundary")
    const pins = within(canvas).getAllByTestId("vehicle-topology-pin")
    expect(pins).toHaveLength(5)
    expect(pins.map((pin) => pin.textContent)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
    ])
    expect(
      within(canvas).queryByText("프레임 관찰/규칙 판정"),
    ).not.toBeInTheDocument()

    const targetMap = screen.getByRole("list", {
      name: "Door spoofing route target map",
    })
    expect(within(targetMap).getByText("Training OBD-II")).toBeInTheDocument()
    expect(within(targetMap).getByText("Toy Body ECU")).toBeInTheDocument()
    expect(within(targetMap).getByText("Left Door Effect")).toBeInTheDocument()
    expect(
      within(targetMap).getAllByText("교육용 논리 위치 · 실제 OEM 배치 아님"),
    ).toHaveLength(4)
    expect(
      within(targetMap).getByText("GLB 동작 기준점 · 실제 actuator 위치 아님"),
    ).toBeInTheDocument()
  })

  it("renders exactly the scenario target and effect as visual-only door callouts", () => {
    renderDoorViewport()

    const canvas = screen.getByTestId("canvas-boundary")
    const callouts = within(canvas).getAllByTestId("vehicle-topology-callout")

    expect(callouts).toHaveLength(2)
    expect(
      callouts.map((callout) => callout.getAttribute("data-kind")),
    ).toEqual(["target", "effect"])
    expect(callouts[0]).toHaveTextContent("Toy Body ECU")
    expect(callouts[0]).toHaveTextContent("Target ECU · 교육용 위치")
    expect(callouts[0]).toHaveAttribute("data-placement", "target-far-left")
    expect(callouts[1]).toHaveTextContent("GLB Left Door")
    expect(callouts[1]).toHaveTextContent("영향 부위")
    expect(callouts[1]).toHaveAttribute("data-placement", "effect-near-right")
    expect(
      callouts.every(
        (callout) => callout.getAttribute("aria-hidden") === "true",
      ),
    ).toBe(true)
    expect(within(canvas).queryByText("Toy Rear ECU")).not.toBeInTheDocument()
    expect(within(canvas).queryByText("GLB Tailgate")).not.toBeInTheDocument()
  })

  it("switches spoofing callouts to the rear target and tailgate effect only", () => {
    renderDoorViewport({
      route: ["obd", "ids", "gateway", "rear", "tailgate"],
      targetId: "rear",
      effectId: "tailgate",
      scenarioTitle: "Spoofing route",
    })

    const canvas = screen.getByTestId("canvas-boundary")
    const callouts = within(canvas).getAllByTestId("vehicle-topology-callout")

    expect(callouts).toHaveLength(2)
    expect(callouts[0]).toHaveAttribute("data-kind", "target")
    expect(callouts[0]).toHaveTextContent("Toy Rear ECU")
    expect(callouts[0]).toHaveTextContent("Target ECU · 교육용 위치")
    expect(callouts[1]).toHaveAttribute("data-kind", "effect")
    expect(callouts[1]).toHaveTextContent("GLB Tailgate")
    expect(callouts[1]).toHaveTextContent("영향 부위")
    expect(within(canvas).queryByText("Toy Body ECU")).not.toBeInTheDocument()
    expect(within(canvas).queryByText("GLB Left Door")).not.toBeInTheDocument()
  })

  it("keeps callout identity independent of camera and focused node changes", async () => {
    const user = userEvent.setup()
    const view = renderDoorViewport()
    const canvas = screen.getByTestId("canvas-boundary")
    const calloutCopy = () =>
      within(canvas)
        .getAllByTestId("vehicle-topology-callout")
        .map((callout) => callout.textContent)

    expect(calloutCopy()).toEqual([
      "Toy Body ECUTarget ECU · 교육용 위치",
      "GLB Left Door영향 부위",
    ])

    await user.click(screen.getByRole("button", { name: "진입점" }))
    expect(calloutCopy()).toEqual([
      "Toy Body ECUTarget ECU · 교육용 위치",
      "GLB Left Door영향 부위",
    ])

    view.rerender(
      <VehicleNetworkViewport
        route={["obd", "ids", "gateway", "body", "leftDoor"]}
        targetId="body"
        effectId="leftDoor"
        focusedNodeId="ids"
        scenarioTitle="Door spoofing route"
        accent="#d94b4b"
      />,
    )
    expect(calloutCopy()).toEqual([
      "Toy Body ECUTarget ECU · 교육용 위치",
      "GLB Left Door영향 부위",
    ])
  })

  it("changes focus presets and resets without remounting Canvas", async () => {
    const user = userEvent.setup()
    renderDoorViewport()
    await waitFor(() => expect(canvasState.mounts).toBe(1))

    await user.click(screen.getByRole("button", { name: "Target ECU" }))
    expect(
      screen.getByRole("region", {
        name: "Door spoofing route vehicle network",
      }),
    ).toHaveAttribute("data-camera-preset", "target")

    await user.click(screen.getByRole("button", { name: "영향 부위" }))
    expect(screen.getByRole("button", { name: "영향 부위" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )

    await user.click(screen.getByRole("button", { name: "카메라 초기화" }))
    expect(
      screen.getByRole("region", {
        name: "Door spoofing route vehicle network",
      }),
    ).toHaveAttribute("data-camera-preset", "overview")
    expect(canvasState.mounts).toBe(1)
  })

  it("applies camera focus immediately and disables damping for reduced motion", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    const user = userEvent.setup()
    renderDoorViewport()
    const overviewPosition = canvasState.camera!.position.clone()

    await user.click(screen.getByRole("button", { name: "진입점" }))

    expect(canvasState.camera!.position.equals(overviewPosition)).toBe(false)
    expect(canvasState.orbitProps?.enableDamping).toBe(false)
  })

  it("keeps the selected camera target when the viewport is refit", async () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    const user = userEvent.setup()
    renderDoorViewport()

    await user.click(screen.getByRole("button", { name: "Target ECU" }))
    const selectedTarget = canvasState.controls!.target.clone()
    expect(selectedTarget.equals(new THREE.Vector3(9, 9, 9))).toBe(false)

    act(() => canvasState.boundsRefit?.())

    expect(canvasState.controls!.target.equals(selectedTarget)).toBe(true)
  })

  it.each([
    ["ids", [0.447, 0.55, -0.761]],
    ["gateway", [0.165, 0.72, 0.18]],
  ] as const)(
    "focuses and highlights the intermediate %s node at its rotated anchor",
    async (nodeId, expectedTarget) => {
      vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
          matches: true,
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
        }))
      renderDoorViewport({ focusedNodeId: nodeId })

      await waitFor(() =>
        expect(canvasState.controls!.target.x).toBeCloseTo(
          expectedTarget[0],
          3,
        ),
      )
      expect(canvasState.controls!.target.y).toBeCloseTo(expectedTarget[1], 3)
      expect(canvasState.controls!.target.z).toBeCloseTo(expectedTarget[2], 3)
      expect(
        screen.getByRole("region", {
          name: "Door spoofing route vehicle network",
        }),
      ).toHaveAttribute("data-camera-preset", `node:${nodeId}`)
      expect(
        screen
          .getByText(nodeId === "ids" ? "Toy IDS" : "Toy Gateway")
          .closest("li"),
      ).toHaveAttribute("data-active", "true")
    },
  )

  it("retains accessible loading and GLB error fallbacks", async () => {
    const never = new Promise<never>(() => undefined)
    gltf.useGLTF.mockImplementation(() => {
      throw never
    })
    const loadingView = renderDoorViewport()
    expect(await screen.findByRole("status")).toHaveTextContent(
      "GLB 불러오는 중",
    )
    loadingView.unmount()

    vi.spyOn(console, "error").mockImplementation(() => undefined)
    gltf.useGLTF.mockReset()
    gltf.useGLTF.mockImplementation(() => {
      throw new Error("broken model")
    })
    renderDoorViewport()
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "GLB 차량 시각화를 불러오지 못했습니다.",
    )
  })
})
