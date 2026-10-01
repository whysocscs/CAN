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

const spoofingSuccessTrace: VehicleFlowTrace = {
  ...executedDoorTrace,
  traceId: "spoofing-success",
  route: ["terminal", "obd", "ids", "gateway", "rear", "tailgate"],
  effectTarget: "tailgate",
}

const replaySuccessTrace: VehicleFlowTrace = {
  ...executedDoorTrace,
  traceId: "replay-success",
  commandLabel: "canplayer -I capture.log -l 1",
}

const orderedDoorTraces: readonly VehicleFlowTrace[] = [
  {
    ...executedDoorTrace,
    traceId: "ordered-door-1",
    sequence: 1,
    commandIndex: 1,
    commandLabel: "cansend vcan0 456#000113B7",
    data: ["00", "01", "13", "B7"],
    route: ["terminal", "obd", "ids", "gateway", "body"],
    effectTarget: null,
    effectState: null,
    effectApplied: false,
  },
  {
    ...executedDoorTrace,
    traceId: "ordered-door-2",
    sequence: 2,
    commandIndex: 2,
    commandLabel: "cansend vcan0 456#000114B0",
    data: ["00", "01", "14", "B0"],
    route: ["terminal", "obd", "ids", "gateway", "body"],
    idsVerdict: "ALERT",
    effectTarget: null,
    effectState: null,
    effectApplied: false,
  },
  {
    ...executedDoorTrace,
    traceId: "ordered-door-3",
    sequence: 3,
    commandIndex: 3,
    commandLabel: "cansend vcan0 456#000115B1",
    data: ["00", "01", "15", "B1"],
  },
]

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

