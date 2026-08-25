# Attack Flow Visualization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Build an authoritative-result-driven hybrid timeline and 3D packet visualization that shows each Door, Spoofing, and Replay command traversing the Toy vehicle before any GLB effect is applied.

**Architecture:** FastAPI responses gain server-derived flowTraces so the frontend never guesses security verdict locations. A shared React playback controller consumes validated traces, advances one segment at a time, and applies vehicle effects only at effect-node arrival; VehicleNetworkViewport renders the same snapshot as both an accessible DOM rail and a Three.js packet/halo overlay.

**Tech Stack:** FastAPI, Python, pytest, React 19, TypeScript, Vitest, Testing Library, React Three Fiber, Drei, Three.js, CSS, Docker Compose.

**Spec:** docs/superpowers/specs/2026-08-25-attack-flow-visualization-design.md

## Global Constraints

- The visible animation must be labelled 교육용 slow-motion trace.
- Presentation timing must never be described as physical CAN propagation time.
- ECU verdict and IDS observation must remain separate; IDS ALERT does not imply blocking.
- Rejected operations must not reach or mutate a vehicle effect target.
- Logical OBD, IDS, Gateway, and ECU positions remain educational anchors, not OEM locations.
- Only HINGE_doorL and HINGE_tailgate count as truthful clickable GLB effect parts.
- DoS remains a static preview and is not included in this implementation.
- No new runtime dependency is allowed.
- Session ID and generation guards remain authoritative for stale-response rejection.
- Reset, scenario change, new session, and unmount must cancel active playback.
- Matching live lab events may update the monitor but must not mutate the global vehicle store before playback reaches the effect node.

---

## File Structure

### New backend file

- server/labs/attack_flow_trace.py
  - Defines the JSON trace construction primitives shared by Door, Spoofing, and Replay routers.
  - Contains no FastAPI imports and does not mutate a lab session.

### New frontend files

- src/features/vehicle/vehicleFlowTypes.ts
  - Owns VehicleFlowTrace, VehicleFlowPlaybackSnapshot, runtime trace validation, and effect-state application.
- src/features/vehicle/vehicleFlowTypes.test.ts
  - Verifies malformed API traces are rejected and accepted traces retain exact ordered routes.
- src/features/vehicle/vehicleFlowTestFixtures.ts
  - Exports immutable executed, rejected, capture, Spoofing, Replay, and playback snapshots for component tests.
- src/features/vehicle/useVehicleFlowPlayback.ts
  - Owns queue timing, deduplication, segment transitions, cancellation, and effect/complete callbacks.
- src/features/vehicle/useVehicleFlowPlayback.test.tsx
  - Uses fake timers to verify ordering, effect timing, rejection, reduced motion, replacement, and cleanup.
- src/features/vehicle/VehicleFlowRail.tsx
  - Renders the accessible DOM timeline, command HUD, and coarse live announcement.
- src/features/vehicle/VehicleFlowRail.test.tsx
  - Verifies node states, separate ECU/IDS copy, and color-independent rejection semantics.

### Existing files modified

- server/routers/labs.py
  - Adds Door flowTraces to terminal/run responses and attemptId to live metadata.
- server/routers/can_attack_labs.py
  - Adds Spoofing/Replay flowTraces to terminal/run responses.
- server/tests/test_labs_api.py
  - Locks Door trace and metadata contracts.
- server/tests/test_can_attack_labs_api.py
  - Locks Spoofing/Replay trace contracts.
- src/features/attack-lab/doorLabTypes.ts
  - Exposes unknown flowTraces at the network boundary.
- src/features/attack-lab/beginnerCanAttackTypes.ts
  - Exposes unknown flowTraces at the network boundary.
- src/features/vehicle/VehicleNetworkViewport.tsx
  - Adds clickable anchors/effect meshes, packet/halo rendering, compact selected tooltip, and VehicleFlowRail.
- src/features/vehicle/VehicleNetworkViewport.test.tsx
  - Locks selection, packet edges, focus, Canvas lifetime, and material cleanup.
- src/features/attack-lab/DoorAttackVehicle.tsx
  - Passes playback state to the shared viewport.
- src/features/attack-lab/DoorAttackVehicle.test.tsx
  - Locks playback prop forwarding.
- src/features/attack-lab/DoorAttackLabPage.tsx
  - Accepts Door traces, defers vehicle mutation, coordinates completion/reset, and blocks concurrent input.
- src/features/attack-lab/DoorAttackLabPage.test.tsx
  - Locks accepted/rejected timing and cancellation.
- src/features/attack-lab/BeginnerCanAttackLabPage.tsx
  - Applies the shared controller to Spoofing and Replay.
- src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx
  - Locks capture/no-effect and accepted/rejected timing.
- src/features/attack-lab/doorAttackLab.css
  - Styles the new rail, HUD, packet status, selected tooltips, and responsive states.

---

### Task 1: Door backend flow trace contract

**Files:**
- Create: server/labs/attack_flow_trace.py
- Modify: server/routers/labs.py
- Test: server/tests/test_labs_api.py

**Interfaces:**
- Produces: make_flow_trace(...) -> dict[str, object]
- Produces: door_terminal_traces(command, result) -> list[dict[str, object]]
- Produces: door_script_traces(script, result) -> list[dict[str, object]]
- Produces: terminal/script response field flowTraces
- Produces: Door WebSocket lab.attemptId

- [ ] **Step 1: Add failing Door API trace tests**

Append focused tests that create a fresh Door session and assert local, rejected,
accepted, and live-metadata behavior:

~~~python
def test_door_results_expose_authoritative_flow_traces() -> None:
    emitted: list[dict[str, object]] = []

    async def record(can_id: str, data: list[str], **metadata: object) -> bool:
        emitted.append({"can_id": can_id, "data": data, **metadata})
        return True

    app = FastAPI()
    app.include_router(labs.router)
    app.dependency_overrides[labs.get_frame_emitter] = lambda: record
    client = TestClient(app)

    created = client.post("/labs/door-blackbox/sessions").json()
    session_id = created["sessionId"]

    local = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/terminal",
        json={"command": "pwd"},
    ).json()
    assert local["flowTraces"][0] == {
        "traceId": "terminal:pwd",
        "attemptId": None,
        "sequence": 1,
        "kind": "local",
        "commandLabel": "pwd",
        "commandIndex": None,
        "canId": None,
        "data": [],
        "route": ["terminal"],
        "stoppedAt": None,
        "outcome": "LOCAL",
        "ecuVerdict": None,
        "idsVerdict": None,
        "effectTarget": None,
        "effectState": None,
        "effectApplied": False,
    }

    rejected = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/terminal",
        json={"command": "cansend vcan0 456#010110B5"},
    ).json()
    trace = rejected["flowTraces"][0]
    assert trace["route"] == ["terminal", "obd", "ids", "gateway", "body"]
    assert trace["stoppedAt"] == "body"
    assert trace["outcome"] == "REJECTED"
    assert trace["effectApplied"] is False

    accepted = client.post(
        f"/labs/door-blackbox/sessions/{session_id}/run",
        json={
            "script": "interval_ms=100\n"
            "cansend vcan0 456#000113B7\n"
            "cansend vcan0 456#000114B0\n"
            "cansend vcan0 456#000115B1"
        },
    ).json()
    assert [item["sequence"] for item in accepted["flowTraces"]] == [1, 2, 3]
    assert all(item["outcome"] == "EXECUTED" for item in accepted["flowTraces"])
    assert accepted["flowTraces"][0]["route"][-2:] == ["body", "leftDoor"]
    assert accepted["flowTraces"][0]["effectState"] == "open"
    assert emitted[-1]["lab"]["attemptId"] == accepted["flowTraces"][-1]["attemptId"]
~~~

- [ ] **Step 2: Run the Door test and confirm RED**

Run:

~~~powershell
python -B -m pytest server/tests/test_labs_api.py -k "flow_traces" -q
~~~

Expected: FAIL because flowTraces is absent and Door lab metadata has no attemptId.

- [ ] **Step 3: Create the pure trace construction module**

Create server/labs/attack_flow_trace.py with one JSON-key-normalizing primitive:

~~~python
from __future__ import annotations

from collections.abc import Sequence
from typing import Literal

FlowKind = Literal["local", "observe", "capture", "inject"]
FlowOutcome = Literal["LOCAL", "OBSERVED", "EXECUTED", "REJECTED"]


