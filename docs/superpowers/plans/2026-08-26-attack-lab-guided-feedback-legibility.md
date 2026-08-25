# Attack Lab Guided Feedback and Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Door, Spoofing, and Replay show tool-faithful terminal transcripts, truthful command-driven vehicle routes, progressively disclosed ECU/IDS explanations, strong 3D focus, readable stage/route layouts, bounded evidence, and a learner self-check separate from Toy attack success.

**Architecture:** Keep backend `flowTraces` as the route and outcome authority. Parse each response once in the page, feed the same typed traces into playback and a new pure attack-feedback classifier, and pass the classifier's renderer-neutral `VehicleFlowPresentation` into the DOM HUD and 3D viewport. The playback snapshot gates when each authoritative fact becomes visible. Keep platform errors, virtual terminal stderr, Toy ECU/IDS analysis, bounded Activity evidence, Toy technical completion, and local learner confirmation as distinct state layers.

**Tech Stack:** React 19, TypeScript 5.7, Vite 8, React Three Fiber 9, Drei 10, Three.js 0.185, Vitest 4, FastAPI, Python 3, pytest 8, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-08-26-attack-lab-guided-feedback-legibility-design.md`

## Global Constraints

- Work only on `feat/can-attack-basics-expansion`; do not merge, commit, or push to `main`.
- Apply the shared feedback and legibility policy to Door full-chain, Spoofing Basics, and Replay Basics.
- Keep `attacks/dos` a static preview; do not add a runnable DoS contract.
- Keep the terminal an allowlisted in-memory interpreter; never execute a host shell, subprocess, Docker socket, or host CAN command.
- Keep `flowTraces` backend-authoritative; frontend code must not infer a security route by parsing localized output text.
- Treat playback as an educational slow-motion trace after an authoritative result, not physical CAN hop telemetry.
- ECU/IDS semantic verdicts must not masquerade as `can-utils` stdout/stderr.
- Describe successful interpreter submission as `가상 CAN 경로 입력`, never as
  observed physical CAN transmission, CAN ACK, or target ECU acceptance.
- Render Toy IDS as an observation point: `NORMAL` means observed with no Toy
  rule alert; `ALERT` means detected with no evidence of blocking.
- Do not reveal an unobserved correct ID, payload, checksum formula, counter, or full solution command in automatic feedback.
- Only Left Door and Tailgate known GLB effect geometry may be presented as physical moving parts; logical ECU positions remain educational anchors.
- Preserve cancellation, stale-response guards, bounded monitor/history state, reduced motion, and final authoritative state reconciliation.
- Progressively disclose IDS, ECU, and effect facts only after playback reaches
  the corresponding authoritative node.
- Keep backend Toy-scenario `completed` separate from a local learner self-check.
- Use TDD for every behavior change and make one focused commit per task.

---

## File Structure

### New files

- `src/features/attack-lab/attackLabFeedback.ts`: pure structured policy for terminal transcript, explanation rows, safe reason text, and vehicle-flow presentation.
- `src/features/attack-lab/attackLabFeedback.test.ts`: policy unit tests covering every output channel and answer-secrecy boundary.
- `src/features/attack-lab/AttackLabTerminalTranscript.tsx`: shared stdout/stderr/silent transcript renderer.
- `src/features/attack-lab/AttackLabTerminalTranscript.test.tsx`: transcript component tests.
- `src/features/attack-lab/AttackLabFeedbackPanel.tsx`: shared `왜 이런 결과가 발생했나요?` panel.
- `src/features/attack-lab/AttackLabFeedbackPanel.test.tsx`: explanation source, route, verdict, and effect tests.
- `src/features/attack-lab/AttackLabActivityLog.tsx`: bounded non-frame action evidence and selection UI.
- `src/features/attack-lab/AttackLabActivityLog.test.tsx`: cap, selection, and local/preflight activity tests.
- `src/features/attack-lab/AttackLabLearningCheck.tsx`: controlled prediction/evidence/reflection self-check that is distinct from Toy completion.
- `src/features/attack-lab/AttackLabLearningCheck.test.tsx`: learning-gate and reset tests.
- `src/features/attack-lab/AttackStageRail.tsx`: shared five-stage/seven-stage accessible rail with segmented connectors.
- `src/features/attack-lab/AttackStageRail.test.tsx`: connector, state, and ordered-list tests.
- `src/features/attack-lab/attackLabStage.ts`: pure backend-curriculum/live-playback stage reconciliation.
- `src/features/attack-lab/attackLabStage.test.ts`: Door/Spoofing/Replay no-skip stage tests.

### Existing backend files

- `server/labs/can_attack_basics.py`: stop Replay preflight errors before creating a frame attempt or IDS observation.
- `server/labs/door_blackbox.py`: keep local script validation out of Toy IDS status.
- `server/routers/can_attack_labs.py`: emit terminal/evidence-local traces for Replay preflight failures.
- `server/routers/labs.py`: keep Door terminal-local errors out of `ecuVerdict`.
- `server/tests/test_can_attack_basics.py`: domain-level preflight assertions.
- `server/tests/test_can_attack_labs_api.py`: API route and event assertions.
- `server/tests/test_labs_api.py`: Door local-verdict separation regression.

### Existing frontend files

- `src/features/vehicle/vehicleFlowTypes.ts`: renderer-neutral feedback/presentation types.
- `src/features/vehicle/vehicleFlowTestFixtures.ts`: complete feedback-ready trace fixtures.
- `src/features/vehicle/VehicleFlowRail.tsx`: consume structured presentation and show frame/transition evidence.
- `src/features/vehicle/VehicleFlowRail.test.tsx`: HUD and state tests.
- `src/features/vehicle/VehicleNetworkViewport.tsx`: dynamic callout, final-result persistence, double halo, and stronger route states.
- `src/features/vehicle/VehicleNetworkViewport.test.tsx`: 3D semantic-state regressions.
- `src/features/vehicle/vehicleTopology.ts`: split truth title/detail copy for two-line cards.
- `src/features/vehicle/vehicleTopology.test.ts`: topology truth-copy assertions.
- `src/features/attack-lab/DoorAttackVehicle.tsx`: pass structured presentation into the shared viewport.
- `src/features/attack-lab/DoorAttackVehicle.test.tsx`: wrapper contract regression.
- `src/features/attack-lab/DoorAttackLabPage.tsx`: typed trace acceptance, common terminal entry, feedback state, and shared stage rail.
- `src/features/attack-lab/DoorAttackLabPage.test.tsx`: Door terminal/feedback/playback integration.
- `src/features/attack-lab/BeginnerCanAttackLabPage.tsx`: shared Spoofing/Replay policy and removal of ECU rejection from application errors.
- `src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx`: scenario integration and Replay preflight regressions.
- `src/features/attack-lab/beginnerCanAttackTypes.ts`: remove page-specific terminal-entry type after migration.
- `src/features/attack-lab/doorAttackLab.css`: stage connectors, cards, callouts, halos, terminal streams, explanation panel, and responsive rules.

### Documentation files

- `docs/superpowers/reviews/2026-08-26-attack-lab-purpose-alignment-review.md`
- `docs/labs/blackbox-can-door-attack.md`
- `docs/labs/can-spoofing-replay-basics.md`
- `docs/instructors/can-attack-lab-validation.md`
- `docs/instructors/can-attack-lab-quick-pass.md`

---

### Task 1: Keep local/preflight results out of vehicle and IDS routes

**Files:**
- Modify: `server/labs/can_attack_basics.py:372-407`
- Modify: `server/labs/door_blackbox.py:260-305`
- Modify: `server/routers/can_attack_labs.py:128-226`
- Modify: `server/routers/labs.py:127-166`
- Test: `server/tests/test_can_attack_basics.py:115-157`
- Test: `server/tests/test_can_attack_labs_api.py:91-188`
- Test: `server/tests/test_labs_api.py:868-1014`

**Interfaces:**
- Consumes: existing `TerminalResult`, `FrameAttempt`, and `make_flow_trace(...)` contracts.
- Produces: `attempts` containing only emitted frames; Replay preflight traces stopped at `terminal` or `evidence`; `ecuVerdict=None` and `idsVerdict=None` when no ECU/IDS processed a frame; whole-script Door IDS verdict on the final attempt only.

- [ ] **Step 1: Write domain tests that distinguish preflight from an emitted attempt**

Extend `test_replay_requires_current_same_session_unmodified_capture_and_exact_repeat_count` with concrete assertions for every preflight result:

```python
preflight_results = [
    before_capture,
    wrong_file,
    wrong_repeat,
    noncanonical_repeat,
    *variant_results,
]
for rejected in preflight_results:
    assert rejected.ok is False
    assert rejected.attempts == ()
    assert rejected.ids_status is None
    assert rejected.state["attemptCount"] == 0
    assert rejected.state["vehicleState"]["leftDoor"] == "closed"
