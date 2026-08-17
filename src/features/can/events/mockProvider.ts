import { CAN_COMMAND_CATALOG } from "./catalog"
import type { CanCommand, CanEvent, CanEventOrigin } from "./types"
import { validateCanFrame } from "./types"

let mockSequence = 0

function nextEventId() {
  mockSequence += 1
  return `evt-${String(mockSequence).padStart(4, "0")}`
}

export function createCanEvent(command: CanCommand, origin: CanEventOrigin = "mock"): CanEvent {
  const definition = CAN_COMMAND_CATALOG[command]

  validateCanFrame(definition.frame)

  return {
    eventId: nextEventId(),
    timestamp: Date.now(),
    channel: "vcan0",
    origin,
    frame: {
      canId: definition.frame.canId,
      dlc: definition.frame.dlc,
      data: [...definition.frame.data],
    },
    context: {
      command: definition.context.command,
      source: definition.context.source,
      target: definition.context.target,
      route: [...definition.context.route],
      meaning: definition.context.meaning,
      action: definition.context.action,
    },
    processing: {
      filterResult: definition.processing.filterResult,
      executionResult: definition.processing.executionResult,
    },
    monitoring: {
      idsObserved: definition.monitoring.idsObserved,
      status: definition.monitoring.status,
    },
  }
}

export const mockEventProvider = {
  emit(command: CanCommand) {
    return createCanEvent(command, "mock")
  },
}
