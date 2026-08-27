import type {
  VehicleFlowPlaybackSnapshot,
  VehicleFlowTrace,
} from "./vehicleFlowTypes"

function freezeTrace(trace: VehicleFlowTrace): VehicleFlowTrace {
  Object.freeze(trace.data)
  Object.freeze(trace.route)
  return Object.freeze(trace)
}

function freezePlaybackSnapshot(
  snapshot: VehicleFlowPlaybackSnapshot,
): VehicleFlowPlaybackSnapshot {
  if (snapshot.trace) freezeTrace(snapshot.trace)
  return Object.freeze(snapshot)
}

export const executedDoorTrace: VehicleFlowTrace = freezeTrace({
  traceId: "door-attempt-1",
  attemptId: "door-attempt-1",
  sequence: 1,
  kind: "inject",
  commandLabel: "cansend vcan0 456#000113B7",
  commandIndex: 1,
  canId: "0x456",
  data: ["00", "01", "13", "B7"],
  route: ["terminal", "obd", "ids", "gateway", "body", "leftDoor"],
  stoppedAt: null,
  outcome: "EXECUTED",
  ecuVerdict: "EXECUTED",
  idsVerdict: "NORMAL",
  effectTarget: "leftDoor",
  effectState: "open",
  effectApplied: true,
})

export const rejectedBodyTrace: VehicleFlowTrace = freezeTrace({
  ...executedDoorTrace,
  traceId: "door-attempt-rejected",
  attemptId: "door-attempt-rejected",
  commandLabel: "cansend vcan0 456#010110B5",
  data: ["01", "01", "10", "B5"],
  route: ["terminal", "obd", "ids", "gateway", "body"],
  stoppedAt: "body",
  outcome: "REJECTED",
  ecuVerdict: "COUNTER_REJECTED",
  idsVerdict: "ALERT",
  effectTarget: null,
  effectState: null,
  effectApplied: false,
})

export const captureTrace: VehicleFlowTrace = freezeTrace({
  ...executedDoorTrace,
  traceId: "capture-1",
  attemptId: null,
  kind: "capture",
  commandLabel: "candump -L vcan0 > capture.log",
  commandIndex: null,
  canId: "0x5a2",
  data: ["00", "01"],
  route: ["terminal", "obd", "monitor"],
  outcome: "OBSERVED",
  ecuVerdict: null,
  idsVerdict: null,
  effectTarget: null,
  effectState: null,
  effectApplied: false,
})

export const playingDoorSnapshotAtGateway: VehicleFlowPlaybackSnapshot =
  freezePlaybackSnapshot({
    playbackId: 1,
    phase: "playing",
    trace: executedDoorTrace,
    traceIndex: 0,
    traceCount: 1,
    segmentIndex: 3,
  })

export const executedAlertTrace: VehicleFlowTrace = freezeTrace({
  ...executedDoorTrace,
  traceId: "door-attempt-alert",
  attemptId: "door-attempt-alert",
  idsVerdict: "ALERT",
})
