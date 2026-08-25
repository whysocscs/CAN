import { describe, expect, it } from "vitest"
import {
  appendAttackLabActivity,
  appendAttackLabTranscript,
  classifyAttackLabFeedback,
  classifyTerminalTranscript,
  type AttackLabActionResult,
  type AttackLabTerminalTranscript,
} from "./attackLabFeedback"
import {
  captureTrace,
  executedAlertTrace,
  executedDoorTrace,
  rejectedBodyTrace,
  terminalLocalRejectionTrace,
} from "../vehicle/vehicleFlowTestFixtures"
import type {
  VehicleFlowPlaybackSnapshot,
  VehicleFlowTrace,
} from "../vehicle/vehicleFlowTypes"

function actionResult(
  overrides: Partial<AttackLabActionResult> = {},
): AttackLabActionResult {
  return {
    actionId: "action-1",
    scenario: "door",
    origin: "terminal",
    commandLabel: "learner command",
    ok: true,
    resultCode: "EXECUTED",
    rawOutput: "",
    traces: [executedDoorTrace],
    ...overrides,
  }
}

function playback(
  trace: VehicleFlowTrace,
  segmentIndex: number,
  options: Partial<VehicleFlowPlaybackSnapshot> = {},
): VehicleFlowPlaybackSnapshot {
  return {
    playbackId: 1,
    phase: "playing",
    trace,
    traceIndex: 0,
    traceCount: 1,
    segmentIndex,
    ...options,
  }
}

function complete(trace: VehicleFlowTrace): VehicleFlowPlaybackSnapshot {
  return playback(trace, trace.route.length - 1, { phase: "complete" })
}

