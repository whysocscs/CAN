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
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber"
import { Html, Line } from "@react-three/drei"
import {
  ArrowCounterClockwise,
  CircleNotch,
  Warning,
} from "@phosphor-icons/react"
import * as THREE from "three"
import VehicleFlowRail from "./VehicleFlowRail"
import {
  NORMAL_CAN_SCENE_PRESET,
  SharedVehicleCanvas,
  SharedVehicleOverviewController,
  SharedVehicleOrbitControls,
  SharedVehicleScene,
  effectTargetFromVehicleObject,
  useSharedVehicleClone,
  vehicleLocalPointToWorld,
} from "./SharedVehicleScene"
import { useVehicleRig } from "./useVehicleRig"
import type {
  VehicleFlowNodeFeedback,
  VehicleFlowNodeId,
  VehicleFlowPlaybackMode,
  VehicleFlowPlaybackSnapshot,
  VehicleFlowPresentation,
} from "./vehicleFlowTypes"
import {
  VEHICLE_TOPOLOGY_BY_ID,
  type VehicleEffectTargetId,
  type VehicleLogicalNodeId,
  type VehicleTopologyNode,
  type VehicleTopologyNodeId,
} from "./vehicleTopology"

const CAMERA_TARGET: [number, number, number] = [0, 0, 0]
const IDS_OBSERVER_TONE = "#f59e0b"
const REJECTED_TONE = "#d12f2f"
const EFFECT_TONE = "#287a52"
const FLOW_PACKET_DURATION_MS = 600
const FLOW_CALLOUT_INSET = 8
const FLOW_CALLOUT_MAX_WIDTH = 220
const FLOW_CALLOUT_MIN_WIDTH = 160
const FLOW_CALLOUT_FALLBACK_HEIGHT = 112
const FLOW_CALLOUT_PLACEMENT_DIRECTIONS = [
  [1, -1],
  [-1, -1],
  [1, 1],
  [-1, 1],
] as const
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
  presentation?: VehicleFlowPresentation
  playbackPaused?: boolean
  onPlaybackPause?: () => void
  onPlaybackResume?: () => void
  onPlaybackNextStep?: () => void
  playbackMode?: VehicleFlowPlaybackMode
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
type TopologyCalloutKind = "logical" | "target" | "effect"
type VehicleFlowEdgeState = "idle" | "queued" | "active" | "passed" | "cancelled"
type VehicleFlowNodeVisualState = "active" | "cancelled" | "observer" | "rejected" | "effect"
type VehicleScenePhase = "loading" | "fitting" | "ready" | "error"

interface VehicleRouteNode {
  node: VehicleTopologyNode
  traceIndex: number
}

interface VehicleTopologyFeedback extends VehicleFlowNodeFeedback {
  nodeId: VehicleTopologyNodeId
}

interface PinScreenOffset {
  x: number
  y: number
}

const PIN_SCREEN_OFFSETS: Record<VehicleTopologyNodeId, PinScreenOffset> = {
  obd: { x: -72, y: 34 },
  ids: { x: -68, y: -34 },
  gateway: { x: 0, y: -74 },
  body: { x: 70, y: -30 },
  rear: { x: 74, y: -36 },
  leftDoor: { x: 54, y: 58 },
  tailgate: { x: 15, y: 65 },
}

const COMPACT_PIN_SCREEN_OFFSETS: Record<VehicleTopologyNodeId, PinScreenOffset> =
  {
    obd: { x: -36, y: 34 },
    ids: { x: -34, y: -20 },
    gateway: { x: 0, y: -46 },
    body: { x: 22, y: -18 },
    rear: { x: 22, y: -18 },
    leftDoor: { x: 28, y: 38 },
    tailgate: { x: -24, y: 42 },
  }

const LOGICAL_CALLOUT_STYLE: CSSProperties = {
  width: "104px",
  maxWidth: "calc(100vw - 48px)",
  whiteSpace: "normal",
}

