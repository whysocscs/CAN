# Task 6A Report — Normal CAN / attack vehicle scene parity

Date: 2026-08-25
Branch: `feat/can-attack-basics-expansion`
Base: `f76be8b80328e69efc7c02f5069be49e7c067776`

## Result

The normal CAN practice page and attack viewport now consume one shared RIDGEX
vehicle scene boundary. The boundary owns the GLB path/preload, cloned vehicle and
material lifecycle, normal-CAN camera/renderer/light/control presentation, and the
single fitted coordinate root. Normal ECU/bus children and attack topology/flow
children remain consumer-owned and are mounted below that same root.

The attack viewport retains the existing playback camera contract: a new automatic
playback selects the overview once, segment changes in the same playback do not
replace the camera focus, and the Canvas has no playback-derived key/remount. The
normal page retains its label, bus, auto-rotate, orbit command, and Reset View UI.

## TDD evidence

### RED 1 — missing shared boundary and attack presentation mismatch

Command:

```powershell
npm test -- src/features/vehicle/SharedVehicleScene.test.tsx src/features/vehicle/VehicleNetworkViewport.test.tsx
```

Observed:

- `SharedVehicleScene.test.tsx`: suite failed to resolve
  `./SharedVehicleScene` because the shared boundary did not exist.
- `VehicleNetworkViewport.test.tsx`: 22 passed, 1 failed. The presentation test
  expected camera `[5.8, 3.8, 7.6]` and received the attack-only
  `[-6.2, 2.9, 0.55]`.

Production changes that made it GREEN:

- Added `SharedVehicleScene.tsx` with one immutable normal-CAN preset and one GLB
  implementation.
- Replaced the attack-only Canvas presentation, model rotation, model clone, and
  material code with the shared Canvas/scene/controls.

### RED 2 — normal page sticky X-ray toggle

Command:

```powershell
npm test -- src/pages/CanPracticeOnlyPage.test.tsx
```

Observed: 1 failed. After both ECU Name and CAN Bus were turned off, the vehicle
material still reported `transparent: true`, `opacity: 0.4`, and
`depthWrite: false` instead of returning to an opaque clone.

Production change that made it GREEN: the normal page now uses the shared scene,
which replaces the clone when `xray` changes and disposes the prior cloned
materials.

### RED 3 — `xray={false}` must be authoritative

Command:

```powershell
npm test -- src/features/vehicle/SharedVehicleScene.test.tsx
```

Observed: 4 passed, 1 failed. With a deliberately transparent source material, the
non-X-ray clone inherited `transparent: true`, `opacity: 0.35`, and
`depthWrite: false`.

Production change that made it GREEN: the non-X-ray branch explicitly sets the
cloned material to `transparent: false`, `opacity: 1`, and `depthWrite: true`
without changing the source material.

### Focused GREEN

Command:

```powershell
npm test -- src/features/vehicle/SharedVehicleScene.test.tsx src/pages/CanPracticeOnlyPage.test.tsx src/features/vehicle/VehicleNetworkViewport.test.tsx src/features/vehicle/VehicleFlowRail.test.tsx src/features/vehicle/useVehicleRig.test.tsx src/features/vehicle/vehicleTopology.test.ts
```

Result: 6 test files passed, 39 tests passed.

## Coordinate and camera approach

- `SharedVehicleScene` creates one stable `THREE.Group` coordinate root inside
  `Bounds fit observe margin={0.9}` and `Center`.
- The cloned GLB and every consumer child are siblings below that root. The attack
  overlay no longer has a separate `MODEL_ROTATION`; pins, route lines, packet,
  halo, effect anchors, and the model inherit the same Center transform.
- `vehicleLocalPointToWorld` calls `root.updateWorldMatrix(true, false)` and
  `root.localToWorld(...)`. Attack focus presets use that world coordinate, while
  rendered overlay objects keep the same local anchor tuples.
- A transformed-root test places packet and pin objects at the same local anchor
  and verifies their world positions equal the camera focus target.
- The overview uses the shared camera direction/preset and the active Bounds API.
  Entering overview refreshes/refits the complete shared root. A selected non-
  overview target is restored after a Bounds refit without resetting the user's
  orbit position.

## Clone, material, and rig lifecycle

- The source GLTF scene and its materials are never modified.
- Every rendered mesh receives a cloned material. X-ray and opaque properties are
  applied only to those clones.
- All cloned materials are disposed when X-ray state replaces the scene or when
  the shared scene unmounts. Source materials are not disposed.
- Shadow and frustum flags are applied to cloned meshes only.
- `VehicleRigAttachment` reads the exact clone from the shared scene context and
  passes it to `useVehicleRig`; the normal page does not import or attach attack
  rig logic.
- Effect selection still walks ancestors and recognizes only `HINGE_doorL` and
  `HINGE_tailgate`.

## Changed files

- `src/features/vehicle/SharedVehicleScene.tsx` (new)
- `src/features/vehicle/SharedVehicleScene.test.tsx` (new)
- `src/features/vehicle/VehicleNetworkViewport.tsx`
- `src/features/vehicle/VehicleNetworkViewport.test.tsx`
- `src/pages/CanPracticeOnlyPage.tsx`
- `src/pages/CanPracticeOnlyPage.test.tsx` (new)
- `.superpowers/sdd/2026-08-25-attack-flow-visualization/task-6a-report.md`

No Door/Beginner page state, backend, trace contract, playback hook, rail
implementation, topology data, CSS, or lab-answer files were changed.

## Final verification

