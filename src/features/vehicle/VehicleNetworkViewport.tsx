import {
  Component,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ErrorInfo,
  type ReactNode,
} from "react"
import {
  Canvas,
  useFrame,
  useThree,
  type ThreeEvent,
} from "@react-three/fiber"
import { Html, Line, OrbitControls, useGLTF } from "@react-three/drei"
import {
  ArrowCounterClockwise,
  CircleNotch,
  Warning,
} from "@phosphor-icons/react"
import * as THREE from "three"
import VehicleFlowRail from "./VehicleFlowRail"
import { useVehicleRig } from "./useVehicleRig"
import type {
  VehicleFlowNodeId,
  VehicleFlowPlaybackSnapshot,
} from "./vehicleFlowTypes"
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
const OVERVIEW_CAMERA: [number, number, number] = [-6.2, 2.9, 0.55]
const OVERVIEW_FOV = 38
const CAMERA_TARGET: [number, number, number] = [0, 0.72, 0]
const XRAY_TINT = new THREE.Color("#a8bac8")
const MECHANICAL_MESH_NAME = /TIRE|WHEEL|BRAKE|CALIPER|STEER/i
const IDLE_PLAYBACK: VehicleFlowPlaybackSnapshot = {
  playbackId: 0,
  phase: "idle",
  trace: null,
  traceIndex: 0,
  traceCount: 0,
  segmentIndex: 0,
}

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
  playback?: VehicleFlowPlaybackSnapshot
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
type VehicleFlowEdgeState =
  | "idle"
  | "queued"
  | "active"
  | "passed"
  | "cancelled"
type VehicleFlowNodeVisualState = "active" | "cancelled"

interface VehicleRouteNode {
  node: VehicleTopologyNode
  traceIndex: number
}

interface OrbitControlsState {
  target: THREE.Vector3
  update: () => void
}

function getTopologyNode(id: VehicleTopologyNodeId): VehicleTopologyNode {
  const node = VEHICLE_TOPOLOGY_BY_ID.get(id)
  if (!node) throw new Error(`Unknown vehicle topology node: ${id}`)
  return node
}

function isVehicleTopologyNodeId(
  nodeId: VehicleFlowNodeId,
): nodeId is VehicleTopologyNodeId {
  return VEHICLE_TOPOLOGY_BY_ID.has(nodeId as VehicleTopologyNodeId)
}

function playbackSnapshotForRendering(
  playback: VehicleFlowPlaybackSnapshot,
): VehicleFlowPlaybackSnapshot {
  const trace = playback.trace
  if (!trace || trace.outcome !== "REJECTED") return playback

  const stoppedIndex = trace.stoppedAt
    ? trace.route.indexOf(trace.stoppedAt)
    : -1
  const boundedRoute =
    stoppedIndex >= 0 ? trace.route.slice(0, stoppedIndex + 1) : []
  const segmentIndex = Math.min(
    playback.segmentIndex,
    Math.max(0, boundedRoute.length - 1),
  )
  if (
    boundedRoute.length === trace.route.length &&
    segmentIndex === playback.segmentIndex
  ) {
    return playback
  }

  return {
    ...playback,
    trace: { ...trace, route: boundedRoute },
    segmentIndex,
  }
}

export function effectTargetFromObject(
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

function VehicleModel({
  immediate,
  onSelectEffect,
}: {
  immediate: boolean
  onSelectEffect: (effectId: VehicleEffectTargetId) => void
}) {
  const gltf = useGLTF(MODEL_PATH)
  const { scene, xrayMaterials } = useMemo(() => {
    const clonedScene = gltf.scene.clone(true)
    const clonedMaterials: THREE.Material[] = []

    clonedScene.traverse((object) => {
      const mesh = object as THREE.Mesh
      if (!mesh.isMesh) return

      const isMechanical = MECHANICAL_MESH_NAME.test(mesh.name)
      const createXrayMaterial = (material: THREE.Material) => {
        const xrayMaterial = material.clone()
        xrayMaterial.transparent = true
        xrayMaterial.opacity = isMechanical ? 0.72 : 0.4
        xrayMaterial.depthWrite = false
        xrayMaterial.side = THREE.DoubleSide

        if (
          "color" in xrayMaterial &&
          xrayMaterial.color instanceof THREE.Color
        ) {
          xrayMaterial.color.lerp(XRAY_TINT, 0.72)
        }

        xrayMaterial.needsUpdate = true
        clonedMaterials.push(xrayMaterial)
        return xrayMaterial
      }

      mesh.material = Array.isArray(mesh.material)
        ? mesh.material.map(createXrayMaterial)
        : createXrayMaterial(mesh.material)
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.frustumCulled = false
    })

    return { scene: clonedScene, xrayMaterials: clonedMaterials }
  }, [gltf.scene])

  useVehicleRig(scene, { immediate })

  useEffect(
    () => () => {
      xrayMaterials.forEach((material) => material.dispose())
    },
    [xrayMaterials],
  )

  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      const effectId = effectTargetFromObject(event.object)
      if (!effectId) return
      event.stopPropagation()
      onSelectEffect(effectId)
    },
    [onSelectEffect],
  )

  return <primitive object={scene} onClick={handleClick} />
}

