// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest"
import { useEffect, type ReactNode } from "react"
import { cleanup, render, screen } from "@testing-library/react"
import * as THREE from "three"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const sharedState = vi.hoisted(() => ({
  canvasProps: undefined as Record<string, unknown> | undefined,
  canvasChildren: [] as Array<{ type: string; props: Record<string, unknown> }>,
  boundsProps: undefined as Record<string, unknown> | undefined,
  centerRenders: 0,
  orbitProps: undefined as Record<string, unknown> | undefined,
  useGLTF: vi.fn(),
}))

vi.mock("@react-three/fiber", async () => {
  const React = await import("react")
  return {
    Canvas: ({ children, ...props }: { children: ReactNode }) => {
      sharedState.canvasProps = props
      sharedState.canvasChildren = React.Children.toArray(children).flatMap(
        (child) =>
          React.isValidElement(child) && typeof child.type === "string"
            ? [
                {
                  type: child.type,
                  props: child.props as Record<string, unknown>,
                },
              ]
            : [],
      )
      return <div data-testid="shared-canvas">{children}</div>
    },
  }
})

vi.mock("@react-three/drei", async () => {
  const React = await import("react")
  return {
    Bounds: ({ children, ...props }: { children?: ReactNode }) => {
      sharedState.boundsProps = props
      return <div data-testid="shared-bounds">{children}</div>
    },
    Center: ({ children }: { children?: ReactNode }) => {
      sharedState.centerRenders += 1
      return <div data-testid="shared-center">{children}</div>
    },
    OrbitControls: (props: Record<string, unknown>) => {
      sharedState.orbitProps = props
      return null
    },
    useGLTF: Object.assign(sharedState.useGLTF, { preload: vi.fn() }),
  }
})

import {
  NORMAL_CAN_SCENE_PRESET,
  SHARED_VEHICLE_MODEL_PATH,
  SharedVehicleCanvas,
  SharedVehicleOrbitControls,
  SharedVehicleScene,
  effectTargetFromVehicleObject,
  useSharedVehicleClone,
  vehicleLocalPointToWorld,
} from "./SharedVehicleScene"

function CloneProbe({ onClone }: { onClone: (scene: THREE.Group) => void }) {
  const scene = useSharedVehicleClone()
  useEffect(() => onClone(scene), [onClone, scene])
  return null
}

