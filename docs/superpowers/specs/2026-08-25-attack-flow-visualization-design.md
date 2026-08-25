# Attack Flow Visualization Design

Date: 2026-08-25
Status: Approved direction, pending user review
Branch: `feat/can-attack-basics-expansion`

## 1. Problem

The current attack vehicle view is a static topology overlay. It can identify the
Training OBD-II, Toy IDS, Toy Gateway, target ECU, and effect target, but it does
not show causality after a learner submits a terminal command or Lab script.

The vehicle store also applies an accepted live CAN event immediately. As a
result, a door or tailgate can move before the learner sees how the frame reached
the target. Adding a decorative animation after that mutation would explain the
path too late and would not meet the learning goal.

The new experience must show which operation starts a flow, which devices it
passes, where a rejected operation stops, and when the vehicle effect is applied.

## 2. Goals

- Show a command-driven, ordered flow from the lab workstation through the
  training vehicle topology.
- Combine a readable DOM timeline with a packet moving over the 3D vehicle.
- Apply the GLB door or tailgate effect only when an accepted flow reaches its
  effect node.
- Stop rejected frame flows at the server-authoritative validation point without
  changing the vehicle.
- Keep ECU verdict and IDS observation separate. An IDS alert is not presented as
  a block unless the backend explicitly reports a block.
- Support Door full-chain, Spoofing, and Replay through one shared model.
- Let learners click logical anchors and known GLB effect parts to inspect them.
- Keep labels compact and make the selected label's background translucent while
  the camera is focused.
- Preserve reset, stale-session filtering, reduced-motion behavior, mobile
  readability, and the existing monitor/evidence functions.

## 3. Non-goals

- This does not reproduce physical CAN propagation timing.
- This does not claim the educational anchors are real OEM ECU locations.
- This does not add a runnable DoS lab. The current DoS route remains a static
  preview until it has a backend domain and completion contract.
- This does not infer arbitrary ECU or IDS geometry from the GLB. The GLB has no
  reliable OBD, IDS, Gateway, Body ECU, or Rear ECU meshes.
- This does not simulate backend hop-by-hop telemetry that the server does not
  produce.

## 4. Truth and Terminology

The animation is labelled **교육용 slow-motion trace**. Its path and outcome are
driven by an authoritative backend result, while its per-hop delay is a frontend
presentation delay.

The UI distinguishes these outcomes:

- `LOCAL`: the virtual terminal or evidence store was used; no vehicle path.
- `OBSERVED`: a virtual CAN frame or capture was observed; no vehicle mutation.
- `EXECUTED`: the Toy ECU accepted the frame and an effect may be applied.
- `REJECTED`: the Toy ECU rejected the frame at the reported stop node.
- `IDS NORMAL`: the Toy IDS did not flag the completed sequence.
- `IDS ALERT`: the Toy IDS observed an alert condition. This does not imply that
  the frame was blocked.

For the current domains, frame-format, payload, checksum, counter, capture, and
repeat failures are Toy ECU validation results. They must not be shown as IDS
blocks. Script syntax errors stop before Training OBD-II.

## 5. Chosen Experience: Hybrid Timeline and 3D Packet

### 5.1 DOM flow timeline

The current target-map row becomes an accessible command timeline. It contains a
lab workstation source followed by the scenario route:

```text
Lab Terminal -> Training OBD-II -> Toy IDS -> Toy Gateway
             -> Toy Body/Rear ECU -> Left Door/Tailgate
```

Each node has one of these visual states:

- `idle`
- `queued`
- `active`
- `passed`
- `accepted`
- `rejected`
- `effect`

The active connector animates in the route accent color. Passed connectors remain
visible at a lower intensity. A rejected connector and node use a stop icon and
red treatment in addition to color.

A compact command HUD shows:

- the command or script line being represented;
- frame position such as `Frame 1/3`;
- CAN ID and payload when a frame exists;
- the current transition, for example `Toy Gateway -> Toy Body ECU`;
- the ECU verdict and IDS observation as separate values.

### 5.2 3D flow

`VehicleNetworkViewport` keeps the current X-ray vehicle and topology anchors. A
small emissive packet moves along the existing 3D route line. The active node gets
a halo pulse, and completed edges remain highlighted until the command ends.

The camera moves to the overview preset when automatic playback begins. It does
not jump between every node because that would hide edges and cause visual
disorientation. Learners can manually focus a node after or outside playback.

