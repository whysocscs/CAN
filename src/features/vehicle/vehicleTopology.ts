import { HINGES } from "./hinges"

export type VehicleLogicalNodeId = "obd" | "ids" | "gateway" | "body" | "rear"
export type VehicleEffectTargetId = "leftDoor" | "tailgate"
export type VehicleTopologyNodeId = VehicleLogicalNodeId | VehicleEffectTargetId
export type VehicleRouteId = "door" | "spoofing" | "replay"
export type VehicleAnchor = [number, number, number]

interface VehicleTopologyNodeBase {
  id: VehicleTopologyNodeId
  number: number
  label: string
  role: string
  anchor: VehicleAnchor
  truthDetail: string
}

export interface VehicleLogicalNode extends VehicleTopologyNodeBase {
  id: VehicleLogicalNodeId
  kind: "logical"
  truth: "toy-logical"
}

export interface VehicleEffectTarget extends VehicleTopologyNodeBase {
  id: VehicleEffectTargetId
  kind: "effect"
  truth: "glb-effect-anchor"
}

export type VehicleTopologyNode = VehicleLogicalNode | VehicleEffectTarget

const LOGICAL_TRUTH = "교육용 논리 위치 · 실제 OEM 배치 아님"
const EFFECT_TRUTH = "GLB 동작 기준점 · 실제 actuator 위치 아님"

export const VEHICLE_TOPOLOGY: readonly VehicleTopologyNode[] = [
  {
    id: "obd",
    number: 1,
    label: "Training OBD-II",
    role: "공격 프레임 진입점",
    anchor: [0.55, 0.69, 1.08],
    kind: "logical",
    truth: "toy-logical",
    truthDetail: LOGICAL_TRUTH,
  },
  {
    id: "ids",
    number: 2,
    label: "Toy IDS",
    role: "프레임 관찰/규칙 판정",
    anchor: [0.27, 0.55, -0.84],
    kind: "logical",
    truth: "toy-logical",
    truthDetail: LOGICAL_TRUTH,
  },
  {
    id: "gateway",
    number: 3,
    label: "Toy Gateway",
    role: "대상 네트워크로 라우팅",
    anchor: [0.2, 0.72, 0.14],
    kind: "logical",
    truth: "toy-logical",
    truthDetail: LOGICAL_TRUTH,
  },
  {
    id: "body",
    number: 4,
    label: "Toy Body ECU",
    role: "도어 상태 프레임 처리",
    anchor: [0.67, 0.73, -0.54],
    kind: "logical",
    truth: "toy-logical",
    truthDetail: LOGICAL_TRUTH,
  },
  {
    id: "rear",
    number: 4,
    label: "Toy Rear ECU",
    role: "테일게이트 상태 프레임 처리",
    anchor: [0.56, 0.6, -1.58],
    kind: "logical",
    truth: "toy-logical",
    truthDetail: LOGICAL_TRUTH,
  },
  {
    id: "leftDoor",
    number: 5,
    label: "Left Door Effect",
    role: "GLB 왼쪽 문 상태 표현",
    anchor: HINGES.doorL.pivot,
    kind: "effect",
    truth: "glb-effect-anchor",
    truthDetail: EFFECT_TRUTH,
  },
  {
    id: "tailgate",
    number: 5,
    label: "Tailgate Effect",
    role: "GLB 테일게이트 상태 표현",
    anchor: HINGES.tailgate.pivot,
    kind: "effect",
    truth: "glb-effect-anchor",
    truthDetail: EFFECT_TRUTH,
  },
]

export const VEHICLE_TOPOLOGY_BY_ID = new Map(
  VEHICLE_TOPOLOGY.map((node) => [node.id, node]),
)

export const VEHICLE_ROUTES: Record<VehicleRouteId, readonly VehicleTopologyNodeId[]> =
  {
    door: ["obd", "ids", "gateway", "body", "leftDoor"],
    spoofing: ["obd", "ids", "gateway", "rear", "tailgate"],
    replay: ["obd", "ids", "gateway", "body", "leftDoor"],
  }