def make_flow_trace(
    *,
    trace_id: str,
    attempt_id: str | None,
    sequence: int,
    kind: FlowKind,
    command_label: str,
    command_index: int | None,
    can_id: str | None,
    data: Sequence[str],
    route: Sequence[str],
    stopped_at: str | None,
    outcome: FlowOutcome,
    ecu_verdict: str | None,
    ids_verdict: str | None,
    effect_target: str | None,
    effect_state: str | None,
    effect_applied: bool,
) -> dict[str, object]:
    return {
        "traceId": trace_id,
        "attemptId": attempt_id,
        "sequence": sequence,
        "kind": kind,
        "commandLabel": command_label,
        "commandIndex": command_index,
        "canId": can_id,
        "data": list(data),
        "route": list(route),
        "stoppedAt": stopped_at,
        "outcome": outcome,
        "ecuVerdict": ecu_verdict,
        "idsVerdict": ids_verdict,
        "effectTarget": effect_target,
        "effectState": effect_state,
        "effectApplied": effect_applied,
    }
~~~

Add Door-specific private builders in server/routers/labs.py. Keep verdict
interpretation on the server:

~~~python
def _door_attempt_trace(
    attempt: FrameAttempt,
    *,
    sequence: int,
    command_label: str,
    command_index: int | None,
    ids_status: str | None,
) -> dict[str, object]:
    accepted = attempt.accepted
    route = ["terminal", "obd", "ids", "gateway", "body"]
    if accepted:
        route.append("leftDoor")
    return make_flow_trace(
        trace_id=attempt.attempt_id,
        attempt_id=attempt.attempt_id,
        sequence=sequence,
        kind="inject",
        command_label=command_label,
        command_index=command_index,
        can_id=attempt.can_id,
        data=attempt.data,
        route=route,
        stopped_at=None if accepted else "body",
        outcome="EXECUTED" if accepted else "REJECTED",
        ecu_verdict=attempt.verdict,
        ids_verdict=ids_status,
        effect_target="leftDoor" if accepted else None,
        effect_state=("open" if attempt.data[0] == "00" else "closed") if accepted else None,
        effect_applied=accepted,
    )
~~~

Map terminal-only commands without inventing a vehicle path:

~~~python
def _door_terminal_traces(command: str, result: TerminalResult) -> list[dict[str, object]]:
    if result.frames and command.startswith("cansend "):
        return [
            _door_attempt_trace(
                result.frames[0],
                sequence=1,
                command_label=command,
                command_index=None,
                ids_status=result.ids_status,
            )
        ]
    if command.startswith("cat "):
        kind, route, outcome = "observe", ["terminal", "evidence"], "OBSERVED"
    elif command.startswith("candump "):
        kind, route, outcome = "observe", ["terminal", "obd", "monitor"], "OBSERVED"
    else:
        kind, route, outcome = "local", ["terminal"], "LOCAL"
    return [
        make_flow_trace(
            trace_id="terminal:" + command,
            attempt_id=None,
            sequence=1,
            kind=kind,
            command_label=command,
            command_index=None,
            can_id=None,
            data=[],
            route=route,
            stopped_at="terminal" if not result.ok else None,
            outcome="REJECTED" if not result.ok else outcome,
            ecu_verdict=None,
            ids_verdict=None,
            effect_target=None,
            effect_state=None,
            effect_applied=False,
        )
    ]
~~~

For scripts, enumerate executable cansend lines in source order and zip them to
attempts:

~~~python
def _door_script_traces(
    script: str,
    result: ScriptResult,
) -> list[dict[str, object]]:
    commands = [
        (line_number, stripped)
        for line_number, line in enumerate(script.splitlines(), start=1)
        if (stripped := line.strip()).startswith("cansend ")
    ]
    if result.attempts:
        return [
            _door_attempt_trace(
                attempt,
                sequence=index + 1,
                command_label=commands[index][1],
                command_index=commands[index][0],
                ids_status=result.ids_status,
            )
            for index, attempt in enumerate(result.attempts)
        ]
    if result.error is None:
        return []
    return [
        make_flow_trace(
            trace_id="script:" + result.error,
            attempt_id=None,
            sequence=1,
            kind="local",
            command_label=script,
            command_index=None,
            can_id=None,
            data=[],
            route=["terminal"],
            stopped_at="terminal",
            outcome="REJECTED",
            ecu_verdict=result.error,
            ids_verdict=None,
            effect_target=None,
            effect_state=None,
            effect_applied=False,
        )
    ]
~~~

- [ ] **Step 4: Add flowTraces and attemptId to Door responses**

Modify the response helpers:

~~~python
def _terminal_response(
    command: str,
    result: TerminalResult,
    state: dict[str, object],
) -> dict[str, object]:
    return {
        "ok": result.ok,
        "code": result.code,
        "output": result.output,
        "frames": [_attempt_response(frame) for frame in result.frames],
        "state": state,
        "idsStatus": result.ids_status,
        "flowTraces": _door_terminal_traces(command, result),
    }


def _script_response(script: str, result: ScriptResult) -> dict[str, object]:
    return {
        "attempts": [_attempt_response(attempt) for attempt in result.attempts],
        "idsStatus": result.ids_status,
        "state": result.state,
        "error": result.error,
        "flowTraces": _door_script_traces(script, result),
    }
~~~

Add attemptId to _metadata_for:

~~~python
"lab": {
    "labId": "door-blackbox-v1",
    "sessionId": session_id,
    "generation": attempt.generation,
    "attemptId": attempt.attempt_id,
},
~~~

Pass request.command and request.script into the response helpers.

- [ ] **Step 5: Run focused Door backend tests**

Run:

~~~powershell
python -B -m pytest server/tests/test_labs_api.py -k "flow_traces or metadata" -q
~~~

Expected: PASS.

- [ ] **Step 6: Run the Door domain and API regression set**

Run:

~~~powershell
python -B -m pytest server/tests/test_door_blackbox.py server/tests/test_labs_api.py -q
~~~

Expected: PASS with no change to existing ECU acceptance behavior.

- [ ] **Step 7: Commit Task 1**

~~~powershell
git add -- server/labs/attack_flow_trace.py server/routers/labs.py server/tests/test_labs_api.py
git commit -m "feat: expose authoritative door flow traces"
~~~

---

### Task 2: Spoofing and Replay backend flow traces

**Files:**
- Modify: server/routers/can_attack_labs.py
- Test: server/tests/test_can_attack_labs_api.py

**Interfaces:**
- Consumes: make_flow_trace(...) from server/labs/attack_flow_trace.py
- Produces: _beginner_result_traces(scenario, command_label, result)
- Produces: flowTraces on both Beginner terminal and script responses

- [ ] **Step 1: Add failing Spoofing and Replay trace tests**

~~~python
def test_spoofing_and_replay_results_expose_scenario_routes() -> None:
    client = _client(emitted=[])

    spoof = client.post("/labs/can-attacks/spoofing/sessions").json()
    spoof_result = client.post(
        f"/labs/can-attacks/spoofing/sessions/{spoof['sessionId']}/run",
        json={"script": "cansend vcan0 5A1#01"},
    ).json()
    spoof_trace = spoof_result["flowTraces"][0]
    assert spoof_trace["route"] == [
        "terminal", "obd", "ids", "gateway", "rear", "tailgate"
    ]
    assert spoof_trace["effectTarget"] == "tailgate"
    assert spoof_trace["effectState"] == "open"

    replay = client.post("/labs/can-attacks/replay/sessions").json()
    capture = client.post(
        f"/labs/can-attacks/replay/sessions/{replay['sessionId']}/terminal",
        json={"command": "candump -L vcan0 > capture.log"},
    ).json()
    assert capture["flowTraces"][0]["kind"] == "capture"
    assert capture["flowTraces"][0]["effectApplied"] is False

    replay_result = client.post(
        f"/labs/can-attacks/replay/sessions/{replay['sessionId']}/run",
        json={"script": "canplayer -I capture.log -l 1"},
    ).json()
    replay_trace = replay_result["flowTraces"][0]
    assert replay_trace["route"] == [
        "terminal", "obd", "ids", "gateway", "body", "leftDoor"
    ]
    assert replay_trace["effectTarget"] == "leftDoor"
~~~

Add one rejected test:

~~~python
def test_replay_before_capture_stops_before_vehicle_effect() -> None:
    client = _client(emitted=[])
    state = client.post("/labs/can-attacks/replay/sessions").json()
    result = client.post(
        f"/labs/can-attacks/replay/sessions/{state['sessionId']}/run",
        json={"script": "canplayer -I capture.log -l 1"},
    ).json()
    trace = result["flowTraces"][0]
    assert trace["outcome"] == "REJECTED"
    assert trace["stoppedAt"] == "body"
    assert trace["effectApplied"] is False
~~~

