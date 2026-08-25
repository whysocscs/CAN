import {
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type Ref,
} from "react"
import { Canvas, useThree, type ThreeEvent } from "@react-three/fiber"
import {
  Bounds,
  Center,
  OrbitControls,
  useBounds,
  useGLTF,
} from "@react-three/drei"
import * as THREE from "three"
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib"
import type { VehicleEffectTargetId, VehicleAnchor } from "./vehicleTopology"

export const SHARED_VEHICLE_MODEL_PATH =
  "/models/RIDGEX_ROCKER_CLEANUP_V7_01.glb"

export const NORMAL_CAN_SCENE_PRESET = Object.freeze({
  camera: Object.freeze({
    position: Object.freeze([5.8, 3.8, 7.6] as const),
    target: Object.freeze([0, 0, 0] as const),
    fov: 38,
    near: 0.05,
    far: 100,
  }),
  canvas: Object.freeze({
    shadows: true,
    dpr: Object.freeze([1, 1.5] as const),
  }),
  renderer: Object.freeze({
    alpha: false,
    antialias: true,
    toneMapping: THREE.ACESFilmicToneMapping,
  }),
  scene: Object.freeze({
    background: "#0b1018",
    fog: Object.freeze(["#0b1018", 7, 14] as const),
  }),
  lights: Object.freeze({
    ambient: 0.72,
    hemisphere: Object.freeze(["#c9dcff", "#05070d", 0.72] as const),
    directional: 2.35,
    spot: 1.2,
  }),
  bounds: Object.freeze({ fit: true, observe: true, margin: 0.9 }),
  orbit: Object.freeze({
    enablePan: false,
    minDistance: 3,
    maxDistance: 10,
    minPolarAngle: 0.32,
    maxPolarAngle: Math.PI - 0.32,
  }),
})

const XRAY_TINT = new THREE.Color("#a8bac8")
const MECHANICAL_MESH_NAME = /TIRE|WHEEL|BRAKE|CALIPER|STEER/i
const SharedVehicleCloneContext = createContext<THREE.Group | null>(null)

interface VehicleResource {
  scene: THREE.Group
  clonedMaterials: THREE.Material[]
  revision: number
}

function createVehicleResource(
  sourceScene: THREE.Group,
  xray: boolean,
  revision: number,
): VehicleResource {
  const scene = sourceScene.clone(true) as THREE.Group
  const clonedMaterials: THREE.Material[] = []

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh
    if (!mesh.isMesh) return

    const mechanical = MECHANICAL_MESH_NAME.test(mesh.name)
    const cloneMaterial = (source: THREE.Material) => {
      const material = source.clone()
      if (xray) {
        material.transparent = true
        material.opacity = mechanical ? 0.72 : 0.4
        material.depthWrite = false
        material.side = THREE.DoubleSide
        if ("color" in material && material.color instanceof THREE.Color) {
          material.color.lerp(XRAY_TINT, 0.72)
        }
      } else {
        material.transparent = false
        material.opacity = 1
        material.depthWrite = true
      }
      material.needsUpdate = true
      clonedMaterials.push(material)
      return material
    }

    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(cloneMaterial)
      : cloneMaterial(mesh.material)
    mesh.castShadow = true
    mesh.receiveShadow = true
    mesh.frustumCulled = false
  })

  return { scene, clonedMaterials, revision }
}

export function useSharedVehicleClone(): THREE.Group {
  const scene = useContext(SharedVehicleCloneContext)
  if (!scene) {
    throw new Error("useSharedVehicleClone must be used inside SharedVehicleScene")
  }
  return scene
}

export function effectTargetFromVehicleObject(
  object: THREE.Object3D,
): VehicleEffectTargetId | undefined {
  for (
    let current: THREE.Object3D | null = object;
    current;
    current = current.parent
  ) {
    if (current.name === "HINGE_doorL") return "leftDoor"
    if (current.name === "HINGE_tailgate") return "tailgate"
  }
  return undefined
}

export function vehicleLocalPointToWorld(
  root: THREE.Object3D,
  point: readonly [number, number, number] | VehicleAnchor,
): THREE.Vector3 {
  root.updateWorldMatrix(true, false)
  return root.localToWorld(new THREE.Vector3(...point))
}

