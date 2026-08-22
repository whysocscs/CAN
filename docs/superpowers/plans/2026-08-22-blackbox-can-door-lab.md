# Black-box CAN Door Attack Lab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the static `attacks/chain` preview with a functioning Black-box CAN Door Attack lab whose accepted Toy ECU events animate the existing GLB vehicle.

**Architecture:** FastAPI owns the private Toy Body ECU contract, virtual terminal, script parser, session state, and Toy IDS verdict. The React page calls the lab API, listens to the existing CAN WebSocket, and renders the existing GLB through the existing vehicle rig; rejected attempts remain analysis evidence and accepted frames alone enter the vehicle stream.

**Tech Stack:** React 19, TypeScript, Vite, React Three Fiber/Drei/Three.js, Vitest, FastAPI, Pydantic, pytest, Docker Compose, nginx.

**Spec:** `docs/superpowers/specs/2026-08-22-blackbox-can-door-lab.md`

## Global Constraints

- Keep the existing `attacks/chain` route and existing CANLite ver4 AppShell/DesignedSidebar visual language.
- Use `/models/RIDGEX_ROCKER_CLEANUP_V7_01.glb` with `useVehicleRig`; do not create or substitute a fake vehicle asset.
- Hide CAN ID, byte meaning, checksum formula, checksum seed, and expected counter from initial public state.
- Never execute arbitrary learner input with Python, Bash, `eval`, `exec`, `shell=True`, or Docker socket access.
- Only accepted Toy ECU frames may enter the vehicle-state event path; blocked attempts must not move the GLB.
- Label all protocol, IDS, ECU position, and physical effects as Toy/educational behavior.
- Docker defaults to loopback mode, non-root, localhost-only published ports, no privileged mode or host mounts.
- Follow red-green-refactor for every new behavior and record the failing and passing command in the task report.

---

### Task 1: Toy Body ECU, virtual terminal, session API, and accepted CAN events

**Files:**
- Create: `server/labs/door_blackbox.py`
- Create: `server/routers/labs.py`
- Create: `server/tests/test_door_blackbox.py`
- Create: `server/tests/test_labs_api.py`
- Create: `server/requirements-dev.txt`
- Modify: `server/routers/can.py`
- Modify: `server/main.py`

**Interfaces:**
- Produces: `DoorBlackboxSession.execute_terminal(command: str) -> TerminalResult`
- Produces: `DoorBlackboxSession.run_script(script: str) -> ScriptResult`
- Produces: `DoorBlackboxSession.public_state() -> dict[str, object]`
- Produces: REST routes under `/labs/door-blackbox/sessions`
- Produces: `emit(can_id, data, *, context=None, processing=None, monitoring=None)` accepted-event bridge

- [ ] **Step 1: Write pure-domain failing tests**

  Add literal-fixture tests covering checksum `01 01 10 B5`, invalid checksum block, counter replay block, single valid frame impact with IDS alert, three valid 100 ms frames with IDS normal, whitelist terminal commands, unknown command rejection, script size/line/interval limits, and absence of private answer fields in `public_state()`.

- [ ] **Step 2: Run the domain tests and verify RED**

  Run: `.venv/Scripts/python -m pytest server/tests/test_door_blackbox.py -q`

  Expected: collection failure because `server.labs.door_blackbox` does not exist.

- [ ] **Step 3: Implement the minimal pure domain**

  Implement immutable result dataclasses and `DoorBlackboxSession` with reset counter `0x12`, checksum `b0 ^ b1 ^ counter ^ 0xA5`, validation order from the spec, static noisy captures, command whitelist, 4096-character/20-line script limits, and evidence-derived stages. Do not import FastAPI in this module.

- [ ] **Step 4: Run the domain tests and verify GREEN**

  Run: `.venv/Scripts/python -m pytest server/tests/test_door_blackbox.py -q`

  Expected: all domain tests pass.

- [ ] **Step 5: Write API and CAN metadata failing tests**

  Build a test-only FastAPI app around `labs.router`. Assert create/get/reset/terminal/run behavior, 404 for unknown session, and that a successful run calls an injected accepted-frame emitter with `DOOR_LOCK`, route `obd → ids → gateway → body`, `EXECUTED`, and IDS `NORMAL` metadata.