describe("SharedVehicleScene", () => {
  beforeEach(() => {
    sharedState.canvasProps = undefined
    sharedState.canvasChildren = []
    sharedState.boundsProps = undefined
    sharedState.centerRenders = 0
    sharedState.orbitProps = undefined
    sharedState.useGLTF.mockReset()
    sharedState.useGLTF.mockReturnValue({ scene: new THREE.Group() })
  })

  afterEach(() => {
    cleanup()
    vi.restoreAllMocks()
  })

  it("provides the exact normal-CAN camera, renderer, lighting, fit, and orbit presentation", () => {
    render(
      <SharedVehicleCanvas>
        <SharedVehicleScene xray={false} />
        <SharedVehicleOrbitControls />
      </SharedVehicleCanvas>,
    )

    expect(SHARED_VEHICLE_MODEL_PATH).toBe(
      "/models/RIDGEX_ROCKER_CLEANUP_V7_01.glb",
    )
    expect(NORMAL_CAN_SCENE_PRESET).toMatchObject({
      camera: {
        position: [5.8, 3.8, 7.6],
        fov: 38,
        near: 0.05,
        far: 100,
      },
      canvas: { shadows: true, dpr: [1, 1.5] },
      scene: { background: "#0b1018", fog: ["#0b1018", 7, 14] },
      lights: {
        ambient: 0.72,
        hemisphere: ["#c9dcff", "#05070d", 0.72],
        directional: 2.35,
        spot: 1.2,
      },
      bounds: { fit: true, observe: true, margin: 0.9 },
      orbit: {
        enablePan: false,
        minDistance: 3,
        maxDistance: 10,
        minPolarAngle: 0.32,
        maxPolarAngle: Math.PI - 0.32,
      },
    })
    expect(sharedState.canvasProps).toMatchObject({
      shadows: true,
      dpr: [1, 1.5],
      camera: {
        position: [5.8, 3.8, 7.6],
        fov: 38,
        near: 0.05,
        far: 100,
      },
      gl: {
        alpha: false,
        antialias: true,
        toneMapping: THREE.ACESFilmicToneMapping,
      },
    })
    expect(sharedState.boundsProps).toEqual({
      fit: true,
      observe: true,
      margin: 0.9,
    })
    expect(sharedState.centerRenders).toBe(1)
    expect(sharedState.orbitProps).toMatchObject(
      NORMAL_CAN_SCENE_PRESET.orbit,
    )
    expect(
      sharedState.canvasChildren.find(({ type }) => type === "ambientLight")
        ?.props,
    ).toMatchObject({ intensity: 0.72 })
    expect(
      sharedState.canvasChildren.find(
        ({ type }) => type === "directionalLight",
      )?.props,
    ).toMatchObject({ intensity: 2.35 })
  })

  it("places the cloned model and consumer overlays in one fitted coordinate root", () => {
    render(
      <SharedVehicleScene xray={false}>
        <mesh name="consumer-overlay" />
      </SharedVehicleScene>,
    )

    const root = screen.getByTestId("shared-center").querySelector(
      'primitive[name="shared-vehicle-coordinate-root"]',
    )
    expect(root).not.toBeNull()
    expect(root?.querySelector("primitive")).not.toBeNull()
    expect(root?.querySelector('mesh[name="consumer-overlay"]')).not.toBeNull()
  })

  it("keeps source materials immutable, makes xray truthful, and disposes every cloned material", () => {
    const sourceMaterial = new THREE.MeshStandardMaterial({
      color: "#334455",
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
    const sourceMesh = new THREE.Mesh(new THREE.BoxGeometry(), sourceMaterial)
    sourceMesh.name = "BODY_SHELL"
    const sourceScene = new THREE.Group()
    sourceScene.add(sourceMesh)
    sharedState.useGLTF.mockReturnValue({ scene: sourceScene })
    let clone: THREE.Group | undefined
    const rememberClone = (next: THREE.Group) => {
      clone = next
    }

    const view = render(
      <SharedVehicleScene xray={false}>
        <CloneProbe onClone={rememberClone} />
      </SharedVehicleScene>,
    )
    const opaqueMesh = clone?.getObjectByName("BODY_SHELL") as
      | THREE.Mesh
      | undefined
    const opaqueMaterial = opaqueMesh?.material as
      | THREE.MeshStandardMaterial
      | undefined
    expect(opaqueMaterial).not.toBe(sourceMaterial)
    expect(opaqueMaterial).toMatchObject({
      transparent: false,
      opacity: 1,
      depthWrite: true,
    })
    const opaqueDispose = vi.spyOn(opaqueMaterial!, "dispose")

    view.rerender(
      <SharedVehicleScene xray>
        <CloneProbe onClone={rememberClone} />
      </SharedVehicleScene>,
    )
    const xrayMesh = clone?.getObjectByName("BODY_SHELL") as
      | THREE.Mesh
      | undefined
    const xrayMaterial = xrayMesh?.material as
      | THREE.MeshStandardMaterial
      | undefined
    expect(opaqueDispose).toHaveBeenCalledOnce()
    expect(xrayMaterial).not.toBe(sourceMaterial)
    expect(xrayMaterial).toMatchObject({
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
      side: THREE.DoubleSide,
    })
    expect(sourceMaterial).toMatchObject({
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    })
    const xrayDispose = vi.spyOn(xrayMaterial!, "dispose")
    const sourceDispose = vi.spyOn(sourceMaterial, "dispose")

    view.unmount()

    expect(xrayDispose).toHaveBeenCalledOnce()
    expect(sourceDispose).not.toHaveBeenCalled()
  })

  it("maps only real hinge ancestors to effect targets", () => {
    const doorMesh = new THREE.Mesh()
    const doorHinge = new THREE.Group()
    doorHinge.name = "HINGE_doorL"
    doorHinge.add(doorMesh)
    const tailgateMesh = new THREE.Mesh()
    const tailgateHinge = new THREE.Group()
    tailgateHinge.name = "HINGE_tailgate"
    tailgateHinge.add(tailgateMesh)

    expect(effectTargetFromVehicleObject(doorMesh)).toBe("leftDoor")
    expect(effectTargetFromVehicleObject(tailgateMesh)).toBe("tailgate")
    expect(effectTargetFromVehicleObject(new THREE.Mesh())).toBeUndefined()
  })

  it("aligns attack focus, packet, and pin coordinates through one transformed root", () => {
    const parent = new THREE.Group()
    parent.position.set(4, -2, 7)
    parent.rotation.set(0, Math.PI / 2, 0)
    const root = new THREE.Group()
    parent.add(root)
    const localAnchor = [0.2, 0.72, 0.14] as const
    const packet = new THREE.Object3D()
    const pin = new THREE.Object3D()
    packet.position.set(...localAnchor)
    pin.position.set(...localAnchor)
    root.add(packet, pin)

    const focus = vehicleLocalPointToWorld(root, localAnchor)
    const packetWorld = packet.getWorldPosition(new THREE.Vector3())
    const pinWorld = pin.getWorldPosition(new THREE.Vector3())

    expect(focus.toArray()).toEqual(packetWorld.toArray())
    expect(focus.toArray()).toEqual(pinWorld.toArray())
    expect(focus.toArray()).not.toEqual([...localAnchor])
  })
})