- [ ] **Step 2: Run focused tests and confirm RED**

~~~powershell
python -B -m pytest server/tests/test_can_attack_labs_api.py -k "flow_traces or stops_before" -q
~~~

Expected: FAIL because flowTraces is absent.

- [ ] **Step 3: Implement Beginner result trace construction**

Add a server-side helper that uses SCENARIO_SPECS:

~~~python
def _attempt_trace(
    scenario: str,
    command_label: str,
    attempt: FrameAttempt,
    sequence: int,
    ids_status: str | None,
) -> dict[str, object]:
    spec = SCENARIO_SPECS[scenario]
    accepted = attempt.accepted
    route = ["terminal", *spec.route]
    if accepted:
        route.append(spec.effect_target)
    return make_flow_trace(
        trace_id=attempt.attempt_id,
        attempt_id=attempt.attempt_id,
        sequence=sequence,
        kind="inject",
        command_label=command_label,
        command_index=1,
        can_id=attempt.can_id,
        data=attempt.data,
        route=route,
        stopped_at=None if accepted else spec.target_node,
        outcome="EXECUTED" if accepted else "REJECTED",
        ecu_verdict=attempt.verdict,
        ids_verdict=ids_status,
        effect_target=spec.effect_target if accepted else None,
        effect_state="open" if accepted else None,
        effect_applied=accepted,
    )
~~~

Map capture, evidence, monitor, local, and no-attempt rejection results explicitly:

~~~python
def _beginner_result_traces(
    scenario: str,
    command_label: str,
    result: TerminalResult | ScriptResult,
) -> list[dict[str, object]]:
    if result.attempts:
        return [
            _attempt_trace(
                scenario,
                command_label,
                attempt,
                index + 1,
                result.ids_status,
            )
            for index, attempt in enumerate(result.attempts)
        ]

    capture = result.captures[0] if result.captures else None
    if command_label.startswith("cat "):
        kind, route = "observe", ["terminal", "evidence"]
    elif command_label.startswith("candump "):
        kind = "capture" if ">" in command_label else "observe"
        route = ["terminal", "obd", "monitor"]
    elif not result.ok:
        return [
            make_flow_trace(
                trace_id="result:" + result.code,
                attempt_id=None,
                sequence=1,
                kind="local",
                command_label=command_label,
                command_index=None,
                can_id=None,
                data=[],
                route=["terminal"],
                stopped_at="terminal",
                outcome="REJECTED",
                ecu_verdict=result.code,
                ids_verdict=result.ids_status,
                effect_target=None,
                effect_state=None,
                effect_applied=False,
            )
        ]
    else:
        kind, route = "local", ["terminal"]

    return [
        make_flow_trace(
            trace_id=(capture.capture_id if capture else "result:" + result.code),
            attempt_id=None,
            sequence=1,
            kind=kind,
            command_label=command_label,
            command_index=None,
            can_id=capture.can_id if capture else None,
            data=capture.data if capture else (),
            route=route,
            stopped_at=None,
            outcome="LOCAL" if kind == "local" else "OBSERVED",
            ecu_verdict=None,
            ids_verdict=result.ids_status,
            effect_target=None,
            effect_state=None,
            effect_applied=False,
        )
    ]
~~~

- [ ] **Step 4: Add flowTraces to the shared Beginner response**

~~~python
def _result_response(
    scenario: str,
    command_label: str,
    result: TerminalResult | ScriptResult,
) -> dict[str, object]:
    return {
        "ok": result.ok,
        "code": result.code,
        "output": result.output,
        "attempts": [_attempt_response(attempt) for attempt in result.attempts],
        "captures": [_capture_response(capture) for capture in result.captures],
        "state": result.state,
        "idsStatus": result.ids_status,
        "flowTraces": _beginner_result_traces(
            scenario,
            command_label,
            result,
        ),
    }
~~~

Call it with request.command from terminal_command and request.script from
run_script.

- [ ] **Step 5: Run focused and complete Beginner backend tests**

~~~powershell
python -B -m pytest server/tests/test_can_attack_labs_api.py -q
python -B -m pytest server/tests/test_can_attack_basics.py -q
~~~

Expected: both commands PASS.

- [ ] **Step 6: Commit Task 2**

~~~powershell
git add -- server/routers/can_attack_labs.py server/tests/test_can_attack_labs_api.py
git commit -m "feat: expose beginner CAN attack flow traces"
~~~

---

### Task 3: Frontend flow contract and runtime validation

**Files:**
- Create: src/features/vehicle/vehicleFlowTypes.ts
- Create: src/features/vehicle/vehicleFlowTypes.test.ts
- Create: src/features/vehicle/vehicleFlowTestFixtures.ts
- Modify: src/features/attack-lab/doorLabTypes.ts
- Modify: src/features/attack-lab/beginnerCanAttackTypes.ts

**Interfaces:**
- Produces: VehicleFlowNodeId
- Produces: VehicleFlowTrace
- Produces: VehicleFlowPlaybackSnapshot
- Produces: parseVehicleFlowTraces(value: unknown) -> VehicleFlowTrace[] | null
- Produces: applyVehicleFlowEffect(trace: VehicleFlowTrace) -> boolean

- [ ] **Step 1: Write failing runtime-validation tests**

~~~typescript
import { describe, expect, it } from "vitest"
import {
  applyVehicleFlowEffect,
  parseVehicleFlowTraces,
} from "./vehicleFlowTypes"
import { vehicle } from "./vehicleStore"

describe("vehicle flow contract", () => {
  it("accepts an ordered executed effect trace", () => {
    const parsed = parseVehicleFlowTraces([{
      traceId: "attempt-1",
      attemptId: "attempt-1",
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
      idsVerdict: "ALERT",
      effectTarget: "leftDoor",
      effectState: "open",
      effectApplied: true,
    }])
    expect(parsed?.[0].route.at(-1)).toBe("leftDoor")
  })

  it("rejects malformed routes and contradictory effects", () => {
    expect(parseVehicleFlowTraces([{ traceId: "bad" }])).toBeNull()
    expect(parseVehicleFlowTraces([{
      traceId: "bad-effect",
      attemptId: null,
      sequence: 1,
      kind: "inject",
      commandLabel: "bad",
      commandIndex: null,
      canId: null,
      data: [],
      route: ["terminal"],
      stoppedAt: "terminal",
      outcome: "REJECTED",
      ecuVerdict: "BLOCKED",
      idsVerdict: "ALERT",
      effectTarget: "leftDoor",
      effectState: "open",
      effectApplied: true,
    }])).toBeNull()
  })

  it("applies only an executed effect trace", () => {
    vehicle.reset()
    const trace = parseVehicleFlowTraces([validExecutedTrace])![0]
    expect(applyVehicleFlowEffect(trace)).toBe(true)
    expect(vehicle.isOpen("doorL")).toBe(true)
  })
})
~~~

Define validExecutedTrace as a module-level fixture with the exact first-test
object so the third test does not duplicate mutable state.

- [ ] **Step 2: Run the validation test and confirm RED**

~~~powershell
npx vitest run src/features/vehicle/vehicleFlowTypes.test.ts
~~~

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Define trace types and parser**

~~~typescript
import { vehicle } from "./vehicleStore"
import type { VehicleTopologyNodeId } from "./vehicleTopology"

export type VehicleFlowNodeId =
  | "terminal"
  | "evidence"
  | "monitor"
  | VehicleTopologyNodeId

export type VehicleFlowOutcome =
  | "LOCAL"
  | "OBSERVED"
  | "EXECUTED"
  | "REJECTED"

export interface VehicleFlowTrace {
  traceId: string
  attemptId: string | null
  sequence: number
  kind: "local" | "observe" | "capture" | "inject"
  commandLabel: string
  commandIndex: number | null
  canId: string | null
  data: string[]
  route: VehicleFlowNodeId[]
  stoppedAt: VehicleFlowNodeId | null
  outcome: VehicleFlowOutcome
  ecuVerdict: string | null
  idsVerdict: "NORMAL" | "ALERT" | null
  effectTarget: "leftDoor" | "tailgate" | null
  effectState: "open" | "closed" | null
  effectApplied: boolean
}

export interface VehicleFlowPlaybackSnapshot {
  playbackId: number
  phase: "idle" | "playing" | "complete" | "cancelled"
  trace: VehicleFlowTrace | null
  traceIndex: number
  traceCount: number
  segmentIndex: number
}
~~~

Implement a strict object guard. Require a non-empty route, positive integer
sequence, known node strings, known enums, and the invariant:

~~~typescript
if (
  trace.effectApplied &&
  (
    trace.outcome !== "EXECUTED" ||
    trace.effectTarget === null ||
    trace.effectState === null ||
    trace.route.at(-1) !== trace.effectTarget
  )
) return null

if (trace.outcome === "REJECTED" && trace.effectApplied) return null
~~~

Implement effect application:

~~~typescript
export function applyVehicleFlowEffect(trace: VehicleFlowTrace): boolean {
  if (
    trace.outcome !== "EXECUTED" ||
    !trace.effectApplied ||
    !trace.effectTarget ||
    !trace.effectState
  ) return false
  const part = trace.effectTarget === "leftDoor" ? "doorL" : "tailgate"
  vehicle.set(part, trace.effectState === "open" ? 1 : 0)
  return true
}
~~~

- [ ] **Step 4: Add immutable shared test fixtures**

~~~typescript
import type {
  VehicleFlowPlaybackSnapshot,
  VehicleFlowTrace,
} from "./vehicleFlowTypes"

export const executedDoorTrace: VehicleFlowTrace = Object.freeze({
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

export const rejectedBodyTrace: VehicleFlowTrace = Object.freeze({
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

export const captureTrace: VehicleFlowTrace = Object.freeze({
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
  Object.freeze({
    playbackId: 1,
    phase: "playing",
    trace: executedDoorTrace,
    traceIndex: 0,
    traceCount: 1,
    segmentIndex: 3,
  })
~~~

Tests that need IDS detect-without-block use:

~~~typescript
export const executedAlertTrace: VehicleFlowTrace = Object.freeze({
  ...executedDoorTrace,
  traceId: "door-attempt-alert",
  attemptId: "door-attempt-alert",
  idsVerdict: "ALERT",
})
~~~

- [ ] **Step 5: Extend attack API result boundary types**

Add this property to DoorLabTerminalResult, DoorLabScriptResult, and
BeginnerCanAttackResult:

~~~typescript
flowTraces?: unknown
~~~

Keeping the field unknown forces every page to call parseVehicleFlowTraces before
playback.

- [ ] **Step 6: Run focused frontend contract tests and typecheck**

~~~powershell
npx vitest run src/features/vehicle/vehicleFlowTypes.test.ts
npm run typecheck
~~~

Expected: PASS.

- [ ] **Step 7: Commit Task 3**

~~~powershell
git add -- src/features/vehicle/vehicleFlowTypes.ts src/features/vehicle/vehicleFlowTypes.test.ts src/features/vehicle/vehicleFlowTestFixtures.ts src/features/attack-lab/doorLabTypes.ts src/features/attack-lab/beginnerCanAttackTypes.ts
git commit -m "feat: validate attack flow contracts"
~~~

---

### Task 4: Shared playback controller

**Files:**
- Create: src/features/vehicle/useVehicleFlowPlayback.ts
- Create: src/features/vehicle/useVehicleFlowPlayback.test.tsx

**Interfaces:**
- Consumes: VehicleFlowTrace and VehicleFlowPlaybackSnapshot
- Produces: useVehicleFlowPlayback(options)
- Produces: play({ runKey, traces }) -> boolean
- Produces: cancel() -> void
- Calls: onEffect(trace), onComplete(runKey), onCancel(runKey)

- [ ] **Step 1: Write failing fake-timer tests**

~~~typescript
// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  executedDoorTrace,
  rejectedBodyTrace,
} from "./vehicleFlowTestFixtures"
import { useVehicleFlowPlayback } from "./useVehicleFlowPlayback"

describe("useVehicleFlowPlayback", () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it("applies an effect only after its final segment", () => {
    const onEffect = vi.fn()
    const onComplete = vi.fn()
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({
        stepMs: 200,
        reducedMotion: false,
        onEffect,
        onComplete,
      }),
    )

    act(() => result.current.play({
      runKey: "session:0:run-1",
      traces: [executedDoorTrace],
    }))
    expect(onEffect).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(999))
    expect(onEffect).not.toHaveBeenCalled()

    act(() => vi.advanceTimersByTime(1))
    expect(onEffect).toHaveBeenCalledOnce()
    expect(onComplete).toHaveBeenCalledWith("session:0:run-1")
  })

  it("stops a rejected trace without applying an effect", () => {
    const onEffect = vi.fn()
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({
        stepMs: 200,
        reducedMotion: false,
        onEffect,
      }),
    )
    act(() => result.current.play({
      runKey: "session:0:reject-1",
      traces: [rejectedBodyTrace],
    }))
    act(() => vi.runAllTimers())
    expect(onEffect).not.toHaveBeenCalled()
    expect(result.current.snapshot.trace?.stoppedAt).toBe("body")
  })

  it("cancels timers and pending effects on reset or unmount", () => {
    const onEffect = vi.fn()
    const { result, unmount } = renderHook(() =>
      useVehicleFlowPlayback({
        stepMs: 200,
        reducedMotion: false,
        onEffect,
      }),
    )
    act(() => result.current.play({
      runKey: "session:0:run-2",
      traces: [executedDoorTrace],
    }))
    act(() => result.current.cancel())
    act(() => vi.runAllTimers())
    expect(onEffect).not.toHaveBeenCalled()

    act(() => result.current.play({
      runKey: "session:0:run-3",
      traces: [executedDoorTrace],
    }))
    unmount()
    act(() => vi.runAllTimers())
    expect(onEffect).not.toHaveBeenCalled()
  })

  it("deduplicates trace ids and preserves source sequence order", () => {
    const onEffect = vi.fn()
    const onComplete = vi.fn()
    const second = {
      ...executedDoorTrace,
      traceId: "door-attempt-2",
      attemptId: "door-attempt-2",
      sequence: 2,
    }
    const { result } = renderHook(() =>
      useVehicleFlowPlayback({
        stepMs: 200,
        reducedMotion: false,
        onEffect,
        onComplete,
      }),
    )
    act(() => result.current.play({
      runKey: "session:0:ordered",
      traces: [second, executedDoorTrace, executedDoorTrace],
    }))
    act(() => vi.runAllTimers())
    expect(onEffect.mock.calls.map(([trace]) => trace.sequence)).toEqual([1, 2])
    expect(onComplete).toHaveBeenCalledOnce()
  })

  it("replaces an old run and completes reduced motion synchronously", () => {
    const onEffect = vi.fn()
    const onCancel = vi.fn()
    const { result, rerender } = renderHook(
      ({ reducedMotion }) =>
        useVehicleFlowPlayback({
          stepMs: 200,
          reducedMotion,
          onEffect,
          onCancel,
        }),
      { initialProps: { reducedMotion: false } },
    )
    act(() => result.current.play({
      runKey: "session:0:old",
      traces: [executedDoorTrace],
    }))
    act(() => result.current.play({
      runKey: "session:0:new",
      traces: [rejectedBodyTrace],
    }))
    expect(onCancel).toHaveBeenCalledWith("session:0:old")
    rerender({ reducedMotion: true })
    act(() => result.current.play({
      runKey: "session:0:reduced",
      traces: [executedDoorTrace],
    }))
    expect(onEffect).toHaveBeenCalledWith(executedDoorTrace)
    expect(vi.getTimerCount()).toBe(0)
  })
})
~~~

- [ ] **Step 2: Run the playback test and confirm RED**

~~~powershell
npx vitest run src/features/vehicle/useVehicleFlowPlayback.test.tsx
~~~

Expected: FAIL because the hook does not exist.

- [ ] **Step 3: Implement the timer-backed controller**

Use a reducer for public snapshots and refs for current run/timer ownership:

~~~typescript
export interface VehicleFlowRun {
  runKey: string
  traces: VehicleFlowTrace[]
}

export interface VehicleFlowPlaybackOptions {
  stepMs?: number
  reducedMotion?: boolean
  onEffect?: (trace: VehicleFlowTrace) => void
  onComplete?: (runKey: string) => void
  onCancel?: (runKey: string) => void
}

export function useVehicleFlowPlayback(
  options: VehicleFlowPlaybackOptions,
) {
  const systemReducedMotion = useSystemReducedMotion()
  const reducedMotion = options.reducedMotion ?? systemReducedMotion
  const [snapshot, setSnapshot] = useState<VehicleFlowPlaybackSnapshot>(IDLE)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const generationRef = useRef(0)
  const runRef = useRef<VehicleFlowRun | null>(null)
  const optionsRef = useRef(options)
  optionsRef.current = { ...options, reducedMotion }

  const advance = useCallback((
    generation: number,
    traceIndex: number,
    segmentIndex: number,
  ) => {
    const run = runRef.current
    if (!run || generationRef.current !== generation) return
    const trace = run.traces[traceIndex]
    setSnapshot({
      playbackId: generation,
      phase: "playing",
      trace,
      traceIndex,
      traceCount: run.traces.length,
      segmentIndex,
    })

    const finalNode = trace.route.length - 1
    if (segmentIndex >= finalNode) {
      if (trace.effectApplied) optionsRef.current.onEffect?.(trace)
      if (traceIndex + 1 < run.traces.length) {
        timerRef.current = setTimeout(
          () => advance(generation, traceIndex + 1, 0),
          optionsRef.current.stepMs ?? 220,
        )
        return
      }
      runRef.current = null
      setSnapshot((current) => ({ ...current, phase: "complete" }))
      optionsRef.current.onComplete?.(run.runKey)
      return
    }

    timerRef.current = setTimeout(
      () => advance(generation, traceIndex, segmentIndex + 1),
      optionsRef.current.stepMs ?? 220,
    )
  }, [])

  const cancel = useCallback(() => {
    generationRef.current += 1
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    const cancelled = runRef.current
    runRef.current = null
    setSnapshot((current) => ({
      ...current,
      phase: current.phase === "playing" ? "cancelled" : current.phase,
    }))
    if (cancelled) optionsRef.current.onCancel?.(cancelled.runKey)
  }, [])

  const play = useCallback((run: VehicleFlowRun) => {
    cancel()
    const traces = dedupeTraces(run.traces).toSorted(
      (left, right) => left.sequence - right.sequence,
    )
    if (traces.length === 0) return false
    runRef.current = { ...run, traces }
    const generation = ++generationRef.current
    if (optionsRef.current.reducedMotion) {
      for (const trace of traces) {
        setSnapshot({
          playbackId: generation,
          phase: "playing",
          trace,
          traceIndex: traces.indexOf(trace),
          traceCount: traces.length,
          segmentIndex: trace.route.length - 1,
        })
        if (trace.effectApplied) optionsRef.current.onEffect?.(trace)
      }
      runRef.current = null
      setSnapshot((current) => ({ ...current, phase: "complete" }))
      optionsRef.current.onComplete?.(run.runKey)
      return true
    }
    advance(generation, 0, 0)
    return true
  }, [advance, cancel])

  useEffect(
    () => () => {
      generationRef.current += 1
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = null
      runRef.current = null
    },
    [],
  )

  return {
    snapshot,
    isPlaying: snapshot.phase === "playing",
    play,
    cancel,
  }
}
~~~

dedupeTraces uses a Set keyed by traceId and returns a new array. The implementation
must not mutate the API response array.

- [ ] **Step 4: Run playback tests and typecheck**

~~~powershell
npx vitest run src/features/vehicle/useVehicleFlowPlayback.test.tsx
npm run typecheck
~~~

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

~~~powershell
git add -- src/features/vehicle/useVehicleFlowPlayback.ts src/features/vehicle/useVehicleFlowPlayback.test.tsx
git commit -m "feat: add deterministic vehicle flow playback"
~~~

---

### Task 5: Accessible command timeline and HUD

**Files:**
- Create: src/features/vehicle/VehicleFlowRail.tsx
- Create: src/features/vehicle/VehicleFlowRail.test.tsx
- Modify: src/features/attack-lab/doorAttackLab.css

**Interfaces:**
- Consumes: route nodes, VehicleFlowPlaybackSnapshot, scenario title, accent
- Produces: VehicleFlowRail component
- Produces: one aria-live announcement per trace start/result, not per animation frame

- [ ] **Step 1: Write failing rail tests**

~~~typescript
// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest"
import { render, screen, within } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import {
  executedAlertTrace,
  rejectedBodyTrace,
} from "./vehicleFlowTestFixtures"
import VehicleFlowRail from "./VehicleFlowRail"

it("shows the active device transition and separate verdicts", () => {
  render(
    <VehicleFlowRail
      scenarioTitle="Door attack route"
      route={["obd", "ids", "gateway", "body", "leftDoor"]}
      playback={{
        playbackId: 1,
        phase: "playing",
        trace: executedAlertTrace,
        traceIndex: 0,
        traceCount: 1,
        segmentIndex: 2,
      }}
      accent="#d94b4b"
    />,
  )
  const rail = screen.getByRole("list", { name: "Door attack route command flow" })
  expect(within(rail).getByText("Lab Terminal")).toBeInTheDocument()
  expect(within(rail).getByText("Toy IDS").closest("li")).toHaveAttribute(
    "data-flow-state",
    "active",
  )
  expect(screen.getByText("ECU · EXECUTED")).toBeInTheDocument()
  expect(screen.getByText("IDS · ALERT · 탐지됨, 차단하지 않음")).toBeInTheDocument()
})

it("marks rejection with text and a stop state", () => {
  render(
    <VehicleFlowRail
      scenarioTitle="Door attack route"
      route={["obd", "ids", "gateway", "body", "leftDoor"]}
      playback={{
        playbackId: 2,
        phase: "complete",
        trace: rejectedBodyTrace,
        traceIndex: 0,
        traceCount: 1,
        segmentIndex: 4,
      }}
      accent="#d94b4b"
    />,
  )
  expect(screen.getByText("Toy Body ECU에서 거부")).toBeInTheDocument()
  expect(screen.getByText("Toy Body ECU").closest("li")).toHaveAttribute(
    "data-flow-state",
    "rejected",
  )
})
~~~

- [ ] **Step 2: Run the rail test and confirm RED**

~~~powershell
npx vitest run src/features/vehicle/VehicleFlowRail.test.tsx
~~~

Expected: FAIL because VehicleFlowRail does not exist.

- [ ] **Step 3: Implement deterministic node-state derivation**

~~~typescript
function nodeState(
  nodeId: VehicleFlowNodeId,
  playback: VehicleFlowPlaybackSnapshot,
): FlowNodeState {
  const index = playback.trace?.route.indexOf(nodeId) ?? -1
  if (index < 0 || playback.phase === "idle") return "idle"
  if (
    playback.trace?.outcome === "REJECTED" &&
    playback.trace.stoppedAt === nodeId &&
    playback.segmentIndex >= index
  ) return "rejected"
  if (
    playback.trace?.effectApplied &&
    playback.trace.effectTarget === nodeId &&
    playback.segmentIndex >= index
  ) return "effect"
  if (index < playback.segmentIndex) return "passed"
  if (index === playback.segmentIndex) return "active"
  return "queued"
}
~~~

Render a terminal node plus scenario route nodes, arrow connectors, the command HUD,
and an aria-live polite result string. The rail must remain meaningful when Canvas
fails.

- [ ] **Step 4: Add rail and HUD CSS**

Add compact layout tokens:

~~~css
.vehicle-flow-rail {
  --flow-accent: var(--vehicle-route-accent);
  display: grid;
  border-bottom: 1px solid var(--dal-line);
  background: #f8fafc;
}

.vehicle-flow-rail__nodes {
  display: grid;
  grid-template-columns: repeat(6, minmax(108px, 1fr));
  overflow-x: auto;
}

.vehicle-flow-rail__node[data-flow-state="active"] {
  border-color: var(--flow-accent);
  background: color-mix(in srgb, var(--flow-accent) 10%, #fff);
}

.vehicle-flow-rail__node[data-flow-state="rejected"] {
  border-color: #d12f2f;
  background: #fff1f1;
}

.vehicle-flow-rail__hud {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  padding: 7px 10px;
  background: #101827;
  color: #e8eef8;
}
~~~

At 820 px and below, keep fixed-width flow nodes in horizontal overflow inside the
rail only; never allow document-level horizontal overflow.

- [ ] **Step 5: Run rail tests and CSS diff check**

~~~powershell
npx vitest run src/features/vehicle/VehicleFlowRail.test.tsx
git diff --check
~~~

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

~~~powershell
git add -- src/features/vehicle/VehicleFlowRail.tsx src/features/vehicle/VehicleFlowRail.test.tsx src/features/attack-lab/doorAttackLab.css
git commit -m "feat: add accessible attack flow timeline"
~~~

---

### Task 6: 3D packet, clickable parts, and compact tooltips

**Files:**
- Modify: src/features/vehicle/VehicleNetworkViewport.tsx
- Modify: src/features/vehicle/VehicleNetworkViewport.test.tsx
- Modify: src/features/attack-lab/doorAttackLab.css

**Interfaces:**
- Consumes: optional playback?: VehicleFlowPlaybackSnapshot
- Produces: onSelectNode shared by HTML pins, 3D hit spheres, and known GLB hinge groups
- Produces: effectTargetFromObject(object: THREE.Object3D) -> VehicleEffectTargetId | undefined
- Renders: VehicleFlowRail, completed/active lines, packet, node halo, selected tooltip

- [ ] **Step 1: Extend Canvas mocks and write failing interaction tests**

Add mock support that captures Line props, mesh click handlers, and useFrame packet
callbacks. Add tests:

~~~typescript
import { playingDoorSnapshotAtGateway } from "./vehicleFlowTestFixtures"

it("selects logical anchors without remounting Canvas", async () => {
  const user = userEvent.setup()
  renderDoorViewport()
  await user.click(screen.getByRole("button", { name: "Toy Body ECU 선택" }))
  expect(
    screen.getByRole("region", {
      name: "Door spoofing route vehicle network",
    }),
  ).toHaveAttribute("data-camera-preset", "target")
  expect(canvasState.mounts).toBe(1)
})

it("renders an active 3D packet edge from playback", () => {
  renderDoorViewport({
    playback: playingDoorSnapshotAtGateway,
  })
  expect(screen.getByTestId("vehicle-flow-packet")).toBeInTheDocument()
  expect(screen.getByTestId("vehicle-flow-node-halo")).toHaveAttribute(
    "data-node-id",
    "gateway",
  )
})

it("maps only truthful GLB hinge groups to effect targets", () => {
  const doorMesh = new THREE.Mesh()
  const doorHinge = new THREE.Group()
  doorHinge.name = "HINGE_doorL"
  doorHinge.add(doorMesh)
  expect(effectTargetFromObject(doorMesh)).toBe("leftDoor")

  const tailgateMesh = new THREE.Mesh()
  const tailgateHinge = new THREE.Group()
  tailgateHinge.name = "HINGE_tailgate"
  tailgateHinge.add(tailgateMesh)
  expect(effectTargetFromObject(tailgateMesh)).toBe("tailgate")
  expect(effectTargetFromObject(new THREE.Mesh())).toBeUndefined()
})

it("shows only the selected compact translucent tooltip while focused", async () => {
  const user = userEvent.setup()
  renderDoorViewport()
  await user.click(screen.getByRole("button", { name: "Toy Body ECU 선택" }))
  const callouts = screen.getAllByTestId("vehicle-topology-callout")
  const target = callouts.find((callout) =>
    callout.textContent?.includes("Toy Body ECU"),
  )
  const effect = callouts.find((callout) =>
    callout.textContent?.includes("GLB Left Door"),
  )
  expect(target).toHaveAttribute("data-visible", "true")
  expect(target).toHaveAttribute("data-translucent", "true")
  expect(effect).not.toHaveAttribute("data-visible")
})
~~~

- [ ] **Step 2: Run focused viewport tests and confirm RED**

~~~powershell
npx vitest run src/features/vehicle/VehicleNetworkViewport.test.tsx
~~~

Expected: FAIL on missing playback, selection buttons, packet, hinge mapping, and
new tooltip attributes.

- [ ] **Step 3: Add one node selection path**

Change TopologyPin to render a keyboard-accessible button:

~~~tsx
<button
  type="button"
  className="vehicle-network-viewport__pin"
  data-active={active}
  aria-label={node.label + " 선택"}
  onClick={() => onSelect(node.id)}
>
  {node.number}
</button>
~~~

Add an invisible 3D hit target at each educational anchor:

~~~tsx
<mesh
  position={node.anchor}
  onClick={(event) => {
    event.stopPropagation()
    onSelect(node.id)
  }}
>
  <sphereGeometry args={[0.12, 12, 12]} />
  <meshBasicMaterial transparent opacity={0} depthWrite={false} />
</mesh>
~~~

The shared handler sets camera focus through cameraFocusForNode. Playback active
node takes visual priority, but manual camera selection remains independent.

- [ ] **Step 4: Add truthful GLB effect selection**

Export a pure ancestor-name mapper:

~~~typescript
export function effectTargetFromObject(
  object: THREE.Object3D,
): VehicleEffectTargetId | undefined {
  for (let current: THREE.Object3D | null = object; current; current = current.parent) {
    if (current.name === "HINGE_doorL") return "leftDoor"
    if (current.name === "HINGE_tailgate") return "tailgate"
  }
  return undefined
}
~~~

Pass onSelectEffect to VehicleModel and attach one primitive onClick. Stop
propagation only when effectTargetFromObject returns a known target.

- [ ] **Step 5: Render active lines, halo, and packet**

Filter terminal/evidence/monitor nodes out of the 3D route. Add FlowPacket:

~~~tsx
function FlowPacket({
  from,
  to,
  durationMs,
  accent,
}: {
  from: VehicleTopologyNode
  to: VehicleTopologyNode
  durationMs: number
  accent: string
}) {
  const ref = useRef<THREE.Mesh>(null)
  const progress = useRef(0)
  useFrame((_, delta) => {
    progress.current = Math.min(
      1,
      progress.current + Math.min(delta, 0.05) / (durationMs / 1000),
    )
    ref.current?.position.lerpVectors(
      new THREE.Vector3(...from.anchor),
      new THREE.Vector3(...to.anchor),
      progress.current,
    )
  })
  return (
    <mesh ref={ref} data-testid="vehicle-flow-packet">
      <sphereGeometry args={[0.055, 14, 14]} />
      <meshStandardMaterial
        color="#f6fbff"
        emissive={accent}
        emissiveIntensity={2.2}
      />
    </mesh>
  )
}
~~~

Render a ring/sphere halo at the active vehicle node and raise completed-edge
opacity. For reduced motion, omit FlowPacket and render static line/node states.
Key each moving packet by playback, trace, and segment so its local progress resets
exactly once per edge:

~~~tsx
<FlowPacket
  key={[
    playback.playbackId,
    playback.traceIndex,
    playback.segmentIndex,
  ].join(":")}
  from={fromNode}
  to={toNode}
  durationMs={220}
  accent={accent}
/>
~~~

- [ ] **Step 6: Integrate VehicleFlowRail and compact tooltip state**

Render VehicleFlowRail before the Canvas. Use playback.active node when playing,
otherwise selected node. Tooltips use:

~~~tsx
data-visible={node.id === visibleTooltipNodeId ? "true" : undefined}
data-translucent={
  node.id === visibleTooltipNodeId && cameraFocus.view !== "overview"
    ? "true"
    : undefined
}
~~~

Update CSS:

~~~css
.vehicle-network-viewport__callout {
  min-width: 94px;
  padding: 3px 5px;
  background: rgba(16, 25, 39, .9);
  opacity: 0;
  transform: scale(.92);
  transition: opacity .16s ease, transform .16s ease, background-color .16s ease;
}

.vehicle-network-viewport__callout[data-visible="true"] {
  opacity: 1;
  transform: scale(1);
}

.vehicle-network-viewport__callout[data-translucent="true"] {
  background: rgba(16, 25, 39, .6);
  box-shadow: none;
}

.vehicle-network-viewport__callout strong { font-size: 10px; }
.vehicle-network-viewport__callout small { font-size: 8px; }
~~~

- [ ] **Step 7: Run viewport, rail, type, and diff checks**

~~~powershell
npx vitest run src/features/vehicle/VehicleNetworkViewport.test.tsx src/features/vehicle/VehicleFlowRail.test.tsx
npm run typecheck
git diff --check
~~~

Expected: PASS. Existing X-ray clone-disposal and Canvas-remount tests remain green.

- [ ] **Step 8: Commit Task 6**

~~~powershell
git add -- src/features/vehicle/VehicleNetworkViewport.tsx src/features/vehicle/VehicleNetworkViewport.test.tsx src/features/attack-lab/doorAttackLab.css
git commit -m "feat: animate and inspect the 3D attack route"
~~~

---

### Task 7: Door page playback and deferred effect integration

**Files:**
- Modify: src/features/attack-lab/DoorAttackVehicle.tsx
- Modify: src/features/attack-lab/DoorAttackVehicle.test.tsx
- Modify: src/features/attack-lab/DoorAttackLabPage.tsx
- Modify: src/features/attack-lab/DoorAttackLabPage.test.tsx

**Interfaces:**
- Consumes: parseVehicleFlowTraces, applyVehicleFlowEffect, useVehicleFlowPlayback
- Produces: DoorAttackVehicle playback prop
- Guarantees: accepted WebSocket events update monitor only
- Guarantees: final Door state is reconciled after normal playback completion

- [ ] **Step 1: Add failing Door page timing tests**

Extend the DoorAttackVehicle mock to capture playback. Use fake timers:

~~~typescript
const executedDoorTrace: VehicleFlowTrace = {
  traceId: "attempt-1",
  attemptId: "attempt-1",
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
}

const acceptedRunResult: DoorLabScriptResult = {
  attempts: [{
    attemptId: "attempt-1",
    timestamp: MONITOR_TIMESTAMP,
    canId: "0x456",
    data: ["00", "01", "13", "B7"],
    verdict: "EXECUTED",
  }],
  idsStatus: "NORMAL",
  state: {
    ...initialSession,
    stage: "증거",
    vehicleState: { leftDoor: "open", rightDoor: "closed" },
    attemptCount: 1,
    completed: true,
  },
  error: null,
  flowTraces: [executedDoorTrace],
}

it("keeps the door closed until an executed trace reaches its effect", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  api.runDoorLabScript.mockResolvedValueOnce(acceptedRunResult)
  render(<DoorAttackLabPage />)
  await screen.findByRole("button", { name: "스크립트 실행" })

  await user.click(screen.getByRole("button", { name: "스크립트 실행" }))
  await waitFor(() => expect(api.runDoorLabScript).toHaveBeenCalledOnce())
  expect(vehicle.isOpen("doorL")).toBe(false)

  act(() => vi.runAllTimers())
  expect(vehicle.isOpen("doorL")).toBe(true)
})

it("does not apply matching live events before playback", async () => {
  render(<DoorAttackLabPage />)
  await screen.findByRole("button", { name: "스크립트 실행" })
  act(() => stream.connections[0].options.onEvent(acceptedDoorEvent))
  expect(vehicle.isOpen("doorL")).toBe(false)
})

it("reset cancels a pending effect and restores the closed state", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  api.runDoorLabScript.mockResolvedValueOnce(acceptedRunResult)
  api.resetDoorLabSession.mockResolvedValueOnce(resetSession)
  render(<DoorAttackLabPage />)
  await screen.findByRole("button", { name: "스크립트 실행" })

  await user.click(screen.getByRole("button", { name: "스크립트 실행" }))
  await waitFor(() => expect(api.runDoorLabScript).toHaveBeenCalledOnce())
  expect(vehicle.isOpen("doorL")).toBe(false)

  await user.click(screen.getByRole("button", { name: "실습 초기화" }))
  await waitFor(() => expect(api.resetDoorLabSession).toHaveBeenCalledOnce())
  act(() => vi.runAllTimers())

  expect(vehicle.isOpen("doorL")).toBe(false)
  const evidence = screen.getByRole("region", { name: "Evidence" })
  expect(within(evidence).getByText("0")).toBeInTheDocument()
})
~~~

