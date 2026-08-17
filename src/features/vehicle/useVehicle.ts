import { useSyncExternalStore } from "react"
import { vehicle, type VehicleState } from "./vehicleStore"

/** UI에서 개폐 상태를 읽을 때. 뱃지·토글 버튼 등에 사용합니다. */
export function useVehicleState(): VehicleState {
  return useSyncExternalStore(vehicle.subscribe, vehicle.getState, vehicle.getState)
}
