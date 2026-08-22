# Task 1 — Toy Body ECU, virtual terminal, session API, and CAN events

## Implementation

- Added a pure `DoorBlackboxSession` domain with frozen result dataclasses,
  reset state, Toy ECU validation order, Toy IDS sequence evaluation, noisy
  static captures, and an intentionally fixed virtual-terminal whitelist.
  Learner text is parsed as a small grammar only; it is never passed to a
  shell, `eval`, or `exec`.
- Added in-memory UUID session REST endpoints beneath
  `/labs/door-blackbox/sessions` for create, read, reset, terminal, and script
  execution. Request bodies have Pydantic size limits.
- Added event metadata arguments to `can.build_event` and `can.emit`. Loopback
  broadcasts metadata immediately; SocketCAN preserves it until the matching
  `candump` observation is forwarded.
- Emitted CAN events only for ECU attempts with `EXECUTED`. Blocked attempts
  remain in the API response and cannot enter the vehicle state event path.
- Included the lab router in `server/main.py`, listed pytest/httpx developer
  dependencies, and made the pre-existing POSIX PTY terminal import lazy so
  the non-PTY API/CAN routes load on Windows.

## Files

- Created `server/labs/__init__.py`
- Created `server/labs/door_blackbox.py`
- Created `server/routers/labs.py`
- Created `server/tests/test_door_blackbox.py`
- Created `server/tests/test_labs_api.py`
- Created `server/requirements-dev.txt`
- Modified `server/routers/can.py`
- Modified `server/main.py`
- Modified `server/routers/terminal.py`

## TDD record

### Domain RED

```powershell
.venv\Scripts\python -m pytest server\tests\test_door_blackbox.py -q
```

Relevant output:

```text
ModuleNotFoundError: No module named 'server.labs'
1 error during collection
```

### Domain GREEN

```powershell
.venv\Scripts\python -m pytest server\tests\test_door_blackbox.py -q
```

Relevant output:

```text
.........                                                                [100%]
9 passed in 0.06s
```

### API and metadata RED

```powershell
.venv\Scripts\python -m pytest server\tests\test_labs_api.py -q
```

Relevant initial output:

```text
ImportError: cannot import name 'labs' from 'server.routers'
1 error during collection
```

After the router existed, the same test exposed an existing Windows import
coupling at `can.py -> terminal.py -> terminal_service.py -> fcntl`. The
minimal root-cause fix was to import the POSIX PTY service only inside the
terminal WebSocket handler; the door lab does not use that handler.

The SocketCAN metadata bridge was then test-first added. Its RED output was:

```text
AttributeError: module 'server.routers.can' has no attribute '_pending_metadata'
1 failed, 4 passed
```

### API and metadata GREEN

```powershell
.venv\Scripts\python -m pytest server\tests\test_labs_api.py -q
```

Relevant output:

```text
.....                                                                    [100%]
5 passed, 1 warning in 0.81s
```

## Final verification

```powershell
.venv\Scripts\python -m pytest server\tests -q
.venv\Scripts\python -m compileall -q server
git diff --check
.venv\Scripts\python -c "from server.main import app; print(sorted(app.openapi()['paths']))"
```

Relevant output:

```text
..............                                                           [100%]
14 passed, 1 warning in 0.82s
['/can/door', '/can/send', '/can/snapshot', '/can/status', '/can/trunk',
 '/health', '/labs/door-blackbox/sessions',
 '/labs/door-blackbox/sessions/{session_id}',
 '/labs/door-blackbox/sessions/{session_id}/reset',
 '/labs/door-blackbox/sessions/{session_id}/run',
 '/labs/door-blackbox/sessions/{session_id}/terminal']
```

`compileall` and `git diff --check` exited 0 with no output. A focused static
scan of the new lab code found no `eval(`, `exec(`, `shell=True`,
`create_subprocess_shell`, or `subprocess.run(` use.

## Self-review

- `public_state()` has an exact eight-key public contract and tests reject
  checksum/counter/seed answer leakage.
- The virtual terminal is a string-equality/regular-expression whitelist; it
  never creates a process.
- The API tests prove a rejected checksum attempt is returned but produces no
  emitter call; accepted frames carry the required Toy ECU/IDS metadata.
- SocketCAN metadata is queued by normalized ID/data and consumed once when
  its matching observation is received; loopback emits it directly.