describe("attack lab feedback policy", () => {
  it("keeps an emitted rejected cansend silent while explaining the ECU verdict", () => {
    const result = actionResult({
      commandLabel: rejectedBodyTrace.commandLabel,
      ok: false,
      resultCode: "COUNTER_REJECTED",
      rawOutput: "COUNTER_REJECTED",
      traces: [rejectedBodyTrace],
    })

    expect(classifyTerminalTranscript(result)).toMatchObject({
      stream: "silent",
      text: "",
    })

    const feedback = classifyAttackLabFeedback({
      result,
      playback: complete(rejectedBodyTrace),
    })

    expect(feedback.explanation).toContain("rolling counter")
    expect(feedback.explanationRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "가상 CAN 경로 입력", value: "성공" }),
      expect.objectContaining({ label: "ECU 판정", value: "COUNTER_REJECTED" }),
    ]))
  })

  it.each([
    ["cansend", executedDoorTrace],
    ["canplayer", { ...executedDoorTrace, commandLabel: "canplayer -I capture.log" }],
  ] as const)("keeps an executed %s submission silent and explains its effect", (
    _operation,
    trace,
  ) => {
    const result = actionResult({ traces: [trace], commandLabel: trace.commandLabel })
    const feedback = classifyAttackLabFeedback({ result, playback: complete(trace) })

    expect(classifyTerminalTranscript(result)).toMatchObject({ stream: "silent", text: "" })
    expect(feedback.flow.nodeFeedback?.status).toBe("EFFECT APPLIED")
    expect(feedback.explanationRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "차량 영향", value: "적용됨" }),
    ]))
  })

  it("keeps candump output in stdout while preserving its observation route", () => {
    const observeTrace: VehicleFlowTrace = {
      ...captureTrace,
      traceId: "observe-1",
      kind: "observe",
      commandLabel: "candump -L vcan0",
    }
    const result = actionResult({
      commandLabel: observeTrace.commandLabel,
      rawOutput: "captured frame text",
      traces: [observeTrace],
    })

    expect(classifyTerminalTranscript(result)).toEqual({
      command: observeTrace.commandLabel,
      stream: "stdout",
      text: "captured frame text",
    })
    expect(classifyAttackLabFeedback({ result, playback: complete(observeTrace) }).flow.nodeFeedback)
      .toMatchObject({ nodeId: "monitor", status: "OBSERVED" })
  })

  it("keeps capture redirection silent and labels its Evidence explanation", () => {
    const result = actionResult({
      scenario: "replay",
      commandLabel: captureTrace.commandLabel,
      traces: [captureTrace],
    })
    const feedback = classifyAttackLabFeedback({ result, playback: complete(captureTrace) })

    expect(classifyTerminalTranscript(result)).toMatchObject({ stream: "silent", text: "" })
    expect(feedback.explanation).toContain("Evidence")
    expect(feedback.explanationRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Evidence" }),
    ]))
  })

  it.each([
    "COMMAND_REJECTED",
    "CAPTURE_FILE_UNKNOWN",
    "REPEAT_COUNT_INVALID",
  ])("keeps local or preflight %s in stderr without a vehicle path", (resultCode) => {
    const result = actionResult({
      ok: false,
      resultCode,
      rawOutput: "virtual terminal error",
      traces: [terminalLocalRejectionTrace],
    })
    const feedback = classifyAttackLabFeedback({
      result,
      playback: complete(terminalLocalRejectionTrace),
    })

    expect(classifyTerminalTranscript(result)).toMatchObject({
      stream: "stderr",
      text: "virtual terminal error",
    })
    expect(feedback.flow.nodeFeedback).toMatchObject({
      nodeId: "terminal",
      status: "NO VEHICLE PATH",
    })
    expect(feedback.explanationRows).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "ECU 판정" }),
      expect.objectContaining({ label: "Toy IDS 관찰" }),
    ]))
  })

  it("does not create a transcript for a missing platform action result", () => {
    expect(appendAttackLabTranscript([], null)).toEqual([])
  })

  it("derives the current frame evidence and transition from the active trace", () => {
    const secondTrace: VehicleFlowTrace = {
      ...executedDoorTrace,
      traceId: "door-attempt-2",
      sequence: 2,
      commandIndex: 2,
      commandLabel: "script line two",
    }
    const result = actionResult({
      origin: "script",
      commandLabel: "whole script",
      traces: [executedDoorTrace, secondTrace, executedAlertTrace],
    })
    const feedback = classifyAttackLabFeedback({
      result,
      playback: playback(secondTrace, 3, { traceIndex: 1, traceCount: 3 }),
    })

    expect(feedback.flow).toMatchObject({
      commandLabel: "script line two",
      traceIndex: 1,
      traceCount: 3,
      canId: secondTrace.canId,
      dlc: secondTrace.data.length,
      data: secondTrace.data,
      currentTransition: "Toy Gateway -> Toy Body ECU",
    })
    expect(feedback.explanationRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "프레임", value: "Frame 2/3" }),
    ]))
  })

  it("keeps each multi-frame trace command label instead of the outer script label", () => {
    const traces = [
      { ...executedDoorTrace, traceId: "one", commandLabel: "script line one" },
      { ...executedDoorTrace, traceId: "two", sequence: 2, commandLabel: "script line two" },
    ]
    const result = actionResult({ origin: "script", commandLabel: "whole script", traces })

    for (const [index, trace] of traces.entries()) {
      expect(classifyAttackLabFeedback({
        result,
        playback: playback(trace, 0, { traceIndex: index, traceCount: traces.length }),
      }).flow.commandLabel).toBe(trace.commandLabel)
    }
  })

  it("describes Toy IDS NORMAL as observed without an alert and ALERT as detected without blocking", () => {
    const normal = classifyAttackLabFeedback({
      result: actionResult(),
      playback: playback(executedDoorTrace, 2),
    })
    const alert = classifyAttackLabFeedback({
      result: actionResult({ traces: [executedAlertTrace] }),
      playback: playback(executedAlertTrace, 2),
    })

    expect(normal.explanationRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Toy IDS 관찰", value: "관찰됨 · Toy 규칙 경보 없음" }),
    ]))
    expect(alert.explanationRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Toy IDS 관찰", value: "관찰/탐지됨 · 차단 근거 없음" }),
    ]))
  })

  it("discloses IDS, ECU, and effect facts only at their authoritative segments", () => {
    const result = actionResult()

    expect(classifyAttackLabFeedback({
      result,
      playback: playback(executedDoorTrace, 1),
    }).explanationRows).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Toy IDS 관찰" }),
      expect.objectContaining({ label: "ECU 판정" }),
      expect.objectContaining({ label: "차량 영향" }),
    ]))

    expect(classifyAttackLabFeedback({
      result,
      playback: playback(executedDoorTrace, 2),
    }).explanationRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "Toy IDS 관찰" }),
    ]))

    expect(classifyAttackLabFeedback({
      result,
      playback: playback(executedDoorTrace, 4),
    }).explanationRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "ECU 판정" }),
    ]))

    expect(classifyAttackLabFeedback({
      result,
      playback: complete(executedDoorTrace),
    }).explanationRows).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: "차량 영향" }),
    ]))
  })

  it("does not derive automatic explanation text from an untrusted output payload", () => {
    const privateText = "unobserved-private-answer"
    const feedback = classifyAttackLabFeedback({
      result: actionResult({ resultCode: "UNKNOWN", rawOutput: privateText }),
      playback: complete(executedDoorTrace),
    })
    const automaticText = [
      feedback.explanation,
      ...feedback.explanationRows.map((row) => row.value),
      feedback.flow.nodeFeedback?.detail ?? "",
    ].join(" ")

    expect(automaticText).not.toContain(privateText)
  })

  it("keeps the newest twenty authoritative actions including local and script results", () => {
    const initial = Array.from({ length: 20 }, (_, index) => ({
      id: `old-${index}`,
      origin: "terminal" as const,
      commandLabel: `old-${index}`,
      resultCode: "EXECUTED",
      frameEmitted: true,
      stoppedAt: "body" as const,
      effectApplied: false,
    }))
    const local = actionResult({
      actionId: "local-preflight",
      resultCode: "CAPTURE_REQUIRED",
      ok: false,
      traces: [terminalLocalRejectionTrace],
    })
    const script = actionResult({
      actionId: "script-result",
      origin: "script",
      traces: [executedDoorTrace],
    })

    const afterLocal = appendAttackLabActivity(initial, local)
    const entries = appendAttackLabActivity(afterLocal, script)

    expect(entries).toHaveLength(20)
    expect(entries.at(0)?.id).toBe("old-2")
    expect(entries.at(-2)).toMatchObject({
      id: "local-preflight",
      frameEmitted: false,
      stoppedAt: "terminal",
    })
    expect(entries.at(-1)).toMatchObject({
      id: "script-result",
      origin: "script",
      frameEmitted: true,
    })
  })

  it("keeps the newest one hundred terminal transcript entries", () => {
    const entries: AttackLabTerminalTranscript[] = Array.from({ length: 100 }, (_, index) => ({
      command: `old-${index}`,
      stream: "stdout",
      text: String(index),
    }))
    const appended = appendAttackLabTranscript(entries, {
      command: "latest",
      stream: "stderr",
      text: "latest text",
    })

    expect(appended).toHaveLength(100)
    expect(appended.at(0)?.command).toBe("old-1")
    expect(appended.at(-1)).toMatchObject({ command: "latest", stream: "stderr" })
  })
})