function TopologyPin({
  node,
  accent,
  active,
  calloutKind,
  cameraFocused,
  tooltipVisible,
  tooltipTranslucent,
  onSelect,
}: {
  node: VehicleTopologyNode
  accent: string
  active: boolean
  calloutKind?: TopologyCalloutKind
  cameraFocused: boolean
  tooltipVisible: boolean
  tooltipTranslucent: boolean
  onSelect: (nodeId: VehicleTopologyNodeId) => void
}) {
  const handleSelect = useCallback(() => onSelect(node.id), [node.id, onSelect])

  return (
    <Html position={node.anchor} center distanceFactor={7.2} sprite>
      <span
        className="vehicle-network-viewport__marker"
        style={{ "--vehicle-route-accent": accent } as CSSProperties}
      >
        <button
          type="button"
          className="vehicle-network-viewport__pin"
          data-active={active}
          data-testid="vehicle-topology-pin"
          aria-label={`${node.label} 선택`}
          onClick={handleSelect}
        >
          {node.number}
        </button>
        {calloutKind && node.calloutLabel ? (
          <span
            className="vehicle-network-viewport__callout"
            data-kind={calloutKind}
            data-placement={
              calloutKind === "target" ? "target-far-left" : "effect-high-right"
            }
            data-camera-focused={cameraFocused ? "true" : undefined}
            data-visible={tooltipVisible ? "true" : undefined}
            data-translucent={tooltipTranslucent ? "true" : undefined}
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

function flowEdgeState(
  sourceTraceIndex: number,
  destinationTraceIndex: number,
  playback: VehicleFlowPlaybackSnapshot,
): VehicleFlowEdgeState {
  if (!playback.trace || playback.phase === "idle") return "idle"
  if (destinationTraceIndex <= playback.segmentIndex) return "passed"
  if (sourceTraceIndex === playback.segmentIndex) {
    if (playback.phase === "playing") return "active"
    if (playback.phase === "cancelled") return "cancelled"
  }
  return "queued"
}

function lineOpacity(state: VehicleFlowEdgeState): number {
  if (state === "active") return 1
  if (state === "passed") return 0.92
  if (state === "cancelled") return 0.52
  if (state === "queued") return 0.28
  return 0.68
}

function TopologyHitTarget({
  node,
  onSelect,
}: {
  node: VehicleTopologyNode
  onSelect: (nodeId: VehicleTopologyNodeId) => void
}) {
  const handleClick = useCallback(
    (event: ThreeEvent<MouseEvent>) => {
      event.stopPropagation()
      onSelect(node.id)
    },
    [node.id, onSelect],
  )

  return (
    <mesh
      position={node.anchor}
      onClick={handleClick}
      name={`vehicle-topology-hit-target:${node.id}`}
      userData={{ vehicleNodeId: node.id, role: "hit-target" }}
    >
      <sphereGeometry args={[0.12, 12, 12]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  )
}

function FlowNodeHalo({
  node,
  accent,
  state,
}: {
  node: VehicleTopologyNode
  accent: string
  state: VehicleFlowNodeVisualState
}) {
  return (
    <mesh
      position={node.anchor}
      name={`vehicle-flow-node-halo:${node.id}:${state}`}
      userData={{ vehicleNodeId: node.id, flowState: state }}
    >
      <sphereGeometry args={[0.17, 16, 16]} />
      <meshBasicMaterial
        color={accent}
        transparent
        opacity={0.28}
        depthWrite={false}
      />
    </mesh>
  )
}

function FlowPacket({
  from,
  to,
  durationMs,
  accent,
}: {
  from: VehicleTopologyNode
  to: VehicleTopologyNode
  durationMs: number
  accent: string
}) {
  const ref = useRef<THREE.Mesh>(null)
  const progress = useRef(0)
  const fromPosition = useMemo(
    () => new THREE.Vector3(...from.anchor),
    [from],
  )
  const toPosition = useMemo(() => new THREE.Vector3(...to.anchor), [to])

  useFrame((_, delta) => {
    progress.current = Math.min(
      1,
      progress.current + Math.min(delta, 0.05) / (durationMs / 1000),
    )
    ref.current?.position.lerpVectors(
      fromPosition,
      toPosition,
      progress.current,
    )
  })

  return (
    <mesh
      ref={ref}
      position={from.anchor}
      name="vehicle-flow-packet"
      userData={{ role: "flow-packet" }}
    >
      <sphereGeometry args={[0.055, 14, 14]} />
      <meshStandardMaterial
        color="#f6fbff"
        emissive={accent}
        emissiveIntensity={2.2}
      />
    </mesh>
  )
}

function TopologyOverlay({
  nodes,
  flowRoute,
  playback,
  accent,
  activeNodeId,
  activeNodeState,
  cameraFocusedNodeId,
  visibleTooltipNodeId,
  targetId,
  effectId,
  reducedMotion,
  onSelect,
}: {
  nodes: readonly VehicleTopologyNode[]
  flowRoute: readonly VehicleRouteNode[]
  playback: VehicleFlowPlaybackSnapshot
  accent: string
  activeNodeId?: VehicleTopologyNodeId
  activeNodeState: VehicleFlowNodeVisualState
  cameraFocusedNodeId?: VehicleTopologyNodeId
  visibleTooltipNodeId?: VehicleTopologyNodeId
  targetId: VehicleLogicalNodeId
  effectId: VehicleEffectTargetId
  reducedMotion: boolean
  onSelect: (nodeId: VehicleTopologyNodeId) => void
}) {
  const activeEdgeIndex = flowRoute
    .slice(1)
    .findIndex(({ traceIndex }, index) =>
      flowEdgeState(
        flowRoute[index].traceIndex,
        traceIndex,
        playback,
      ) === "active",
    )
  const activeEdge =
    activeEdgeIndex >= 0
      ? [flowRoute[activeEdgeIndex], flowRoute[activeEdgeIndex + 1]]
      : undefined
  const activeNode = activeNodeId
    ? VEHICLE_TOPOLOGY_BY_ID.get(activeNodeId)
    : undefined

  return (
    <group rotation={MODEL_ROTATION}>
      {flowRoute.slice(0, -1).map(({ node }, index) => {
        const destination = flowRoute[index + 1]
        const state = flowEdgeState(
          flowRoute[index].traceIndex,
          destination.traceIndex,
          playback,
        )
        return (
          <Line
            key={`${node.id}-${destination.node.id}`}
            points={[node.anchor, destination.node.anchor]}
            color={accent}
            lineWidth={state === "active" ? 2 : 1}
            transparent
            opacity={lineOpacity(state)}
            userData={{ flowState: state }}
          />
        )
      })}
      {activeNode ? (
        <FlowNodeHalo
          node={activeNode}
          accent={accent}
          state={activeNodeState}
        />
      ) : null}
      {!reducedMotion && activeEdge ? (
        <FlowPacket
          key={[
            playback.playbackId,
            playback.traceIndex,
            playback.segmentIndex,
          ].join(":")}
          from={activeEdge[0].node}
          to={activeEdge[1].node}
          durationMs={220}
          accent={accent}
        />
      ) : null}
      {nodes.map((node) => (
        <group key={node.id}>
          <TopologyHitTarget node={node} onSelect={onSelect} />
          <TopologyPin
            node={node}
            accent={accent}
            active={node.id === activeNodeId}
            cameraFocused={node.id === cameraFocusedNodeId}
            tooltipVisible={node.id === visibleTooltipNodeId}
            tooltipTranslucent={
              node.id === visibleTooltipNodeId &&
              cameraFocusedNodeId !== undefined
            }
            onSelect={onSelect}
            calloutKind={
              node.id === targetId
                ? "target"
                : node.id === effectId
                  ? "effect"
                  : undefined
            }
          />
        </group>
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
  playback,
}: VehicleNetworkViewportProps) {
  const reducedMotion = useReducedMotion()
  const playbackState = useMemo(
    () => playbackSnapshotForRendering(playback ?? IDLE_PLAYBACK),
    [playback],
  )
  const routeNodes = useMemo(() => route.map(getTopologyNode), [route])
  const flowRoute = useMemo<VehicleRouteNode[]>(() => {
    if (!playbackState.trace) {
      return routeNodes.map((node, traceIndex) => ({ node, traceIndex }))
    }
    return playbackState.trace.route.flatMap((nodeId, traceIndex) =>
      isVehicleTopologyNodeId(nodeId)
        ? [{ node: getTopologyNode(nodeId), traceIndex }]
        : [],
    )
  }, [playbackState.trace, routeNodes])
  const sourceNode = routeNodes[0]
  const targetNode = getTopologyNode(targetId)
  const effectNode = getTopologyNode(effectId)
  const [cameraFocus, setCameraFocus] = useState<CameraFocus>(() =>
    focusedNodeId
      ? cameraFocusForNode(focusedNodeId, route, targetId, effectId)
      : { view: initialView },
  )
  const previousPlaybackRef = useRef({
    phase: IDLE_PLAYBACK.phase,
    playbackId: IDLE_PLAYBACK.playbackId,
  })
  const cameraPresets = useMemo(
    () => createCameraPresets(sourceNode, targetNode, effectNode),
    [effectNode, sourceNode, targetNode],
  )
  const onSelectNode = useCallback(
    (nodeId: VehicleTopologyNodeId) => {
      setCameraFocus(cameraFocusForNode(nodeId, route, targetId, effectId))
    },
    [effectId, route, targetId],
  )

  useEffect(() => {
    if (!focusedNodeId) return
    onSelectNode(focusedNodeId)
  }, [focusedNodeId, onSelectNode])

  useEffect(() => {
    const previousPlayback = previousPlaybackRef.current
    previousPlaybackRef.current = {
      phase: playbackState.phase,
      playbackId: playbackState.playbackId,
    }
    if (
      playbackState.phase === "playing"
      && (
        previousPlayback.phase === "idle"
        || previousPlayback.playbackId !== playbackState.playbackId
      )
    ) {
      setCameraFocus({ view: "overview" })
    }
  }, [playbackState.phase, playbackState.playbackId])

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
  const playbackNodeId =
    playbackState.phase === "playing" || playbackState.phase === "cancelled"
      ? playbackState.trace?.route[playbackState.segmentIndex]
      : undefined
  const playbackCurrentNodeId =
    playbackNodeId && isVehicleTopologyNodeId(playbackNodeId)
      ? playbackNodeId
      : undefined
  const playbackActiveNodeId =
    playbackState.phase === "playing" ? playbackCurrentNodeId : undefined
  const activeNodeId = playbackCurrentNodeId ?? focusedId ?? currentNodeId
  const activeNodeState: VehicleFlowNodeVisualState =
    playbackState.phase === "cancelled" && playbackCurrentNodeId
      ? "cancelled"
      : "active"
  const visibleTooltipNodeId = playbackActiveNodeId ?? focusedId
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
        tabIndex={0}
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

      <VehicleFlowRail
        scenarioTitle={scenarioTitle}
        route={route}
        playback={playbackState}
        accent={accent}
      />

      <div className="vehicle-network-viewport__canvas">
        <Canvas
          shadows
          dpr={[1, 1.5]}
          camera={{
            position: OVERVIEW_CAMERA,
            fov: OVERVIEW_FOV,
            near: 0.05,
            far: 100,
          }}
          gl={{
            alpha: false,
            antialias: true,
            toneMapping: THREE.ACESFilmicToneMapping,
          }}
        >
          <color attach="background" args={["#0b1018"]} />
          <fog attach="fog" args={["#0b1018", 7, 14]} />
          <ambientLight intensity={0.72} />
          <hemisphereLight args={["#c9dcff", "#05070d", 0.72]} />
          <directionalLight
            castShadow
            position={[6, 8, 5]}
            intensity={2.35}
            shadow-mapSize={[2048, 2048]}
          />
          <spotLight
            position={[-5, 4, -3]}
            angle={0.52}
            penumbra={0.72}
            intensity={1.2}
            color="#b3c9ff"
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
                <VehicleModel
                  immediate={reducedMotion}
                  onSelectEffect={onSelectNode}
                />
              </group>
              <TopologyOverlay
                nodes={routeNodes}
                flowRoute={flowRoute}
                playback={playbackState}
                accent={accent}
                activeNodeId={activeNodeId}
                activeNodeState={activeNodeState}
                cameraFocusedNodeId={focusedId}
                visibleTooltipNodeId={visibleTooltipNodeId}
                targetId={targetId}
                effectId={effectId}
                reducedMotion={reducedMotion}
                onSelect={onSelectNode}
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
