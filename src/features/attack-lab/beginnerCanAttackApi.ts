import type {
  BeginnerCanAttackResult,
  BeginnerCanAttackScenario,
  BeginnerCanAttackState,
} from "./beginnerCanAttackTypes"

type BrowserLocation = Pick<Location, "hostname" | "protocol">

const DEFAULT_HOSTNAME = "127.0.0.1"

export class BeginnerCanAttackApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message)
    this.name = "BeginnerCanAttackApiError"
  }
}

export function resolveBeginnerCanAttackApiBase(
  scenario: BeginnerCanAttackScenario,
  location: BrowserLocation | undefined = globalThis.location,
): string {
  const protocol = location?.protocol === "https:" ? "https:" : "http:"
  const hostname = location?.hostname || DEFAULT_HOSTNAME
  return `${protocol}//${hostname}:8010/labs/can-attacks/${scenario}`
}

async function request<T>(
  scenario: BeginnerCanAttackScenario,
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${resolveBeginnerCanAttackApiBase(scenario)}${path}`, init)
  } catch {
    throw new BeginnerCanAttackApiError(
      "Beginner CAN attack lab API is unavailable.",
    )
  }

  if (!response.ok) {
    let message = `Beginner CAN attack lab request failed (${response.status}).`
    try {
      const payload: unknown = await response.json()
      if (
        typeof payload === "object" &&
        payload !== null &&
        "detail" in payload &&
        typeof payload.detail === "string"
      ) {
        message = payload.detail
      }
    } catch {
      // The HTTP status remains the stable fallback for a non-JSON body.
    }
    throw new BeginnerCanAttackApiError(message, response.status)
  }

  try {
    return (await response.json()) as T
  } catch {
    throw new BeginnerCanAttackApiError(
      "Beginner CAN attack lab API returned an invalid response.",
      response.status,
    )
  }
}

const signalInit = (method: string, signal?: AbortSignal): RequestInit => ({
  method,
  ...(signal ? { signal } : {}),
})

export function createBeginnerCanAttackSession(
  scenario: BeginnerCanAttackScenario,
  signal?: AbortSignal,
): Promise<BeginnerCanAttackState> {
  return request(scenario, "/sessions", signalInit("POST", signal))
}

export function getBeginnerCanAttackSession(
  scenario: BeginnerCanAttackScenario,
  sessionId: string,
  signal?: AbortSignal,
): Promise<BeginnerCanAttackState> {
  return request(
    scenario,
    `/sessions/${encodeURIComponent(sessionId)}`,
    signalInit("GET", signal),
  )
}

export function resetBeginnerCanAttackSession(
  scenario: BeginnerCanAttackScenario,
  sessionId: string,
  signal?: AbortSignal,
): Promise<BeginnerCanAttackState> {
  return request(
    scenario,
    `/sessions/${encodeURIComponent(sessionId)}/reset`,
    signalInit("POST", signal),
  )
}

function jsonInit(body: unknown, signal?: AbortSignal): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  }
}

export function runBeginnerCanAttackTerminal(
  scenario: BeginnerCanAttackScenario,
  sessionId: string,
  command: string,
  signal?: AbortSignal,
): Promise<BeginnerCanAttackResult> {
  return request(
    scenario,
    `/sessions/${encodeURIComponent(sessionId)}/terminal`,
    jsonInit({ command }, signal),
  )
}

export function runBeginnerCanAttackScript(
  scenario: BeginnerCanAttackScenario,
  sessionId: string,
  script: string,
  signal?: AbortSignal,
): Promise<BeginnerCanAttackResult> {
  return request(
    scenario,
    `/sessions/${encodeURIComponent(sessionId)}/run`,
    jsonInit({ script }, signal),
  )
}
