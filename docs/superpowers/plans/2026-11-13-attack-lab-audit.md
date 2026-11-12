# Attack Lab Audit and Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify every attack-training route against its documented contract, repair reproducible failures, and leave Docker, API, automated-test, and rendered-flow evidence.

**Architecture:** Treat the remote `feat/lab-v2-layout` branch as the baseline. Keep the runnable Toy CAN labs (Door chain, Spoofing, Replay), the static DoS preview, and the upstream-backed KUKSA/SWUpdate labs as separate contracts; fix integration boundaries without turning static or unavailable upstream targets into simulated success.

**Tech Stack:** Python 3.12, FastAPI, pytest, React 19, TypeScript, Vitest, Docker Compose, Playwright fallback for rendered QA.

**Spec:** `docs/superpowers/specs/2026-08-23-can-attack-basics-expansion.md`, `docs/superpowers/specs/2026-09-30-cve-hands-on-labs-design.md`, and `docs/labs/cve-education-labs.md`

## Global Constraints

- Use the standardized normal CAN IDs for Spoofing and Replay; do not restore legacy `0x5A1`/`0x5A2` attack-only IDs.
- Keep DoS as a clearly labeled static preview; do not claim a runnable DoS or physical CAN result.
- KUKSA and SWUpdate must show explicit preparation errors when pinned upstream programs are absent; never fabricate success evidence.
- Preserve localhost-only Docker ports, loopback CAN mode, disabled real terminal, non-root containers, and read-only runtime filesystems.
- Every production bug fix follows RED → GREEN and the full relevant suite must pass.

## Review Focus

- A clean Docker checkout must import every backend module and become healthy.
- Spoofing and Replay must use normal IDs while keeping their effects, traces, resets, and snapshot isolation distinct.
- DoS must be reachable and clearly non-runnable without suggesting actual bus exhaustion.
- Missing KUKSA/SWUpdate upstream builds must produce bounded preparation errors rather than backend crashes or fake results.
- All six attack routes must render, navigate, and expose their primary control or static-state evidence without console errors.

---

### Task 1: Align runnable CAN attack contracts and tests

**Files:**
- Modify: `server/labs/can_attack_basics.py`
- Modify: `server/routers/can_attack_labs.py`
- Modify: `server/tests/test_can_attack_basics.py`
- Modify: `server/tests/test_can_attack_labs_api.py`
- Test: `src/features/attack-lab/BeginnerCanAttackLabPage.test.tsx`
- Test: `src/features/attack-lab/DoorAttackLabPage.test.tsx`

**Interfaces:**
- Consumes: standardized CAN message rules and existing session/API schemas.
- Produces: Spoofing and Replay results whose CAN IDs, vehicle effects, flow traces, reset behavior, and WebSocket events agree.

- [ ] Update stale legacy-ID assertions to hand-derived standardized-ID behavior and run them to expose remaining production mismatches.
- [ ] Repair only confirmed domain/router mismatches, including complete accepted-effect traces and target snapshot clearing.
- [ ] Run targeted Python and Vitest suites and confirm Spoofing, Replay, and Door flows pass.
- [ ] Commit the contract-alignment change.

### Task 2: Make the backend Docker package self-contained

**Files:**
- Modify: `docker/server.Dockerfile`
- Test: Docker build/import/startup smoke commands

**Interfaces:**
- Consumes: backend imports of `repro.*` and the repository-root `repro/` package.
- Produces: `canlite-backend:local` that imports `server.main` and reaches `/health` in Compose.

- [ ] Reproduce the clean-image `ModuleNotFoundError: repro` failure and retain the log as RED evidence.
- [ ] Copy the complete `repro/` runtime package into the non-root backend image with the existing ownership convention.
- [ ] Build the backend image, import `server.main`, and run the Compose health check to GREEN.
- [ ] Commit the packaging repair.

### Task 3: Reconcile attack navigation and DoS preview semantics

**Files:**
- Modify: `src/pages/AttackPracticePage.tsx`
- Modify: `src/pages/AttackPracticePage.test.tsx`
- Modify: `src/pages/CoursePage.tsx`
- Modify: `src/pages/CoursePage.test.tsx`

**Interfaces:**
- Consumes: six attack routes from `Route` and the static-only DoS decision.
- Produces: accurate navigation/copy that distinguishes runnable labs from the DoS preview.

- [ ] Update/add route tests that fail when any of the six tabs is missing or DoS is presented as runnable.
- [ ] Make the smallest copy/navigation changes needed for those tests.
- [ ] Run the affected Vitest files and commit the route-semantics repair.

### Task 4: Verify KUKSA and SWUpdate safe failure and API flows

**Files:**
- Modify only if a failing test proves a bug: `server/labs/kuksa_hands_on.py`, `server/routers/kuksa_hands_on.py`, `server/labs/swupdate_repro.py`, `server/routers/swupdate_repro.py`
- Test: `server/tests/test_kuksa_*`, `server/tests/test_swupdate_*`
- Test: `src/features/cve-labs/KuksaLabPage.test.tsx`, `src/features/cve-labs/SwupdateLabPage.test.tsx`

**Interfaces:**
- Consumes: pinned upstream paths/environment and existing API response schemas.
- Produces: real evidence when prepared and explicit bounded errors when unprepared.

- [ ] Run all KUKSA/SWUpdate unit and API tests in a test image containing Git.
- [ ] Exercise unprepared endpoints against the running Docker backend and record the returned preparation errors.
- [ ] For each confirmed defect, add a failing regression test, implement the minimal fix, and rerun its suite.
- [ ] Commit only if production or test code changes are required.

### Task 5: Rendered attack-lab smoke test and final verification

**Files:**
- Modify only when a rendered-flow regression is reproduced.
- Store screenshots and temporary Playwright scripts outside committed source.

**Interfaces:**
- Consumes: healthy Compose app at `http://127.0.0.1:8447`.
- Produces: route-by-route page, console, and interaction evidence for all attack labs.

- [ ] Start Compose and verify backend/frontend health.
- [ ] Test `전체 공격 체인`, `Spoofing`, `Replay`, `DoS`, `KUKSA`, and `SWUpdate` routes through rendered navigation.
- [ ] Exercise one meaningful interaction per runnable local lab; verify DoS static messaging and CVE preparation-error behavior.
- [ ] Run all Python tests, all Vitest tests, typecheck, production build, Compose config, and `git diff --check`.
- [ ] Commit any final regression fix and prepare the whole-branch review package.
