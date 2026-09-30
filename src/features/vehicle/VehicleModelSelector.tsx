import {
  setSelectedVehicleModel,
  useSelectedVehicleModel,
  VEHICLE_MODEL_OPTIONS,
  type VehicleModelId,
} from "./vehicleModelCatalog"

interface VehicleModelSelectorProps {
  compact?: boolean
}

export default function VehicleModelSelector({
  compact = false,
}: VehicleModelSelectorProps) {
  const selectedModel = useSelectedVehicleModel()

  return (
    <label
      className={`vehicle-model-selector${compact ? " vehicle-model-selector--compact" : ""}`}
    >
      <span>차량 모델</span>
      <select
        aria-label="차량 모델 선택"
        value={selectedModel.id}
        onChange={(event) =>
          setSelectedVehicleModel(event.currentTarget.value as VehicleModelId)
        }
      >
        {VEHICLE_MODEL_OPTIONS.map((model) => (
          <option key={model.id} value={model.id}>
            {model.title}
          </option>
        ))}
      </select>
    </label>
  )
}
