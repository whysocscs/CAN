# CAN Attack Basics Expansion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`. Implement every behavior with red-green-refactor, commit only on `feat/can-attack-basics-expansion`, and write the requested task report.

**Goal:** Make the vehicle attack target unmistakable, replace static Spoofing/Replay previews with safe interactive CAN beginner labs, and provide exact instructor validation commands.

**Architecture:** Keep the proven Door engine intact. Add a separate FastAPI pure-domain/session router for two private Toy scenarios. Add a shared GLB topology viewport with non-occluding pins and an external target map. Use one parameterized React beginner page backed by the new API and existing accepted CAN event stream.

**Tech stack:** React 19, TypeScript, Vite, R3F/Drei/Three.js, Vitest/Testing Library, FastAPI/Pydantic, pytest, Docker Compose/nginx, Playwright for external browser QA.

**Spec:** `docs/superpowers/specs/2026-08-23-can-attack-basics-expansion.md`

## Global constraints

- Never commit, merge, or push `main`; never rewrite or merge `feat/blackbox-can-door-lab`.
- Preserve the existing Door domain/router and its concurrency/WebSocket behavior unless a new regression test proves a required integration defect.
- Use only the existing GLB and `useVehicleRig`; no fake replacement asset.
- ECU/OBD/Gateway/IDS positions must say Toy logical position, not actual OEM placement. Effect anchors must not claim actuator physical location.
- Keep private scenario IDs/payloads/solution commands out of initial public state, frontend config, initial DOM, and production JS bundle.
- Never execute arbitrary learner input or a real shell/process. `candump`, redirection, and `canplayer` are virtual grammar only.
- Capture/rejected attempts never enter the shared vehicle event stream. Only exact current-session `ACCEPT/EXECUTED` live events may affect the lab GLB.
- Replay Attack events must not use top-level `replay: true`.
- Keep `attacks/dos` static and preserve all unrelated routes.
- Record RED and GREEN commands/output in each task report.

---

### Task 1: Backend beginner CAN attack domain and API

**Files:**
- Create: `server/labs/can_attack_basics.py`
- Create: `server/routers/can_attack_labs.py`
- Create: `server/tests/test_can_attack_basics.py`
- Create: `server/tests/test_can_attack_labs_api.py`
- Modify: `server/routers/can.py` only to expose a virtual-only event publisher that never invokes SocketCAN
- Modify: `server/main.py`

**Produces:** `BeginnerCanAttackSession`, two scenario specs, virtual terminal/script results, `/labs/can-attacks/{scenario}/sessions` routes, accepted enriched event emission.

- [ ] Write failing pure-domain tests for both private contracts, observation/capture evidence, spoofing vs replay distinction, validation order, script/command limits, reset generation, attempt ID uniqueness, and public-state answer absence.
- [ ] Run focused tests and record RED.
- [ ] Implement the framework-free domain with immutable result values and exact virtual grammar.
- [ ] Run focused domain tests and record GREEN.
- [ ] Write failing API tests for create/get/reset/terminal/run, wrong scenario/session 404, bounded sessions, targeted snapshot clearing, accepted-only emission, exact metadata, no top-level replay, stale session/generation suppression, and reset/in-flight races.
- [ ] Implement the separate router/coordinator and include it in `server/main.py`; add a narrow `publish_virtual_event` bridge that always uses the in-process accepted event path even when global CAN mode is SocketCAN, and do not refactor the Door router or alter existing `emit` behavior.
- [ ] Run focused and full backend tests plus compileall.
- [ ] Self-review security boundaries, commit, and write `task-1-report.md`.

### Task 2: Shared non-occluding vehicle topology and Door visualization

**Files:**
- Create: `src/features/vehicle/vehicleTopology.ts`
- Create: `src/features/vehicle/vehicleTopology.test.ts`
- Create: `src/features/vehicle/VehicleNetworkViewport.tsx`
- Create: `src/features/vehicle/VehicleNetworkViewport.test.tsx`
- Modify: `src/features/attack-lab/DoorAttackVehicle.tsx`
- Modify: `src/features/attack-lab/DoorAttackVehicle.test.tsx`
- Modify: `src/features/attack-lab/DoorAttackLabPage.tsx`
- Modify: `src/features/attack-lab/doorAttackLab.css`

