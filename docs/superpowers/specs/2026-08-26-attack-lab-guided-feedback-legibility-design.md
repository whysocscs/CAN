# CAN Attack Lab Guided Feedback and Legibility Design

Date: 2026-08-26
Status: User-approved; purpose-alignment review incorporated
Branch: `feat/can-attack-basics-expansion`

## 1. Relationship to the implemented baseline

This is a delta design over
`2026-08-25-attack-flow-visualization-design.md`. The implemented baseline
already provides backend-authoritative `flowTraces`, ordered frontend playback,
3D route packets and halos, effect-at-endpoint timing, and shared Door,
Spoofing, and Replay vehicle presentation.

This design does not replace that flow model. It makes the model easier to
understand and more truthful by separating terminal output from educational
analysis, adding event-driven ECU feedback, strengthening the active path, and
fixing text and connector layout defects.

## 2. Problem statement

The current attack labs have five learner-facing problems:

1. The virtual terminal prints Toy ECU and Toy IDS semantic verdicts as if they
   were ordinary `can-utils` stdout. For example, `COUNTER_REJECTED` appears
   directly below `cansend`, although a normal CAN sender does not receive an
   application-level Body ECU verdict from `cansend`.
2. The 3D route is command-driven, but the active halo is visually weak and the
   fixed callouts do not explain `PROCESSING`, `ACCEPTED`, `REJECTED`, or the
   reason an effect was applied or blocked.
3. The compact HUD does not yet show enough causal evidence, such as trace
   position, current transition, CAN frame summary, and final stop/effect node.
4. Target-map cards compress long Korean text into narrow pill badges and can
   break words at arbitrary syllables.
5. The stage rail draws one global horizontal connector through the center of
   both the numbered circle and the label text, so the connector visibly
   crosses labels such as `Replay 실패`.

There is also a semantic flow defect in Replay: preflight failures such as a
missing capture file currently create a `FrameAttempt`, which makes the UI show
a path to Body ECU even though no frame was available to inject.

## 3. Goals

- Apply one feedback and legibility model to the runnable Door full-chain,
  Spoofing, and Replay labs.
- Keep the terminal transcript tool-faithful: show virtual stdout/stderr that a
  learner should associate with the command, while keeping ECU/IDS analysis in
  separately labelled educational channels.
- Explain why a command led to no route, a rejected route, or an applied vehicle
  effect without pretending that the explanation came from `cansend`.
- Show each submitted command's backend-authoritative route on the shared 3D
  vehicle and accessible DOM rail.
- Make the current device, transition, verdict, and vehicle effect obvious.
- Fix stage connectors, target-map text wrapping, tooltip size, and route-card
  alignment at common zoom levels and viewport widths.
- Preserve the existing answer-secrecy boundary and instructor-only solutions.
- Distinguish Toy scenario success from learning completion: a vehicle effect can
  prove that the Toy contract was satisfied, but it cannot prove that the learner
  understood the evidence.
- Preserve reset, cancellation, stale-result rejection, reduced motion, Docker
  isolation, and existing Toy ECU/IDS behavior unless this design explicitly
  corrects a presentation or preflight-flow defect.

## 4. Non-goals

- A runnable DoS lab. `attacks/dos` remains a static preview.
- A real Bash/PTTY, subprocess, Docker socket, host filesystem, or unrestricted
  shell.
- Real SocketCAN or physical vehicle access in the default lab.
- Physical hop telemetry or measured CAN propagation time. The UI remains an
  **educational slow-motion trace** played after an authoritative backend
  result.
- Claims that the logical OBD-II, IDS, Gateway, Body ECU, or Rear ECU anchors are
  actual OEM component positions.
- Exact byte-for-byte emulation of an unspecified `can-utils` release. Any error
  transcript presented as tool output must either be verified against a pinned
  tool version or explicitly labelled as a virtual-lab message.

## 5. Scope by lab

