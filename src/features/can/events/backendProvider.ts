import type { CanEvent } from "./types"

/**
 * 백엔드(/ws/can)의 CAN 이벤트 스트림에 붙습니다.
 *
 * mockEventProvider와 달리 연결이 끊길 수 있으므로 지수 백오프로 다시 붙습니다.
 * 어느 페이지에서든 쓸 수 있게 React에 의존하지 않습니다.
 */

export type CanStreamStatus = "connecting" | "open" | "closed"

export interface CanStreamOptions {
  url?: string
  onEvent: (event: CanEvent) => void
  onStatus?: (status: CanStreamStatus) => void
  /** 재연결 최대 간격(ms) */
  maxRetryDelay?: number
}

export const DEFAULT_CAN_STREAM_URL = "ws://127.0.0.1:8010/ws/can"

/** @returns 연결을 끊는 함수 (useEffect의 cleanup에 그대로 넘기면 됩니다) */
export function connectCanStream(options: CanStreamOptions): () => void {
  const {
    url = DEFAULT_CAN_STREAM_URL,
    onEvent,
    onStatus,
    maxRetryDelay = 15_000,
  } = options

  let socket: WebSocket | null = null
  let retry = 0
  let timer: number | undefined
  let disposed = false

  const open = () => {
    if (disposed) return
    onStatus?.("connecting")

    socket = new WebSocket(url)

    socket.onopen = () => {
      retry = 0
      onStatus?.("open")
    }

    socket.onmessage = (message) => {
      try {
        onEvent(JSON.parse(message.data as string) as CanEvent)
      } catch {
        // 깨진 줄은 조용히 버립니다. 스트림 전체를 죽일 이유가 없습니다.
      }
    }

    socket.onclose = () => {
      onStatus?.("closed")
      if (disposed) return
      // 1s → 2s → 4s … 최대 maxRetryDelay
      timer = window.setTimeout(open, Math.min(1000 * 2 ** retry++, maxRetryDelay))
    }

    // onerror 뒤에는 항상 onclose가 따라오므로 재연결은 그쪽에서만 처리합니다.
    socket.onerror = () => socket?.close()
  }

  open()

  return () => {
    disposed = true
    window.clearTimeout(timer)
    socket?.close()
  }
}
