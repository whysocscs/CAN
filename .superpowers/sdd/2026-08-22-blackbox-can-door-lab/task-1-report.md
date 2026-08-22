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