| Lab | Target route | Effect target | Included |
| --- | --- | --- | --- |
| Door full-chain | Terminal -> OBD-II -> IDS -> Gateway -> Body ECU | Left Door | Yes |
| Spoofing Basics | Terminal -> OBD-II -> IDS -> Gateway -> Rear ECU | Tailgate | Yes |
| Replay Basics | Terminal -> OBD-II -> IDS -> Gateway -> Body ECU | Left Door | Yes |
| DoS | Static preview only | None | No runnable changes |

Door and Replay intentionally share the Body ECU and Left Door topology but
teach different security properties. Door teaches inferred counter/checksum
validation and IDS sequence behavior. Replay teaches capture provenance and the
absence of freshness protection. Spoofing teaches the absence of sender
authentication for a newly crafted state frame.

## 6. Three-channel presentation model

The learner must be able to distinguish three sources of information.

### 6.1 Terminal transcript: what the tool showed

The terminal renders the command echo and its virtual stdout/stderr.

- `pwd`, `whoami`, `ls`, `cat`, and `candump` show their expected virtual
  stdout.
- A syntactically valid `cansend` that injects a frame is silent on successful
  submission and returns to the prompt. ECU acceptance is not terminal stdout.
- A valid `canplayer` invocation is silent after successful local preflight and
  submission. Replay acceptance is not terminal stdout.
- A malformed command, disallowed command, unavailable interface, or missing
  virtual file may show tool-style stderr because the failure occurred before
  vehicle injection.
- Network/API failures are labelled as platform errors, not shell output.
- The terminal remains labelled `Virtual terminal` and states that it is an
  allowlisted in-memory interpreter, not a host shell.

Example, frame submitted but rejected by the Toy ECU:

```text
$ cansend vcan0 456#010110B5
$
```

Example, command rejected locally:

```text
$ cansend vcan0 456#XYZ
cansend: invalid CAN frame
$
```

The exact error wording must follow the pinned transcript contract selected
during implementation. It must not fabricate an ECU verdict as command stderr.

### 6.2 Event feedback: where the operation is now

The accessible flow rail and 3D vehicle show the current backend-authoritative
trace node and transition. A single event-driven callout follows the active
node and uses one of these presentation states:

- `PROCESSING`
- `PASSED`
- `OBSERVED`
- `ACCEPTED`
- `REJECTED`
- `EFFECT APPLIED`
- `NO VEHICLE PATH`

### 6.3 Explanation panel: why it happened

A persistent `왜 이런 결과가 발생했나요?` panel explains the result without
claiming that the text came from the terminal. It contains:

- terminal outcome;
- whether a frame was emitted;
- current or final route;
- stop/effect node;
- Toy ECU verdict;
- Toy IDS observation;
- vehicle effect applied or blocked;
- one concise causal explanation;
- an explicit source label such as `Terminal`, `Toy ECU`, `Toy IDS`, or
  `교육용 분석`.

Example for a rejected Door frame:

```text
터미널 오류        없음
가상 CAN 경로 입력 성공
중단 지점         Toy Body ECU
ECU 판정          COUNTER_REJECTED
차량 영향         없음

프레임은 버스로 전송되었지만 Toy Body ECU가 rolling counter 순서를
거부했으므로 Left Door 상태는 변경되지 않았습니다.
```

## 7. Command-to-flow contract

The UI must not guess a route from arbitrary command text. The backend's
validated `flowTraces` remain the route and outcome authority.

| Operation | Required visible route | Effect |
| --- | --- | --- |
| `pwd`, `whoami`, `ls` | Terminal only | None |
| Valid `cat <known-file>` | Terminal -> Evidence | None |
| `candump` observation | Terminal -> OBD-II -> Monitor | None |
| Replay capture redirection | Terminal -> OBD-II -> Monitor/Evidence | None |
| Valid Door `cansend` | Terminal -> OBD-II -> IDS -> Gateway -> Body ECU | Left Door only if accepted |
| Valid Spoofing `cansend` | Terminal -> OBD-II -> IDS -> Gateway -> Rear ECU | Tailgate only if accepted |
| Valid Replay `canplayer` | Terminal -> OBD-II -> IDS -> Gateway -> Body ECU | Left Door only if accepted |
| Script syntax/local validation error | Terminal, stopped locally | None |
| Emitted frame rejected by Toy ECU | Stop at authoritative target ECU | None |
| API/network failure | No trace playback | None |