```

Collect `variant_results` while testing `CAPTURE_SESSION_MISMATCH`, `CAPTURE_GENERATION_MISMATCH`, and `CAPTURE_CONTENT_MISMATCH`; restore the valid capture before the final successful replay.

- [ ] **Step 2: Write API tests for terminal-local and evidence-local Replay failures**

Replace the old Body ECU expectation in `test_replay_before_capture_stops_before_vehicle_effect`:

```python
assert result["attempts"] == []
assert result["idsStatus"] is None
assert trace["route"] == ["terminal"]
assert trace["stoppedAt"] == "terminal"
assert trace["outcome"] == "REJECTED"
assert trace["ecuVerdict"] is None
assert trace["idsVerdict"] is None
assert trace["effectApplied"] is False
```

Add a parameterized router-unit/API test for capture-provenance failures by injecting a mismatched capture into the session and asserting:

```python
assert result["attempts"] == []
assert result["idsStatus"] is None
assert result["flowTraces"][0]["route"] == ["terminal", "evidence"]
assert result["flowTraces"][0]["stoppedAt"] == "evidence"
assert result["flowTraces"][0]["ecuVerdict"] is None
```

Update Door and Beginner local-command trace tests so a local rejection keeps `ecuVerdict is None`.

Add Door regressions proving that script grammar/local validation returns
`ids_status is None`, and that a three-attempt script exposes `idsVerdict=None`
for attempts 1 and 2 and the whole-script verdict only on attempt 3.
For emitted events, assert attempts 1 and 2 keep `idsObserved=True` with no
`monitoring.status`, while attempt 3 carries the final `NORMAL` or `ALERT`.

- [ ] **Step 3: Run the focused backend tests and verify RED**

Run:

```powershell
& '.\.venv\Scripts\python.exe' -m pytest `
  server/tests/test_can_attack_basics.py `
  server/tests/test_can_attack_labs_api.py `
  server/tests/test_labs_api.py -q
```

Expected: failures show a Replay `FrameAttempt`, `idsStatus="ALERT"`, route ending at `body`, local Door/Beginner codes stored in `ecuVerdict`, local Door script errors labelled as IDS alerts, and the final Door IDS verdict copied onto every trace.

- [ ] **Step 4: Change Replay domain state only after local preflight succeeds**

Refactor `_replay_attempt` so only `EXECUTED` calls `_record_attempt`:

```python
if verdict != "EXECUTED":
    self._last_verdict = verdict
    self._stage = "EXECUTE" if capture is not None else "CAPTURE"
    return self._terminal_error(
        verdict,
        f"virtual canplayer preflight failed: {verdict}",
    )

attempt = self._record_attempt(self.spec.target_can_id, capture.data, "EXECUTED")
self._left_door = "open"
self._right_door = "closed"
self._completed = True
self._stage = "EVIDENCE"
return self._terminal_ok(
    "EXECUTED",
    _NORMAL_IDS_EXPLANATION,
    attempts=(attempt,),
    ids_status="NORMAL",
)
```

Do not increment `attemptCount` or create IDS status for a file/count/session/generation/content preflight failure. Keep `_last_verdict` so the existing Evidence view can report the failure code.

- [ ] **Step 5: Build truthful Replay preflight traces**

Add explicit code sets and a helper in `can_attack_labs.py`:

```python
_REPLAY_TERMINAL_PREFLIGHT = {
    "CAPTURE_REQUIRED",
    "CAPTURE_FILE_UNKNOWN",
    "REPEAT_COUNT_INVALID",
}
_REPLAY_EVIDENCE_PREFLIGHT = {
    "CAPTURE_SESSION_MISMATCH",
    "CAPTURE_GENERATION_MISMATCH",
    "CAPTURE_CONTENT_MISMATCH",
}

def _replay_preflight_trace(command_label: str, code: str) -> dict[str, object]:
    evidence_stop = code in _REPLAY_EVIDENCE_PREFLIGHT
    route = ["terminal", "evidence"] if evidence_stop else ["terminal"]
    return make_flow_trace(
        trace_id="result:" + code,
        attempt_id=None,
        sequence=1,
        kind="local",
        command_label=command_label,
        command_index=None,
        can_id=None,
        data=(),
        route=route,
        stopped_at=route[-1],
        outcome="REJECTED",
        ecu_verdict=None,
        ids_verdict=None,
        effect_target=None,
        effect_state=None,
        effect_applied=False,
    )
```

Call this helper before the general `if result.attempts` branch. In both `labs.py` and `can_attack_labs.py`, set `ecu_verdict=None` for failures stopped at `terminal` or `evidence`.

For Door scripts, return `ids_status=None` from grammar/local validation errors.
When `labs.py` builds attempt traces, pass `result.ids_status` only to the final
attempt; every earlier trace gets `ids_verdict=None`. This prevents Frame 1/3
from revealing the whole-sequence verdict before the final IDS observation.

Make `_metadata_for(..., ids_status: str | None)` omit `monitoring.status` when
the value is `None` while retaining `idsObserved=True`. In the script emission
loop, pass the whole-script status only for the final attempt and `None` for
earlier accepted frames. Their monitor event is therefore `OBSERVED/PENDING`,
not a fabricated final IDS result.

- [ ] **Step 6: Run focused backend tests and verify GREEN**

Run the Step 3 command.

Expected: all selected tests pass; valid Spoofing, valid Replay, and emitted Door rejection routes remain unchanged.