The 3D packet is presentation-only. `useFrame` updates the packet object's position
through a ref; it does not update React state every animation frame. React state
changes only when the active segment changes.

### 5.3 Effect timing

An accepted flow follows:

```text
Terminal -> OBD -> IDS -> Gateway -> target ECU -> effect target
```

The GLB effect is applied when the packet reaches the effect target. For a script
with multiple accepted attempts, each attempt is played in order. The first
accepted open/close action takes effect when that attempt reaches the effect node;
subsequent attempts show the continuing sequence and IDS result.

A rejected flow stops at `stoppedAt`. It never reaches or mutates the effect target.

An `EXECUTED + IDS ALERT` trace reaches and applies the effect, then shows an
orange `탐지됨 · 차단하지 않음` IDS state. This preserves the current Toy IDS
semantics.

### 5.4 Local and observation commands

Commands are not given a fake injection path:

- `pwd`, `ls`, and identity commands highlight only Lab Terminal and report
  `차량 영향 없음`.
- `cat` commands show a terminal-to-evidence transition and do not mutate the
  vehicle.
- `candump` and capture operations show an observation/capture state at the
  training interface and monitor. They do not continue to an effect node.
- `cansend` and `canplayer` can create an injected frame flow.
- `interval_ms` and comments configure a script and do not create packets.

## 6. Click and Label Behavior

- All route anchors and number pins are selectable.
- An HTML pin is a keyboard-accessible button and shares one selection handler
  with its 3D hit target.
- `leftDoor` and `tailgate` can also be selected by clicking known GLB hinge groups
  (`HINGE_doorL` and `HINGE_tailgate`).
- Logical OBD/IDS/Gateway/ECU nodes remain explicitly labelled as educational
  anchors rather than physical GLB parts.
- Selecting a node focuses the camera, highlights the matching timeline node, and
  shows one compact tooltip.
- Base tooltip target width is about 92-96 px with 10 px title and 8 px detail text.
- During target/effect focus, the selected tooltip uses a roughly 60% opaque dark
  background. Text remains fully opaque. Non-selected tooltips are hidden.

## 7. Authoritative Trace Contract

Terminal and script responses add `flowTraces`. Each executable or observable
operation has at most one trace; a multi-frame Door script returns traces in source
order.

```ts
type VehicleFlowNodeId =
  | "terminal"
  | "evidence"
  | "monitor"
  | VehicleTopologyNodeId

interface VehicleFlowTrace {
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
  outcome: "LOCAL" | "OBSERVED" | "EXECUTED" | "REJECTED"
  ecuVerdict: string | null
  idsVerdict: "NORMAL" | "ALERT" | null
  effectTarget: VehicleEffectTargetId | null
  effectState: "open" | "closed" | null
  effectApplied: boolean
}
```

The backend derives this contract from the domain result. The frontend does not
duplicate verdict-to-stop-node security rules.

Door live-event metadata also gains `attemptId` so REST attempts and monitor events
can be correlated. WebSocket events remain the live monitor source, but REST
`flowTraces` are the animation authority because browser-observed HTTP and
WebSocket ordering is not guaranteed.

No learner answer is exposed by session creation or initial page markup. Trace
details appear only after the associated command or script is submitted.

## 8. Frontend State and Ownership

A shared playback controller owns the queue rather than placing timers in each
page.

```ts
interface VehicleFlowPlayback {
  playbackId: number
  phase: "idle" | "playing" | "complete" | "cancelled"
  trace: VehicleFlowTrace | null
  traceIndex: number
  traceCount: number
  segmentIndex: number
}
```

The page owns authoritative result acceptance and submits validated traces to the
controller. `VehicleNetworkViewport` receives a read-only playback snapshot and
renders it.

The attack pages stop allowing matching live lab events to mutate the global
vehicle store immediately. Monitor observation is retained. At an effect-node
arrival, the controller applies the trace's effect state. At normal queue
completion, the page applies the backend's final `vehicleState` to guarantee
consistency. A reset, scenario change, or new session applies that operation's new
authoritative state and never reconciles an obsolete result.

Network request state and playback state are separate. Terminal and script submit
buttons remain disabled while either one is active so a learner sees one causal
flow at a time.

## 9. Playback Timing

- Default presentation duration is 180-240 ms per segment.
- A normal injected command completes in roughly 0.9-1.2 seconds.
- Multi-attempt scripts play in source order.
- Presentation timing is clamped and never presented as physical CAN latency.
- `prefers-reduced-motion` skips moving particles and pulses. The timeline advances
  through stable states and applies the final effect without motion.