A Door script with multiple `cansend` lines plays one trace per attempt in
source order. The HUD displays `Frame n/N`. `interval_ms` and comments configure
the script and do not create vehicle packets.

Only the final Door attempt carries the whole-script Toy IDS verdict. Earlier
attempt traces use `idsVerdict=null`, so Frame 1/3 cannot reveal a final
`NORMAL` or `ALERT` result before the sequence has been observed. Script grammar
and other local validation failures also use `idsStatus=null`; they did not
reach the Toy IDS.

## 8. Replay preflight correction

Replay must distinguish local/capture preflight from a frame that actually
entered the vehicle path.

| Verdict | Stop location | OBD/vehicle route |
| --- | --- | --- |
| `CAPTURE_REQUIRED` | Terminal | None |
| `CAPTURE_FILE_UNKNOWN` | Terminal | None |
| `REPEAT_COUNT_INVALID` | Terminal preflight | None |
| `CAPTURE_SESSION_MISMATCH` | Evidence/capture preflight | None |
| `CAPTURE_GENERATION_MISMATCH` | Evidence/capture preflight | None |
| `CAPTURE_CONTENT_MISMATCH` | Evidence/capture preflight | None |
| `EXECUTED` | Body ECU, then Left Door | Full Replay injection route |

These preflight failures may still be recorded as learner evidence, but they
must not be presented as a CAN frame reaching Body ECU. Existing tests that
lock `CAPTURE_REQUIRED` to a Body ECU stop must be corrected.

## 9. 3D flow and active-device feedback

The existing shared GLB and `VehicleFlowTrace` playback remain in use.

Playback sequence:

1. Echo the command in the terminal.
2. Activate the Training OBD-II marker when a frame enters the virtual bus.
3. Show Toy IDS observation separately from blocking semantics.
4. Highlight Toy Gateway routing.
5. Show the target ECU as `ACCEPTED` or `REJECTED`.
6. Reach and animate Left Door or Tailgate only for an accepted effect trace.
7. Reconcile Network Monitor, Binary Inspector, explanation, and completion
   evidence with the authoritative result.

Visual requirements:

- The active marker uses a clearly visible double ring/halo and increased scale.
- The active edge has full contrast and greater visual weight than idle edges.
- Passed edges remain visible at medium contrast.
- Queued and unrelated routes are dimmed.
- Rejection uses red plus text/icon, not color alone.
- Applied effect uses green plus text/icon, not color alone.
- The active callout title is at least 12 px; status/detail text is at least
  10-11 px at 100% browser zoom.
- A leader ends at the callout boundary and never passes behind callout text.
- Only one dynamic feedback callout is shown at a time.
- The final result callout persists after playback until the next command,
  reset, scenario change, or new session.
- Feedback is progressively disclosed from the playback snapshot. A target ECU
  verdict is not shown before the target ECU node is reached, an IDS verdict is
  not shown before the IDS node is reached, and a vehicle effect is not shown
  before the effect endpoint is reached.
- The current multi-frame command label remains visible so the learner can tie
  each animation to the exact script line being processed.
- Normal playback keeps each node readable for 600 ms and keeps a completed
  trace visible for 900 ms before moving to the next trace. Reduced-motion mode
  skips travel while preserving the same final semantic evidence.
- `prefers-reduced-motion` replaces packet travel and pulsing with strong static
  node/edge states and the same final explanation.
- Logical ECU anchors use markers and halos. Only known GLB effect geometry for
  Left Door and Tailgate may be presented as a physical moving part.

Example target callout:

```text
Toy Body ECU
REJECTED
Rolling counter mismatch
Vehicle effect blocked
```

## 10. Flow HUD and detailed analysis

The command HUD must show, when available:

- command label;
- `Frame n/N`;
- CAN ID, DLC, and submitted DATA;
- current transition, such as `Gateway -> Body ECU`;
- outcome and stop/effect node;
- ECU verdict;
- IDS verdict with `detected, not blocked` wording when applicable.

The UI must not describe an in-memory Toy injection as observed physical CAN
transmission or CAN ACK. `가상 CAN 경로 입력 성공` means only that the
allowlisted teaching interpreter accepted the frame into the Toy flow. It does
not mean that a physical bus acknowledged the frame or that a target ECU
accepted its application semantics.

Toy IDS uses the following fixed learner-facing meanings:

- `NORMAL`: `관찰됨 · Toy 규칙 경보 없음`
- `ALERT`: `관찰/탐지됨 · 차단 근거 없음`

The Toy IDS marker is an educational observation point. It must not be drawn or
described as an inline blocker unless a future backend contract explicitly
reports a blocking action.

The Binary Inspector highlights the learner-submitted bytes relevant to the
verdict. The default feedback may reveal the reason category and received
values, but must not automatically reveal an unobserved correct ID, payload,
checksum formula, or solution command.

This implementation does not add an expected-value advanced hint. Existing
general hints may remain, but the frontend must not derive or bundle an expected
counter, checksum formula, private ID, payload, or complete solution command.
An expected-versus-received advanced hint is deferred until a future backend
contract can enforce relevant evidence, at least one failed attempt, and an
explicit learner request.

## 11. Shared feedback boundaries

The implementation should centralize presentation policy instead of duplicating
it in the Door page and Beginner page.

Expected shared responsibilities:

- A pure feedback classifier maps command results and `VehicleFlowTrace` values
  into terminal presentation, feedback status, progressively disclosed
  explanation rows, and bounded Activity evidence.
- A shared feedback panel renders the causal explanation and evidence source.
- `VehicleNetworkViewport` renders dynamic node callouts and stronger 3D states
  from a read-only playback snapshot and the classified feedback.
- A shared stage-rail component renders the five-step and seven-step variants
  with the same connector geometry and accessibility contract.
- Door and Beginner pages keep request ownership, session guards, evidence
  selection, and final authoritative state reconciliation.
- A bounded activity record keeps the last 20 authoritative actions, including
  script and Replay preflight results that correctly do not belong in Network
  Monitor. It is cleared on reset, scenario/session replacement, and unmount.
- A shared learning-check card separates `공격 조건 충족` from `학습 확인 완료`.
  The latter is a local self-check, not an AI or semantic grade: it requires a
  prediction saved before the relevant action, selected evidence from that
  action, and a learner-written comparison/explanation.

The classifier must not infer security truth solely from localized output text.
It uses structured result codes, attempts, and parsed authoritative traces.

## 12. Stage-rail connector correction

The global `.door-attack-lab__stages::before` connector is removed.

Required structure and behavior:

- Each stage item places its numbered circle on the first row and its label
  below the circle.
- Each `li:not(:last-child)` owns only the connector segment from its circle
  toward the next circle.
- A connector never intersects the label bounding box.
- Completed connector segments use the scenario accent; future segments use the
  neutral border color.
- `aria-current="step"`, ordered-list semantics, and keyboard/assistive output
  remain unchanged.
- Small viewports use horizontal scrolling rather than shrinking text below the
  specified minimum.
- The five-step Spoofing/Replay rail and seven-step Door rail use the same shared
  behavior.
- Backend `stage` remains authoritative curriculum state, while live playback
  temporarily drives the visible action stage. Spoofing must visibly enter
  `ECU 수락`, Replay must visibly enter `재전송`, and `증거` must not appear as
  current until the authoritative playback completes.

## 13. Target-map card and tooltip legibility

