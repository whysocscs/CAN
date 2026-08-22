import { useMemo, useRef } from "react"
import { useFrame } from "@react-three/fiber"
import type * as THREE from "three"
import { HINGES, PART_IDS, buildHinges, type PartId } from "./hinges"
import { vehicle } from "./vehicleStore"

/**
 * GLB 씬을 vehicleStore에 연결합니다.
 * 애니메이션은 프레임 루프에서 직접 처리하므로 React 리렌더가 발생하지 않습니다.
 */
export interface VehicleRigOptions {
  stiffness?: number
  immediate?: boolean
}

export function useVehicleRig(
  scene: THREE.Object3D,
  stiffnessOrOptions: number | VehicleRigOptions = 6,
) {
  const stiffness =
    typeof stiffnessOrOptions === "number"
      ? stiffnessOrOptions
      : (stiffnessOrOptions.stiffness ?? 6)
  const immediate =
    typeof stiffnessOrOptions === "number"
      ? false
      : (stiffnessOrOptions.immediate ?? false)
  const pivots = useMemo(() => buildHinges(scene), [scene])
  const current = useRef<Record<PartId, number>>({
    doorL: 0,
    doorR: 0,
    tailgate: 0,
  })

  useFrame((_, delta) => {
    const target = vehicle.getState()
    // 프레임레이트에 무관한 감쇠
    const k = 1 - Math.exp(-delta * stiffness)

    for (const id of PART_IDS) {
      const next = immediate
        ? target[id]
        : current.current[id] + (target[id] - current.current[id]) * k
      current.current[id] =
        Math.abs(target[id] - next) < 0.0005 ? target[id] : next
      pivots[id].rotation[HINGES[id].axis] =
        HINGES[id].openAngle * current.current[id]
    }
  })

  return pivots
}