export function SharedVehicleCanvas({ children }: { children: ReactNode }) {
  const camera = useMemo(
    () => ({
      position: [...NORMAL_CAN_SCENE_PRESET.camera.position] as [
        number,
        number,
        number,
      ],
      fov: NORMAL_CAN_SCENE_PRESET.camera.fov,
      near: NORMAL_CAN_SCENE_PRESET.camera.near,
      far: NORMAL_CAN_SCENE_PRESET.camera.far,
    }),
    [],
  )
  const dpr = useMemo(
    () => [...NORMAL_CAN_SCENE_PRESET.canvas.dpr] as [number, number],
    [],
  )
  const renderer = useMemo(
    () => ({ ...NORMAL_CAN_SCENE_PRESET.renderer }),
    [],
  )

  return (
    <Canvas
      shadows={NORMAL_CAN_SCENE_PRESET.canvas.shadows}
      dpr={dpr}
      camera={camera}
      gl={renderer}
    >
      <color
        attach="background"
        args={[NORMAL_CAN_SCENE_PRESET.scene.background]}
      />
      <fog attach="fog" args={[...NORMAL_CAN_SCENE_PRESET.scene.fog]} />
      <ambientLight intensity={NORMAL_CAN_SCENE_PRESET.lights.ambient} />
      <hemisphereLight
        args={[...NORMAL_CAN_SCENE_PRESET.lights.hemisphere]}
      />
      <directionalLight
        castShadow
        position={[6, 8, 5]}
        intensity={NORMAL_CAN_SCENE_PRESET.lights.directional}
        shadow-mapSize={[2048, 2048]}
      />
      <spotLight
        position={[-5, 4, -3]}
        angle={0.52}
        penumbra={0.72}
        intensity={NORMAL_CAN_SCENE_PRESET.lights.spot}
        color="#b3c9ff"
      />
      {children}
    </Canvas>
  )
}

interface SharedVehicleOrbitControlsProps {
  controlsRef?: Ref<OrbitControlsImpl>
  autoRotate?: boolean
  autoRotateSpeed?: number
  enableDamping?: boolean
  dampingFactor?: number
  makeDefault?: boolean
}

export function SharedVehicleOrbitControls({
  controlsRef,
  autoRotate,
  autoRotateSpeed,
  enableDamping,
  dampingFactor,
  makeDefault,
}: SharedVehicleOrbitControlsProps) {
  return (
    <OrbitControls
      ref={controlsRef}
      {...NORMAL_CAN_SCENE_PRESET.orbit}
      autoRotate={autoRotate}
      autoRotateSpeed={autoRotateSpeed}
      enableDamping={enableDamping}
      dampingFactor={dampingFactor}
      makeDefault={makeDefault}
    />
  )
}

export function SharedVehicleOverviewController({
  active = true,
  resetRevision,
}: {
  active?: boolean
  resetRevision: number
}) {
  const camera = useThree((state) => state.camera)
  const controls = useThree(
    (state) =>
      (state as typeof state & { controls?: OrbitControlsImpl }).controls,
  )
  const bounds = useBounds()

  useEffect(() => {
    if (!active) return
    const position = NORMAL_CAN_SCENE_PRESET.camera.position
    const target = NORMAL_CAN_SCENE_PRESET.camera.target
    camera.position.set(...position)
    if (controls) {
      controls.target.set(...target)
      controls.update()
    } else {
      camera.lookAt(...target)
    }
    bounds.refresh().reset().fit()
  }, [active, bounds, camera, controls, resetRevision])

  return null
}

interface SharedVehicleSceneProps {
  xray: boolean
  children?: ReactNode
  onCentered?: () => void
  onSelectEffect?: (effectId: VehicleEffectTargetId) => void
}

export const SharedVehicleScene = forwardRef<
  THREE.Group,
  SharedVehicleSceneProps
>(function SharedVehicleScene(
  { xray, children, onCentered, onSelectEffect },
  rootRef,
) {
  const gltf = useGLTF(SHARED_VEHICLE_MODEL_PATH)
  const coordinateRoot = useMemo(() => {
    const root = new THREE.Group()
    root.name = "shared-vehicle-coordinate-root"
    return root
  }, [])
  useImperativeHandle(rootRef, () => coordinateRoot, [coordinateRoot])
  const resourceRevision = useRef(0)
  const [resource, setResource] = useState<VehicleResource | null>(null)

  useLayoutEffect(() => {
    resourceRevision.current += 1
    const nextResource = createVehicleResource(
      gltf.scene,
      xray,
      resourceRevision.current,
    )
    setResource(nextResource)
    return () => {
      nextResource.clonedMaterials.forEach((material) => material.dispose())
    }
  }, [gltf.scene, xray])

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      if (!onSelectEffect) return
      const effectId = effectTargetFromVehicleObject(event.object)
      if (!effectId) return
      event.stopPropagation()
      onSelectEffect(effectId)
    },
    [onSelectEffect],
  )

  return (
    <Bounds {...NORMAL_CAN_SCENE_PRESET.bounds}>
      <Center onCentered={onCentered} cacheKey={resource?.revision ?? 0}>
        <primitive object={coordinateRoot} name={coordinateRoot.name}>
          {resource && (
            <SharedVehicleCloneContext.Provider value={resource.scene}>
              <primitive object={resource.scene} onClick={handleClick} />
              {children}
            </SharedVehicleCloneContext.Provider>
          )}
        </primitive>
      </Center>
    </Bounds>
  )
})

useGLTF.preload(SHARED_VEHICLE_MODEL_PATH)
