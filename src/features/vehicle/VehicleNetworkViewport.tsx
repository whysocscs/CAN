import {
  Component,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from "react"
import { Canvas, useFrame, useThree } from "@react-three/fiber"
import { Html, Line, OrbitControls, useGLTF } from "@react-three/drei"
import {
  ArrowCounterClockwise,
  CircleNotch,
  Warning,
} from "@phosphor-icons/react"
import * as THREE from "three"
import { useVehicleRig } from "./useVehicleRig"
import {
  VEHICLE_TOPOLOGY_BY_ID,
  type VehicleEffectTargetId,
  type VehicleLogicalNodeId,
  type VehicleTopologyNode,
  type VehicleTopologyNodeId,
} from "./vehicleTopology"

const MODEL_PATH = "/models/RIDGEX_ROCKER_CLEANUP_V7_01.glb"
const MODEL_ROTATION: [number, number, number] = [0, -0.22, 0]
const MODEL_EULER = new THREE.Euler(...MODEL_ROTATION)
const OVERVIEW_CAMERA: [number, number, number] = [-5.6, 3.1, 7.2]
const CAMERA_TARGET: [number, number, number] = [0, 0.72, 0]

export type VehicleCameraView = "overview" | "source" | "target" | "effect"

export interface VehicleNetworkViewportProps {
  route: readonly VehicleTopologyNodeId[]
  targetId: VehicleLogicalNodeId
  effectId: VehicleEffectTargetId
  currentNodeId?: VehicleTopologyNodeId
  focusedNodeId?: VehicleTopologyNodeId
  scenarioTitle: string
  accent: string
  initialView?: VehicleCameraView
}

interface CameraPreset {
  position: THREE.Vector3
  target: THREE.Vector3
}

interface NamedCameraFocus {
  view: VehicleCameraView
  nodeId?: undefined
}

interface NodeCameraFocus {
  view: "node"
  nodeId: VehicleTopologyNodeId
}

type CameraFocus = NamedCameraFocus | NodeCameraFocus
type TopologyCalloutKind = "target" | "effect"

interface OrbitControlsState {
  target: THREE.Vector3
  update: () => void
}

function getTopologyNode(id: VehicleTopologyNodeId): VehicleTopologyNode {
  const node = VEHICLE_TOPOLOGY_BY_ID.get(id)
  if (!node) throw new Error(`Unknown vehicle topology node: ${id}`)
  return node
}

function cameraFocusForNode(
  nodeId: VehicleTopologyNodeId | undefined,
  route: readonly VehicleTopologyNodeId[],
  targetId: VehicleLogicalNodeId,
  effectId: VehicleEffectTargetId,
): CameraFocus {
  if (nodeId === route[0]) return { view: "source" }
  if (nodeId === targetId) return { view: "target" }
  if (nodeId === effectId) return { view: "effect" }
  if (nodeId) return { view: "node", nodeId }
  return { view: "overview" }
}

function rotatedAnchor(node: VehicleTopologyNode): THREE.Vector3 {
  return new THREE.Vector3(...node.anchor).applyEuler(MODEL_EULER)
}

function createNodeCameraPreset(
  node: VehicleTopologyNode,
  offset = new THREE.Vector3(3.4, 1.8, 3.4),
): CameraPreset {
  const target = rotatedAnchor(node)
  const position =
    node.id === "tailgate"
      ? target.clone().add(new THREE.Vector3(0, 1.9, -4.6))
      : node.id === "leftDoor"
        ? target.clone().add(new THREE.Vector3(-4.2, 1.7, 2.2))
        : target.clone().add(offset)

  return { position, target }
}

function createCameraPresets(
  source: VehicleTopologyNode,
  target: VehicleTopologyNode,
  effect: VehicleTopologyNode,
): Record<VehicleCameraView, CameraPreset> {
  return {
    overview: {
      position: new THREE.Vector3(...OVERVIEW_CAMERA),
      target: new THREE.Vector3(...CAMERA_TARGET),
    },
    source: createNodeCameraPreset(source, new THREE.Vector3(3.4, 1.7, 3.4)),
    target: createNodeCameraPreset(target, new THREE.Vector3(3.8, 1.9, 3.1)),
    effect: createNodeCameraPreset(effect),
  }
}

function CameraPresetController({
  preset,
  immediate,
}: {
  preset: CameraPreset
  immediate: boolean
}) {
  const camera = useThree((state) => state.camera)
  const controls = useThree(
    (state) =>
      (state as typeof state & { controls?: OrbitControlsState }).controls,
  )
  const startPosition = useRef(camera.position.clone())
  const startTarget = useRef(new THREE.Vector3(...CAMERA_TARGET))
  const progress = useRef(1)

  useEffect(() => {
    const applyPreset = () => {
      camera.position.copy(preset.position)
      if (controls) {
        controls.target.copy(preset.target)
        controls.update()
      } else {
        camera.lookAt(preset.target)
      }
    }

    if (immediate) {
      applyPreset()
      progress.current = 1
      return
    }

    startPosition.current.copy(camera.position)
    startTarget.current.copy(
      controls?.target ?? new THREE.Vector3(...CAMERA_TARGET),
    )
    progress.current = 0
  }, [camera, controls, immediate, preset])

  useFrame((_, delta) => {
    if (progress.current >= 1) return
    progress.current = Math.min(1, progress.current + delta / 0.45)
    const amount = THREE.MathUtils.smoothstep(progress.current, 0, 1)
    camera.position.lerpVectors(startPosition.current, preset.position, amount)
    if (controls) {
      controls.target.lerpVectors(startTarget.current, preset.target, amount)
      controls.update()
    } else {
      camera.lookAt(preset.target)
    }
  })

  return null
}

function VehicleModel({ immediate }: { immediate: boolean }) {
  const gltf = useGLTF(MODEL_PATH)
  const scene = useMemo(() => gltf.scene.clone(true), [gltf.scene])

  useVehicleRig(scene, { immediate })

  useEffect(() => {
    scene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
    })
  }, [scene])

  return <primitive object={scene} />
}