- [ ] **Step 2: Run focused Door page tests and confirm RED**

~~~powershell
npx vitest run src/features/attack-lab/DoorAttackLabPage.test.tsx src/features/attack-lab/DoorAttackVehicle.test.tsx -t "trace|playback|pending effect"
~~~

Expected: FAIL because playback is not wired and live events still mutate vehicle.

- [ ] **Step 3: Pass playback through DoorAttackVehicle**

~~~tsx
export interface DoorAttackVehicleProps {
  currentStage?: string
  focusedNodeId?: VehicleTopologyNodeId
  playback?: VehicleFlowPlaybackSnapshot
}

<VehicleNetworkViewport
  route={VEHICLE_ROUTES.door}
  targetId="body"
  effectId="leftDoor"
  currentNodeId={currentStage ? STAGE_NODE[currentStage] : undefined}
  focusedNodeId={focusedNodeId}
  scenarioTitle="Door attack route"
  accent="#d94b4b"
  playback={playback}
/>
~~~

- [ ] **Step 4: Wire playback and block immediate stream mutation**

Create refs for the current pending final state and use the shared controller:

~~~typescript
const pendingFlowRef = useRef<{
  runKey: string
  state: DoorLabVehicleState
} | null>(null)

const flow = useVehicleFlowPlayback({
  onEffect: applyVehicleFlowEffect,
  onComplete: (runKey) => {
    const pending = pendingFlowRef.current
    if (!pending || pending.runKey !== runKey) return
    applyVehicleState(pending.state)
    pendingFlowRef.current = null
  },
})
~~~

