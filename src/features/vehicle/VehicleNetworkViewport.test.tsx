// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { useEffect, type ReactNode } from "react"
import {
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
  return {
    Bounds: Wrapper,
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

import VehicleNetworkViewport from "./VehicleNetworkViewport"

function renderDoorViewport() {
  return render(
    <VehicleNetworkViewport
      route={["obd", "ids", "gateway", "body", "leftDoor"]}
      targetId="body"
      effectId="leftDoor"
      scenarioTitle="Door spoofing route"
      accent="#d94b4b"
    />,
  )
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