function TopologyPin({
  node,
  accent,
  active,
  calloutKind,
}: {
  node: VehicleTopologyNode
  accent: string
  active: boolean
  calloutKind?: TopologyCalloutKind
}) {
  return (
    <Html position={node.anchor} center distanceFactor={7.2} sprite>
      <span
        className="vehicle-network-viewport__marker"
        style={{ "--vehicle-route-accent": accent } as CSSProperties}
      >
        <span
          className="vehicle-network-viewport__pin"
          data-active={active}
          data-testid="vehicle-topology-pin"
          aria-hidden="true"
        >
          {node.number}
        </span>
        {calloutKind && node.calloutLabel ? (
          <span
            className="vehicle-network-viewport__callout"
            data-kind={calloutKind}
            data-placement={
              calloutKind === "target" ? "target-far-left" : "effect-near-right"
            }
            data-testid="vehicle-topology-callout"
            aria-hidden="true"
          >
            <strong>{node.calloutLabel}</strong>
            <small>
              {calloutKind === "target"
                ? "Target ECU · 교육용 위치"
                : "영향 부위"}
            </small>
          </span>
        ) : null}
      </span>
    </Html>
  )
}

function TopologyOverlay({
  nodes,
  accent,
  activeNodeId,
  targetId,
  effectId,
}: {
  nodes: readonly VehicleTopologyNode[]
  accent: string
  activeNodeId?: VehicleTopologyNodeId
  targetId: VehicleLogicalNodeId
  effectId: VehicleEffectTargetId
}) {
  return (
    <group rotation={MODEL_ROTATION}>
      {nodes.slice(0, -1).map((node, index) => (
        <Line
          key={`${node.id}-${nodes[index + 1].id}`}
          points={[node.anchor, nodes[index + 1].anchor]}
          color={accent}
          lineWidth={1}
          transparent
          opacity={0.68}
        />
      ))}
      {nodes.map((node) => (
        <TopologyPin
          key={node.id}
          node={node}
          accent={accent}
          active={node.id === activeNodeId}
          calloutKind={
            node.id === targetId
              ? "target"
              : node.id === effectId
                ? "effect"
                : undefined
          }
        />
      ))}
    </group>
  )
}

class VehicleErrorBoundary extends Component<{ children: ReactNode }, {
  failed: boolean
}> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The route map and the rest of the lab remain usable without the GLB.
  }

  render() {
    if (this.state.failed) {
      return (
        <Html center>
          <div className="vehicle-network-viewport__status" role="alert">
            <Warning size={18} weight="fill" aria-hidden="true" />
            GLB 차량 시각화를 불러오지 못했습니다.
          </div>
        </Html>
      )
    }
    return this.props.children
  }
}

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  )

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return
    const media = window.matchMedia("(prefers-reduced-motion: reduce)")
    const update = () => setReducedMotion(media.matches)
    update()
    media.addEventListener("change", update)
    return () => media.removeEventListener("change", update)
  }, [])

  return reducedMotion
}