- Target-map cards use a minimum width of approximately 176-184 px. If the
  available width is smaller, the target map scrolls internally.
- Titles are at least 13 px, role text at least 12 px, and truth qualifier text
  at least 10-11 px at 100% zoom.
- Korean labels use `word-break: keep-all` plus safe overflow wrapping.
- Long truth qualifiers use a two-line rounded rectangle, not a single-line pill
  forced into three or four narrow lines.
- Suggested copy:

  ```text
  교육용 논리 ECU
  실제 OEM 위치 아님
  ```

- Card title, role, and truth-qualifier rows align consistently across the route.
- The scroll container has a visible keyboard focus state.
- Static and dynamic callouts remain inside the Canvas bounds and do not cover
  the active vehicle part unnecessarily.

## 14. Error handling and state lifetime

- A local command error creates terminal feedback and no vehicle playback.
- A frame-level rejection reaches only the authoritative stop node and never
  applies an effect.
- An API/network error produces an application alert and no fabricated terminal
  or ECU result.
- Malformed `flowTraces` are ignored, the final authoritative vehicle state is
  reconciled, and the UI reports that route visualization was unavailable.
- Reset, scenario change, generation change, unmount, and new session cancel
  playback and clear persistent feedback.
- A stale or duplicate result cannot update the terminal transcript, explanation
  panel, final callout, or vehicle effect.
- Repeated run/reset cycles must not increase panel height or accumulate
  unbounded feedback elements.
- Network Monitor contains only observed/emitted CAN frames. Local and preflight
  actions belong to the bounded Activity record, never fabricated monitor rows.

## 15. Accessibility and responsive requirements

- Every feedback state has text in addition to color.
- Current stage and current flow node remain programmatically exposed.
- Dynamic route changes are announced through one throttled
  `aria-live="polite"` region; intermediate animation frames are not announced.
- Terminal transcript, explanation panel, and target-map scroll areas are
  keyboard reachable where interaction or scrolling is required.
- Browser QA covers 1440x900 at 100%, 125%, and 150% zoom, plus 820 px and
  390 px wide viewports.
- At all required sizes, stage connectors do not cross text, route-card content
  is not clipped, and feedback callouts stay within the visible Canvas.

## 16. Testing strategy

### 16.1 Backend

- Door accepted and rejected frames retain correct route, stop, effect, ECU, and
  IDS values.
- Spoofing accepted and emitted-but-rejected frames retain Rear ECU semantics.
- Replay preflight failures produce no OBD/vehicle route.
- Valid Replay still traverses Body ECU and applies Left Door only at the effect
  endpoint.
- Multi-frame Door scripts preserve source order.

### 16.2 Shared frontend policy

- A submitted frame with an ECU rejection does not print the ECU verdict as
  tool stdout.
- The same verdict appears in the dynamic callout, HUD, monitor/evidence, and
  explanation panel.
- Local syntax/file errors remain visible in terminal stderr and produce no 3D
  vehicle path.
- Tool output, platform error, ECU verdict, and IDS verdict are never conflated.
- Safe feedback does not expose private expected values or full solution
  commands before the configured hint gate.

### 16.3 Components

- Door, Spoofing, and Replay all use the same feedback policy.
- The shared policy reveals IDS, ECU, and effect rows only when playback has
  reached their authoritative nodes.
- Active, passed, rejected, effect, and idle 3D states render correctly.
- The final feedback callout persists and clears on every required lifecycle
  transition.
- Stage connector markup is segmented and separate from labels.
- Target-map copy uses the larger typography and non-pill qualifier layout.
- Reduced-motion behavior produces the same final semantic state.

### 16.4 Browser QA

- Door counter rejection: terminal transcript is tool-faithful, Body ECU explains
  the rejection, and Left Door does not move.
- Door valid sequence: each frame shows its route before the Left Door effect and
  final IDS result.
