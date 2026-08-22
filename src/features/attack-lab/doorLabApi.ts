import type {
  DoorLabScriptResult,
  DoorLabSessionState,
  DoorLabTerminalResult,
} from "./doorLabTypes"

type BrowserLocation = Pick<Location, "hostname" | "protocol">

const DEFAULT_HOSTNAME = "127.0.0.1"
const DOOR_LAB_PATH = "/labs/door-blackbox"

export class DoorLabApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = "DoorLabApiError"
  }
}

/** Resolve the local API without hard-coding the browser's hostname. */
export function resolveDoorLabApiBase(location: BrowserLocation | undefined = globalThis.location): string {
  const protocol = location?.protocol === "https:" ? "https:" : "http:"
  const hostname = location?.hostname || DEFAULT_HOSTNAME
  return `${protocol}//${hostname}:8010${DOOR_LAB_PATH}`
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${resolveDoorLabApiBase()}${path}`, init)
  } catch {
    throw new DoorLabApiError("Door lab API is unavailable.")
  }

  if (!response.ok) {
    let message = `Door lab API request failed (${response.status}).`
    try {
      const payload: unknown = await response.json()
      if (
        typeof payload === "object"
        && payload !== null
        && "detail" in payload
        && typeof payload.detail === "string"
      ) {
        message = payload.detail
      }
    } catch {
      // HTTP status remains a useful, stable error when the body is not JSON.
    }
    throw new DoorLabApiError(message, response.status)
  }

  try {
    return await response.json() as T
  } catch {
    throw new DoorLabApiError("Door lab API returned an invalid response.", response.status)
  }
}

export function createDoorLabSession(): Promise<DoorLabSessionState> {
  return request<DoorLabSessionState>("/sessions", { method: "POST" })
}

export function resetDoorLabSession(sessionId: string): Promise<DoorLabSessionState> {
  return request<DoorLabSessionState>(`/sessions/${encodeURIComponent(sessionId)}/reset`, { method: "POST" })
}

export function runDoorLabCommand(sessionId: string, command: string): Promise<DoorLabTerminalResult> {
  return request<DoorLabTerminalResult>(`/sessions/${encodeURIComponent(sessionId)}/terminal`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ command }),
  })
}

export function runDoorLabScript(sessionId: string, script: string): Promise<DoorLabScriptResult> {
  return request<DoorLabScriptResult>(`/sessions/${encodeURIComponent(sessionId)}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ script }),
  })
}
