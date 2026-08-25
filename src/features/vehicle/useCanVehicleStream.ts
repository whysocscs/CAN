import { useEffect, useRef, useState } from "react"
import type { CanEvent } from "../can/events/types"
import {
  connectCanStream,
  type CanStreamStatus,
} from "../can/events/backendProvider"
import { vehicle } from "./vehicleStore"

/**
 * 백엔드 CAN 스트림을 차량 3D에 연결합니다.
 * 3D를 쓰는 어느 페이지에서든 한 줄로 붙일 수 있습니다.
 *
 *   const status = useCanVehicleStream({ onEvent: (e) => setEvents(...) })
 *
 * 프레임은 초당 수백 건까지 올 수 있습니다.
 * - vehicle 반영은 즉시 (리렌더가 없어 비용이 거의 0입니다)
 * - onEvent 전달은 requestAnimationFrame마다 한 번 (React 상태 갱신 보호)
 */
export function useCanVehicleStream(options?: {
  url?: string
  /** 프레임 단위로 묶인 이벤트. Monitor·Inspector 목록에 씁니다. */
  onEvent?: (events: CanEvent[]) => void
  /** Return false to observe an event without applying it to the global vehicle store. */
  vehicleEventPredicate?: (event: CanEvent) => boolean
  enabled?: boolean
  /**
   * 접속 직후 재생되는 스냅샷 프레임도 onEvent로 넘길지 여부.
   * 기본은 false — 지금 버스에서 일어난 일이 아니라 과거 상태이기 때문입니다.
   * (차량 반영 여부는 이 값과 무관하며 vehicleEventPredicate가 결정합니다.)
   */
  includeReplay?: boolean
}): CanStreamStatus {
  const { url, enabled = true, includeReplay = false } = options ?? {}
  const [status, setStatus] = useState<CanStreamStatus>("connecting")

  // onEvent가 매 렌더 새 함수여도 재연결하지 않도록 ref로 잡아 둡니다.
  const onEventRef = useRef(options?.onEvent)
  onEventRef.current = options?.onEvent
  const vehicleEventPredicateRef = useRef(options?.vehicleEventPredicate)
  vehicleEventPredicateRef.current = options?.vehicleEventPredicate

  useEffect(() => {
    if (!enabled) return

    const pending: CanEvent[] = []
    let frame = 0

    const flush = () => {
      frame = 0
      if (pending.length === 0) return
      onEventRef.current?.(pending.splice(0, pending.length))
    }

    const disconnect = connectCanStream({
      url,
      onStatus: setStatus,
      onEvent: (event) => {
        // Monitor 관찰과 global vehicle mutation ownership을 분리합니다.
        if (vehicleEventPredicateRef.current?.(event) ?? true) {
          vehicle.applyCanEvent(event)
        }
        if (!onEventRef.current) return
        if (event.replay && !includeReplay) return
        pending.push(event)
        if (!frame) frame = requestAnimationFrame(flush)
      },
    })

    return () => {
      if (frame) cancelAnimationFrame(frame)
      disconnect()
    }
  }, [url, enabled, includeReplay])

  return status
}