- [ ] **Step 7: Commit Task 1**

```powershell
git add -- server/labs/can_attack_basics.py server/labs/door_blackbox.py server/routers/can_attack_labs.py server/routers/labs.py server/tests/test_can_attack_basics.py server/tests/test_can_attack_labs_api.py server/tests/test_labs_api.py
git commit -m "fix: keep local results off vehicle routes"
```

---

### Task 2: Add one pure feedback and terminal-presentation policy

**Files:**
- Create: `src/features/attack-lab/attackLabFeedback.ts`
- Create: `src/features/attack-lab/attackLabFeedback.test.ts`
- Modify: `src/features/vehicle/vehicleFlowTypes.ts`
- Modify: `src/features/vehicle/vehicleFlowTestFixtures.ts`

**Interfaces:**
- Consumes: typed `VehicleFlowTrace[]`, `VehicleFlowPlaybackSnapshot`, backend `ok/code/output`, scenario, origin, and a stable page-owned action ID.
- Produces: `AttackLabActionResult`, `AttackLabTerminalTranscript`, `AttackLabFeedbackPresentation`, progressively disclosed `VehicleFlowPresentation`, and bounded `AttackLabActivityEntry` values. Expected-value advanced hints are explicitly not produced.

- [ ] **Step 1: Add renderer-neutral flow presentation types**

Append these exact public types to `vehicleFlowTypes.ts`:

```ts
export type VehicleFlowFeedbackStatus =
  | "PROCESSING"
  | "PASSED"
  | "OBSERVED"
  | "ACCEPTED"
  | "REJECTED"
  | "EFFECT APPLIED"
  | "NO VEHICLE PATH"

export interface VehicleFlowNodeFeedback {
  nodeId: VehicleFlowNodeId
  title: string
  status: VehicleFlowFeedbackStatus
  detail: string
  source: "Terminal" | "Toy ECU" | "Toy IDS" | "교육용 분석"
  persist: boolean
}

export interface VehicleFlowPresentation {
  commandLabel: string
  phase: VehicleFlowPlaybackSnapshot["phase"]
  traceIndex: number
  traceCount: number
  canId: string | null
  dlc: number
  data: readonly string[]
  currentTransition: string | null
  currentNodeId: VehicleFlowNodeId | null
  outcome: VehicleFlowOutcome | null
  stoppedAt: VehicleFlowNodeId | null
  effectTarget: "leftDoor" | "tailgate" | null
  effectApplied: boolean
  ecuVerdict: string | null
  idsVerdict: "NORMAL" | "ALERT" | null
  nodeFeedback: VehicleFlowNodeFeedback | null
}
```

Add one fixture for a terminal-local rejection with `ecuVerdict: null` and retain existing executed/rejected/capture fixtures.

- [ ] **Step 2: Write policy tests before implementation**

Create `attackLabFeedback.test.ts` with explicit cases:

```ts
it("keeps an emitted rejected cansend silent while explaining the ECU verdict", () => {
  const result = actionResult({
    commandLabel: "cansend vcan0 456#010110B5",
    ok: false,
    resultCode: "COUNTER_REJECTED",
    rawOutput: "COUNTER_REJECTED",
    traces: [rejectedDoorTrace()],
  })
  expect(classifyTerminalTranscript(result)).toMatchObject({
    stream: "silent",
    text: "",
  })
  const feedback = classifyAttackLabFeedback({ result, playback: complete(result.traces[0]) })
  expect(feedback.explanation).toContain("rolling counter")
  expect(feedback.explanationRows).toEqual(expect.arrayContaining([
    expect.objectContaining({ label: "가상 CAN 경로 입력", value: "성공" }),
    expect.objectContaining({ label: "ECU 판정", value: "COUNTER_REJECTED" }),
  ]))
})
```

Add independent tests for:

- executed `cansend` and valid `canplayer`: `silent` terminal, accepted/effect explanation;
- `candump`: `stdout` with captured frame text;
- capture redirection: `silent` plus Evidence explanation;
- malformed/disallowed/missing-file/preflight error: `stderr` plus `NO VEHICLE PATH`;
- API/platform error: no transcript entry;
- `Frame 2/3`, CAN ID, DLC, DATA, and `Gateway -> Body ECU` transition;
- current command label for every multi-frame trace;
- IDS `NORMAL` as observed with no Toy rule alert and `ALERT` as detected with no blocking evidence;
- no IDS row before the IDS segment, no ECU row before the target segment, and no effect row before the effect endpoint;
- no private correct ID, payload, checksum formula, expected counter, or complete solution command in automatic output.
- bounded activity append keeps the newest 20 authoritative actions and preserves local/script/Replay-preflight failures without inventing monitor frames;
- bounded terminal append keeps the newest 100 transcript entries.

- [ ] **Step 3: Run the policy test and verify RED**

Run:

```powershell
& '.\node_modules\.bin\vitest.cmd' run src/features/attack-lab/attackLabFeedback.test.ts
```

Expected: module and exported policy functions do not exist.

- [ ] **Step 4: Implement structured action and transcript types**

Create these interfaces in `attackLabFeedback.ts`:

```ts
export type AttackLabScenarioId = "door" | "spoofing" | "replay"
export type AttackLabActionOrigin = "terminal" | "script"
export type AttackLabTerminalStream = "stdout" | "stderr" | "silent"

export interface AttackLabActionResult {
  actionId: string
  scenario: AttackLabScenarioId
  origin: AttackLabActionOrigin
  commandLabel: string
  ok: boolean
  resultCode: string
  rawOutput: string
  traces: readonly VehicleFlowTrace[]
}

export interface AttackLabTerminalTranscript {
  command: string
  stream: AttackLabTerminalStream
  text: string
}

export interface AttackLabExplanationRow {
  key: string
  label: string
  value: string
  source: "Terminal" | "Toy ECU" | "Toy IDS" | "교육용 분석"
}

export interface AttackLabFeedbackPresentation {
  flow: VehicleFlowPresentation
  terminal: AttackLabTerminalTranscript | null
  explanationRows: readonly AttackLabExplanationRow[]
  explanation: string
}

export interface AttackLabActivityEntry {
  id: string
  origin: AttackLabActionOrigin
  commandLabel: string
  resultCode: string
  frameEmitted: boolean
  stoppedAt: VehicleFlowNodeId | null
  effectApplied: boolean
}
```

- [ ] **Step 5: Implement transcript classification from structured traces**

Use trace structure, never localized output parsing:

```ts
export function classifyTerminalTranscript(
  result: AttackLabActionResult,
): AttackLabTerminalTranscript | null {
  if (result.origin !== "terminal") return null
  const emitted = result.traces.some(
    (trace) => trace.kind === "inject" && trace.route.includes("obd"),
  )
  const capturedToFile = result.traces.some((trace) => trace.kind === "capture")
  if (emitted || capturedToFile) {
    return { command: result.commandLabel, stream: "silent", text: "" }
  }
  return {
    command: result.commandLabel,
    stream: result.ok ? "stdout" : "stderr",
    text: result.rawOutput,
  }
}
```

Platform/network failures never create `AttackLabActionResult`; pages keep those in `actionError`.