const DYNAMIC_CALLOUT_STYLE: CSSProperties = {
  width: "clamp(160px, 22vw, 220px)",
  maxWidth:
    "min(calc(100vw - 16px), var(--vehicle-feedback-canvas-max-width, calc(100vw - 16px)))",
  whiteSpace: "normal",
  pointerEvents: "auto",
}
const DYNAMIC_CALLOUT_TITLE_STYLE: CSSProperties = { fontSize: "12px" }
const DYNAMIC_CALLOUT_STATUS_STYLE: CSSProperties = { fontSize: "11px" }
const DYNAMIC_CALLOUT_DETAIL_STYLE: CSSProperties = { fontSize: "11px" }
const DYNAMIC_CALLOUT_META_STYLE: CSSProperties = { fontSize: "10px" }

const HTML_PIN_LAYER_STYLE: CSSProperties = { pointerEvents: "none" }
const PIN_BUTTON_STYLE: CSSProperties = { pointerEvents: "auto" }
const PIN_Z_INDEX_RANGE: [number, number] = [100, 0]
const FEEDBACK_Z_INDEX_RANGE: [number, number] = [200, 101]

interface OrbitControlsState {
  target: THREE.Vector3
  update: () => void
  dispatchEvent: (event: { type: "start" }) => void
}

interface FlowCalloutGeometryInput {
  anchorX: number
  anchorY: number
  canvasWidth: number
  canvasHeight: number
  calloutWidth: number
  calloutHeight: number
  inset?: number
}

export interface FlowCalloutGeometry {
  left: number
  top: number
  leaderEndX: number
  leaderEndY: number
}

function clampNumber(value: number, minimum: number, maximum: number): number {
  if (minimum > maximum) return (minimum + maximum) / 2
  return Math.min(maximum, Math.max(minimum, value))
}

export function clampFlowCalloutPosition({
  anchorX,
  anchorY,
  canvasWidth,
  canvasHeight,
  calloutWidth,
  calloutHeight,
  inset = FLOW_CALLOUT_INSET,
}: FlowCalloutGeometryInput): FlowCalloutGeometry {
  const halfWidth = calloutWidth / 2
  const halfHeight = calloutHeight / 2
  let centerX = anchorX
  let centerY = anchorY
  let bestScore = Number.POSITIVE_INFINITY
  for (const [horizontal, vertical] of FLOW_CALLOUT_PLACEMENT_DIRECTIONS) {
    const preferredCenterX = anchorX + horizontal * (halfWidth + 24)
    const preferredCenterY = anchorY + vertical * (halfHeight + 16)
    const candidateCenterX = clampNumber(
      preferredCenterX,
      inset + halfWidth,
      canvasWidth - inset - halfWidth,
    )
    const candidateCenterY = clampNumber(
      preferredCenterY,
      inset + halfHeight,
      canvasHeight - inset - halfHeight,
    )
    const left = candidateCenterX - halfWidth
    const top = candidateCenterY - halfHeight
    const anchorInside =
      anchorX > left &&
      anchorX < left + calloutWidth &&
      anchorY > top &&
      anchorY < top + calloutHeight
    const clampDistance = Math.hypot(
      candidateCenterX - preferredCenterX,
      candidateCenterY - preferredCenterY,
    )
    const score = clampDistance + (anchorInside ? 1_000_000 : 0)
    if (score < bestScore) {
      centerX = candidateCenterX
      centerY = candidateCenterY
      bestScore = score
    }
  }
  const left = centerX - halfWidth
  const top = centerY - halfHeight
  const deltaX = anchorX - centerX
  const deltaY = anchorY - centerY
  const scaleX =
    deltaX === 0 ? Number.POSITIVE_INFINITY : halfWidth / Math.abs(deltaX)
  const scaleY =
    deltaY === 0 ? Number.POSITIVE_INFINITY : halfHeight / Math.abs(deltaY)
  const boundaryScale = Math.min(scaleX, scaleY)
  const leaderEndX = Number.isFinite(boundaryScale)
    ? centerX + deltaX * boundaryScale
    : centerX
  const leaderEndY = Number.isFinite(boundaryScale)
    ? centerY + deltaY * boundaryScale
    : top

  return { left, top, leaderEndX, leaderEndY }
}