export default function VehicleNetworkViewport({
  route,
  targetId,
  effectId,
  currentNodeId,
  focusedNodeId,
  scenarioTitle,
  accent,
  initialView = "overview",
}: VehicleNetworkViewportProps) {
  const reducedMotion = useReducedMotion()
  const routeNodes = useMemo(() => route.map(getTopologyNode), [route])
  const sourceNode = routeNodes[0]
  const targetNode = getTopologyNode(targetId)
  const effectNode = getTopologyNode(effectId)
  const [cameraFocus, setCameraFocus] = useState<CameraFocus>(() =>
    focusedNodeId
      ? cameraFocusForNode(focusedNodeId, route, targetId, effectId)
      : { view: initialView },
  )
  const cameraPresets = useMemo(
    () => createCameraPresets(sourceNode, targetNode, effectNode),
    [effectNode, sourceNode, targetNode],
  )

  useEffect(() => {
    if (!focusedNodeId) return
    setCameraFocus(cameraFocusForNode(focusedNodeId, route, targetId, effectId))
  }, [effectId, focusedNodeId, route, targetId])

  const focusedId =
    cameraFocus.view === "node"
      ? cameraFocus.nodeId
      : cameraFocus.view === "source"
        ? sourceNode.id
        : cameraFocus.view === "target"
          ? targetId
          : cameraFocus.view === "effect"
            ? effectId
            : undefined
  const activeNodeId = focusedId ?? currentNodeId
  const cameraPreset = useMemo(
    () =>
      cameraFocus.view === "node"
        ? createNodeCameraPreset(getTopologyNode(cameraFocus.nodeId))
        : cameraPresets[cameraFocus.view],
    [cameraFocus, cameraPresets],
  )
  const cameraPresetName =
    cameraFocus.view === "node"
      ? `node:${cameraFocus.nodeId}`
      : cameraFocus.view
  const rootStyle = { "--vehicle-route-accent": accent } as CSSProperties

  return (
    <div
      className="vehicle-network-viewport"
      role="region"
      aria-label={`${scenarioTitle} vehicle network`}
      data-camera-preset={cameraPresetName}
      style={rootStyle}
    >
      <div className="vehicle-network-viewport__toolbar">
        <strong>{scenarioTitle}</strong>
        <div role="group" aria-label="차량 카메라 초점">
          <button
            type="button"
            aria-pressed={cameraFocus.view === "overview"}
            onClick={() => setCameraFocus({ view: "overview" })}
          >
            전체
          </button>
          <button
            type="button"
            aria-pressed={cameraFocus.view === "source"}
            onClick={() => setCameraFocus({ view: "source" })}
          >
            진입점
          </button>
          <button
            type="button"
            aria-pressed={cameraFocus.view === "target"}
            onClick={() => setCameraFocus({ view: "target" })}
          >
            Target ECU
          </button>
          <button
            type="button"
            aria-pressed={cameraFocus.view === "effect"}
            onClick={() => setCameraFocus({ view: "effect" })}
          >
            영향 부위
          </button>
          <button
            type="button"
            className="vehicle-network-viewport__reset"
            onClick={() => setCameraFocus({ view: "overview" })}
          >
            <ArrowCounterClockwise size={13} aria-hidden="true" />
            카메라 초기화
          </button>
        </div>
      </div>

      <ol
        className="vehicle-network-viewport__target-map"
        aria-label={`${scenarioTitle} target map`}
      >
        {routeNodes.map((node) => (
          <li
            key={node.id}
            data-kind={node.kind}
            data-active={node.id === activeNodeId}
            aria-current={node.id === currentNodeId ? "step" : undefined}
          >
            <span className="vehicle-network-viewport__map-number">
              {node.number}
            </span>
            <div>
              <strong>{node.label}</strong>
              <span>{node.role}</span>
              <small data-truth={node.truth}>{node.truthDetail}</small>
            </div>
          </li>
        ))}
      </ol>

      <div className="vehicle-network-viewport__canvas">
        <Canvas
          shadows="basic"
          dpr={[1, 1.5]}
          camera={{
            position: OVERVIEW_CAMERA,
            fov: 34,
            near: 0.05,
            far: 100,
          }}
          gl={{
            alpha: false,
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
          }}
        >
          <color attach="background" args={["#eef2f7"]} />
          <ambientLight intensity={1.05} />
          <hemisphereLight args={["#f8fbff", "#c7d0da", 1.1]} />
          <directionalLight
            castShadow
            position={[6, 8, 5]}
            intensity={2.6}
            shadow-mapSize={[2048, 2048]}
          />
          <spotLight
            position={[-5, 4, -3]}
            angle={0.55}
            penumbra={0.75}
            intensity={0.9}
            color="#8daee8"
          />
          <VehicleErrorBoundary>
            <Suspense
              fallback={
                <Html center>
                  <div
                    className="vehicle-network-viewport__status"
                    role="status"
                  >
                    <CircleNotch
                      size={18}
                      className="door-attack-lab__spin"
                      aria-hidden="true"
                    />
                    GLB 불러오는 중
                  </div>
                </Html>
              }
            >
              <group rotation={MODEL_ROTATION}>
                <VehicleModel immediate={reducedMotion} />
              </group>
              <TopologyOverlay
                nodes={routeNodes}
                accent={accent}
                activeNodeId={activeNodeId}
                targetId={targetId}
                effectId={effectId}
              />
            </Suspense>
          </VehicleErrorBoundary>
          <OrbitControls
            makeDefault
            enableDamping={!reducedMotion}
            dampingFactor={0.075}
            enablePan={false}
            minDistance={2.2}
            maxDistance={10}
            minPolarAngle={0.32}
            maxPolarAngle={Math.PI / 2.02}
          />
          <CameraPresetController
            preset={cameraPreset}
            immediate={reducedMotion}
          />
        </Canvas>
      </div>
      <p className="vehicle-network-viewport__hint">
        드래그: 회전 · 스크롤: 확대/축소
      </p>
    </div>
  )
}