- [ ] **Step 6: Run API tests and verify RED**

  Run: `.venv/Scripts/python -m pytest server/tests/test_labs_api.py -q`

  Expected: failures because the router and metadata-capable emitter do not exist.

- [ ] **Step 7: Implement the router and event bridge**

  Add in-memory UUID sessions, Pydantic request limits, router dependency for the emitter, sequential awaited frame emission, optional event metadata in `build_event`/`emit`, include the router in `server/main.py`, and list `pytest`/`httpx` in `server/requirements-dev.txt`.

- [ ] **Step 8: Run backend tests and regression checks**

  Run: `.venv/Scripts/python -m pytest server/tests -q`

  Run: `.venv/Scripts/python -m compileall -q server`

  Expected: all tests and compile checks pass.

- [ ] **Step 9: Commit**

  ```bash
  git add server
  git commit -m "feat: add black-box CAN door lab engine"
  ```

### Task 2: Frontend contracts, API client, script/frame utilities, and vehicle execution guard

**Files:**
- Create: `src/features/attack-lab/doorLabTypes.ts`
- Create: `src/features/attack-lab/doorLabApi.ts`
- Create: `src/features/attack-lab/doorLabUtils.ts`
- Create: `src/features/attack-lab/doorLabUtils.test.ts`
- Create: `src/features/vehicle/vehicleStore.test.ts`
- Modify: `src/features/can/events/types.ts`
- Modify: `src/features/vehicle/vehicleStore.ts`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Task 1 REST response field names and accepted event metadata.
- Produces: `createDoorLabSession`, `resetDoorLabSession`, `runDoorLabCommand`, `runDoorLabScript`.
- Produces: `parseTerminalFrames`, `formatFrameData`, `frameBits`, `appendBoundedEvents`.
- Produces: CanEvent optional `reasonCode`, `ruleIds`, and lab metadata types.

- [ ] **Step 1: Add Vitest and write failing utility/vehicle tests**

  Add `vitest` and a `test` script. Tests must assert literal parsing of candump lines, byte/bit formatting, 300-event truncation, and that `vehicle.applyCanEvent()` leaves state unchanged for `processing.executionResult === "BLOCKED"` while applying `EXECUTED` `0x101` data.

- [ ] **Step 2: Run the focused tests and verify RED**

  Run: `pnpm test -- src/features/attack-lab/doorLabUtils.test.ts src/features/vehicle/vehicleStore.test.ts`

  Expected: failures because utilities do not exist and blocked events are currently applied.

- [ ] **Step 3: Implement the minimal contracts and utilities**

  Add response types matching Task 1 exactly, a hostname-aware API base defaulting to port 8010, fetch error normalization, direct utility exports, CanEvent optional metadata, and an early return in `vehicle.applyCanEvent()` when execution is `BLOCKED` or filter result is `DROP`.

- [ ] **Step 4: Run focused tests and verify GREEN**

  Run: `pnpm test -- src/features/attack-lab/doorLabUtils.test.ts src/features/vehicle/vehicleStore.test.ts`

  Expected: all focused tests pass.

- [ ] **Step 5: Run frontend regression checks and commit**

  Run: `pnpm typecheck`

  Run: `pnpm build`

  ```bash
  git add package.json pnpm-lock.yaml src/features
  git commit -m "feat: add door lab frontend contracts"
  ```

### Task 3: Interactive attack workbench with actual GLB and ECU target overlay