Implement useSystemReducedMotion privately in useVehicleFlowPlayback.ts with the
same matchMedia change-listener and cleanup contract already used by the viewport.
The optional reducedMotion value exists only as a deterministic test override.
Configure useCanVehicleStream with:

~~~typescript
vehicleEventPredicate: () => false
~~~

Keep currentAcceptedEventPredicate for monitor filtering inside handleCanEvents.

- [ ] **Step 5: Start traces from authoritative results**

Add a helper in the page:

~~~typescript
const playResult = (
  actionKey: string,
  rawTraces: unknown,
  finalState: DoorLabVehicleState,
) => {
  const traces = parseVehicleFlowTraces(rawTraces)
  if (!traces) {
    applyVehicleState(finalState)
    setActionError("공격 흐름을 표시하지 못해 최종 차량 상태만 동기화했습니다.")
    return
  }
  const runKey = [
    sessionIdRef.current,
    sessionGenerationRef.current,
    actionKey,
  ].join(":")
  pendingFlowRef.current = { runKey, state: finalState }
  if (!flow.play({ runKey, traces })) {
    pendingFlowRef.current = null
    applyVehicleState(finalState)
  }
}
~~~

Call playResult after current-session validation in handleRun and
handleTerminalSubmit. Keep network busy and flow.isPlaying as separate conditions,
but disable reset only during its own network request; reset must remain able to
cancel playback.

