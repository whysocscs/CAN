// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { useEffect, type CSSProperties, type ReactNode } from "react"
import {
  act,
  cleanup,
  fireEvent,
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
  canvasProps: undefined as
    | {
        camera?: {
          position?: [number, number, number]
          fov?: number
          near?: number
          far?: number
        }
        shadows?: boolean | string
      }
    | undefined,
  sceneElements: [] as Array<{
    type: string
    props: Record<string, unknown>
  }>,
  camera: undefined as THREE.PerspectiveCamera | undefined,
  controls: undefined as {
    target: THREE.Vector3
    update: ReturnType<typeof vi.fn>
  } | undefined,
  frameCallbacks: [] as Array<(state: unknown, delta: number) => void>,
  lineProps: [] as Array<{ current: Record<string, unknown> }>,
  orbitProps: undefined as Record<string, unknown> | undefined,
  boundsRefit: undefined as (() => void) | undefined,
  overviewResets: [] as Array<{
    camera: [number, number, number]
    target: [number, number, number]
  }>,
  coordinateRoot: undefined as THREE.Group | undefined,
  centerTransform: {
    enabled: false,
    position: [0, 0, 0] as [number, number, number],
    rotationY: 0,
  },
}))
const gltf = vi.hoisted(() => ({ useGLTF: vi.fn() }))
const vehicleRig = vi.hoisted(() => ({ useVehicleRig: vi.fn() }))

vi.mock("@react-three/fiber", async () => {
  const React = await import("react")
  return {
    Canvas: ({
      children,
      ...props
    }: {
      children: ReactNode
      camera?: {
        position?: [number, number, number]
        fov?: number
        near?: number
        far?: number
      }
      shadows?: boolean | string
    }) => {
      useEffect(() => {
        canvasState.mounts += 1
      }, [])
      canvasState.canvasProps = props
      const allChildren = React.Children.toArray(children)
      canvasState.sceneElements = allChildren.flatMap((child) =>
        React.isValidElement(child) && typeof child.type === "string"
          ? [{
              type: child.type,
              props: child.props as Record<string, unknown>,
            }]
          : [],
      )
      const sceneChildren = allChildren.filter(
        (child) =>
          !React.isValidElement(child) || typeof child.type !== "string",
      )
      return React.createElement(
        "div",
        { "data-testid": "canvas-boundary" },
        sceneChildren,
      )
    },
    useFrame: (callback: (state: unknown, delta: number) => void) => {
      const callbackRef = React.useRef(callback)
      callbackRef.current = callback
      React.useEffect(() => {
        const runFrame = (state: unknown, delta: number) =>
          callbackRef.current(state, delta)
        canvasState.frameCallbacks.push(runFrame)
        return () => {
          canvasState.frameCallbacks = canvasState.frameCallbacks.filter(
            (registered) => registered !== runFrame,
          )
        }
      }, [])
    },
    useThree: (selector: (state: unknown) => unknown) =>
      selector({ camera: canvasState.camera, controls: canvasState.controls }),
  }
})

vi.mock("@react-three/drei", async () => {
  const React = await import("react")
  const THREE = await import("three")
  const Wrapper = ({
    children,
    className,
    style,
  }: {
    children?: ReactNode
    className?: string
    style?: CSSProperties
  }) => React.createElement("div", { className, style }, children)
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
  const boundsApi = {
    refresh: vi.fn(() => {
      canvasState.overviewResets.push({
        camera: canvasState.camera!.position.toArray(),
        target: canvasState.controls!.target.toArray(),
      })
      return boundsApi
    }),
    reset: vi.fn(),
    fit: vi.fn(),
  }
  boundsApi.reset.mockReturnValue(boundsApi)
  boundsApi.fit.mockReturnValue(boundsApi)
  return {
    Bounds,
    Center: ({
      children,
      onCentered,
    }: {
      children?: ReactNode
      onCentered?: () => void
    }) => {
      const centerRoot = React.useMemo(() => new THREE.Group(), [])
      const childrenRef = React.useRef(children)
      childrenRef.current = children
      React.useLayoutEffect(() => {
        const child = React.Children.only(childrenRef.current)
        const object = React.isValidElement(child)
          ? (child.props as { object?: THREE.Group }).object
          : undefined
        if (!object) return
        const transform = canvasState.centerTransform
        const position: [number, number, number] = transform.enabled
          ? transform.position
          : [0, 0, 0]
        centerRoot.position.set(...position)
        centerRoot.rotation.set(
          0,
          transform.enabled ? transform.rotationY : 0,
          0,
        )
        centerRoot.add(object)
        canvasState.coordinateRoot = object
        onCentered?.()
        return () => {
          centerRoot.remove(object)
          if (canvasState.coordinateRoot === object) {
            canvasState.coordinateRoot = undefined
          }
        }
      }, [centerRoot, onCentered])
      return React.createElement("div", null, children)
    },
    Html: Wrapper,
    Line: (props: Record<string, unknown>) => {
      const propsRef = React.useRef(props)
      propsRef.current = props
      React.useEffect(() => {
        canvasState.lineProps.push(propsRef)
        return () => {
          canvasState.lineProps = canvasState.lineProps.filter(
            (registered) => registered !== propsRef,
          )
        }
      }, [])
      return null
    },
    OrbitControls: (props: Record<string, unknown>) => {
      canvasState.orbitProps = props
      return null
    },
    useBounds: () => boundsApi,
    useGLTF: Object.assign(gltf.useGLTF, { preload: vi.fn() }),
  }
})

