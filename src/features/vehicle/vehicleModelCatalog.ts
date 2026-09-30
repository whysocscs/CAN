import { useSyncExternalStore } from "react"

export type VehicleModelId = "ridgex" | "canlite-s3"

export interface VehicleModelOption {
  id: VehicleModelId
  title: string
  path: string
  fileName: string
  formatVersion: string
  sizeLabel: string
  description: string
  supportsVehicleControls: boolean
}

export const VEHICLE_MODEL_OPTIONS: readonly VehicleModelOption[] = [
  {
    id: "ridgex",
    title: "RIDGEX · V7.01",
    path: "/models/RIDGEX_ROCKER_CLEANUP_V7_01.glb",
    fileName: "RIDGEX_ROCKER_CLEANUP_V7_01.glb",
    formatVersion: "V7.01",
    sizeLabel: "4.0 MB",
    description: "기존 CANLite 교육 흐름과 문·트렁크 제어가 연결된 모델입니다.",
    supportsVehicleControls: true,
  },
  {
    id: "canlite-s3",
    title: "CANLite · S3 Sedan",
    path: "/models/CANLITE_S3_DETAILED_SEDAN.glb",
    fileName: "CANLITE_S3_DETAILED_SEDAN.glb",
    formatVersion: "S3 상세 세단",
    sizeLabel: "8.6 MB",
    description:
      "새로 추가한 상세 세단 프리뷰 모델입니다. 현재는 시각화용으로 연결됩니다.",
    supportsVehicleControls: false,
  },
]

const DEFAULT_MODEL_ID: VehicleModelId = "ridgex"
let selectedModelId: VehicleModelId = DEFAULT_MODEL_ID
const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSelectedModelId() {
  return selectedModelId
}

export function getSelectedVehicleModel(): VehicleModelOption {
  return (
    VEHICLE_MODEL_OPTIONS.find((model) => model.id === selectedModelId) ??
    VEHICLE_MODEL_OPTIONS[0]
  )
}

export function setSelectedVehicleModel(modelId: VehicleModelId) {
  if (modelId === selectedModelId) return
  if (!VEHICLE_MODEL_OPTIONS.some((model) => model.id === modelId)) return
  selectedModelId = modelId
  listeners.forEach((listener) => listener())
}

export function useSelectedVehicleModel() {
  const modelId = useSyncExternalStore(
    subscribe,
    getSelectedModelId,
    getSelectedModelId,
  )
  return (
    VEHICLE_MODEL_OPTIONS.find((model) => model.id === modelId) ??
    VEHICLE_MODEL_OPTIONS[0]
  )
}