- [ ] **Step 6: Implement reason, transition, progressive disclosure, and bounded activity classification**

Use a closed bilingual reason map with concise Korean explanations and the
English security term where it improves precision. Do not expose expected
values:

```ts
const SAFE_REASON: Readonly<Record<string, string>> = {
  EXECUTED: "Toy ECU가 제출된 상태 프레임을 수락했습니다.",
  COUNTER_REJECTED: "Rolling counter(순서 카운터)가 예상 진행 순서와 맞지 않습니다.",
  CHECKSUM_INVALID: "Checksum(검사값)이 이 프레임에 대해 유효하지 않습니다.",
  TARGET_ID_MISMATCH: "제출한 message identifier가 Toy 대상 계약과 다릅니다.",
  LENGTH_INVALID: "제출한 DLC가 Toy 대상 계약과 다릅니다.",
  STATE_INVALID: "제출한 상태 바이트가 Toy 허용 범위 밖입니다.",
  STATE_NOT_ALTERED: "제출한 상태가 Toy actuator 상태를 바꾸지 않았습니다.",
  CAPTURE_REQUIRED: "현재 실습 generation에 재생 가능한 캡처가 없습니다.",
  CAPTURE_FILE_UNKNOWN: "요청한 가상 캡처 파일이 없습니다.",
  REPEAT_COUNT_INVALID: "Replay 횟수가 로컬 preflight를 통과하지 못했습니다.",
  CAPTURE_SESSION_MISMATCH: "캡처가 다른 실습 session에 속합니다.",
  CAPTURE_GENERATION_MISMATCH: "캡처가 reset 이전 generation에 속합니다.",
  CAPTURE_CONTENT_MISMATCH: "캡처 내용이 기록된 evidence와 일치하지 않습니다.",
  COMMAND_REJECTED: "제한된 가상 터미널이 이 명령 형식을 거부했습니다.",
  SCRIPT_COMMAND_INVALID: "제한된 script grammar가 이 줄을 거부했습니다.",
}
```

Derive `currentTransition` from `trace.route[segmentIndex]` and the next route
node. Reveal IDS only once the IDS route index is reached, ECU outcome only once
the authoritative target is reached, and effect only once the effect endpoint is
reached. At the final node, create `REJECTED`, `ACCEPTED`, or `EFFECT APPLIED`
feedback. At intermediate topology nodes, create `PROCESSING` or `OBSERVED`
feedback. For terminal/evidence/monitor-only routes, set `nodeFeedback` to the
non-topology node and never imply a 3D ECU. Use the fixed IDS text from Global
Constraints and preserve `commandLabel`.

Add `appendAttackLabActivity(entries, action)` as a pure newest-last cap of 20
and `appendAttackLabTranscript(entries, entry)` as a cap of 100.
It records authoritative structured results, including script and preflight
failures, but never platform/network errors. Do not calculate or expose an
expected counter, solution payload, or advanced expected-value hint.

- [ ] **Step 7: Run policy tests and typecheck**

Run:

```powershell
& '.\node_modules\.bin\vitest.cmd' run src/features/attack-lab/attackLabFeedback.test.ts src/features/vehicle/vehicleFlowTypes.test.ts
& '.\node_modules\.bin\tsc.cmd' --noEmit
```

Expected: all selected tests and typecheck pass.

- [ ] **Step 8: Commit Task 2**

```powershell
git add -- src/features/attack-lab/attackLabFeedback.ts src/features/attack-lab/attackLabFeedback.test.ts src/features/vehicle/vehicleFlowTypes.ts src/features/vehicle/vehicleFlowTestFixtures.ts src/features/vehicle/vehicleFlowTypes.test.ts
git commit -m "feat: classify attack feedback channels"
```

---

### Task 3: Share terminal, explanation, activity, and learning-check UI

**Files:**
- Create: `src/features/attack-lab/AttackLabTerminalTranscript.tsx`
- Create: `src/features/attack-lab/AttackLabTerminalTranscript.test.tsx`
- Create: `src/features/attack-lab/AttackLabFeedbackPanel.tsx`
- Create: `src/features/attack-lab/AttackLabFeedbackPanel.test.tsx`
- Create: `src/features/attack-lab/AttackLabActivityLog.tsx`
- Create: `src/features/attack-lab/AttackLabActivityLog.test.tsx`
- Create: `src/features/attack-lab/AttackLabLearningCheck.tsx`
- Create: `src/features/attack-lab/AttackLabLearningCheck.test.tsx`
- Modify: `src/features/attack-lab/DoorAttackLabPage.tsx`
- Modify: `src/features/attack-lab/DoorAttackLabPage.test.tsx`
- Modify: `src/features/attack-lab/BeginnerCanAttackLabPage.tsx`
- Modify: `src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx`
- Modify: `src/features/attack-lab/beginnerCanAttackTypes.ts`
- Modify: `src/features/attack-lab/doorAttackLab.css`

**Interfaces:**
- Consumes: Task 2 action, transcript, feedback, activity, typed traces, and `flow.snapshot` contracts.
- Produces: one shared transcript, progressive Why panel, selectable bounded Activity evidence, page-owned last action, a local learner self-check, and platform-only `actionError`.

- [ ] **Step 1: Write shared component tests before implementation**

Test terminal rendering with stdout, silent `cansend`, and stderr entries. Assert
that stream styling comes from `stream`, the silent row still echoes the command,
and no ECU verdict appears as command output.

Test the Why panel with a rejected Door presentation:

```tsx
expect(screen.getByRole("heading", { name: "왜 이런 결과가 발생했나요?" })).toBeInTheDocument()
expect(screen.getByText("가상 CAN 경로 입력")).toBeInTheDocument()
expect(screen.getByText("COUNTER_REJECTED")).toBeInTheDocument()
expect(screen.getByText("Toy ECU")).toBeInTheDocument()
expect(screen.getByText("차량 영향").parentElement).toHaveTextContent("없음")
```

Test `AttackLabActivityLog` with local, preflight, and emitted actions. Assert it
renders no fabricated CAN row, exposes selection as `aria-current`, and stays in
a fixed scroll region.

Test `AttackLabLearningCheck` as a controlled self-check. Its confirm button is
disabled until the latest action has a non-empty prediction captured before the
request, matching selected evidence, a successful Toy effect, and at least 20
trimmed explanation characters. It must say `자동 채점 아님` and show separate
`공격 조건 충족` and `학습 확인 완료` states.

- [ ] **Step 2: Run component tests and verify RED**

```powershell
& '.\node_modules\.bin\vitest.cmd' run `
  src/features/attack-lab/AttackLabTerminalTranscript.test.tsx `
  src/features/attack-lab/AttackLabFeedbackPanel.test.tsx `
  src/features/attack-lab/AttackLabActivityLog.test.tsx `
  src/features/attack-lab/AttackLabLearningCheck.test.tsx
```

Expected: all four shared components are missing.

- [ ] **Step 3: Implement the four focused shared components**

`AttackLabTerminalTranscript` and `AttackLabFeedbackPanel` render classified
values without reinterpreting raw output or reason codes. `AttackLabActivityLog`
renders the already-bounded entries with a selectable button per row.