- Spoofing: Rear ECU and Tailgate are the only target/effect pair.
- Replay capture: observation reaches Monitor/Evidence and has no vehicle effect.
- Replay without capture: no OBD or Body ECU route appears.
- Replay with a valid capture: Body ECU and Left Door path appears.
- At required zoom and viewport sizes, no stage line crosses text and no route
  card or callout clips.
- Repeated run, reset, focus, and scenario navigation do not grow panel height or
  produce relevant console errors.

## 17. Documentation updates

- Mark the 2026-08-25 flow visualization design as the implemented baseline and
  link this delta design.
- Update `docs/labs/blackbox-can-door-attack.md` so learners distinguish terminal
  output from Toy ECU/IDS analysis.
- Update `docs/labs/can-spoofing-replay-basics.md` with the same three-channel
  model.
- Update `docs/instructors/can-attack-lab-validation.md` and
  `docs/instructors/can-attack-lab-quick-pass.md` with exact terminal, feedback,
  route, monitor, IDS, and effect evidence locations.
- Keep exact completion commands in instructor documentation only.
- Remove direct instructor-solution links from learner guides. Document that an
  open repository cannot provide strong assessment secrecy, while ensuring the
  production frontend bundle does not contain instructor completion commands.

## 18. Completion criteria

The work is complete when all of the following are observable:

1. Door, Spoofing, and Replay share one terminal/feedback/explanation policy.
2. The terminal transcript shows tool-like stdout/stderr and does not impersonate
   an ECU or IDS diagnostic channel.
3. A learner can identify whether a frame was emitted, where it stopped, why it
   was accepted or rejected, and whether a vehicle effect occurred.
4. Every learner command produces only its truthful backend-authoritative route.
5. Replay preflight failures never appear to enter the vehicle network.
6. Active 3D devices and edges are visually unmistakable, including reduced
   motion mode.
7. Stage connectors never intersect label text.
8. Route cards and callouts remain readable at the required zoom and viewport
   sizes.
9. No private solution is exposed before the configured evidence/hint gate.
10. Relevant backend tests, frontend tests, typecheck, production build, diff
    check, and browser QA all pass.
11. `공격 조건 충족` and `학습 확인 완료` are separately visible; backend
    `completed` is never presented as proof of learner understanding.
12. Activity history is bounded, Network Monitor contains frames only, and
    Spoofing/Replay do not skip their live attack stage.

## 19. Known limitations

- The terminal is a deterministic virtual teaching interface, not a real shell.
- The route is a presentation of an authoritative lab result, not live ECU hop
  telemetry.
- Logical ECU anchors are not physical OEM placement claims.
- Tool transcript fidelity depends on the pinned reference selected during
  implementation; unverified text must remain labelled as virtual-lab output.
- A future runnable DoS lab requires a bus-load/frequency flow model and is not
  covered by this single-operation effect design.
- Natural-language explanations are not automatically graded or persisted in
  SQLite in this delta.

## 20. Purpose-alignment review decisions

The backend/security, learning-feedback, and visual/accessibility reviewers
agreed on the following binding corrections before implementation:

1. Say `message identifier 재사용`, not `송신자 ID/identity 사칭`. A CAN
   identifier identifies message meaning and participates in arbitration; it is
   not an authenticated sender address.
2. Say `가상 CAN 경로 입력`, not observed physical transmission or ACK.
3. Separate terminal acceptance, Toy IDS observation, Toy ECU application
   verdict, vehicle effect, Toy scenario completion, and learner completion.
4. Reveal authoritative facts in playback order and keep the exact active
   command visible for multi-frame scripts.
5. Preserve logical-location qualifiers in dynamic callouts; only known GLB
   Left Door and Tailgate geometry may be presented as physical effects.
6. Keep feedback and terminal histories bounded and keep local/preflight events
   out of Network Monitor.
7. Fix the live curriculum stage as well as connector geometry, so the rail is
   both visually and semantically correct.
8. Keep advanced expected-value hints, natural-language auto-grading, runnable
   DoS, physical CAN, and production-vehicle claims outside this delta.