**Produces:** reusable truthful topology, view presets, compact pins/route, external target map, enlarged Door vehicle panel.

- [ ] Write failing topology invariants: unique nodes, valid edges, truth labels, hinge-derived effect anchors, and no unsupported OEM-location copy.
- [ ] Write failing viewport/wrapper tests for active route, numbered pins, external details, focus/reset controls, reduced motion, no WebSocket ownership, and Door route/effect props.
- [ ] Implement the shared viewport and convert `DoorAttackVehicle` to a thin wrapper.
- [ ] Replace the occluding in-Canvas cards, enlarge the desktop vehicle panel, and stack target details outside Canvas on narrow screens.
- [ ] Run focused tests, full frontend tests, typecheck, and build.
- [ ] Self-review visual truth and component lifecycle, commit, and write `task-2-report.md`.

### Task 3: Interactive Spoofing and Replay frontend labs

**Files:**
- Create: `src/features/attack-lab/beginnerCanAttackTypes.ts`
- Create: `src/features/attack-lab/beginnerCanAttackApi.ts`
- Create: `src/features/attack-lab/beginnerCanAttackUtils.ts`
- Create: `src/features/attack-lab/beginnerCanAttackUtils.test.ts`
- Create: `src/features/attack-lab/BeginnerCanAttackLabPage.tsx`
- Create: `src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx`
- Modify: `src/features/can/events/types.ts`
- Modify: `src/pages/AttackPracticePage.tsx`
- Modify: `src/pages/AttackPracticePage.test.tsx`
- Modify: `src/components/layout/DesignedSidebar.tsx`
- Modify: `src/features/attack-lab/doorAttackLab.css`

**Consumes:** Task 1 API/event contract and Task 2 shared viewport.

- [ ] Write failing API/utility tests for response parsing, script/frame formatting, exact event predicate, monitor dedup/cap, and error normalization.
- [ ] Write failing page tests for both scenario identities, answer-free initial UI, session lifecycle, terminal observation, run/reset, rejected immutability, accepted authoritative state, stale/wrong event rejection, binary selection, request abort, and route isolation.
- [ ] Extend optional lab event metadata with `scenario`, `attemptId`, and `stage` without changing existing event behavior.
- [ ] Implement the parameterized workbench with separate scenario learning copy but no private answer data.
- [ ] Route Spoofing and Replay to it, leave Door and DoS behavior intact, and add a mobile Attack navigation item.
- [ ] Run focused tests, full frontend tests, typecheck, build, and a built-dist answer scan.
- [ ] Self-review lifecycle, accessibility, and state isolation, commit, and write `task-3-report.md`.

### Task 4: Learner/instructor guides and complete runtime verification

**Files:**
- Create: `docs/labs/can-spoofing-replay-basics.md`
- Create: `docs/instructors/can-attack-lab-validation.md`
- Modify: `docs/labs/blackbox-can-door-attack.md`
- Modify: `README.md`
- Modify only if verified necessary: Docker/nginx files

**Produces:** answer-free learner material, answer-bearing validation runbook, reproducible evidence and screenshots.

- [ ] Write the learner guide with definitions, prerequisites, virtual command grammar, expected evidence, misconceptions, and isolated-environment warning but no exact answer.
- [ ] Write the instructor guide with Docker/API health checks, exact Door/Spoofing/Replay command sequences, expected stage/verdict/monitor/GLB state, negative cases, reset, and troubleshooting.
- [ ] Separate the existing Door teacher answer from its learner document and update README links with clear labels.
- [ ] Run backend tests/compileall, frontend tests/typecheck/build, compose config/static hardening checks, diff check, frontend answer/secret scans, and confirm both protected branches remain at their recorded SHAs.
- [ ] If Docker daemon is available, build/up/health/API happy paths/down; otherwise report the exact runtime limitation without claiming success.
- [ ] Use Browser plugin if available; otherwise regular Playwright. From a fresh load test desktop and fresh mobile navigation, all three interactive routes, target-map overlap, exact happy/negative flows, reset, console errors, screenshots, and body horizontal overflow.
- [ ] Dispatch broad final review, fix its Critical/Important findings once, and re-review.
- [ ] Commit only on the feature branch, push only `feat/can-attack-basics-expansion`, and verify remote `main` and remote parent branch did not move.
