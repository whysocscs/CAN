import type { CanCommand, CanEvent } from "../can/events/types"
import { PART_IDS, type PartId } from "./hinges"

/**
 * 차량 개폐 상태 저장소.
 *
 * 값은 0(완전히 닫힘) ~ 1(완전히 열림) 비율입니다.
 * 3D 렌더링은 이 값을 각도로 환산해서 부드럽게 따라갑니다.
 * three.js를 몰라도 이 파일의 `vehicle` API만 호출하면 됩니다.
 */

export type VehicleState = Record<PartId, number>
export type DoorSide = "L" | "R" | "both"

type Listener = (state: VehicleState) => void

const state: VehicleState = { doorL: 0, doorR: 0, tailgate: 0 }
const listeners = new Set<Listener>()

let snapshot: VehicleState = { ...state }

function commit() {
  snapshot = { ...state }
  for (const listener of listeners) listener(snapshot)
}

function setParts(updates: Partial<VehicleState>) {
  let changed = false
  for (const id of PART_IDS) {
    const ratio = updates[id]
    if (ratio === undefined) continue
    const next = Math.min(1, Math.max(0, ratio))
    if (state[id] === next) continue
    state[id] = next
    changed = true
  }
  if (changed) commit()
}

function setPart(id: PartId, ratio: number) {
  setParts({ [id]: ratio })
}

function doorIds(side: DoorSide): PartId[] {
  if (side === "L") return ["doorL"]
  if (side === "R") return ["doorR"]
  return ["doorL", "doorR"]
}

// ---------------------------------------------------------------- CAN 매핑

/**
 * CAN 프레임 → 차량 동작. 명령을 추가하려면 여기 한 줄만 넣으면 됩니다.
 *
 * 프레임 규격 (server/routers/can.py와 짝을 이룹니다)
 *   0x101  도어    data[0] 왼쪽 상태, data[1] 오른쪽 상태   (00=열림 01=닫힘)
 *   0x200  트렁크  data[0] 상태                             (01=열림 00=닫힘)
 *
 * 프레임은 명령이 아니라 상태를 싣습니다. 프레임 하나가 항상 전체 상태를
 * 담고 있어야 재접속 시 복원이 정확합니다.
 */
const openRatio = (byte: string | undefined): number | null => {
  if (byte === "00") return 1
  if (byte === "01") return 0
  return null
}

const COMMAND_BINDINGS: Partial<Record<CanCommand, (
  data: string[],
) => boolean>> = {
  DOOR_LOCK: (data) => {
    if (data.length !== 1 && data.length !== 2 && data.length !== 4)
      return false
    // 1바이트 구형 프레임은 양쪽 같은 값으로 해석합니다.
    const leftDoor = openRatio(data[0])
    const rightDoor = openRatio(data.length >= 2 ? data[1] : data[0])
    if (leftDoor === null || rightDoor === null) return false
    setParts({ doorL: leftDoor, doorR: rightDoor })
    return true
  },
  TRUNK_OPEN: (data) => {
    setPart("tailgate", data[0] === "01" ? 1 : 0)
    return true
  },
}

/** command 정보 없이 원시 프레임만 들어왔을 때 쓰는 CAN ID 매핑 */
const CAN_ID_TO_COMMAND: Record<string, CanCommand> = {
  "0x101": "DOOR_LOCK",
  "0x200": "TRUNK_OPEN",
}

function normalizeCanId(canId: string | number): string | null {
  const value = typeof canId === "number"
    ? canId
    : Number.parseInt(canId.trim().replace(/^0x/i, ""), 16)

  return Number.isNaN(value) ? null : `0x${value.toString(16).toLowerCase().padStart(3, "0")}`
}

