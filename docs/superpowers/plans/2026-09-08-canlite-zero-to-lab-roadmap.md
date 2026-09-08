# CANLite Zero-to-Lab Roadmap Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the existing guided CAN attack labs, add a complete beginner-to-1-day learning roadmap, and leave the isolated lab branch runnable without changing `main`.

**Architecture:** Keep the existing in-memory Toy ECU/Toy IDS and authoritative vehicle-flow trace unchanged. Add human documentation only, correct the Windows launch examples, then validate the existing backend, frontend, Compose definition, and browser flow as independent evidence.

**Tech Stack:** Markdown, React 19, TypeScript, Vite, FastAPI, pytest, Vitest, Docker Compose

**Spec:** `docs/superpowers/specs/2026-09-08-canlite-zero-to-lab-roadmap.md`

## Global Constraints

- Work only on `feat/can-replay-glb-lab`; do not commit, merge, or push `main`.
- Keep all exercises on localhost, `CANLITE_CAN_MODE=loopback`, `vcan`, or an owned isolated lab.
- Label current attacks as Toy educational models, not OEM/CVE/physical-vehicle proof.
- Prefer official standards, official documentation, and official upstream repositories.
- Human-facing prose does not receive source-text tests; verify links, commands, builds, APIs, and rendered behavior instead.
- Keep learner material and answer-bearing instructor material visibly separated.

---

### Task 1: Beginner-to-1-day learning roadmap

**Files:**
- Create: `docs/learning/canlite-zero-to-lab-roadmap.md`

**Interfaces:**
- Consumes: the safety and Toy-contract boundaries from `docs/superpowers/specs/2026-08-22-blackbox-can-door-lab.md` and `docs/superpowers/specs/2026-08-23-can-attack-basics-expansion.md`
- Produces: one stable roadmap link for `README.md`

- [ ] **Step 1: Write the safety boundary and current-platform mental model**

Explain owned/isolated targets, the limitation of `vcan`, the distinction between virtual terminal and host shell, and this flow:

```text
learner command → FastAPI whitelist parser → Toy IDS/Gateway/ECU decision
→ authoritative flow trace → WebSocket monitor event → React state → GLB effect
```

- [ ] **Step 2: Write the prerequisite restoration modules**

Cover PowerShell/WSL/Linux shell, process and exit status, IP/ports, SocketCAN/vcan, and `can-utils`. Every module must contain `목표`, `실습`, `관찰할 증거`, `완료 기준`, and `스스로 답할 질문`.

- [ ] **Step 3: Write the CAN security reasoning modules**

Cover signal/message contract, producer versus inferred source, gateway trust boundary, Body ECU state, Spoofing, Replay, DoS, freshness, IDS detection versus prevention, threat modeling, and common false conclusions.

- [ ] **Step 4: Write the platform-development modules**

Cover Python decoding, `asyncio`, FastAPI/WebSocket, TypeScript/React state, Three.js/R3F/GLB node mapping, logs/correlation IDs, pytest/Vitest/browser tests, Docker isolation, and failure diagnosis.

- [ ] **Step 5: Write the extension modules**

Separate ISO-TP/UDS, DoIP, SOME/IP, keyless/RF-to-CAN modeling, and an ASan/GDB 1-day workflow. State entry criteria and prohibit claims beyond observed evidence.

- [ ] **Step 6: Verify the document mechanically**

Run:

```powershell
rg -n "실제 차량|vcan|candump|cansend|canplayer|Spoofing|Replay|FastAPI|WebSocket|GLB|Docker|UDS|DoIP|SOME/IP|ASan|GDB" docs\learning\canlite-zero-to-lab-roadmap.md
```

Expected: every required topic has at least one substantive section; no empty heading or placeholder is present.

- [ ] **Step 7: Commit**

```powershell
git add docs/learning/canlite-zero-to-lab-roadmap.md
git commit -m "docs: add CANLite zero-to-lab learning roadmap"
```

### Task 2: Discoverability and correct Windows launch commands

**Files:**
- Modify: `README.md`

**Interfaces:**
- Consumes: `docs/learning/canlite-zero-to-lab-roadmap.md`
- Produces: a clickable roadmap entry and PowerShell commands that invoke `.exe` paths correctly

- [ ] **Step 1: Add the roadmap link under learning documentation**

Label the new document as the starting point for learners who know only the CAN frame structure.

- [ ] **Step 2: Correct PowerShell executable invocation**

Use the call operator in commands containing a path:

```powershell
& .\.venv\Scripts\python.exe -m pip install -r server\requirements.txt -r server\requirements-dev.txt
& .\.venv\Scripts\python.exe -m uvicorn server.main:app --host 127.0.0.1 --port 8010
```

- [ ] **Step 3: Check changed documentation**

Run:

```powershell
git diff --check
rg -n "zero-to-lab|\.venv\\Scripts\\python\.exe" README.md
```

Expected: no whitespace errors; the roadmap link and both corrected executable invocations are present.

- [ ] **Step 4: Commit**

```powershell
git add README.md
git commit -m "docs: link beginner roadmap and fix PowerShell launch"
```

### Task 3: Runtime and learning-flow verification

**Files:**
- Verify only: `server/tests`, `src/**/*.test.*`, `compose.yaml`, rendered `attacks/replay`

**Interfaces:**
- Consumes: existing application and the commands documented by Tasks 1–2
- Produces: fresh pass/fail evidence; no source change unless a separate failing test first proves a defect

- [ ] **Step 1: Run backend verification**

```powershell
& .\.venv\Scripts\python.exe -m pytest server\tests -q
& .\.venv\Scripts\python.exe -m compileall -q server
```

Expected: pytest reports zero failures and compileall exits `0`.

- [ ] **Step 2: Run frontend verification**

```powershell
pnpm test
pnpm typecheck
pnpm build
```

If the default parallel Vitest run times out under constrained I/O, rerun unchanged tests with `pnpm exec vitest run --maxWorkers=1` and report both outcomes rather than hiding the first result.

- [ ] **Step 3: Validate Compose syntax**

```powershell
docker compose config --quiet
```

Expected: exit `0`. A stopped Docker daemon blocks container startup but does not invalidate syntax validation.

- [ ] **Step 4: Start the local services**

Backend environment is exactly `CANLITE_CAN_MODE=loopback` and `CANLITE_ENABLE_REAL_TERMINAL=false`. Start FastAPI at `127.0.0.1:8010` and Vite ver4 at `127.0.0.1:8447`.

- [ ] **Step 5: Exercise Guided Replay in the browser**

Open `http://127.0.0.1:8447`, navigate to `공격 실습 → Replay`, select Guided mode, capture to `capture.log`, inspect it, run the recorded replay, and advance exactly one node per click until the GLB Left Door endpoint.

- [ ] **Step 6: Collect evidence**

Verify page identity, no framework overlay, console health, backend `/health`, capture-before-replay negative route, monitor/binary-inspector correlation, node order, and no GLB effect before the endpoint. Record any unverified item explicitly.

