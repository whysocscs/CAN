import VehicleNetworkViewport from "../vehicle/VehicleNetworkViewport"
import {
  VEHICLE_ROUTES,
  type VehicleTopologyNodeId,
} from "../vehicle/vehicleTopology"

const STAGE_NODE: Record<string, VehicleTopologyNodeId> = {
  정찰: "obd",
  캡처: "ids",
  분석: "gateway",
  "Replay 실패": "body",
  "프레임 제작": "body",
  "IDS 검증": "ids",
  증거: "leftDoor",
}

export interface DoorAttackVehicleProps {
  currentStage?: string
  focusedNodeId?: VehicleTopologyNodeId
}

export default function DoorAttackVehicle({
  currentStage,
  focusedNodeId,
}: DoorAttackVehicleProps) {
  return (
    <VehicleNetworkViewport
      route={VEHICLE_ROUTES.door}
      targetId="body"
      effectId="leftDoor"
      currentNodeId={currentStage ? STAGE_NODE[currentStage] : undefined}
      focusedNodeId={focusedNodeId}
      scenarioTitle="Door attack route"
      accent="#d94b4b"
    />
  )
}