- [ ] **Step 6: Cancel safely on reset and lifecycle changes**

Before reset applies its new state:

~~~typescript
flow.cancel()
pendingFlowRef.current = null
applyVehicleState(next.vehicleState)
~~~

Run the same cancellation in the component cleanup before aborting requests.

- [ ] **Step 7: Run Door page, stream, and viewport regression tests**

~~~powershell
npx vitest run src/features/attack-lab/DoorAttackLabPage.test.tsx src/features/attack-lab/DoorAttackVehicle.test.tsx src/features/vehicle/useCanVehicleStream.test.tsx
npm run typecheck
~~~

Expected: PASS.

- [ ] **Step 8: Commit Task 7**

~~~powershell
git add -- src/features/attack-lab/DoorAttackVehicle.tsx src/features/attack-lab/DoorAttackVehicle.test.tsx src/features/attack-lab/DoorAttackLabPage.tsx src/features/attack-lab/DoorAttackLabPage.test.tsx
git commit -m "feat: synchronize door effects with attack playback"
~~~

---

### Task 8: Spoofing and Replay page integration

**Files:**
- Modify: src/features/attack-lab/BeginnerCanAttackLabPage.tsx
- Modify: src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx

**Interfaces:**
- Consumes: shared trace parser, effect function, playback hook, viewport playback prop
- Guarantees: capture and observation commands never mutate the vehicle
- Guarantees: Spoofing affects tailgate and Replay affects leftDoor only at endpoint

- [ ] **Step 1: Add failing Beginner timing and capture tests**

~~~typescript
function executedBeginnerTrace(
  scenario: BeginnerCanAttackScenario,
): VehicleFlowTrace {
  const spoofing = scenario === "spoofing"
  return {
    traceId: scenario + "-attempt-1",
    attemptId: scenario + "-attempt-1",
    sequence: 1,
    kind: "inject",
    commandLabel: spoofing
      ? "cansend vcan0 5A1#01"
      : "canplayer -I capture.log -l 1",
    commandIndex: 1,
    canId: spoofing ? "0x5a1" : "0x5a2",
    data: spoofing ? ["01"] : ["00", "01"],
    route: spoofing
      ? ["terminal", "obd", "ids", "gateway", "rear", "tailgate"]
      : ["terminal", "obd", "ids", "gateway", "body", "leftDoor"],
    stoppedAt: null,
    outcome: "EXECUTED",
    ecuVerdict: "EXECUTED",
    idsVerdict: "NORMAL",
    effectTarget: spoofing ? "tailgate" : "leftDoor",
    effectState: "open",
    effectApplied: true,
  }
}

it.each([
  ["spoofing", "tailgate"],
  ["replay", "doorL"],
] as const)(
  "defers the %s effect until playback reaches the endpoint",
  async (scenario, part) => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const current = session(scenario)
    const completed = {
      ...current,
      stage: "EVIDENCE",
      completed: true,
      vehicleState: {
        ...current.vehicleState,
        [part === "doorL" ? "leftDoor" : "tailgate"]: "open",
      },
    } satisfies BeginnerCanAttackState
    api.runBeginnerCanAttackScript.mockResolvedValueOnce(result(completed, {
      code: "EXECUTED",
      flowTraces: [executedBeginnerTrace(scenario)],
    }))
    render(<BeginnerCanAttackLabPage scenario={scenario} />)
    await screen.findByRole("button", { name: "스크립트 실행" })
    await userEvent.click(screen.getByRole("button", { name: "스크립트 실행" }))
    expect(vehicle.isOpen(part)).toBe(false)
    act(() => vi.runAllTimers())
    expect(vehicle.isOpen(part)).toBe(true)
  },
)