/** ["01"] / "01" / "0x01" / "0100" 전부 받아서 ["01"] 형태로 정규화 */
function normalizeData(data?: readonly string[] | string): string[] {
  if (!data) return []
  const bytes = Array.isArray(data)
    ? [...data]
    : (String(data)
        .replace(/^0x/i, "")
        .match(/.{1,2}/g) ?? [])
  return bytes.map((byte) =>
    byte.replace(/^0x/i, "").toUpperCase().padStart(2, "0"),
  )
}

// ---------------------------------------------------------------- 공개 API

export const vehicle = {
  /** 문 열기. side 생략 시 양쪽 다. */
  openDoor(side: DoorSide = "both") {
    for (const id of doorIds(side)) setPart(id, 1)
  },
  closeDoor(side: DoorSide = "both") {
    for (const id of doorIds(side)) setPart(id, 0)
  },
  toggleDoor(side: DoorSide = "both") {
    const ids = doorIds(side)
    const next = ids.every((id) => state[id] > 0.5) ? 0 : 1
    for (const id of ids) setPart(id, next)
  },
  /** 양쪽 문을 같은 비율로. 0 = 닫힘, 1 = 열림 */
  setDoors(ratio: number) {
    setPart("doorL", ratio)
    setPart("doorR", ratio)
  },

  openTrunk() {
    setPart("tailgate", 1)
  },
  closeTrunk() {
    setPart("tailgate", 0)
  },
  toggleTrunk() {
    setPart("tailgate", state.tailgate > 0.5 ? 0 : 1)
  },

  /** 반쯤 열기 같은 연속 제어: vehicle.set("doorL", 0.35) */
  set(id: PartId, ratio: number) {
    setPart(id, ratio)
  },
  get(id: PartId) {
    return state[id]
  },
  isOpen(id: PartId) {
    return state[id] > 0.5
  },
  getState(): VehicleState {
    return snapshot
  },
  reset() {
    for (const id of PART_IDS) setPart(id, 0)
  },

  /**
   * 백엔드에서 실제로 쓰는 진입점.
   * 파싱된 CAN 이벤트를 그대로 넣으면 대응되는 부위가 움직입니다.
   * 매핑된 명령이 없으면 아무것도 하지 않고 false를 돌려줍니다.
   */
  applyCanEvent(event: CanEvent): boolean {
    if (
      event.processing?.executionResult === "BLOCKED"
      || event.processing?.filterResult === "DROP"
    ) {
      return false
    }
    if (event.frame.dlc !== event.frame.data.length) return false

    const command = event.context.command
      ?? (normalizeCanId(event.frame.canId) ? CAN_ID_TO_COMMAND[normalizeCanId(event.frame.canId)!] : undefined)

    if (!command) return false

    const handler = COMMAND_BINDINGS[command]
    if (!handler) return false

    return handler(normalizeData(event.frame.data))
  },

  /** 원시 프레임용. vehicle.applyFrame({ canId: "0x200", data: ["01"] }) */
  applyFrame(frame: { canId: string | number; data?: readonly string[] | string }): boolean {
    const canId = normalizeCanId(frame.canId)
    if (!canId) return false

    const command = CAN_ID_TO_COMMAND[canId]
    if (!command) return false

    const handler = COMMAND_BINDINGS[command]
    if (!handler) return false

    return handler(normalizeData(frame.data))
  },

  /** `cansend vcan0 200#01` 문자열을 그대로 받는 편의 함수 */
  applyCansend(line: string): boolean {
    const match = line.trim().match(/([0-9a-fA-F]{3,8})#([0-9a-fA-F]*)/)
    if (!match) return false
    return vehicle.applyFrame({ canId: match[1], data: match[2] })
  },

  subscribe(listener: Listener) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}

declare global {
  interface Window {
    canlite?: { vehicle: typeof vehicle }
  }
}

// 브라우저 콘솔 / Playwright / 수동 테스트용 핸들.
// window.canlite.vehicle.openTrunk() 로 바로 딸깍 가능합니다.
if (typeof window !== "undefined") {
  window.canlite = { ...window.canlite, vehicle }
}