**Files:**
- Create: `src/features/attack-lab/DoorAttackVehicle.tsx`
- Create: `src/features/attack-lab/DoorAttackLabPage.tsx`
- Create: `src/features/attack-lab/DoorAttackLabPage.test.tsx`
- Create: `src/features/attack-lab/doorAttackLab.css`
- Modify: `src/pages/AttackPracticePage.tsx`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`

**Interfaces:**
- Consumes: Task 1 API and `/ws/can` accepted events.
- Consumes: Task 2 client/utilities and existing `useVehicleRig`, `useCanVehicleStream`, `useVehicleState`.
- Produces: interactive `DoorAttackLabPage` for `attacks/chain`; other attack tabs remain static.

- [ ] **Step 1: Add jsdom/testing-library and write failing page behavior tests**

  Mock only the external API/WebSocket/R3F boundary. Render the real page shell and assert the initial UI shows `BODY ECU`, `UNKNOWN`, seven stages, blank-answer script template, code/binary/network/terminal regions, and an explicit offline error on rejected session creation. Assert a selected structured frame controls the binary byte view.

- [ ] **Step 2: Run the component tests and verify RED**

  Run: `pnpm test -- src/features/attack-lab/DoorAttackLabPage.test.tsx`

  Expected: collection failure because the page does not exist.

- [ ] **Step 3: Implement the actual vehicle view**

  Load `/models/RIDGEX_ROCKER_CLEANUP_V7_01.glb`, clone the scene once, call `useVehicleRig(scene)`, use a large side-biased Canvas, and place educational Body ECU and actual Left Door markers using existing Body anchor `[0.67,0.73,-0.54]` and door hinge pivot `[-0.9,0.78,0.69]`. Respect reduced motion and do not subscribe to the CAN stream inside the Canvas.

- [ ] **Step 4: Implement the workbench page**

  Create the session on mount, subscribe to `useCanVehicleStream` once, cap events at 300, render the stage/target strip, actual GLB, code textarea, binary inspector, network monitor, restricted terminal history/input, hints, evidence, reset/run actions, loading/offline/error states, and accessible labels. Use functional state updates and module-level static configuration.

- [ ] **Step 5: Wire only `attacks/chain` to the interactive page**

  At the top of `AttackPracticePage`, render `DoorAttackLabPage` when `route === "attacks/chain"`; preserve existing static Spoofing/Replay/DoS rendering and tabs.

- [ ] **Step 6: Run component and frontend regression checks**

  Run: `pnpm test -- src/features/attack-lab/DoorAttackLabPage.test.tsx`

  Run: `pnpm test`

  Run: `pnpm typecheck`

  Run: `pnpm build`

  Expected: all tests/typecheck/build pass; existing build-size warning may remain but no new error is accepted.

- [ ] **Step 7: Commit**

  ```bash
  git add package.json pnpm-lock.yaml src/features/attack-lab src/pages/AttackPracticePage.tsx
  git commit -m "feat: build interactive CAN attack workbench"
  ```

### Task 4: Safe Docker Compose packaging, lab guide, and end-to-end smoke verification

**Files:**
- Create: `docker/frontend.Dockerfile`
- Create: `docker/server.Dockerfile`
- Create: `docker/nginx.conf`
- Create: `compose.yaml`
- Create: `.dockerignore`
- Create: `docs/labs/blackbox-can-door-attack.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: Task 1 backend port 8010 and Task 3 Vite frontend.
- Produces: `docker compose up --build` local deployment on `127.0.0.1:8447` and `127.0.0.1:8010`.

- [ ] **Step 1: Write deployment files with explicit safe defaults**

  Frontend uses pinned Corepack/pnpm lockfile build and nginx port 8080. Server uses Python slim, installs runtime requirements, copies source, runs as a numeric non-root user, and starts Uvicorn. Compose uses `CANLITE_CAN_MODE=loopback`, localhost-only ports, `read_only`, `/tmp` tmpfs, `cap_drop: ALL`, `no-new-privileges:true`, healthchecks, CPU/memory/PID limits, and no host mounts or Docker socket.

- [ ] **Step 2: Write the learner/teacher guide**

  Document objectives, prerequisites, Docker start/stop, visible learner commands, evidence expectations, Toy contract disclaimer, GLB physical-effect limitation, troubleshooting, and a teacher-only answer walkthrough clearly separated from learner instructions.

- [ ] **Step 3: Validate static deployment and docs**

  Run: `docker compose config`

  Expected: valid services, localhost-only published ports, no privileged mode, no host mounts.

  Run: `git diff --check`

- [ ] **Step 4: Run the complete verification suite**

  Run: `.venv/Scripts/python -m pytest server/tests -q`

  Run: `pnpm test`

  Run: `pnpm typecheck`

  Run: `pnpm build`

  If the Docker daemon is available, additionally run `docker compose up --build -d`, request `/health`, execute one scripted happy path through the API, then `docker compose down`. If the daemon is unavailable, record that runtime Docker verification was not performed instead of claiming it passed.

- [ ] **Step 5: Commit**

  ```bash
  git add .dockerignore compose.yaml docker docs README.md
  git commit -m "build: package CAN attack lab for Docker"
  ```