it("plays capture evidence without opening any vehicle part", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  const current = session("replay")
  api.runBeginnerCanAttackTerminal.mockResolvedValueOnce(result({
    ...current,
    stage: "CAPTURE",
  }, {
    code: "CAPTURED",
    captures: [{
      captureId: "capture-1",
      timestamp: 1_700_000_000_000,
      sessionId: current.sessionId,
      generation: current.generation,
      fileName: "capture.log",
      canId: "0x5A2",
      data: ["00", "01"],
      verdict: "CAPTURED",
    }],
    flowTraces: [{
      traceId: "capture-1",
      attemptId: null,
      sequence: 1,
      kind: "capture",
      commandLabel: "candump -L vcan0 > capture.log",
      commandIndex: null,
      canId: "0x5A2",
      data: ["00", "01"],
      route: ["terminal", "obd", "monitor"],
      stoppedAt: null,
      outcome: "OBSERVED",
      ecuVerdict: null,
      idsVerdict: null,
      effectTarget: null,
      effectState: null,
      effectApplied: false,
    }],
  }))
  render(<BeginnerCanAttackLabPage scenario="replay" />)
  const input = await screen.findByLabelText("제한 터미널 명령")
  await user.type(input, "candump -L vcan0 > capture.log")
  await user.click(screen.getByRole("button", { name: "명령 실행" }))
  await waitFor(() =>
    expect(api.runBeginnerCanAttackTerminal).toHaveBeenCalledOnce(),
  )
  act(() => vi.runAllTimers())
  expect(vehicle.isOpen("doorL")).toBe(false)
  expect(vehicle.isOpen("doorR")).toBe(false)
  expect(vehicle.isOpen("tailgate")).toBe(false)
})
~~~

- [ ] **Step 2: Run focused Beginner tests and confirm RED**

~~~powershell
npx vitest run src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx -t "defers|capture evidence"
~~~

Expected: FAIL because acceptResult currently applies vehicleState immediately.

- [ ] **Step 3: Wire the shared controller**

Use a pending final state ref keyed by scenario, session, generation, and action
generation. Pass flow.snapshot to VehicleNetworkViewport:

~~~tsx
<VehicleNetworkViewport
  route={VEHICLE_ROUTES[config.routeId]}
  targetId={config.targetId}
  effectId={config.effectId}
  currentNodeId={currentNodeId}
  scenarioTitle={config.title + " route"}
  accent={config.accent}
  playback={flow.snapshot}
/>
~~~

In acceptResult, update session/evidence/monitor immediately but remove direct
applyVehicleState(result.state.vehicleState). Parse and play traces; reconcile the
final state only on normal completion. Local/malformed empty traces reconcile
immediately.

- [ ] **Step 4: Prevent duplicate live mutation and cancel on lifecycle changes**

Set vehicleEventPredicate to false while retaining
beginnerEventMatchesSession in handleCanEvents. On reset, scenario change, new
session load, and unmount:

~~~typescript
flow.cancel()
pendingFlowRef.current = null
applyVehicleState(authoritativeState)
~~~

The scenario-change cleanup closes all three parts before loading the next session.

- [ ] **Step 5: Run all Beginner tests and typecheck**

~~~powershell
npx vitest run src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx src/features/attack-lab/beginnerCanAttackUtils.test.ts
npm run typecheck
~~~

Expected: PASS.

- [ ] **Step 6: Commit Task 8**

~~~powershell
git add -- src/features/attack-lab/BeginnerCanAttackLabPage.tsx src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx
git commit -m "feat: visualize spoofing and replay device flows"
~~~

---

### Task 9: Rendered QA, regression verification, and handoff

**Files:**
- Modify if browser evidence finds a defect:
  - src/features/attack-lab/doorAttackLab.css
  - src/features/vehicle/VehicleFlowRail.tsx
  - src/features/vehicle/VehicleNetworkViewport.tsx
- Test matching modified files when a defect is fixed.

**Interfaces:**
- Consumes: complete backend trace and frontend playback feature
- Produces: desktop/mobile visual evidence and a clean feature branch

- [ ] **Step 1: Run complete backend verification**

~~~powershell
python -B -m pytest server/tests -q
~~~

Expected: all backend tests PASS.

- [ ] **Step 2: Run complete frontend verification**

~~~powershell
npm test
npm run typecheck
npm run build
git diff --check
~~~

Expected: 0 failed tests, TypeScript exit 0, Vite build exit 0, and no whitespace
errors.

- [ ] **Step 3: Start or reuse the local stack**

Use the existing ports:

~~~powershell
python -B -m uvicorn server.main:app --host 127.0.0.1 --port 8010
npm run dev:ver4
~~~

Expected frontend URL: http://127.0.0.1:8447/

- [ ] **Step 4: Verify Door rejected flow in the in-app Browser**

Target flow:

~~~text
공격 실습 -> 전체 공격 체인
-> terminal: cansend vcan0 456#010110B5
-> Terminal/OBD/IDS/Gateway/Body ECU path
-> red stop at Body ECU
-> Left Door remains closed
~~~

Collect DOM state, vehicle store state, command HUD text, console errors, and one
desktop screenshot.

- [ ] **Step 5: Verify Door accepted script timing**

Paste and execute:

~~~text
interval_ms=100
cansend vcan0 456#000113B7
cansend vcan0 456#000114B0
cansend vcan0 456#000115B1
~~~

Observe all of these in order:

~~~text
Frame 1/3 starts
packet reaches OBD, IDS, Gateway, Body ECU, Left Door
door remains closed before first effect arrival
door opens at effect arrival
Frame 2/3 and Frame 3/3 play in order
ECU EXECUTED and IDS NORMAL remain separate
Proof COMPLETE appears
~~~

- [ ] **Step 6: Verify Spoofing and Replay**

Spoofing:

~~~text
Lab script: cansend vcan0 5A1#01
Expected route: Terminal -> OBD -> IDS -> Gateway -> Rear ECU -> Tailgate
Expected effect: Tailgate opens only at endpoint
~~~

Replay:

~~~text
Terminal: candump -L vcan0 > capture.log
Expected: capture/monitor flow, no vehicle effect
Lab script: canplayer -I capture.log -l 1
Expected route: Terminal -> OBD -> IDS -> Gateway -> Body ECU -> Left Door
Expected effect: Left Door opens only at endpoint
~~~

- [ ] **Step 7: Verify click, label, and responsive behavior**

At 1200x800, 820x900, and 390x844:

- Click Training OBD-II, Toy IDS, Toy Gateway, target ECU, and effect pins.
- Click the Left Door or Tailgate GLB mesh.
- Confirm camera focus and rail selection agree.
- Confirm one compact tooltip is visible.
- Confirm focused tooltip background is translucent while text remains readable.
- Confirm bodyOverflow is 0.
- Repeat target/effect/reset twice and confirm panel heights do not grow.
- Enable reduced motion and confirm static state changes preserve final results.

- [ ] **Step 8: Fix only evidence-backed rendered defects**

For each defect, first add or extend a failing component test, run it RED, make the
smallest TSX/CSS correction, run it GREEN, reload the same Browser tab, and repeat
the exact interaction. Do not perform unrelated restyling.

- [ ] **Step 9: Request independent code review**

Ask a reviewer to check:

- backend trace truth and learner-answer leakage;
- ECU verdict versus IDS verdict semantics;
- effect deferral and cancellation;
- HTTP/WebSocket deduplication;
- Three.js resource lifetime and React rerender behavior;
- keyboard/reduced-motion/mobile behavior.

Resolve every blocking, P1, and P2 finding with a failing test before a fix.

- [ ] **Step 10: Run final exact-tree verification**

~~~powershell
python -B -m pytest server/tests -q
npm test
npm run typecheck
npm run build
git diff --check
git status --short
~~~

Expected: all commands pass. status shows only intentional implementation files
before the final commit, then no output after the commit.

- [ ] **Step 11: Commit and push the final QA corrections**

~~~powershell
git add -- src server
git commit -m "fix: polish attack flow visualization"
git fetch origin feat/can-attack-basics-expansion
git push origin feat/can-attack-basics-expansion
~~~

Before push, verify the remote feature branch is an ancestor of local HEAD. Never
force push and never push main.