Use this controlled learning-check boundary:

```ts
export interface AttackLabLearningCheckProps {
  predictionDraft: string
  predictionBeforeAction: string
  explanation: string
  technicalComplete: boolean
  evidenceSelected: boolean
  confirmed: boolean
  onPredictionChange: (value: string) => void
  onExplanationChange: (value: string) => void
  onConfirm: () => void
}
```

The component does no semantic grading. It enables confirmation only when
`technicalComplete`, `predictionBeforeAction.trim()`, `evidenceSelected`, and
`explanation.trim().length >= 20` are all true.

- [ ] **Step 4: Parse each API trace array once and integrate Door**

At action start, allocate a stable `actionId` and snapshot the current
`predictionDraft` into the request object before awaiting the API. For every
authoritative result:

1. parse `flowTraces` once;
2. build one `AttackLabActionResult` using that action ID;
3. pass the same trace array to playback and the classifier;
4. append classified terminal output with the cap-100 helper;
5. append one Activity entry with the cap-20 helper;
6. reset the current explanation/confirmation and associate the captured
   prediction with this action;
7. derive presentation from `lastAction + flow.snapshot` with `useMemo`.

Use the existing stale-guard identity as the action ID:
`door:<sessionId>:<sessionGeneration>:<origin>:<actionGeneration>` for Door and
`<scenario>:<sessionId>:<sessionGeneration>:<origin>:<actionGeneration>` for
Spoofing/Replay. Reuse the exact same value as the playback `runKey`; do not add
time- or randomness-based identity.

For a Door script, use `origin: "script"`, do not create terminal transcript
rows, and keep individual `trace.commandLabel` values for the visible script
line. Only structured results update Activity; network/API failures remain
platform alerts.

- [ ] **Step 5: Apply the same pipeline to Spoofing and Replay**

Remove `BeginnerCanAttackTerminalEntry` and the page-specific transcript. Remove:

```ts
if (!result.ok) setActionError(result.output || result.code)
```

Only catch, malformed traces, and network/API failures set `actionError`.
Structured local stderr and ECU rejection go to transcript/feedback/Activity.
Reset, scenario/session replacement, and unmount clear transcript, Activity,
prediction snapshot, reflection, confirmation, and persistent presentation.

- [ ] **Step 6: Bind evidence and render the shared learning area**

An evidence selection matches the latest action when the selected Monitor frame
key contains one of that action's non-null `attemptId` values. For an action with
no emitted frame, its selected Activity row is valid analysis evidence but cannot
satisfy technical completion. `technicalComplete` is true only when the latest
action has an authoritative `effectApplied` trace, not merely because an older
session state remains completed.

Render transcript, Why panel, Activity, and Learning Check in both runnable page
layouts. Keep Activity and terminal fixed-height with internal scrolling. Add
one concise `aria-live="polite"` result summary; never announce animation frames.
Rename `Proof COMPLETE`/`Completed YES` UI to `Toy 기술 결과 달성` and keep the
separate self-check label `학습 확인 완료`.

- [ ] **Step 7: Write Door and Beginner integration regressions**

Door:

- emitted rejection is silent in terminal and appears in Why/Activity;
- Why rows are absent until their playback node is reached;
- valid multi-frame action captures the pre-request prediction and requires a
  matching selected attempt frame before learning confirmation;
- technical completion and learner confirmation are separate;
- terminal stays at 100 entries, Activity at 20, and reset/new session clears both.

Spoofing/Replay:

- local syntax/preflight uses stderr and Activity with no OBD/ECU feedback;
- emitted ECU rejection is silent and is not an application error;
- valid Spoofing and valid Replay use the same shared components;
- capture redirection is silent and Activity/Why identifies Evidence capture;
- scenario/reset clears all transient learning state;
- a previous successful session cannot make a later failed action pass the
  learning check.

- [ ] **Step 8: Run component/page tests and typecheck**

```powershell
& '.\node_modules\.bin\vitest.cmd' run `
  src/features/attack-lab/AttackLabTerminalTranscript.test.tsx `
  src/features/attack-lab/AttackLabFeedbackPanel.test.tsx `
  src/features/attack-lab/AttackLabActivityLog.test.tsx `
  src/features/attack-lab/AttackLabLearningCheck.test.tsx `
  src/features/attack-lab/DoorAttackLabPage.test.tsx `
  src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx
& '.\node_modules\.bin\tsc.cmd' --noEmit
```

Expected: all selected tests and typecheck pass.

- [ ] **Step 9: Commit Task 3**

```powershell
git add -- src/features/attack-lab/AttackLabTerminalTranscript.tsx src/features/attack-lab/AttackLabTerminalTranscript.test.tsx src/features/attack-lab/AttackLabFeedbackPanel.tsx src/features/attack-lab/AttackLabFeedbackPanel.test.tsx src/features/attack-lab/AttackLabActivityLog.tsx src/features/attack-lab/AttackLabActivityLog.test.tsx src/features/attack-lab/AttackLabLearningCheck.tsx src/features/attack-lab/AttackLabLearningCheck.test.tsx src/features/attack-lab/DoorAttackLabPage.tsx src/features/attack-lab/DoorAttackLabPage.test.tsx src/features/attack-lab/BeginnerCanAttackLabPage.tsx src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx src/features/attack-lab/beginnerCanAttackTypes.ts src/features/attack-lab/doorAttackLab.css
git commit -m "feat: separate attack evidence and learning checks"
```

---

### Task 4: Render dynamic ECU callouts, strong 3D focus, and complete HUD evidence

**Files:**
- Modify: `src/features/vehicle/useVehicleFlowPlayback.ts`
- Modify: `src/features/vehicle/useVehicleFlowPlayback.test.tsx`
- Modify: `src/features/vehicle/VehicleNetworkViewport.tsx`
- Modify: `src/features/vehicle/VehicleNetworkViewport.test.tsx`
- Modify: `src/features/vehicle/VehicleFlowRail.tsx`
- Modify: `src/features/vehicle/VehicleFlowRail.test.tsx`
- Modify: `src/features/attack-lab/DoorAttackVehicle.tsx`
- Modify: `src/features/attack-lab/DoorAttackVehicle.test.tsx`
- Modify: `src/features/attack-lab/DoorAttackLabPage.tsx`
- Modify: `src/features/attack-lab/DoorAttackLabPage.test.tsx`
- Modify: `src/features/attack-lab/BeginnerCanAttackLabPage.tsx`
- Modify: `src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx`
- Modify: `src/features/attack-lab/doorAttackLab.css`

**Interfaces:**
- Consumes: progressively disclosed `VehicleFlowPresentation` from Task 2.
- Produces: 600 ms readable nodes, 900 ms between-trace final holds, one dynamic node callout, final-result persistence, observer-specific IDS styling, strong edge/node states, and HUD evidence shared by all three labs.

- [ ] **Step 1: Write HUD tests for structured evidence**

Extend `VehicleFlowRail.test.tsx` to pass a `presentation` and assert:

```tsx
expect(screen.getByText("Frame 2/3")).toBeInTheDocument()
expect(screen.getByText(/cansend vcan0/)).toBeInTheDocument()
expect(screen.getByText(/0x456/)).toBeInTheDocument()
expect(screen.getByText(/DLC 4/)).toBeInTheDocument()
expect(screen.getByText(/Gateway.*Body ECU/)).toBeInTheDocument()
expect(screen.getByText("COUNTER_REJECTED")).toBeInTheDocument()
expect(screen.getByText(/관찰\/탐지됨.*차단 근거 없음/)).toBeInTheDocument()
```

Assert the HUD does not contain an expected counter or full solution command.

- [ ] **Step 2: Write viewport tests for callout and highlight states**

Add tests for:

- exactly one dynamic callout during playback;
- Body ECU `REJECTED` with safe counter reason;
- target ECU `ACCEPTED` before effect and `EFFECT APPLIED` at the endpoint;
- final callout persistence when `phase="complete"`;
- no 3D callout/halo for terminal/evidence/monitor-only nodes;
- previous final callout removal when presentation is absent/new playback starts;
- two halo meshes with inner/outer roles;
- active edge width greater than passed/queued edges;
- reduced motion removes packet but keeps final node/edge/callout semantics.
- IDS uses `OBSERVED`, an amber observer/dashed visual role, and never the red
  ECU rejection treatment;
- dynamic logical ECU callouts retain `교육용 논리 ECU` and `실제 OEM 위치
  아님`, while effect callouts use the GLB effect qualifier;
- active rail/target-map nodes expose `aria-current="step"` and accessible
  names include processing/rejected/effect state.

Add hook tests proving ordinary segment advancement waits 600 ms, the next
trace does not begin until a 900 ms final hold expires, the last trace becomes
complete after its final hold and then persists, and reduced motion completes
synchronously with identical final semantics.

- [ ] **Step 3: Run HUD and viewport tests and verify RED**

Run:

```powershell
& '.\node_modules\.bin\vitest.cmd' run `
  src/features/vehicle/useVehicleFlowPlayback.test.tsx `
  src/features/vehicle/VehicleFlowRail.test.tsx `
  src/features/vehicle/VehicleNetworkViewport.test.tsx `
  src/features/attack-lab/DoorAttackVehicle.test.tsx `
  src/features/attack-lab/DoorAttackLabPage.test.tsx `
  src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx
```

Expected: presentation props, progressive markup, observer style, second halo,
expanded HUD, and the 600/900 ms timing contract are missing.

- [ ] **Step 4: Make `VehicleFlowRail` a presentation consumer**

Add `presentation?: VehicleFlowPresentation` to its props. Keep the accessible node-state list, but replace locally duplicated ECU/IDS wording with the structured values. Render these compact groups when present:

```tsx
<code>{presentation.commandLabel}</code>
<span>Frame {presentation.traceIndex + 1}/{presentation.traceCount}</span>
{presentation.canId ? <code>{presentation.canId}</code> : null}
<span>DLC {presentation.dlc}</span>
{presentation.data.length ? <code>DATA {presentation.data.join(" ")}</code> : null}
{presentation.currentTransition ? <span>{presentation.currentTransition}</span> : null}
{presentation.ecuVerdict ? <span>ECU · {presentation.ecuVerdict}</span> : null}
{presentation.idsVerdict ? <span>{idsDisplay(presentation.idsVerdict)}</span> : null}
```

Render `IDS NORMAL` as `관찰됨 · Toy 규칙 경보 없음` and `IDS ALERT` as
`관찰/탐지됨 · 차단 근거 없음`. These values are absent before the IDS node.

- [ ] **Step 5: Add a dynamic callout contract to `VehicleNetworkViewport`**

Add `presentation?: VehicleFlowPresentation` to `VehicleNetworkViewportProps` and pass it through `TopologyOverlay` to the active `TopologyPin`. Static inspection tooltips remain available outside playback; the dynamic callout takes priority during playback and for a persistent final result.

Render feedback without interpreting reason codes:

```tsx
{feedback ? (
  <span className="vehicle-network-viewport__feedback" data-status={feedback.status}>
    <strong>{feedback.title}</strong>
    <b>{feedback.status}</b>
    <small>{feedback.detail}</small>
    <em>{feedback.source}</em>
  </span>
) : staticCallout}
```

Only render it when `feedback.nodeId` is a topology node. Terminal, Evidence, and Monitor feedback stays in the DOM explanation panel.

Append the node's truth qualifier to dynamic feedback. Logical markers must
continue to say `교육용 논리 ECU · 실제 OEM 위치 아님`; only Left Door and
Tailgate effect nodes may use a physical GLB effect qualifier.

- [ ] **Step 6: Strengthen node and edge focus without remounting Canvas**

Replace the single halo material with inner and outer meshes in one stable group:

```tsx
<group name={`vehicle-flow-node-halo:${node.id}:${state}`}>
  <mesh userData={{ haloLayer: "inner" }} renderOrder={20}>
    <sphereGeometry args={[0.19, 20, 20]} />
    <meshBasicMaterial color={tone} transparent opacity={0.64} depthTest={false} depthWrite={false} />
  </mesh>
  <mesh userData={{ haloLayer: "outer" }} renderOrder={19}>
    <sphereGeometry args={[0.28, 20, 20]} />
    <meshBasicMaterial color={tone} transparent opacity={0.24} depthTest={false} depthWrite={false} />
  </mesh>
</group>
```

Use scenario accent for processing, red for rejected, and green for applied effect. Increase active edge width to 3-4 and lower queued/unrelated opacity. Keep packet animation ref-driven; do not set React state from `useFrame`.

Give the IDS node and its observation segment an amber dashed observer role.
Do not reuse red rejection styling for an IDS alert, and label the rail as an
educational processing/observation sequence rather than a measured inline path.

- [ ] **Step 7: Persist only the authoritative final topology feedback**

When playback is complete, use `presentation.nodeFeedback` if `persist` is true and its node is in the topology. Do not fall back to a stale focused ECU during terminal/evidence traces. Reset/new action already clears presentation in Task 3.

- [ ] **Step 8: Implement the readable timing contract**

Set the default node step to 600 ms and add a separate default final hold of
900 ms before advancing to the next trace or changing the last trace to
`complete`. Effect application still occurs only on endpoint arrival. Cancellation
must clear both timers/continuations. Reduced motion remains synchronous.

- [ ] **Step 9: Pass the same presentation through every lab wrapper**

Add `presentation` to `DoorAttackVehicle`, pass it to `VehicleNetworkViewport`, and supply `presentation.flow` from Door, Spoofing, and Replay pages. Do not reconstruct presentation inside the viewport.

- [ ] **Step 10: Add callout/HUD CSS and run focused tests**

Set callout width to `clamp(160px, 22vw, 220px)`, inset it at least 8 px
inside the Canvas, allow Korean wrapping, and keep title at least 12 px and
status/detail/source at least 10-11 px. Terminate the leader at the callout
boundary. Add processing/observer/rejected/effect states and a visible double
pin glow.

Run the Step 3 command and:

```powershell
& '.\node_modules\.bin\tsc.cmd' --noEmit
```

Expected: all selected tests and typecheck pass.

- [ ] **Step 11: Commit Task 4**