- `useFrame` delta is clamped to avoid a jump after a background tab resumes.

## 10. Cancellation, Deduplication, and Recovery

- Trace identity uses `sessionId:generation:traceId`.
- Repeated REST/WebSocket evidence cannot enqueue a duplicate trace.
- Reset, scenario change, new session generation, unmount, and explicit retry
  cancel the active playback and clear the queue.
- A cancelled playback does not apply a pending effect.
- Reset immediately applies the reset vehicle state.
- A reconnect snapshot restores the authoritative vehicle state without replaying
  the attack animation.
- Stale session or generation results remain ignored by the existing action guards.
- If playback rendering fails after a valid response, the final backend state is
  reconciled and an accessible warning is shown; the learner is not left with a
  permanently inconsistent vehicle.

## 11. Component Boundaries

Expected shared frontend units:

- `vehicleFlowTypes.ts`: trace and playback types.
- `useVehicleFlowPlayback.ts`: queue, segment transitions, cancellation, effect
  callbacks, and reduced-motion behavior.
- `VehicleNetworkViewport.tsx`: clickable anchors, 3D packet, halos, active edges,
  compact tooltips, and read-only playback rendering.
- `VehicleFlowRail.tsx`: accessible DOM timeline and command HUD.
- Door and Beginner attack pages: request/result acceptance, monitor handling,
  final state reconciliation, and scenario route selection.

Expected backend changes:

- Pure trace builders for Door, Spoofing, and Replay results.
- `flowTraces` in terminal/script responses.
- Door `attemptId` in live-event lab metadata.
- API types and response tests updated without changing the underlying Toy ECU
  acceptance rules.

## 12. Error Handling

- Network/API failure: no trace is played; existing action error remains visible.
- Script parse failure: a terminal/script-local rejected state is shown before OBD.
- Frame rejection: the path stops at the authoritative `stoppedAt` node.
- Missing or malformed trace: ignore the animation payload, log an application
  error, and reconcile the final backend state.
- GLB load failure: the DOM timeline remains fully usable.
- WebSocket loss: REST traces still play; the monitor reports its disconnected
  state and final REST state is reconciled.

## 13. Testing Strategy

### Backend

- Door accepted, counter-rejected, checksum-rejected, and script-parse results
  return correct routes, stop nodes, separate ECU/IDS verdicts, and effects.
- Spoofing and Replay accepted/rejected results return scenario-correct target and
  effect nodes.
- Capture and local commands never report a vehicle effect.
- Door live metadata includes the matching `attemptId`.
- Session/generation reset behavior remains unchanged.

### Frontend unit/component

- Playback advances segments in order and applies an effect only at the endpoint.
- Rejected traces stop and never call the effect callback.
- `EXECUTED + ALERT` applies the effect and announces detect-without-block.
- Multiple traces preserve order and do not remount the Canvas.
- Duplicate traces are ignored.
- Reset/scenario change/unmount cancels playback and timers.
- Reduced-motion mode produces equivalent final state without moving animation.
- Clicking logical anchors, HTML pins, and known hinge groups selects the correct
  node.
- Compact tooltip and focused-translucent state attributes render correctly.

### Browser QA

- Door terminal replay failure stops without opening a door.
- Door valid three-frame script visibly traverses the route before the left door
  effect.
- Spoofing reaches Rear ECU and then Tailgate.
- Replay capture does not mutate the vehicle; playback reaches Body ECU and Left
  Door.
- Desktop, 820 px, and 390 px views have no clipping or horizontal page overflow.
- Repeated run/reset/focus interactions do not increase panel height.
- No framework overlay or relevant console error appears.

## 14. Completion Criteria

- A learner can name the source, each traversed Toy device, the stop/effect node,
  ECU verdict, and IDS observation from one command run.
- Door/tailgate mutation is visually ordered after route traversal.
- Rejected operations cannot animate through to an effect.
- The same shared flow model operates in Door, Spoofing, and Replay.
- All existing and new tests, typecheck, production build, diff check, and browser
  interaction checks pass.

## 15. Known Limitations

- Hop timing is educational, not measured bus latency.
- The topology describes this Toy lab contract, not an OEM vehicle architecture.
- Only the existing left-door and tailgate hinge groups are truthful clickable GLB
  effect parts.
- A future DoS lab will need a bus-load/frequency trace model rather than reusing
  the single-frame effect model unchanged.