- `npm run typecheck`: passed.
- `npm test`: 18 test files passed, 148 tests passed.
- `npm run build`: passed; Vite emitted its chunk-size and plugin-timing warnings.
- `git diff --check`: passed against the staged Task 6A file set.

## Limitations

- Browser/rendered visual parity is intentionally not claimed here. Desktop,
  tablet, and mobile browser QA belongs to Task 9.
- The shared `Bounds` fit includes consumer overlay geometry as required. Different
  scenario overlays can therefore contribute to the fitted box even though all
  consumers use the same vehicle and presentation preset.
- Only the two named GLB hinges are selectable effects; logical ECU positions
  remain explicitly educational anchors.

## Review fix round 1

### RED evidence

Command:

```powershell
npm test -- src/features/vehicle/SharedVehicleScene.test.tsx src/features/vehicle/VehicleNetworkViewport.test.tsx src/pages/CanPracticeOnlyPage.test.tsx --reporter=dot
```

Result before production edits: 3 test files failed; 4 tests failed and 28
passed.

- An already-overview idle-to-playing transition left the observable Bounds
  reset count unchanged (`2`, expected `3`). The camera and controls therefore
  retained a manual orbit because the overview preset dependencies were equal.
- Normal Reset View produced zero in-Canvas overview resets. The existing
  `key={viewKey}` behavior could only remount the Canvas instead of resetting its
  existing camera and controls.
- StrictMode plus an X-ray replacement produced cloned-material disposal counts
  `[2, 0, 1, 0]`, expected `[1, 1, 1, 1]`. This exposed both double cleanup of
  committed render-time clones and leaked discarded-render clones.
- The first transformed-root test revision reached the production tree but its
  initial focused node was truthfully superseded by the automatic playback
  overview reset, yielding target `[0, 0, 0]`. The test was corrected to select
  the rendered gateway pin after playback reset; it then became a production-
  wiring characterization test. It would fail if camera focus used the raw local
  anchor instead of the shared root transform.

No production edit was made until the three product regressions had observable
behavior failures and the coordinate test no longer had a frame-mock exception.

Self-review found one additional real-controls gap. Adding `makeDefault: true` to
the normal-page controls contract and running
`npm test -- src/pages/CanPracticeOnlyPage.test.tsx` produced 1 failed test: the
received prop was `undefined`. After the one-line production change, the same
command passed 1 of 1 test. This is required so `useThree(state.controls)` and
Bounds address the actual normal-page OrbitControls target, not only the camera.

### GREEN evidence

Focused command:

```powershell
npm test -- src/features/vehicle/SharedVehicleScene.test.tsx src/pages/CanPracticeOnlyPage.test.tsx src/features/vehicle/VehicleNetworkViewport.test.tsx src/features/vehicle/VehicleFlowRail.test.tsx src/features/vehicle/useVehicleRig.test.tsx
```

Result: 5 test files passed; 38 tests passed. A separate viewport rerun passed 25
of 25 tests after strengthening the existing target-focus reset test.

### Reset and coordinate implementation

- `SharedVehicleOverviewController` accepts primitive `active` and
  `resetRevision` values. Each explicit overview request increments the revision,
  so an already-overview new playback still invokes one reset while same-run
  segment changes do not.
- Before Bounds refresh/reset/fit, the controller restores camera position
  `[5.8, 3.8, 7.6]` and target `[0, 0, 0]`. Bounds therefore derives its fit from
  the shared normal-CAN direction instead of the current manual orbit direction.
- Normal Reset View increments the same in-Canvas revision. The Canvas no longer
  has a reset-derived React key, remains mounted once, and keeps auto-rotate and
  owned GLTF resources intact. Its OrbitControls are `makeDefault`, making the
  shared controller's target reset operative in the real R3F state.
- The transformed Center mock attaches the actual shared coordinate root to a
  translated and rotated `THREE.Group`. Rendered pin and packet local anchors and
  the camera target are then checked through the real
  `SharedVehicleScene`/`TopologyOverlay`/`createNodeCameraPreset` wiring.

### Commit-owned clone lifecycle

- GLTF scene/material cloning now occurs only in `useLayoutEffect`, never during
  render. Each effect setup owns exactly one resource and its cleanup disposes
  exactly that setup's cloned materials.
- StrictMode setup/cleanup replay, X-ray replacement, and unmount are covered in
  one test; every recorded material clone is disposed exactly once. The source
  GLTF and source material remain immutable and undisposed.
- A local numeric resource revision is used only as Center's cache key. No mutable
  Three.js vectors or globally shared scene instances are exported.

### Review-round final verification

- Focused shared scene, normal page, viewport, rail, rig, and topology command:
  6 test files passed, 42 tests passed.
- `npm run typecheck`: passed on the final Task 6A tree.
- `npm run build`: passed; Vite emitted only the existing chunk-size warning.
- The final full `npm test` ran while Task 8's intentionally RED beginner tests
  were present but not yet implemented: 16 files passed and 2 failed; 148 tests
  passed and 8 failed. Seven failures are the new out-of-scope beginner playback
  expectations, and one is the Door command-history test in that shared run.
  The latter is `DoorAttackLabPage > clears the restricted terminal input and
  command history on reset`: `runDoorLabCommand` had zero calls while the test
  expected the `("session-1", "pwd", ...)` invocation. It is recorded for
  follow-up isolation and is outside the Task 6A files.
  Task 6A's focused files had zero failures. Earlier in this round, before those
  concurrent Task 8 RED edits landed, full `npm test` passed 18 files and 151
  tests.
- Browser/rendered parity remains deferred to Task 9 and is not claimed here.