```powershell
git add -- src/features/vehicle/useVehicleFlowPlayback.ts src/features/vehicle/useVehicleFlowPlayback.test.tsx src/features/vehicle/VehicleNetworkViewport.tsx src/features/vehicle/VehicleNetworkViewport.test.tsx src/features/vehicle/VehicleFlowRail.tsx src/features/vehicle/VehicleFlowRail.test.tsx src/features/attack-lab/DoorAttackVehicle.tsx src/features/attack-lab/DoorAttackVehicle.test.tsx src/features/attack-lab/DoorAttackLabPage.tsx src/features/attack-lab/DoorAttackLabPage.test.tsx src/features/attack-lab/BeginnerCanAttackLabPage.tsx src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx src/features/attack-lab/doorAttackLab.css
git commit -m "feat: explain active vehicle flow in 3d"
```

---

### Task 5: Fix stage connectors and target-map typography

**Files:**
- Create: `src/features/attack-lab/AttackStageRail.tsx`
- Create: `src/features/attack-lab/AttackStageRail.test.tsx`
- Create: `src/features/attack-lab/attackLabStage.ts`
- Create: `src/features/attack-lab/attackLabStage.test.ts`
- Modify: `src/features/attack-lab/DoorAttackLabPage.tsx`
- Modify: `src/features/attack-lab/BeginnerCanAttackLabPage.tsx`
- Modify: `src/features/vehicle/vehicleTopology.ts`
- Modify: `src/features/vehicle/vehicleTopology.test.ts`
- Modify: `src/features/vehicle/VehicleNetworkViewport.tsx`
- Modify: `src/features/vehicle/VehicleNetworkViewport.test.tsx`
- Modify: `src/features/attack-lab/doorAttackLab.css`

**Interfaces:**
- Consumes: arrays of stage labels, backend curriculum stage, live playback snapshot, scenario, and existing topology truth kinds.
- Produces: one accessible segmented stage rail, a no-skip visible stage index, and two-line truth-card copy that remain readable at required zoom/viewport sizes.

- [ ] **Step 1: Write shared stage-rail tests**

Create tests for five-stage and seven-stage inputs:

```tsx
render(<AttackStageRail stages={["정찰", "캡처", "분석"]} currentIndex={1} />)
const list = screen.getByRole("list", { name: "공격 단계" })
expect(within(list).getAllByTestId("attack-stage-marker")).toHaveLength(3)
expect(within(list).getAllByTestId("attack-stage-connector")).toHaveLength(2)
expect(screen.getByText("캡처").closest("li")).toHaveAttribute("aria-current", "step")
expect(screen.getByText("정찰").closest("li")).toHaveAttribute("data-state", "complete")
expect(screen.getByText("분석").closest("li")).toHaveAttribute("data-state", "next")
```

Assert each connector is a sibling of marker/label, never a wrapper behind label text.

- [ ] **Step 2: Write topology card-copy tests**

Change expectations so each logical card contains separate `교육용 논리 ECU` and `실제 OEM 위치 아님` lines, and each effect card contains `GLB 동작 기준점` and `실제 actuator 위치 아님`. Preserve truthful target/effect identities for Door, Spoofing, and Replay.

Write `attackLabStage.test.ts` before implementation. Cover these literal cases:

- Door backend `증거` plus an inject playback before IDS displays index 4
  (`프레임 제작`), at/after IDS displays index 5 (`IDS 검증`), and only complete
  playback displays index 6 (`증거`);
- Spoofing backend `EVIDENCE` does not jump to index 4 while the inject trace is
  playing; it displays index 2 before Rear ECU and index 3 (`ECU 수락`) at Rear
  ECU, then index 4 on complete;
- Replay inject displays index 3 (`재전송`) while playing and index 4 only on
  complete;
- Replay local/preflight and capture traces never fabricate `재전송` or `증거`.

- [ ] **Step 3: Run stage/topology tests and verify RED**

Run:

```powershell
& '.\node_modules\.bin\vitest.cmd' run `
  src/features/attack-lab/AttackStageRail.test.tsx `
  src/features/attack-lab/attackLabStage.test.ts `
  src/features/vehicle/vehicleTopology.test.ts `
  src/features/vehicle/VehicleNetworkViewport.test.tsx
```

Expected: shared rail and split truth copy do not exist.

- [ ] **Step 4: Implement the shared stage component**

Use explicit marker, connector, and label elements:

```tsx
export default function AttackStageRail({ stages, currentIndex }: Props) {
  return (
    <ol className="door-attack-lab__stages" aria-label="공격 단계">
      {stages.map((stage, index) => {
        const state = index < currentIndex ? "complete" : index === currentIndex ? "current" : "next"
        return (
          <li key={stage} data-state={state} aria-current={state === "current" ? "step" : undefined}>
            <span data-testid="attack-stage-marker" className="door-attack-lab__stage-marker">{index + 1}</span>
            {index < stages.length - 1 ? <span data-testid="attack-stage-connector" className="door-attack-lab__stage-connector" aria-hidden="true" /> : null}
            <strong className="door-attack-lab__stage-label">{stage}</strong>
          </li>
        )
      })}
    </ol>
  )
}
```

Replace the local Door `StageRail` and Beginner inline list with this component.

Implement `deriveAttackStageIndex(...)` in `attackLabStage.ts`. Backend stage is
the curriculum baseline; only a current authoritative inject/capture playback
may temporarily override it. Never parse command text or localized result output.
Door uses route-node thresholds for `프레임 제작` and `IDS 검증`; Spoofing uses
Rear ECU arrival for `ECU 수락`; Replay uses an inject trace for `재전송`.
Reconcile to backend `증거` only when playback becomes complete.

- [ ] **Step 5: Make connectors run only between numbered circles**

Remove `.door-attack-lab__stages::before`. Use a grid/column layout that places the marker above the label and absolutely positions each item's connector at the marker center. Give completed segments the accent and future segments the neutral line color. Keep minimum stage width and horizontal scrolling rather than shrinking labels.

- [ ] **Step 6: Split topology truth copy into title and detail**

Change the topology base interface:

```ts
interface VehicleTopologyNodeBase {
  id: VehicleTopologyNodeId
  number: number
  label: string
  calloutLabel?: string
  role: string
  anchor: VehicleAnchor
  truthTitle: string
  truthDetail: string
}
```

Use these exact values:

```ts
const LOGICAL_TRUTH = {
  title: "교육용 논리 ECU",
  detail: "실제 OEM 위치 아님",
}
const EFFECT_TRUTH = {
  title: "GLB 동작 기준점",
  detail: "실제 actuator 위치 아님",
}
```

Render both lines inside the truth rectangle; do not concatenate with ` · `.

- [ ] **Step 7: Apply legible card and mobile CSS**

Set target-map columns to approximately `minmax(180px, 1fr)`, retain internal horizontal scrolling, add `:focus-visible`, use `word-break: keep-all`, and allow emergency wrapping only for genuine overflow. Use at least 13 px title, 12 px role, and 10-11 px truth text. Replace the `999px` pill radius with a two-line rounded rectangle. Remove mobile rules that reduce callout text back to 10/8 px.