vi.mock("./useVehicleRig", () => vehicleRig)

import VehicleNetworkViewport, {
  effectTargetFromObject,
  type VehicleNetworkViewportProps,
} from "./VehicleNetworkViewport"
import {
  captureTrace,
  playingDoorSnapshotAtGateway,
  rejectedBodyTrace,
} from "./vehicleFlowTestFixtures"
import type { VehicleFlowTrace } from "./vehicleFlowTypes"

const defaultDoorViewportProps = {
  route: ["obd", "ids", "gateway", "body", "leftDoor"],
  targetId: "body",
  effectId: "leftDoor",
  scenarioTitle: "Door spoofing route",
  accent: "#d94b4b",
} satisfies VehicleNetworkViewportProps

function renderDoorViewport(props: Partial<VehicleNetworkViewportProps> = {}) {
  return render(
    <VehicleNetworkViewport {...defaultDoorViewportProps} {...props} />,
  )
}

function getCanvasMesh(name: string): Element {
  const mesh = screen
    .getByTestId("canvas-boundary")
    .querySelector(`mesh[name="${name}"]`)
  if (!mesh) throw new Error(`Missing Canvas mesh: ${name}`)
  return mesh
}

describe("VehicleNetworkViewport", () => {
  beforeEach(() => {
    scene.clear()
    gltf.useGLTF.mockReset()
    gltf.useGLTF.mockReturnValue({ scene })
    vehicleRig.useVehicleRig.mockReset()
    canvasState.mounts = 0
    canvasState.canvasProps = undefined
    canvasState.sceneElements = []
    canvasState.camera = new THREE.PerspectiveCamera()
    canvasState.camera.position.set(-5.6, 3.1, 7.2)
    canvasState.controls = { target: new THREE.Vector3(), update: vi.fn() }
    canvasState.frameCallbacks = []
    canvasState.lineProps = []
    canvasState.orbitProps = undefined
    canvasState.boundsRefit = undefined
    canvasState.overviewResets = []
    canvasState.coordinateRoot = undefined
    canvasState.centerTransform = {
      enabled: false,
      position: [0, 0, 0],
      rotationY: 0,
    }
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

  it("matches the complete normal CAN scene presentation", () => {
    renderDoorViewport()

    expect(canvasState.canvasProps).toMatchObject({
      shadows: true,
      camera: {
        position: [5.8, 3.8, 7.6],
        fov: 38,
        near: 0.05,
        far: 100,
      },
    })
    expect(
      canvasState.sceneElements.find(({ type }) => type === "color")?.props,
    ).toMatchObject({ attach: "background", args: ["#0b1018"] })
    expect(
      canvasState.sceneElements.find(({ type }) => type === "fog")?.props,
    ).toMatchObject({ attach: "fog", args: ["#0b1018", 7, 14] })
    expect(
      canvasState.sceneElements.find(({ type }) => type === "ambientLight")
        ?.props,
    ).toMatchObject({ intensity: 0.72 })
    expect(
      canvasState.sceneElements.find(({ type }) => type === "hemisphereLight")
        ?.props,
    ).toMatchObject({ args: ["#c9dcff", "#05070d", 0.72] })
    expect(
      canvasState.sceneElements.find(({ type }) => type === "spotLight")
        ?.props,
    ).toMatchObject({ intensity: 1.2, color: "#b3c9ff" })
    expect(canvasState.orbitProps).toMatchObject({
      enablePan: false,
      minDistance: 3,
      maxDistance: 10,
      minPolarAngle: 0.32,
      maxPolarAngle: Math.PI - 0.32,
    })
  })

  it("treats and disposes cloned X-ray materials without mutating the source vehicle", () => {
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: "#20242a" })
    const tireMaterial = new THREE.MeshStandardMaterial({ color: "#111111" })
    const body = new THREE.Mesh(new THREE.BoxGeometry(), bodyMaterial)
    const tire = new THREE.Mesh(new THREE.BoxGeometry(), tireMaterial)
    body.name = "BODY_SHELL"
    tire.name = "TIRE_FRONT_LEFT"
    scene.add(body, tire)

    const view = renderDoorViewport()

    const riggedScene = vehicleRig.useVehicleRig.mock.calls[0]?.[0] as
      | THREE.Group
      | undefined
    const clonedBody = riggedScene?.getObjectByName("BODY_SHELL") as
      | THREE.Mesh
      | undefined
    const clonedTire = riggedScene?.getObjectByName("TIRE_FRONT_LEFT") as
      | THREE.Mesh
      | undefined
    const clonedBodyMaterial = clonedBody?.material as
      | THREE.MeshStandardMaterial
      | undefined
    const clonedTireMaterial = clonedTire?.material as
      | THREE.MeshStandardMaterial
      | undefined

    expect(clonedBodyMaterial).not.toBe(bodyMaterial)
    expect(clonedBodyMaterial).toMatchObject({
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    expect(clonedTireMaterial).not.toBe(tireMaterial)
    expect(clonedTireMaterial).toMatchObject({
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    expect(bodyMaterial.transparent).toBe(false)
    expect(tireMaterial.transparent).toBe(false)

    const clonedBodyDispose = vi.spyOn(clonedBodyMaterial!, "dispose")
    const clonedTireDispose = vi.spyOn(clonedTireMaterial!, "dispose")
    const sourceBodyDispose = vi.spyOn(bodyMaterial, "dispose")
    const sourceTireDispose = vi.spyOn(tireMaterial, "dispose")

    view.unmount()

    expect(clonedBodyDispose).toHaveBeenCalledOnce()
    expect(clonedTireDispose).toHaveBeenCalledOnce()
    expect(sourceBodyDispose).not.toHaveBeenCalled()
    expect(sourceTireDispose).not.toHaveBeenCalled()
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
    expect(callouts[1]).toHaveAttribute("data-placement", "effect-high-right")
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
        .filter((callout) => callout.getAttribute("data-kind") !== "logical")
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

    await user.click(screen.getByRole("button", { name: "Target ECU" }))
    expect(
      within(canvas).getAllByTestId("vehicle-topology-callout")[0],
    ).toHaveAttribute("data-camera-focused", "true")
    expect(
      within(canvas).getAllByTestId("vehicle-topology-callout")[1],
    ).not.toHaveAttribute("data-camera-focused")

    await user.click(screen.getByRole("button", { name: "영향 부위" }))
    expect(
      within(canvas).getAllByTestId("vehicle-topology-callout")[0],
    ).not.toHaveAttribute("data-camera-focused")
    expect(
      within(canvas).getAllByTestId("vehicle-topology-callout")[1],
    ).toHaveAttribute("data-camera-focused", "true")

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

  it("selects every route pin with one truthful compact tooltip", async () => {
    const user = userEvent.setup()
    renderDoorViewport()
    const canvas = screen.getByTestId("canvas-boundary")
    const cases = [
      {
        button: "Training OBD-II 선택",
        label: "Training OBD-II",
        detail: "공격 프레임 진입점 · 실제 OEM 배치 아님",
        kind: "logical",
        placement: "logical-right",
      },
      {
        button: "Toy IDS 선택",
        label: "Toy IDS",
        detail: "프레임 관찰/규칙 판정 · 실제 OEM 배치 아님",
        kind: "logical",
        placement: "logical-right",
      },
      {
        button: "Toy Gateway 선택",
        label: "Toy Gateway",
        detail: "대상 네트워크로 라우팅 · 실제 OEM 배치 아님",
        kind: "logical",
        placement: "logical-right",
      },
      {
        button: "Toy Body ECU 선택",
        label: "Toy Body ECU",
        detail: "Target ECU · 교육용 위치",
        kind: "target",
        placement: "target-far-left",
      },
      {
        button: "Left Door Effect 선택",
        label: "GLB Left Door",
        detail: "영향 부위",
        kind: "effect",
        placement: "effect-high-right",
      },
    ] as const

    for (const expected of cases) {
      await user.click(
        within(canvas).getByRole("button", { name: expected.button }),
      )

      const activePins = within(canvas)
        .getAllByTestId("vehicle-topology-pin")
        .filter((pin) => pin.getAttribute("data-active") === "true")
      expect(activePins).toHaveLength(1)
      expect(activePins[0]).toHaveAccessibleName(expected.button)

      const visibleCallouts = within(canvas)
        .getAllByTestId("vehicle-topology-callout")
        .filter((callout) => callout.getAttribute("data-visible") === "true")
      expect(visibleCallouts).toHaveLength(1)
      expect(visibleCallouts[0]).toHaveAttribute("data-kind", expected.kind)
      expect(visibleCallouts[0]).toHaveAttribute(
        "data-placement",
        expected.placement,
      )
      expect(visibleCallouts[0]).toHaveTextContent(expected.label)
      expect(visibleCallouts[0]).toHaveTextContent(expected.detail)
    }
  })

  it("caps and wraps a logical tooltip for a narrow canvas", async () => {
    const user = userEvent.setup()
    renderDoorViewport()

    await user.click(screen.getByRole("button", { name: "Toy Gateway 선택" }))
    const tooltip = screen
      .getAllByTestId("vehicle-topology-callout")
      .find((callout) => callout.getAttribute("data-visible") === "true")

    expect(tooltip).toHaveClass(
      "vehicle-network-viewport__callout--logical",
    )
    expect(tooltip).toHaveAttribute("data-placement", "logical-right")
    expect(tooltip?.style.width).toBe("104px")
    expect(tooltip?.style.maxWidth).toBe("calc(100vw - 48px)")
    expect(tooltip?.style.whiteSpace).toBe("normal")
  })

  it("keeps route anchors fixed while separating projected HTML pins with leaders", () => {
    renderDoorViewport()
    const canvas = screen.getByTestId("canvas-boundary")
    const markers = within(canvas).getAllByTestId("vehicle-topology-marker")
    const offsets = markers.map((marker) =>
      [
        marker.style.getPropertyValue("--vehicle-pin-wide-offset-x"),
        marker.style.getPropertyValue("--vehicle-pin-wide-offset-y"),
      ].join(","),
    )
    const expectedWideOffsets = new Map([
      ["obd", "-72px,34px"],
      ["ids", "-68px,-34px"],
      ["gateway", "0px,-74px"],
      ["body", "70px,-30px"],
      ["leftDoor", "54px,58px"],
    ])
    const expectedCompactOffsets = new Map([
      ["obd", "-36px,34px"],
      ["ids", "-34px,-20px"],
      ["gateway", "0px,-46px"],
      ["body", "22px,-18px"],
      ["leftDoor", "28px,38px"],
    ])
    const compactOffsets = markers.map((marker) => [
      marker.style.getPropertyValue("--vehicle-pin-compact-offset-x"),
      marker.style.getPropertyValue("--vehicle-pin-compact-offset-y"),
    ].join(","))

    expect(markers).toHaveLength(5)
    expect(new Set(offsets).size).toBe(5)
    expect(offsets).not.toContain("0px,0px")
    expect(new Set(compactOffsets).size).toBe(5)
    markers.forEach((marker, index) => {
      expect(offsets[index]).toBe(
        expectedWideOffsets.get(marker.dataset.nodeId ?? ""),
      )
      expect(compactOffsets[index]).toBe(
        expectedCompactOffsets.get(marker.dataset.nodeId ?? ""),
      )
      expect(
        marker.style.getPropertyValue("--vehicle-pin-compact-leader-length"),
      ).not.toBe("")
      expect(
        marker.style.getPropertyValue("--vehicle-pin-compact-leader-angle"),
      ).not.toBe("")
    })
    expect(
      within(canvas).getAllByTestId("vehicle-topology-leader"),
    ).toHaveLength(5)

    expect(getCanvasMesh("vehicle-topology-hit-target:obd")).toHaveAttribute(
      "position",
      "0.55,0.69,1.08",
    )
    expect(getCanvasMesh("vehicle-topology-hit-target:ids")).toHaveAttribute(
      "position",
      "0.27,0.55,-0.84",
    )
    expect(
      getCanvasMesh("vehicle-topology-hit-target:gateway"),
    ).toHaveAttribute("position", "0.2,0.72,0.14")
    expect(getCanvasMesh("vehicle-topology-hit-target:body")).toHaveAttribute(
      "position",
      "0.67,0.73,-0.54",
    )
  })

  it("makes each projected Html wrapper transparent to hits except its button", () => {
    renderDoorViewport()
    const canvas = screen.getByTestId("canvas-boundary")
    const layers = canvas.querySelectorAll(
      ".vehicle-network-viewport__html-layer",
    )
    const pins = within(canvas).getAllByTestId("vehicle-topology-pin")

    expect(layers).toHaveLength(5)
    expect(
      Array.from(layers).every(
        (layer) => (layer as HTMLElement).style.pointerEvents === "none",
      ),
    ).toBe(true)
    expect(pins.every((pin) => pin.style.pointerEvents === "auto")).toBe(true)
  })

  it("provides distinct in-canvas compact offsets for the spoofing route", () => {
    renderDoorViewport({
      route: ["obd", "ids", "gateway", "rear", "tailgate"],
      targetId: "rear",
      effectId: "tailgate",
      scenarioTitle: "Spoofing route",
    })
    const markers = within(screen.getByTestId("canvas-boundary"))
      .getAllByTestId("vehicle-topology-marker")
    const compactByNode = new Map(
      markers.map((marker) => [
        marker.dataset.nodeId,
        [
          marker.style.getPropertyValue("--vehicle-pin-compact-offset-x"),
          marker.style.getPropertyValue("--vehicle-pin-compact-offset-y"),
        ].join(","),
      ]),
    )

    expect(compactByNode).toEqual(new Map([
      ["obd", "-36px,34px"],
      ["ids", "-34px,-20px"],
      ["gateway", "0px,-46px"],
      ["rear", "22px,-18px"],
      ["tailgate", "-24px,42px"],
    ]))
    expect(new Set(compactByNode.values()).size).toBe(5)
  })

  it("changes focus presets and resets without remounting Canvas", async () => {
    const user = userEvent.setup()
    renderDoorViewport()
    await waitFor(() => expect(canvasState.mounts).toBe(1))
    await waitFor(() =>
      expect(canvasState.overviewResets.length).toBeGreaterThan(0),
    )
    const initialResetCount = canvasState.overviewResets.length

    await user.click(screen.getByRole("button", { name: "영향 부위" }))
    expect(screen.getByRole("button", { name: "영향 부위" })).toHaveAttribute(
      "aria-pressed",
      "true",
    )

    await user.click(screen.getByRole("button", { name: "Target ECU" }))
    expect(
      screen.getByRole("region", {
        name: "Door spoofing route vehicle network",
      }),
    ).toHaveAttribute("data-camera-preset", "target")

    canvasState.camera!.position.set(-7, 0.25, 3)
    canvasState.controls!.target.set(2, 4, -3)
    await user.click(screen.getByRole("button", { name: "카메라 초기화" }))
    expect(
      screen.getByRole("region", {
        name: "Door spoofing route vehicle network",
      }),
    ).toHaveAttribute("data-camera-preset", "overview")
    await waitFor(() =>
      expect(canvasState.overviewResets).toHaveLength(initialResetCount + 1),
    )
    expect(canvasState.overviewResets.at(-1)).toEqual({
      camera: [5.8, 3.8, 7.6],
      target: [0, 0, 0],
    })
    expect(canvasState.mounts).toBe(1)
  })

  it("resets once for a new automatic playback without interrupting inspection", async () => {
    const user = userEvent.setup()
    const view = renderDoorViewport({
      playback: {
        playbackId: 7,
        phase: "idle",
        trace: null,
        traceIndex: 0,
        traceCount: 0,
        segmentIndex: 0,
      },
    })
    const viewport = screen.getByRole("region", {
      name: "Door spoofing route vehicle network",
    })

    await user.click(screen.getByRole("button", { name: "Target ECU" }))
    expect(viewport).toHaveAttribute("data-camera-preset", "target")

    view.rerender(
      <VehicleNetworkViewport
        {...defaultDoorViewportProps}
        playback={{
          ...playingDoorSnapshotAtGateway,
          playbackId: 7,
          segmentIndex: 0,
        }}
      />,
    )
    await waitFor(() =>
      expect(viewport).toHaveAttribute("data-camera-preset", "overview"),
    )

    await user.click(screen.getByRole("button", { name: "Toy Gateway 선택" }))
    expect(viewport).toHaveAttribute("data-camera-preset", "node:gateway")

    view.rerender(
      <VehicleNetworkViewport
        {...defaultDoorViewportProps}
        playback={{
          ...playingDoorSnapshotAtGateway,
          playbackId: 7,
          segmentIndex: 4,
        }}
      />,
    )
    expect(viewport).toHaveAttribute("data-camera-preset", "node:gateway")

    view.rerender(
      <VehicleNetworkViewport
        {...defaultDoorViewportProps}
        playback={{
          ...playingDoorSnapshotAtGateway,
          playbackId: 8,
          segmentIndex: 0,
        }}
      />,
    )
    await waitFor(() =>
      expect(viewport).toHaveAttribute("data-camera-preset", "overview"),
    )
    expect(canvasState.mounts).toBe(1)
  })

  it("resets an already-overview camera once per new playback from the shared direction", async () => {
    const view = renderDoorViewport({
      playback: {
        playbackId: 7,
        phase: "idle",
        trace: null,
        traceIndex: 0,
        traceCount: 0,
        segmentIndex: 0,
      },
    })
    await waitFor(() =>
      expect(canvasState.overviewResets.length).toBeGreaterThan(0),
    )
    const initialResetCount = canvasState.overviewResets.length
    canvasState.camera!.position.set(-8, 1.2, 2.4)
    canvasState.controls!.target.set(3, 2, 1)

    view.rerender(
      <VehicleNetworkViewport
        {...defaultDoorViewportProps}
        playback={{
          ...playingDoorSnapshotAtGateway,
          playbackId: 7,
          segmentIndex: 0,
        }}
      />,
    )

    await waitFor(() =>
      expect(canvasState.overviewResets).toHaveLength(initialResetCount + 1),
    )
    expect(canvasState.camera!.position.toArray()).toEqual([5.8, 3.8, 7.6])
    expect(canvasState.controls!.target.toArray()).toEqual([0, 0, 0])
    expect(canvasState.overviewResets.at(-1)).toEqual({
      camera: [5.8, 3.8, 7.6],
      target: [0, 0, 0],
    })

    view.rerender(
      <VehicleNetworkViewport
        {...defaultDoorViewportProps}
        playback={{
          ...playingDoorSnapshotAtGateway,
          playbackId: 7,
          segmentIndex: 4,
        }}
      />,
    )
    expect(canvasState.overviewResets).toHaveLength(initialResetCount + 1)

    canvasState.camera!.position.set(-4, 0.5, 6)
    canvasState.controls!.target.set(-2, 3, 1)
    view.rerender(
      <VehicleNetworkViewport
        {...defaultDoorViewportProps}
        playback={{
          ...playingDoorSnapshotAtGateway,
          playbackId: 8,
          segmentIndex: 0,
        }}
      />,
    )
    await waitFor(() =>
      expect(canvasState.overviewResets).toHaveLength(initialResetCount + 2),
    )
    expect(canvasState.overviewResets.at(-1)).toEqual({
      camera: [5.8, 3.8, 7.6],
      target: [0, 0, 0],
    })
    expect(canvasState.mounts).toBe(1)
  })

  it("selects logical anchors without remounting Canvas", async () => {
    const user = userEvent.setup()
    renderDoorViewport()

    await user.click(screen.getByRole("button", { name: "Toy Body ECU 선택" }))

    expect(
      screen.getByRole("region", {
        name: "Door spoofing route vehicle network",
      }),
    ).toHaveAttribute("data-camera-preset", "target")
    expect(canvasState.mounts).toBe(1)
  })

  it("shares node selection with invisible 3D anchor hit targets", () => {
    renderDoorViewport()

    fireEvent.click(getCanvasMesh("vehicle-topology-hit-target:gateway"))

    expect(
      screen.getByRole("region", {
        name: "Door spoofing route vehicle network",
      }),
    ).toHaveAttribute("data-camera-preset", "node:gateway")
    expect(canvasState.mounts).toBe(1)
  })

  it("renders the accessible rail and active 3D packet edge from playback", () => {
    renderDoorViewport({
      playback: playingDoorSnapshotAtGateway,
    })

    expect(
      screen.getByRole("region", {
        name: "Door spoofing route command timeline",
      }),
    ).toBeInTheDocument()
    expect(getCanvasMesh("vehicle-flow-packet")).toBeInTheDocument()
    expect(getCanvasMesh("vehicle-flow-node-halo:gateway:active")).toBeInTheDocument()
    expect(
      canvasState.lineProps.map(({ current }) => current.userData),
    ).toEqual([
      { flowState: "passed" },
      { flowState: "passed" },
      { flowState: "active" },
      { flowState: "queued" },
    ])
  })

  it("marks the current node and outgoing edge cancelled without a packet", () => {
    renderDoorViewport({
      playback: { ...playingDoorSnapshotAtGateway, phase: "cancelled" },
    })

    expect(
      screen
        .getByTestId("canvas-boundary")
        .querySelector('mesh[name="vehicle-flow-packet"]'),
    ).not.toBeInTheDocument()
    expect(
      getCanvasMesh("vehicle-flow-node-halo:gateway:cancelled"),
    ).toBeInTheDocument()
    expect(
      canvasState.lineProps.map(({ current }) => current.userData),
    ).toEqual([
      { flowState: "passed" },
      { flowState: "passed" },
      { flowState: "cancelled" },
      { flowState: "queued" },
    ])
  })

  it.each([
    {
      name: "terminal-only rejection",
      phase: "playing" as const,
      trace: {
        ...rejectedBodyTrace,
        route: ["terminal"],
        stoppedAt: "terminal",
      } satisfies VehicleFlowTrace,
      segmentIndex: 0,
    },
    {
      name: "terminal to evidence observation",
      phase: "cancelled" as const,
      trace: {
        ...captureTrace,
        traceId: "observe-evidence",
        kind: "observe",
        route: ["terminal", "evidence"],
      } satisfies VehicleFlowTrace,
      segmentIndex: 1,
    },
    {
      name: "terminal to OBD to monitor capture",
      phase: "playing" as const,
      trace: captureTrace,
      segmentIndex: 2,
    },
  ])(
    "does not imply 3D ECU activity at a non-topology $name node",
    ({ phase, trace, segmentIndex }) => {
      renderDoorViewport({
        focusedNodeId: "gateway",
        currentNodeId: "body",
        playback: {
          playbackId: 11,
          phase,
          trace,
          traceIndex: 0,
          traceCount: 1,
          segmentIndex,
        },
      })
      const canvas = screen.getByTestId("canvas-boundary")

      expect(
        canvas.querySelector('mesh[name^="vehicle-flow-node-halo:"]'),
      ).not.toBeInTheDocument()
      expect(
        within(canvas)
          .getAllByTestId("vehicle-topology-pin")
          .some((pin) => pin.getAttribute("data-active") === "true"),
      ).toBe(false)
      expect(
        screen
          .getByRole("list", { name: "Door spoofing route target map" })
          .querySelector('[data-active="true"]'),
      ).not.toBeInTheDocument()
    },
  )

  it("defensively stops rejected rendering at stoppedAt", () => {
    const malformedRejectedTrace: VehicleFlowTrace = {
      ...rejectedBodyTrace,
      route: [...rejectedBodyTrace.route, "rear"],
    }
    renderDoorViewport({
      playback: {
        playbackId: 8,
        phase: "playing",
        trace: malformedRejectedTrace,
        traceIndex: 0,
        traceCount: 1,
        segmentIndex: 5,
      },
    })

    const rail = screen.getByRole("list", {
      name: "Door spoofing route command flow",
    })
    expect(within(rail).queryByText("Toy Rear ECU")).not.toBeInTheDocument()
    expect(canvasState.lineProps).toHaveLength(3)
    expect(
      screen
        .getByTestId("canvas-boundary")
        .querySelector('mesh[name^="vehicle-flow-node-halo:rear:"]'),
    ).not.toBeInTheDocument()
    expect(
      screen
        .getByTestId("canvas-boundary")
        .querySelector('mesh[name="vehicle-flow-packet"]'),
    ).not.toBeInTheDocument()
  })

  it("resets the packet exactly once per playback segment without remounting Canvas", () => {
    const view = renderDoorViewport({
      playback: playingDoorSnapshotAtGateway,
    })
    const firstPacket = getCanvasMesh("vehicle-flow-packet")

    view.rerender(
      <VehicleNetworkViewport
        {...defaultDoorViewportProps}
        playback={playingDoorSnapshotAtGateway}
      />,
    )
    expect(getCanvasMesh("vehicle-flow-packet")).toBe(firstPacket)
    expect(canvasState.frameCallbacks).toHaveLength(2)

    view.rerender(
      <VehicleNetworkViewport
        {...defaultDoorViewportProps}
        playback={{ ...playingDoorSnapshotAtGateway, segmentIndex: 4 }}
      />,
    )
    expect(getCanvasMesh("vehicle-flow-packet")).not.toBe(firstPacket)
    expect(canvasState.frameCallbacks).toHaveLength(2)
    expect(canvasState.mounts).toBe(1)
  })

  it("uses static line and node states without a moving packet for reduced motion", () => {
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))

    renderDoorViewport({ playback: playingDoorSnapshotAtGateway })

    expect(
      screen
        .getByTestId("canvas-boundary")
        .querySelector('mesh[name="vehicle-flow-packet"]'),
    ).not.toBeInTheDocument()
    expect(getCanvasMesh("vehicle-flow-node-halo:gateway:active")).toBeInTheDocument()
  })

  it("passes no DOM-only data attributes to R3F mesh hosts", () => {
    renderDoorViewport({ playback: playingDoorSnapshotAtGateway })

    const unsupportedProps = Array.from(
      screen.getByTestId("canvas-boundary").querySelectorAll("mesh"),
    ).flatMap((mesh) =>
      Array.from(mesh.attributes)
        .map((attribute) => attribute.name)
        .filter((name) => name.startsWith("data-")),
    )

    expect(unsupportedProps).toEqual([])
    expect(getCanvasMesh("vehicle-topology-hit-target:gateway")).toBeInTheDocument()
    expect(getCanvasMesh("vehicle-flow-node-halo:gateway:active")).toBeInTheDocument()
    expect(getCanvasMesh("vehicle-flow-packet")).toBeInTheDocument()
  })

  it("maps only truthful GLB hinge groups to effect targets", () => {
    const doorMesh = new THREE.Mesh()
    const doorHinge = new THREE.Group()
    doorHinge.name = "HINGE_doorL"
    doorHinge.add(doorMesh)

    const tailgateMesh = new THREE.Mesh()
    const tailgateHinge = new THREE.Group()
    tailgateHinge.name = "HINGE_tailgate"
    tailgateHinge.add(tailgateMesh)

    expect(effectTargetFromObject(doorMesh)).toBe("leftDoor")
    expect(effectTargetFromObject(tailgateMesh)).toBe("tailgate")
    expect(effectTargetFromObject(new THREE.Mesh())).toBeUndefined()
  })

  it("shows only the selected compact translucent tooltip while focused", async () => {
    const user = userEvent.setup()
    renderDoorViewport()

    await user.click(screen.getByRole("button", { name: "Toy Body ECU 선택" }))
    const callouts = screen.getAllByTestId("vehicle-topology-callout")
    const target = callouts.find((callout) =>
      callout.textContent?.includes("Toy Body ECU"),
    )
    const effect = callouts.find((callout) =>
      callout.textContent?.includes("GLB Left Door"),
    )

    expect(target).toHaveAttribute("data-visible", "true")
    expect(target).toHaveAttribute("data-translucent", "true")
    expect(effect).not.toHaveAttribute("data-visible")
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

    act(() => {
      canvasState.boundsRefit?.()
      canvasState.frameCallbacks.forEach((callback) => callback({}, 0.016))
    })

    expect(canvasState.controls!.target.equals(selectedTarget)).toBe(true)
  })

  it.each([
    ["ids", [0.27, 0.55, -0.84]],
    ["gateway", [0.2, 0.72, 0.14]],
  ] as const)(
    "focuses and highlights the intermediate %s node from the shared coordinate root",
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
        within(
          screen.getByRole("list", {
            name: "Door spoofing route target map",
          }),
        )
          .getByText(nodeId === "ids" ? "Toy IDS" : "Toy Gateway")
          .closest("li"),
      ).toHaveAttribute("data-active", "true")
    },
  )

  it("wires a transformed shared root through rendered pin, packet, and camera focus", async () => {
    const user = userEvent.setup()
    vi.stubGlobal("matchMedia", vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }))
    canvasState.centerTransform = {
      enabled: true,
      position: [4, -2, 7],
      rotationY: Math.PI / 2,
    }
    renderDoorViewport({
      focusedNodeId: "gateway",
      playback: playingDoorSnapshotAtGateway,
    })

    const root = await waitFor(() => {
      expect(canvasState.coordinateRoot).toBeDefined()
      return canvasState.coordinateRoot!
    })
    const pin = getCanvasMesh("vehicle-topology-hit-target:gateway")
    const packet = getCanvasMesh("vehicle-flow-packet")
    expect(pin).toHaveAttribute("position", "0.2,0.72,0.14")
    expect(packet).toHaveAttribute("position", "0.2,0.72,0.14")
    await user.click(
      screen.getByRole("button", { name: "Toy Gateway 선택" }),
    )
    const expectedWorld = root.localToWorld(
      new THREE.Vector3(0.2, 0.72, 0.14),
    )

    act(() => {
      canvasState.frameCallbacks.at(-1)?.({}, 1)
    })

    await waitFor(() =>
      expect(canvasState.controls!.target.toArray()).toEqual(
        expectedWorld.toArray(),
      ),
    )
    expect(expectedWorld.toArray()).not.toEqual([0.2, 0.72, 0.14])
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
