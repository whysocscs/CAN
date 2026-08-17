import * as THREE from "three"

/**
 * GLB 지오메트리는 월드 좌표에 구워져 있고 노드 transform이 전부 단위행렬입니다.
 * 그래서 노드를 그냥 회전시키면 차량 중심(0,0,0)을 축으로 돌아버립니다.
 * 여기서 힌지 위치에 빈 그룹을 만들고 그 밑으로 부품을 옮겨 붙입니다.
 */

export type PartId = "doorL" | "doorR" | "tailgate"

export const PART_IDS: readonly PartId[] = ["doorL", "doorR", "tailgate"]

export interface HingeSpec {
  /** GLB 노드 이름 */
  parts: string[]
  /** 힌지(회전축)가 지나는 점 */
  pivot: [number, number, number]
  axis: "x" | "y" | "z"
  /** 완전히 열렸을 때의 각도(rad) */
  openAngle: number
}

const deg = THREE.MathUtils.degToRad

export const HINGES: Record<PartId, HingeSpec> = {
  // 도어 앞 모서리(z=+0.69)를 지나는 수직축에서 바깥으로 스윙
  doorL: {
    parts: ["DOOR_PANEL_L_V6_1", "DOOR_HANDLE_POCKET_L_V1", "DOOR_HANDLE_PULL_L_V1"],
    pivot: [-0.9, 0.78, 0.69],
    axis: "y",
    openAngle: deg(60),
  },
  doorR: {
    parts: ["DOOR_PANEL_R_V6_1", "DOOR_HANDLE_POCKET_R_V1", "DOOR_HANDLE_PULL_R_V1"],
    pivot: [0.9, 0.78, 0.69],
    axis: "y",
    openAngle: deg(-60),
  },
  /**
   * SUV 리프트게이트: 리어 글라스 + 실 패치 + 테일게이트가 한 덩어리로
   * 루프 라인(y=1.50)에서 위로 들립니다.
   * X축 회전 부호: 힌지 아래쪽 점(dy<0)은 양수 각도에서 뒤·위로 올라갑니다.
   * 테일램프와 C필러는 차체 쪽이라 함께 움직이지 않습니다.
   */
  tailgate: {
    parts: [
      "TAILGATE_REFERENCE_PANEL",
      "TAILGATE_SHUT_LINE_REF",
      "REAR_GLASS_REFERENCE",
      "REAR_GLASS_WEATHERSTRIP_REF",
      "REAR_GLASS_TO_TAILGATE_SILL_PATCH_REF",
    ],
    pivot: [0, 1.5, -1.87],
    axis: "x",
    openAngle: deg(70),
  },
}

/**
 * 씬을 변형하므로 반드시 멱등이어야 합니다.
 * React StrictMode는 useMemo 팩토리를 두 번 호출하고 두 번째 반환값은 버리는데,
 * 부작용은 남습니다. 매번 새 그룹을 만들면 부품이 "버려진" 두 번째 그룹으로 옮겨가고
 * 애니메이션은 빈 첫 번째 그룹을 돌리게 됩니다.
 * 이미 만들어 둔 HINGE_* 그룹이 있으면 그대로 재사용합니다.
 */
export function buildHinges(scene: THREE.Object3D): Record<PartId, THREE.Group> {
  const pivots = {} as Record<PartId, THREE.Group>

  for (const id of PART_IDS) {
    const spec = HINGES[id]
    const name = `HINGE_${id}`
    const found = scene.getObjectByName(name)

    let pivot: THREE.Group
    if (found instanceof THREE.Group) {
      // 재호출: 기존 그룹과 현재 회전 상태를 그대로 유지합니다.
      pivot = found
    } else {
      pivot = new THREE.Group()
      pivot.name = name
      pivot.position.set(...spec.pivot)
      scene.add(pivot)
      pivot.updateMatrixWorld(true)
    }

    for (const partName of spec.parts) {
      const part = scene.getObjectByName(partName)
      if (!part) continue
      // attach()는 월드 변환을 유지한 채 부모만 바꿔줍니다.
      if (part.parent !== pivot) pivot.attach(part)
    }

    pivots[id] = pivot
  }

  return pivots
}