- The result dataclasses are frozen. The public-state dictionaries are freshly
  constructed at each call, so callers do not receive mutable internal ECU
  state.

## Limits and concerns

- The installed FastAPI/Starlette `TestClient` emits one upstream
  `StarletteDeprecationWarning` about its `httpx` integration. It does not
  affect the 14 passing assertions, but should be revisited when dependencies
  are upgraded.
- SocketCAN metadata behavior is unit tested at the observation bridge, not
  against a live `vcan0` interface in this Windows workspace.
- The original real PTY terminal remains POSIX-only when its WebSocket is
  actually opened; this task deliberately uses the new restricted virtual
  terminal instead.

## Review correction TDD record

An independent review identified four concrete regressions. Each was added as
a test before its production change, then rerun green.

### 1. Reset must remove the accepted door replay snapshot

RED command:

```powershell
.venv\Scripts\python -m pytest server\tests\test_labs_api.py -q
```

Relevant RED output:

```text
test_reset_clears_accepted_door_snapshot_before_a_browser_reconnects
assert ['{"eventId": ... "replay": true}'] == []
1 failed, 5 passed
```

GREEN command (same focused command) produced:

```text
6 passed, 1 warning
```

`clear_frame_snapshot("0x101")` now removes just the Toy-door replay event
and matching unobserved SocketCAN metadata. `POST .../reset` still returns the
existing public `vehicleState: closed` value, which is the frontend reset
contract; no private protocol state is exposed.

### 2. Terminal `cansend` must emit accepted frames, never blocked frames

RED command:

```powershell
.venv\Scripts\python -m pytest server\tests\test_labs_api.py -q
```

Relevant RED output:

```text
test_terminal_cansend_emits_an_accepted_toy_frame
IndexError: list index out of range
1 failed, 7 passed
```

GREEN command (same focused command) produced:

```text
8 passed, 1 warning
```

The terminal route now receives the same emitter dependency as script runs
and emits only a `FrameAttempt.accepted` frame. Its blocked-frame regression
test asserts that the emitter list stays empty.

### 3. A valid frame after replay failure must advance the stage

RED command:

```powershell
.venv\Scripts\python -m pytest server\tests\test_door_blackbox.py -q
```

Relevant RED output:

```text
test_valid_frame_after_replay_failure_advances_out_of_replay_stage
AssertionError: assert 'Replay 실패' == 'IDS 검증'
1 failed, 9 passed
```

GREEN command (same focused command) produced:

```text
10 passed in 0.06s
```

The stage now derives from the latest verdict, rather than searching the full
verdict history.

### 4. SocketCAN pending metadata keys must be normalized

RED command:

```powershell
.venv\Scripts\python -m pytest server\tests\test_labs_api.py -q
```

Relevant RED output:

```text
test_socketcan_emit_normalizes_pending_metadata_key
KeyError: 'monitoring'
1 failed, 8 passed
```

GREEN command (same focused command) produced:

```text
9 passed, 1 warning
```

SocketCAN enqueue keys now use `normalize_can_id()` and `normalize_data()`;
the test exercises `emit("101", ["b7"])` and the normalized candump echo.

## Corrected final verification

```powershell
.venv\Scripts\python -m pytest server\tests -q
.venv\Scripts\python -m compileall -q server
git diff --check
```

Relevant output:

```text
...................                                                      [100%]
19 passed, 1 warning in 0.86s
```

`compileall` and `git diff --check` exited 0 with no output. The sole warning
remains the upstream FastAPI/Starlette `TestClient` deprecation warning.

## Task 3 upstream correction

### Scope and implementation

- Moved the private Toy Body ECU target and its static captures to lab-only
  `0x456`. The existing public `/can/door` and tutorial `0x101` mapping were
  not changed. Accepted lab events still use `context.command: DOOR_LOCK`, so
  the vehicle command binding, rather than a private lab raw-ID mapping,
  drives the visualization.
- A new session and a reset now clear only the `0x456` replay snapshot and its
  pending SocketCAN metadata. They preserve unrelated CAN snapshots such as
  public `0x101` door state.
- Added optional `lab` metadata to CAN event construction/emission, retained
  through both loopback and SocketCAN pending-metadata bridges. Accepted lab
  events include `labId: door-blackbox-v1` and the opaque session ID.