function fallbackFlowCalloutWidth(): number {
  if (typeof window === "undefined") return FLOW_CALLOUT_MAX_WIDTH
  return clampNumber(
    window.innerWidth * 0.22,
    FLOW_CALLOUT_MIN_WIDTH,
    FLOW_CALLOUT_MAX_WIDTH,
  )
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

function isVehicleTopologyFeedback(
  feedback: VehicleFlowNodeFeedback,
): feedback is VehicleTopologyFeedback {
  return isVehicleTopologyNodeId(feedback.nodeId)
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

export { effectTargetFromVehicleObject as effectTargetFromObject }

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

function createNodeCameraPreset(
  node: VehicleTopologyNode,
  vehicleRoot: THREE.Object3D | null,
  offset = new THREE.Vector3(3.4, 1.8, 3.4),
): CameraPreset {
  const target = vehicleRoot
    ? vehicleLocalPointToWorld(vehicleRoot, node.anchor)
    : new THREE.Vector3(...node.anchor)
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
  vehicleRoot: THREE.Object3D | null,
): Record<VehicleCameraView, CameraPreset> {
  return {
    overview: {
      position: new THREE.Vector3(...NORMAL_CAN_SCENE_PRESET.camera.position),
      target: new THREE.Vector3(...CAMERA_TARGET),
    },
    source: createNodeCameraPreset(
      source,
      vehicleRoot,
      new THREE.Vector3(3.4, 1.7, 3.4),
    ),
    target: createNodeCameraPreset(
      target,
      vehicleRoot,
      new THREE.Vector3(3.8, 1.9, 3.1),
    ),
    effect: createNodeCameraPreset(effect, vehicleRoot),
  }
}

function CameraPresetController({
  preset,
  active,
  immediate,
}: {
  preset: CameraPreset
  active: boolean
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
    if (!active) {
      progress.current = 1
      return
    }

    // Bounds keeps its own camera animation alive after an overview fit.
    // Notify OrbitControls of a new interaction so Bounds cancels that
    // animation before this focused preset takes ownership of the camera.
    controls?.dispatchEvent({ type: "start" })

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
  }, [active, camera, controls, immediate, preset])

  useFrame((_, delta) => {
    if (!active) return
    if (progress.current >= 1) {
      if (controls && !controls.target.equals(preset.target)) {
        controls.target.copy(preset.target)
        controls.update()
      }
      return
    }
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

function VehicleRigAttachment({ immediate }: { immediate: boolean }) {
  const scene = useSharedVehicleClone()
  useVehicleRig(scene, { immediate })
  return null
}

function DynamicTopologyFeedback({
  node,
  feedback,
  truthQualifier,
}: {
  node: VehicleTopologyNode
  feedback: VehicleFlowNodeFeedback
  truthQualifier: string
}) {
  const elementRef = useRef<HTMLSpanElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const measuredSizeRef = useRef({ width: 0, height: 0 })
  const projectedPositionRef = useRef(new THREE.Vector3())
  const setElementRef = useCallback((element: HTMLSpanElement | null) => {
    observerRef.current?.disconnect()
    observerRef.current = null
    elementRef.current = element
    if (!element) return

    const measure = () => {
      const rect = element.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        measuredSizeRef.current = {
          width: rect.width,
          height: rect.height,
        }
      }
    }
    measure()
    if (typeof ResizeObserver === "undefined") return

    const observer = new ResizeObserver(measure)
    observer.observe(element)
    observerRef.current = observer
  }, [])
  const calculatePosition = useCallback(
    (
      object: THREE.Object3D,
      camera: THREE.Camera,
      size: { width: number; height: number },
    ): [number, number] => {
      const projectedPosition = projectedPositionRef.current
      projectedPosition
        .setFromMatrixPosition(object.matrixWorld)
        .project(camera)
      const anchorX = (projectedPosition.x * 0.5 + 0.5) * size.width
      const anchorY = (projectedPosition.y * -0.5 + 0.5) * size.height
      const availableWidth = Math.max(1, size.width - FLOW_CALLOUT_INSET * 2)
      const measuredSize = measuredSizeRef.current
      const calloutWidth = Math.min(
        measuredSize.width || fallbackFlowCalloutWidth(),
        availableWidth,
      )
      const calloutHeight = measuredSize.height || FLOW_CALLOUT_FALLBACK_HEIGHT
      const geometry = clampFlowCalloutPosition({
        anchorX,
        anchorY,
        canvasWidth: size.width,
        canvasHeight: size.height,
        calloutWidth,
        calloutHeight,
      })
      const leaderX = geometry.leaderEndX - geometry.left
      const leaderY = geometry.leaderEndY - geometry.top
      const deltaX = anchorX - geometry.leaderEndX
      const deltaY = anchorY - geometry.leaderEndY
      const element = elementRef.current
      if (element) {
        element.style.setProperty(
          "--vehicle-feedback-canvas-max-width",
          `${availableWidth}px`,
        )
        element.style.setProperty("--vehicle-feedback-leader-x", `${leaderX}px`)
        element.style.setProperty("--vehicle-feedback-leader-y", `${leaderY}px`)
        element.style.setProperty(
          "--vehicle-feedback-leader-length",
          `${Math.hypot(deltaX, deltaY)}px`,
        )
        element.style.setProperty(
          "--vehicle-feedback-leader-angle",
          `${Math.atan2(deltaY, deltaX)}rad`,
        )
      }
      return [
        geometry.left + calloutWidth / 2,
        geometry.top + calloutHeight / 2,
      ]
    },
    [],
  )

  return (
    <Html
      position={node.anchor}
      center
      calculatePosition={calculatePosition}
      className="vehicle-network-viewport__feedback-layer"
      style={HTML_PIN_LAYER_STYLE}
      zIndexRange={FEEDBACK_Z_INDEX_RANGE}
    >
      <span
        ref={setElementRef}
        className="vehicle-network-viewport__feedback"
        data-status={feedback.status}
        data-testid="vehicle-flow-feedback"
        style={DYNAMIC_CALLOUT_STYLE}
      >
        <span
          className="vehicle-network-viewport__feedback-leader"
          data-testid="vehicle-flow-feedback-leader"
          aria-hidden="true"
        />
        <strong style={DYNAMIC_CALLOUT_TITLE_STYLE}>{feedback.title}</strong>
        <b style={DYNAMIC_CALLOUT_STATUS_STYLE}>{feedback.status}</b>
        <small style={DYNAMIC_CALLOUT_DETAIL_STYLE}>{feedback.detail}</small>
        <em style={DYNAMIC_CALLOUT_META_STYLE}>{feedback.source}</em>
        <span
          className="vehicle-network-viewport__feedback-truth"
          style={DYNAMIC_CALLOUT_META_STYLE}
        >
          {truthQualifier}
        </span>
      </span>
    </Html>
  )
}

function TopologyPin({
  node,
  accent,
  active,
  calloutKind,
  cameraFocused,
  tooltipVisible,
  tooltipTranslucent,
  feedback,
  contextSuppressed,
  onSelect,
}: {
  node: VehicleTopologyNode
  accent: string
  active: boolean
  calloutKind?: TopologyCalloutKind
  cameraFocused: boolean
  tooltipVisible: boolean
  tooltipTranslucent: boolean
  feedback?: VehicleFlowNodeFeedback
  contextSuppressed: boolean
  onSelect: (nodeId: VehicleTopologyNodeId) => void
}) {
  const handleSelect = useCallback(() => onSelect(node.id), [node.id, onSelect])
  const screenOffset = PIN_SCREEN_OFFSETS[node.id]
  const compactScreenOffset = COMPACT_PIN_SCREEN_OFFSETS[node.id]
  const calloutKindForNode = feedback
    ? undefined
    : (calloutKind ??
      (tooltipVisible && node.kind === "logical" ? "logical" : undefined))
  const calloutPlacement =
    calloutKindForNode === "target"
      ? "target-far-left"
      : calloutKindForNode === "effect"
        ? "effect-high-right"
        : "logical-right"
  const markerStyle = {
    "--vehicle-route-accent": accent,
    "--vehicle-pin-wide-offset-x": `${screenOffset.x}px`,
    "--vehicle-pin-wide-offset-y": `${screenOffset.y}px`,
    "--vehicle-pin-wide-leader-length": `${Math.hypot(screenOffset.x, screenOffset.y)}px`,
    "--vehicle-pin-wide-leader-angle": `${Math.atan2(-screenOffset.y, -screenOffset.x)}rad`,
    "--vehicle-pin-compact-offset-x": `${compactScreenOffset.x}px`,
    "--vehicle-pin-compact-offset-y": `${compactScreenOffset.y}px`,
    "--vehicle-pin-compact-leader-length": `${Math.hypot(compactScreenOffset.x, compactScreenOffset.y)}px`,
    "--vehicle-pin-compact-leader-angle": `${Math.atan2(-compactScreenOffset.y, -compactScreenOffset.x)}rad`,
    opacity: contextSuppressed ? 0.24 : 1,
  } as CSSProperties

  const truthQualifier =
    node.kind === "effect"
      ? "GLB 동작 기준점 · 실제 actuator 위치 아님"
      : "교육용 논리 ECU · 실제 OEM 위치 아님"

  return (
    <>
      <Html
        position={node.anchor}
        center
        distanceFactor={7.2}
        sprite
        className="vehicle-network-viewport__html-layer"
        style={HTML_PIN_LAYER_STYLE}
        zIndexRange={PIN_Z_INDEX_RANGE}
      >
        <span
          className="vehicle-network-viewport__marker"
          data-node-id={node.id}
          data-testid="vehicle-topology-marker"
          data-context-suppressed={contextSuppressed ? "true" : undefined}
          style={markerStyle}
        >
          <span
            className="vehicle-network-viewport__leader"
            data-testid="vehicle-topology-leader"
            aria-hidden="true"
          />
          <button
            type="button"
            className="vehicle-network-viewport__pin"
            data-active={active}
            data-feedback-status={feedback?.status}
            data-testid="vehicle-topology-pin"
            aria-label={`${node.label} 선택`}
            onClick={handleSelect}
            disabled={contextSuppressed}
            style={PIN_BUTTON_STYLE}
          >
            {node.number}
          </button>
          {calloutKindForNode ? (
            <span
              className={
                calloutKindForNode === "logical"
                  ? "vehicle-network-viewport__callout vehicle-network-viewport__callout--logical"
                  : "vehicle-network-viewport__callout"
              }
              data-kind={calloutKindForNode}
              data-placement={calloutPlacement}
              style={
                calloutKindForNode === "logical"
                  ? LOGICAL_CALLOUT_STYLE
                  : undefined
              }
              data-camera-focused={cameraFocused ? "true" : undefined}
              data-visible={tooltipVisible ? "true" : undefined}
              data-translucent={tooltipTranslucent ? "true" : undefined}
              data-testid="vehicle-topology-callout"
              aria-hidden="true"
            >
              <strong>{node.calloutLabel ?? node.label}</strong>
              <small>
                {calloutKindForNode === "target"
                  ? "Target ECU · 교육용 위치"
                  : calloutKindForNode === "effect"
                    ? "영향 부위"
                    : `${node.role} · 실제 OEM 배치 아님`}
              </small>
            </span>
          ) : null}
        </span>
      </Html>
      {feedback ? (
        <DynamicTopologyFeedback
          node={node}
          feedback={feedback}
          truthQualifier={truthQualifier}
        />
      ) : null}
    </>
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
  if (state === "passed") return 0.56
  if (state === "cancelled") return 0.52
  if (state === "queued") return 0.16
  return 0.42
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
  const tone =
    state === "observer"
      ? IDS_OBSERVER_TONE
      : state === "rejected"
        ? REJECTED_TONE
        : state === "effect"
          ? EFFECT_TONE
          : accent
  return (
    <group
      position={node.anchor}
      name={`vehicle-flow-node-halo:${node.id}:${state}`}
      userData={{ vehicleNodeId: node.id, flowState: state }}
    >
      <mesh
        name={`vehicle-flow-node-halo-layer:${node.id}:inner`}
        userData={{ haloLayer: "inner" }}
        renderOrder={20}
      >
        <sphereGeometry args={[0.19, 20, 20]} />
        <meshBasicMaterial
          color={tone}
          transparent
          opacity={0.64}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      <mesh
        name={`vehicle-flow-node-halo-layer:${node.id}:outer`}
        userData={{ haloLayer: "outer" }}
        renderOrder={19}
      >
        <sphereGeometry args={[0.28, 20, 20]} />
        <meshBasicMaterial
          color={tone}
          transparent
          opacity={0.24}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
    </group>
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
  const fromPosition = useMemo(() => new THREE.Vector3(...from.anchor), [from])
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
  feedback,
  structuredPresentation,
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
  feedback?: VehicleFlowNodeFeedback
  structuredPresentation: boolean
  reducedMotion: boolean
  onSelect: (nodeId: VehicleTopologyNodeId) => void
}) {
  const activeEdgeIndex = flowRoute
    .slice(1)
    .findIndex(
      ({ traceIndex }, index) =>
        flowEdgeState(flowRoute[index].traceIndex, traceIndex, playback) ===
        "active",
    )
  const activeEdge =
    activeEdgeIndex >= 0
      ? [flowRoute[activeEdgeIndex], flowRoute[activeEdgeIndex + 1]]
      : undefined
  const activeNode = activeNodeId
    ? VEHICLE_TOPOLOGY_BY_ID.get(activeNodeId)
    : undefined

  return (
    <group>
      {flowRoute.slice(0, -1).map(({ node }, index) => {
        const destination = flowRoute[index + 1]
        const state = flowEdgeState(
          flowRoute[index].traceIndex,
          destination.traceIndex,
          playback,
        )
        const observerRole =
          structuredPresentation &&
          (node.id === "ids" || destination.node.id === "ids")
        return (
          <Line
            key={`${node.id}-${destination.node.id}`}
            points={[node.anchor, destination.node.anchor]}
            color={observerRole ? IDS_OBSERVER_TONE : accent}
            lineWidth={state === "active" ? 3.5 : state === "passed" ? 1.4 : 1}
            dashed={observerRole}
            dashSize={observerRole ? 0.12 : undefined}
            gapSize={observerRole ? 0.08 : undefined}
            transparent
            opacity={lineOpacity(state)}
            userData={
              observerRole
                ? { flowState: state, observerRole: "ids" }
                : { flowState: state }
            }
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
          durationMs={FLOW_PACKET_DURATION_MS}
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
            feedback={feedback?.nodeId === node.id ? feedback : undefined}
            contextSuppressed={
              Boolean(feedback) && feedback?.nodeId !== node.id
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

class VehicleErrorBoundary extends Component<{
  children: ReactNode
  onError: () => void
}, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(_error: Error, _info: ErrorInfo) {
    // The route map and the rest of the lab remain usable without the GLB.
    this.props.onError()
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
  presentation,
  playbackPaused,
  onPlaybackPause,
  onPlaybackResume,
  onPlaybackNextStep,
  playbackMode = "auto",
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
  const canvasNodes = useMemo(
    () =>
      playbackState.trace
        ? flowRoute.map(({ node }) => node)
        : routeNodes,
    [flowRoute, playbackState.trace, routeNodes],
  )
  const sourceNode = routeNodes[0]
  const targetNode = getTopologyNode(targetId)
  const effectNode = getTopologyNode(effectId)
  const [cameraFocus, setCameraFocus] = useState<CameraFocus>(() =>
    focusedNodeId
      ? cameraFocusForNode(focusedNodeId, route, targetId, effectId)
      : { view: initialView },
  )
  const [overviewRevision, setOverviewRevision] = useState(0)
  const [scenePhase, setScenePhase] =
    useState<VehicleScenePhase>("loading")
  const centeredRefitFrames = useRef<{
    layout?: number
    settled?: number
  }>({})
  const sceneReadyTimer = useRef<number | undefined>(undefined)
  const previousPlaybackRef = useRef({
    phase: IDLE_PLAYBACK.phase,
    playbackId: IDLE_PLAYBACK.playbackId,
  })
  const vehicleRootRef = useRef<THREE.Group>(null)
  const [rootTransformVersion, setRootTransformVersion] = useState(0)
  const cancelSceneSettling = useCallback(() => {
    const pending = centeredRefitFrames.current
    if (pending.layout !== undefined) {
      window.cancelAnimationFrame(pending.layout)
      pending.layout = undefined
    }
    if (pending.settled !== undefined) {
      window.cancelAnimationFrame(pending.settled)
      pending.settled = undefined
    }
    if (sceneReadyTimer.current !== undefined) {
      window.clearTimeout(sceneReadyTimer.current)
      sceneReadyTimer.current = undefined
    }
  }, [])
  const handleVehicleCentered = useCallback(() => {
    cancelSceneSettling()
    setScenePhase("fitting")
    setRootTransformVersion((version) => version + 1)
    const pending = centeredRefitFrames.current
    // Center measures the committed clone before OrbitControls and Bounds have
    // necessarily completed their own layout work. Two frames later all three
    // share the same scene, so this refit cannot use the empty initial bounds.
    pending.layout = window.requestAnimationFrame(() => {
      pending.settled = window.requestAnimationFrame(() => {
        pending.layout = undefined
        pending.settled = undefined
        setOverviewRevision((revision) => revision + 1)
        sceneReadyTimer.current = window.setTimeout(() => {
          sceneReadyTimer.current = undefined
          setScenePhase("ready")
        }, 350)
      })
    })
  }, [cancelSceneSettling])
  const handleVehicleError = useCallback(() => {
    cancelSceneSettling()
    setScenePhase("error")
  }, [cancelSceneSettling])

  useEffect(() => {
    return cancelSceneSettling
  }, [cancelSceneSettling])
  const cameraPresets = useMemo(
    () =>
      createCameraPresets(
        sourceNode,
        targetNode,
        effectNode,
        vehicleRootRef.current,
      ),
    [effectNode, rootTransformVersion, sourceNode, targetNode],
  )
  const onSelectNode = useCallback(
    (nodeId: VehicleTopologyNodeId) => {
      setCameraFocus(cameraFocusForNode(nodeId, route, targetId, effectId))
    },
    [effectId, route, targetId],
  )
  const requestOverview = useCallback(() => {
    setCameraFocus({ view: "overview" })
    setOverviewRevision((revision) => revision + 1)
  }, [])

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
      playbackState.phase === "playing" &&
      (previousPlayback.phase === "idle" ||
        previousPlayback.playbackId !== playbackState.playbackId)
    ) {
      requestOverview()
    }
  }, [playbackState.phase, playbackState.playbackId, requestOverview])

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
  const presentationFeedback = presentation?.nodeFeedback
  const topologyFeedback =
    presentationFeedback &&
    presentationFeedback.nodeId === presentation.currentNodeId &&
    isVehicleTopologyFeedback(presentationFeedback) &&
    (presentation.phase === "playing" ||
      (presentation.phase === "complete" && presentationFeedback.persist))
      ? presentationFeedback
      : undefined
  const hasAuthoritativeTrace =
    Boolean(playbackState.trace) && playbackState.phase !== "idle"
  const authoritativeActiveNodeId =
    topologyFeedback?.nodeId ??
    (playbackState.phase === "playing" || playbackState.phase === "cancelled"
      ? playbackCurrentNodeId
      : undefined)
  const activeNodeId = hasAuthoritativeTrace
    ? authoritativeActiveNodeId
    : (focusedId ?? currentNodeId)
  const activeNodeState: VehicleFlowNodeVisualState =
    playbackState.phase === "cancelled" && playbackCurrentNodeId
      ? "cancelled"
      : topologyFeedback?.status === "OBSERVED"
        ? "observer"
        : topologyFeedback?.status === "REJECTED"
          ? "rejected"
          : topologyFeedback?.status === "EFFECT APPLIED"
            ? "effect"
            : "active"
  const visibleTooltipNodeId = hasAuthoritativeTrace
    ? authoritativeActiveNodeId
    : focusedId
  const cameraPreset = useMemo(
    () =>
      cameraFocus.view === "node"
        ? createNodeCameraPreset(
            getTopologyNode(cameraFocus.nodeId),
            vehicleRootRef.current,
          )
        : cameraPresets[cameraFocus.view],
    [cameraFocus, cameraPresets, rootTransformVersion],
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
            onClick={requestOverview}
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
            onClick={requestOverview}
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
        {routeNodes.map((node) => {
          const nodeStatus =
            topologyFeedback?.nodeId === node.id
              ? topologyFeedback.status
              : node.id === activeNodeId && hasAuthoritativeTrace
                ? "PROCESSING"
                : null
          return (
            <li
              key={node.id}
              data-kind={node.kind}
              data-active={node.id === activeNodeId}
              data-feedback-status={nodeStatus ?? undefined}
              aria-current={node.id === activeNodeId ? "step" : undefined}
              aria-label={
                nodeStatus ? `${node.label} · ${nodeStatus}` : undefined
              }
            >
              <span className="vehicle-network-viewport__map-number">
                {node.number}
              </span>
              <div>
                <strong>{node.label}</strong>
                <span>{node.role}</span>
                <small data-truth={node.truth}>
                  <strong>{node.truthTitle}</strong>
                  <span>{node.truthDetail}</span>
                </small>
              </div>
            </li>
          )
        })}
      </ol>

      <VehicleFlowRail
        scenarioTitle={scenarioTitle}
        route={route}
        playback={playbackState}
        selectedNodeId={focusedId}
        accent={accent}
        presentation={presentation}
        reducedMotion={reducedMotion}
        isPaused={playbackPaused}
        onPause={onPlaybackPause}
        onResume={onPlaybackResume}
        onNextStep={onPlaybackNextStep}
        playbackMode={playbackMode}
      />

      <div className="vehicle-network-viewport__canvas">
        {(scenePhase === "loading" || scenePhase === "fitting") && (
          <div
            className="vehicle-network-viewport__scene-loading"
            role="status"
          >
            <CircleNotch
              size={17}
              className="door-attack-lab__spin"
              aria-hidden="true"
            />
            {scenePhase === "loading"
              ? "GLB 차량 불러오는 중"
              : "차량 3D 장면 맞추는 중"}
          </div>
        )}
        <SharedVehicleCanvas>
          <VehicleErrorBoundary onError={handleVehicleError}>
            <Suspense fallback={null}>
              <SharedVehicleScene
                ref={vehicleRootRef}
                xray
                onCentered={handleVehicleCentered}
                onSelectEffect={onSelectNode}
              >
                <VehicleRigAttachment immediate={reducedMotion} />
                <TopologyOverlay
                  nodes={canvasNodes}
                  flowRoute={flowRoute}
                  playback={playbackState}
                  accent={accent}
                  activeNodeId={activeNodeId}
                  activeNodeState={activeNodeState}
                  cameraFocusedNodeId={focusedId}
                  visibleTooltipNodeId={visibleTooltipNodeId}
                  targetId={targetId}
                  effectId={effectId}
                  feedback={topologyFeedback}
                  structuredPresentation={presentation !== undefined}
                  reducedMotion={reducedMotion}
                  onSelect={onSelectNode}
                />
                <CameraPresetController
                  preset={cameraPreset}
                  active={cameraFocus.view !== "overview"}
                  immediate={reducedMotion}
                />
                <SharedVehicleOverviewController
                  active={cameraFocus.view === "overview"}
                  resetRevision={overviewRevision}
                />
              </SharedVehicleScene>
            </Suspense>
          </VehicleErrorBoundary>
          <SharedVehicleOrbitControls
            makeDefault
            enableDamping={!reducedMotion}
            dampingFactor={0.075}
          />
        </SharedVehicleCanvas>
      </div>
      <p className="vehicle-network-viewport__hint">
        드래그: 회전 · 스크롤: 확대/축소
      </p>
    </div>
  )
}
