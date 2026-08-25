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