function automaticTextFor(
  result: AttackLabActionResult,
  snapshot: VehicleFlowPlaybackSnapshot,
): string {
  const feedback = classifyAttackLabFeedback({ result, playback: snapshot })
  return [
    feedback.explanation,
    ...feedback.explanationRows.map((row) => row.value),
    feedback.flow.nodeFeedback?.detail ?? "",
  ].join(" ")
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
    expect(feedback.explanationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "터미널 결과", value: "오류 없음" }),
        expect.objectContaining({ label: "가상 CAN 경로 입력", value: "성공" }),
        expect.objectContaining({
          label: "ECU 판정",
          value: "COUNTER_REJECTED",
        }),
      ]),
    )
  })

  it.each([
    ["cansend", executedDoorTrace],
    [
      "canplayer",
      { ...executedDoorTrace, commandLabel: "canplayer -I capture.log" },
    ],
  ] as const)(
    "keeps an executed %s submission silent and explains its effect",
    (_operation, trace) => {
      const result = actionResult({
        traces: [trace],
        commandLabel: trace.commandLabel,
      })
      const feedback = classifyAttackLabFeedback({
        result,
        playback: complete(trace),
      })

      expect(classifyTerminalTranscript(result)).toMatchObject({
        stream: "silent",
        text: "",
      })
      expect(feedback.flow.nodeFeedback?.status).toBe("EFFECT APPLIED")
      expect(feedback.explanationRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: "차량 영향", value: "적용됨" }),
        ]),
      )
    },
  )

  it.each([
    ["door", executedDoorTrace, "ordered state-frame sequence"],
    ["spoofing", spoofingSuccessTrace, "authenticated sender identity"],
    ["replay", replaySuccessTrace, "freshness protection"],
  ] as const)(
    "explains the %s success with its own security principle",
    (scenario, trace, principle) => {
      const feedback = classifyAttackLabFeedback({
        result: actionResult({ scenario, traces: [trace] }),
        playback: complete(trace),
      })

      expect(feedback.explanation).toContain(principle)
    },
  )

  it.each([
    [
      "the trace records no applied effect",
      { ...executedDoorTrace, effectApplied: false },
    ],
    [
      "the applied effect targets a different endpoint",
      { ...executedDoorTrace, effectTarget: "tailgate" },
    ],
  ] as const)(
    "does not report EFFECT APPLIED when %s",
    (_case, trace) => {
      const feedback = classifyAttackLabFeedback({
        result: actionResult({ traces: [trace] }),
        playback: complete(trace),
      })

      expect(feedback.flow.nodeFeedback).toMatchObject({
        nodeId: "leftDoor",
        status: "PROCESSING",
      })
    },
  )

  it("shows ECU acceptance before the later vehicle effect stage", () => {
    const result = actionResult({ traces: [executedDoorTrace] })
    const atBodyEcu = classifyAttackLabFeedback({
      result,
      playback: playback(executedDoorTrace, 4),
    })

    expect(atBodyEcu.flow.currentNodeId).toBe("body")
    expect(atBodyEcu.flow.effectApplied).toBe(false)
    expect(atBodyEcu.flow.nodeFeedback).toMatchObject({
      nodeId: "body",
      status: "ACCEPTED",
      source: "Toy ECU",
    })
    expect(atBodyEcu.flow.nodeFeedback?.detail).toContain("수락")
  })

  it("places the authoritative observed result beside the learner prediction without exposing a hidden expected value", () => {
    const feedback = classifyAttackLabFeedback({
      result: actionResult(),
      playback: complete(executedDoorTrace),
    })

    expect(feedback.actualRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Terminal", value: "오류 없음" }),
        expect.objectContaining({
          label: "제출 프레임",
          value: "0x456 · DLC 4 · DATA 00 01 13 B7",
        }),
        expect.objectContaining({ label: "Toy IDS", value: "NORMAL" }),
        expect.objectContaining({ label: "Toy ECU", value: "EXECUTED" }),
        expect.objectContaining({
          label: "차량 영향",
          value: "Left Door · 적용됨",
        }),
      ]),
    )
    expect(feedback.actualRows.map((row) => row.label)).not.toContain(
      "기대 Counter",
    )
    expect(feedback.actualRows.map((row) => row.label)).not.toContain(
      "정답 Payload",
    )
  })

  it("aggregates every completed script frame with its own authoritative IDS, ECU, and effect result", () => {
    const finalTrace = orderedDoorTraces[2]
    const feedback = classifyAttackLabFeedback({
      result: actionResult({ origin: "script", traces: orderedDoorTraces }),
      playback: playback(finalTrace, finalTrace.route.length - 1, {
        phase: "complete",
        traceIndex: 2,
        traceCount: 3,
      }),
    })

    expect(feedback.actualRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Frame 1/3 · 제출 프레임",
          value: "0x456 · DLC 4 · DATA 00 01 13 B7",
        }),
        expect.objectContaining({
          label: "Frame 1/3 · Toy IDS",
          value: "NORMAL",
        }),
        expect.objectContaining({
          label: "Frame 1/3 · Toy ECU",
          value: "EXECUTED",
        }),
        expect.objectContaining({
          label: "Frame 1/3 · 차량 영향",
          value: "없음",
        }),
        expect.objectContaining({
          label: "Frame 2/3 · 제출 프레임",
          value: "0x456 · DLC 4 · DATA 00 01 14 B0",
        }),
        expect.objectContaining({
          label: "Frame 2/3 · Toy IDS",
          value: "ALERT",
        }),
        expect.objectContaining({
          label: "Frame 2/3 · Toy ECU",
          value: "EXECUTED",
        }),
        expect.objectContaining({
          label: "Frame 2/3 · 차량 영향",
          value: "없음",
        }),
        expect.objectContaining({
          label: "Frame 3/3 · 제출 프레임",
          value: "0x456 · DLC 4 · DATA 00 01 15 B1",
        }),
        expect.objectContaining({
          label: "Frame 3/3 · Toy IDS",
          value: "NORMAL",
        }),
        expect.objectContaining({
          label: "Frame 3/3 · Toy ECU",
          value: "EXECUTED",
        }),
        expect.objectContaining({
          label: "Frame 3/3 · 차량 영향",
          value: "Left Door · 적용됨",
        }),
      ]),
    )
    expect(
      feedback.actualRows.filter((row) => row.value.includes("적용됨")),
    ).toEqual([
      expect.objectContaining({ label: "Frame 3/3 · 차량 영향" }),
    ])
  })

  it("keeps the in-flight Actual comparison scoped to the current script frame", () => {
    const currentTrace = orderedDoorTraces[1]
    const feedback = classifyAttackLabFeedback({
      result: actionResult({ origin: "script", traces: orderedDoorTraces }),
      playback: playback(currentTrace, currentTrace.route.length - 1, {
        traceIndex: 1,
        traceCount: 3,
      }),
    })

    expect(feedback.actualRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Frame 2/3 · 제출 프레임",
          value: "0x456 · DLC 4 · DATA 00 01 14 B0",
        }),
      ]),
    )
    expect(feedback.actualRows.map((row) => row.value).join(" ")).not.toContain(
      "00 01 13 B7",
    )
    expect(feedback.actualRows.map((row) => row.value).join(" ")).not.toContain(
      "00 01 15 B1",
    )
  })

  it.each([
    ["capture", captureTrace, "캡처 프레임"],
    [
      "observe",
      { ...captureTrace, traceId: "observe-frame", kind: "observe" },
      "관찰 프레임",
    ],
    ["inject", executedDoorTrace, "제출 프레임"],
  ] as const)(
    "labels a %s playback frame by its trace kind",
    (_kind, trace, expectedLabel) => {
      const feedback = classifyAttackLabFeedback({
        result: actionResult({ traces: [trace] }),
        playback: complete(trace),
      })

      expect(feedback.actualRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            key: "actual-frame",
            label: expectedLabel,
          }),
        ]),
      )
    },
  )

  it("labels an in-flight node as current instead of falsely calling it the final device", () => {
    const feedback = classifyAttackLabFeedback({
      result: actionResult(),
      playback: playback(executedDoorTrace, 1),
    })

    expect(feedback.actualRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "현재 장치",
          value: "Training OBD-II",
        }),
      ]),
    )
    expect(feedback.actualRows.map((row) => row.label)).not.toContain(
      "최종 도달 장치",
    )
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
    expect(
      classifyAttackLabFeedback({ result, playback: complete(observeTrace) })
        .flow.nodeFeedback,
    ).toMatchObject({ nodeId: "monitor", status: "OBSERVED" })
  })

  it("keeps capture redirection silent and labels its Evidence explanation", () => {
    const result = actionResult({
      scenario: "replay",
      commandLabel: captureTrace.commandLabel,
      traces: [captureTrace],
    })
    const feedback = classifyAttackLabFeedback({
      result,
      playback: complete(captureTrace),
    })

    expect(classifyTerminalTranscript(result)).toMatchObject({
      stream: "silent",
      text: "",
    })
    expect(feedback.explanation).toContain("Evidence")
    expect(feedback.explanationRows).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "Evidence" })]),
    )
  })

  it.each([
    "COMMAND_REJECTED",
    "SCRIPT_COMMAND_INVALID",
    "FILE_NOT_FOUND",
    "CAPTURE_FILE_UNKNOWN",
    "REPEAT_COUNT_INVALID",
  ])(
    "keeps local or preflight %s in stderr without a vehicle path",
    (resultCode) => {
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
      expect(feedback.explanationRows).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ label: "ECU 판정" }),
          expect.objectContaining({ label: "Toy IDS 관찰" }),
        ]),
      )
    },
  )

  it("keeps an evidence-stop Replay preflight in stderr with no vehicle path", () => {
    const evidencePreflight: VehicleFlowTrace = {
      ...terminalLocalRejectionTrace,
      traceId: "replay-evidence-preflight",
      route: ["terminal", "evidence"],
      stoppedAt: "evidence",
    }
    const result = actionResult({
      scenario: "replay",
      ok: false,
      resultCode: "CAPTURE_SESSION_MISMATCH",
      rawOutput: "virtual replay preflight error",
      traces: [evidencePreflight],
    })
    const feedback = classifyAttackLabFeedback({
      result,
      playback: complete(evidencePreflight),
    })

    expect(classifyTerminalTranscript(result)).toMatchObject({
      stream: "stderr",
    })
    expect(feedback.flow.nodeFeedback).toMatchObject({
      nodeId: "evidence",
      status: "NO VEHICLE PATH",
    })
    expect(feedback.explanationRows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "ECU 판정" }),
        expect.objectContaining({ label: "Toy IDS 관찰" }),
      ]),
    )
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
    expect(feedback.explanationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "프레임", value: "Frame 2/3" }),
      ]),
    )
  })

  it("keeps each multi-frame trace command label instead of the outer script label", () => {
    const traces = [
      { ...executedDoorTrace, traceId: "one", commandLabel: "script line one" },
      {
        ...executedDoorTrace,
        traceId: "two",
        sequence: 2,
        commandLabel: "script line two",
      },
    ]
    const result = actionResult({
      origin: "script",
      commandLabel: "whole script",
      traces,
    })

    for (const [index, trace] of traces.entries()) {
      expect(
        classifyAttackLabFeedback({
          result,
          playback: playback(trace, 0, {
            traceIndex: index,
            traceCount: traces.length,
          }),
        }).flow.commandLabel,
      ).toBe(trace.commandLabel)
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

    expect(normal.explanationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Toy IDS 관찰",
          value: "관찰됨 · Toy 규칙 경보 없음",
        }),
      ]),
    )
    expect(alert.explanationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          label: "Toy IDS 관찰",
          value: "관찰/탐지됨 · 차단 근거 없음",
        }),
      ]),
    )
  })

  it("discloses IDS, ECU, and effect facts only at their authoritative segments", () => {
    const rejectedResult = actionResult({
      ok: false,
      resultCode: "COUNTER_REJECTED",
      traces: [rejectedBodyTrace],
    })

    const beforeIds = classifyAttackLabFeedback({
      result: rejectedResult,
      playback: playback(rejectedBodyTrace, 1),
    })
    expect(beforeIds.explanationRows).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Toy IDS 관찰" }),
        expect.objectContaining({ label: "ECU 판정" }),
        expect.objectContaining({ label: "차량 영향" }),
      ]),
    )
    expect(beforeIds.explanation).not.toContain("rolling counter")

    const atIds = classifyAttackLabFeedback({
      result: rejectedResult,
      playback: playback(rejectedBodyTrace, 2),
    })
    expect(atIds.explanationRows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ label: "Toy IDS 관찰" }),
      ]),
    )
    expect(atIds.explanation).not.toContain("rolling counter")

    const atEcu = classifyAttackLabFeedback({
      result: rejectedResult,
      playback: complete(rejectedBodyTrace),
    })
    expect(atEcu.explanationRows).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "ECU 판정" })]),
    )
    expect(atEcu.explanation).toContain("Toy ECU")

    const atEffect = classifyAttackLabFeedback({
      result: actionResult(),
      playback: complete(executedDoorTrace),
    })
    expect(atEffect.explanationRows).toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "차량 영향" })]),
    )
    expect(atEffect.explanation).toContain("차량 효과가 적용")
  })

  it("never exposes synthetic private values or an unknown ECU verdict in automatic feedback", () => {
    const privateValues = [
      "private-id-sentinel",
      "private-payload-sentinel",
      "private-checksum-formula-sentinel",
      "private-expected-counter-sentinel",
      "private-full-command-sentinel",
      "private-ecu-verdict-sentinel",
    ]
    const trace: VehicleFlowTrace = {
      ...rejectedBodyTrace,
      ecuVerdict: privateValues.at(-1)!,
    }
    const result = actionResult({
      resultCode: "COUNTER_REJECTED",
      rawOutput: privateValues.slice(0, -1).join(" "),
      traces: [trace],
    })
    const feedback = classifyAttackLabFeedback({
      result,
      playback: complete(trace),
    })
    const automaticText = automaticTextFor(result, complete(trace))

    for (const privateValue of privateValues) {
      expect(automaticText).not.toContain(privateValue)
    }
    expect(feedback.flow.ecuVerdict).toBeNull()
    expect(feedback.flow.nodeFeedback?.detail).toBe(
      "교육용 분석에 필요한 안전한 판정 정보가 없습니다.",
    )
    expect(feedback.explanationRows).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ label: "ECU 판정" })]),
    )
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

  it("preserves an evidence-stop Replay preflight in bounded activity without a frame", () => {
    const evidencePreflight: VehicleFlowTrace = {
      ...terminalLocalRejectionTrace,
      traceId: "replay-preflight-activity",
      route: ["terminal", "evidence"],
      stoppedAt: "evidence",
    }
    const entries = appendAttackLabActivity(
      [],
      actionResult({
        actionId: "replay-preflight",
        scenario: "replay",
        ok: false,
        resultCode: "CAPTURE_GENERATION_MISMATCH",
        traces: [evidencePreflight],
      }),
    )

    expect(entries).toEqual([
      expect.objectContaining({
        id: "replay-preflight",
        resultCode: "CAPTURE_GENERATION_MISMATCH",
        frameEmitted: false,
        stoppedAt: "evidence",
      }),
    ])
  })

  it("keeps the newest one hundred terminal transcript entries", () => {
    const entries: AttackLabTerminalTranscript[] = Array.from(
      { length: 100 },
      (_, index) => ({
        command: `old-${index}`,
        stream: "stdout",
        text: String(index),
      }),
    )
    const appended = appendAttackLabTranscript(entries, {
      command: "latest",
      stream: "stderr",
      text: "latest text",
    })

    expect(appended).toHaveLength(100)
    expect(appended.at(0)?.command).toBe("old-1")
    expect(appended.at(-1)).toMatchObject({
      command: "latest",
      stream: "stderr",
    })
  })
})