- [ ] **Step 8: Run stage/topology/page tests and typecheck**

Run:

```powershell
& '.\node_modules\.bin\vitest.cmd' run `
  src/features/attack-lab/AttackStageRail.test.tsx `
  src/features/attack-lab/attackLabStage.test.ts `
  src/features/attack-lab/DoorAttackLabPage.test.tsx `
  src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx `
  src/features/vehicle/vehicleTopology.test.ts `
  src/features/vehicle/VehicleNetworkViewport.test.tsx
& '.\node_modules\.bin\tsc.cmd' --noEmit
```

Expected: all selected tests and typecheck pass.

- [ ] **Step 9: Commit Task 5**

```powershell
git add -- src/features/attack-lab/AttackStageRail.tsx src/features/attack-lab/AttackStageRail.test.tsx src/features/attack-lab/attackLabStage.ts src/features/attack-lab/attackLabStage.test.ts src/features/attack-lab/DoorAttackLabPage.tsx src/features/attack-lab/BeginnerCanAttackLabPage.tsx src/features/vehicle/vehicleTopology.ts src/features/vehicle/vehicleTopology.test.ts src/features/vehicle/VehicleNetworkViewport.tsx src/features/vehicle/VehicleNetworkViewport.test.tsx src/features/attack-lab/doorAttackLab.css
git commit -m "fix: keep attack labels clear of connectors"
```

---

### Task 6: Update guides and perform full regression and browser QA

**Files:**
- Modify: `docs/labs/blackbox-can-door-attack.md`
- Modify: `docs/labs/can-spoofing-replay-basics.md`
- Modify: `docs/instructors/can-attack-lab-validation.md`
- Modify: `docs/instructors/can-attack-lab-quick-pass.md`

**Interfaces:**
- Consumes: completed behavior from Tasks 1-5.
- Produces: learner/instructor guidance that names the correct evidence channel,
  states the attacker's starting privilege, separates Toy success from learning
  completion, and a verified build suitable for team review.

- [ ] **Step 1: Update learner guidance without adding solution commands**

Document the three channels:

```text
Virtual Terminal: the command and its virtual stdout/stderr
Vehicle Flow: the educational slow-motion route and current Toy device
Why panel: the source-labelled Terminal/Toy ECU/Toy IDS explanation
```

State that a silent `cansend` transcript does not prove ECU acceptance and that learners must use the flow, monitor, inspector, and explanation evidence.

Correct Spoofing wording to `정상 기능의 message identifier 재사용`; explicitly
state that the CAN identifier is not an authenticated sender address. State the
lab precondition: the learner already has abstracted injection access at the
Training OBD-II, while initial access, remote exploitation, Gateway compromise,
and real-vehicle access are outside the Toy scenario.

Remove the learner guide's direct link to instructor solution files. Explain
that an open source checkout cannot provide strong assessment secrecy, while the
learner UI/production bundle still excludes instructor completion commands.
Replace `terminal code` with source-specific `Virtual terminal stderr`, `Toy ECU
verdict`, `Toy IDS verdict`, or `교육용 분석`. Add the prediction → execution →
evidence selection → comparison/reflection learning sequence and distinguish
`공격 조건 충족` from `학습 확인 완료`.

- [ ] **Step 2: Update instructor validation evidence locations**

For every exact Door, Spoofing, and Replay completion command already present in instructor docs, list these expected checks:

- terminal command echo and expected stdout/stderr/silent behavior;
- exact 3D route and final callout;
- Network Monitor frame or absence of frame;
- Binary Inspector DATA;
- ECU and IDS source labels;
- effect timing and completion evidence.
- Activity entry for local/preflight results;
- 600 ms node progression, 900 ms between-trace hold, and progressive reveal;
- separate Toy technical and learner self-check states.

Add a negative Replay row: `CAPTURE_REQUIRED` must stop at Terminal and must not highlight OBD-II, Body ECU, or Left Door.

- [ ] **Step 3: Run all backend tests**

Run:

```powershell
& '.\.venv\Scripts\python.exe' -m pytest server/tests -q
```

Expected: all backend tests pass with no new warnings attributable to this work.

- [ ] **Step 4: Run all frontend tests, typecheck, and production build**

Run:

```powershell
& '.\node_modules\.bin\vitest.cmd' run
& '.\node_modules\.bin\tsc.cmd' --noEmit
& '.\node_modules\.bin\vite.cmd' build --mode ver4
git diff --check
```

Expected: full frontend suite, typecheck, production build, and diff check pass.

Extract exact `cansend`/`canplayer` completion commands from the two instructor
guides and verify each full literal is absent from `dist` with `rg -F`. Treat
`rg` exit 1 as clean and any match or other exit code as failure. Record only the
number of patterns checked in learner-facing evidence, not the solution strings.

- [ ] **Step 5: Start the local stack and perform Browser-plugin QA**

Use the Browser plugin first. Verify `http://127.0.0.1:8447/` for:

1. Door counter rejection and valid three-frame sequence.
2. Spoofing rejected and accepted `cansend`.
3. Replay capture, preflight failure, and valid `canplayer`.
4. 1440x900 at 100%, 125%, and 150% zoom.
5. 820 px and 390 px viewport widths.
6. Normal and `prefers-reduced-motion` modes.

For every case confirm:

- stage connectors never intersect text;
- cards do not clip or split Korean words at arbitrary syllables;
- active pin, double halo, and edge are immediately distinguishable;
- one dynamic callout is visible and stays inside Canvas;
- leader line stops at the callout boundary;
- callout rectangle stays at least 8 px inside Canvas, connector rectangles do
  not intersect stage-label rectangles, and leader geometry does not intersect
  callout text bounds;
- terminal output, explanation source, route, monitor, inspector, and effect agree;
- IDS is an amber observer with explicit no-blocking wording, not an inline red rejector;
- IDS/ECU/effect facts do not appear before their route nodes;
- the active multi-frame command label matches the script line currently playing;
- Spoofing visits `ECU 수락` and Replay visits `재전송` before `증거`;
- rejected/preflight operations never move a vehicle part;
- accepted effects occur only at the endpoint;
- repeated run/reset/focus does not grow panel height;
- terminal is capped at 100 rows, Activity at 20 rows, and Network Monitor contains frames only;
- Toy technical completion and learner self-check remain separate;
- no relevant browser console error/warning appears.

- [ ] **Step 6: Record reproducible evidence in the instructor validation guide**

Add the exact commands executed, expected screen regions, observed verdict/effect, test command summaries, and the fact that the route is educational playback rather than live hop telemetry. Do not claim a result that was not observed.

- [ ] **Step 7: Commit Task 6**

```powershell
git add -- docs/labs/blackbox-can-door-attack.md docs/labs/can-spoofing-replay-basics.md docs/instructors/can-attack-lab-validation.md docs/instructors/can-attack-lab-quick-pass.md
git commit -m "docs: validate guided attack feedback"
```

- [ ] **Step 8: Final branch audit**

Run:

```powershell
git status --short
git log --oneline --decorate -8
git diff --check main...HEAD
```

Expected: clean worktree, focused commits on `feat/can-attack-basics-expansion`, no `main` mutation, and no whitespace errors.