- Changed loopback event timestamps to epoch milliseconds. Script and terminal
  attempts now return `attemptId`, epoch-millisecond `timestamp`, `canId`,
  `data`, and `verdict`; script timestamps follow `interval_ms`, while capture
  timestamps retain the candump source time.
- Updated the lab specification to document the isolated ID, snapshot contract,
  attempt response fields, epoch timestamps, and lab correlation metadata.

### RED — domain target and attempt contract

```powershell
.venv\Scripts\python -m pytest server\tests\test_door_blackbox.py -q
```

Relevant output before implementation:

```text
TARGET_ID_MISMATCH != COUNTER_REJECTED
TypeError: DoorBlackboxSession.__init__() got an unexpected keyword argument 'clock_ms'
10 failed, 3 passed
```

GREEN (same focused command):

```text
13 passed in 0.06s
```

An additional same-session reset uniqueness regression then passed with the
focused domain suite at `14 passed in 0.07s`.

### RED — API/CAN snapshot, metadata, and timestamp contract

```powershell
.venv\Scripts\python -m pytest server\tests\test_labs_api.py -q
```

Relevant output before implementation:

```text
AttributeError: module 'server.routers.can' has no attribute 'time'
TypeError: emit() got an unexpected keyword argument 'lab'
assert {'canId', 'data', 'verdict'} == {'attemptId', 'timestamp', ...}
assert '0x456' not in can._last_frames
7 failed, 6 passed
```

The first implementation run also exposed a `NameError` in the script route:
the session had been used for metadata after an inline lookup discarded it.
The same route regression test reproduced it; assigning the looked-up session
once at the boundary fixed that single cause.

GREEN (same focused command):

```text
13 passed, 1 warning in 0.78s
```

### Final verification

```powershell
.venv\Scripts\python -m pytest server\tests -q
.venv\Scripts\python -m compileall -q server
git diff --check
```

Relevant output:

```text
...........................                                              [100%]
27 passed, 1 warning in 0.78s
```

`compileall` and `git diff --check` exited 0 with no output. The sole warning
is the existing FastAPI/Starlette `TestClient` deprecation warning. No frontend
production file was changed in this correction.

## Task 3 reset-generation correction

### Scope and implementation

- Added the non-secret `generation` integer to `DoorBlackboxSession`: a new
  session starts at `0`, and each reset increments it while preserving the
  opaque `sessionId`. The public session state now exposes only this lifecycle
  marker in addition to the existing non-secret state.
- Each `FrameAttempt` snapshots its processing-time generation. This includes
  scripted frames, candump capture frames, and virtual-terminal frames, so a
  reset that happens after an attempt is created cannot relabel it.
- Accepted event correlation metadata now includes
  `{labId, sessionId, generation}`. The router derives `generation` from the
  frozen attempt rather than reading current session state during emission.
  BLOCKED and OBSERVED attempts remain non-emitting.
- Updated the black-box lab protocol specification with the generation/reset
  and delayed-event correlation contract. No frontend production file changed.

### RED — generation lifecycle and attempt freeze

```powershell
.venv\Scripts\python -m pytest server\tests\test_door_blackbox.py -q
```

Relevant output before implementation:

```text
.........FFFF....                                                        [100%]
4 failed, 13 passed in 0.18s
```

The failures showed the missing public `generation` key, `KeyError` when
reading it, and the missing `FrameAttempt.generation` field.

GREEN (same focused command):

```text
.................                                                        [100%]
17 passed in 0.05s
```

### RED — API metadata and no-emission contract

```powershell
.venv\Scripts\python -m pytest server\tests\test_labs_api.py -q
```

Relevant output before implementation:

```text
.....F...F..F...                                                         [100%]
3 failed, 13 passed, 1 warning in 1.17s
```

All three failures were missing `generation: 0` from accepted event `lab`
metadata, including the run that resets between delayed emissions.

GREEN (same focused command):

```text
................                                                         [100%]
16 passed, 1 warning in 1.01s
```

### Final verification

```powershell
.venv\Scripts\python -m pytest server\tests -q
.venv\Scripts\python -m compileall -q server
git diff --check
```

Relevant output:

```text
.................................                                        [100%]
33 passed, 1 warning in 1.04s
```

`compileall` and `git diff --check` exited 0 with no output. The sole warning
remains the upstream FastAPI/Starlette `TestClient` deprecation warning.
