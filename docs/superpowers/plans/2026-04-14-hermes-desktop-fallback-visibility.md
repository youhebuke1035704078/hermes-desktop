# Hermes Desktop Fallback Visibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add end-to-end fallback_model visibility to hermes-desktop across both `hermes-rest` and `acp-ws` connection modes, so that when hermes-agent silently switches from primary to fallback model, the user immediately sees a badge update, a toast, and a per-message chip.

**Architecture:** Unified Python callback in hermes-agent (`lifecycle_event_callback`) fires on 3 transition events → per-transport relay in `api_server.py` (streaming SSE named events + non-stream headers/body + asyncio `/v1/runs` queue) → unified Pinia `useModelStore` on the desktop with tagged-union state → three UI surfaces (AppHeader badge with popover, per-message footer chip, toast).

**Tech Stack:**
- Agent: Python 3.11+, pytest, asyncio, stdlib `queue.Queue`
- Desktop: TypeScript, Vue 3, Pinia, NaiveUI, vitest, Electron (main + preload + renderer)

**Spec:** `docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md`

---

## Repository Roots

Two repos are touched:
- **`<HA>`** = `/Users/youhebuke/.hermes/hermes-agent` (Python agent)
- **`<HD>`** = `/Users/youhebuke/hermes-desktop` (Electron + Vue desktop)

Each task specifies which repo via `<HA>` or `<HD>` prefix.

**Test commands:**
- Agent: `uv run pytest <path>::<test_name> -v` (from `<HA>`)
- Desktop: `npm run test -- <path>` (from `<HD>`, uses vitest)
- Desktop typecheck: `npm run typecheck` (from `<HD>`)

---

## File Structure

### hermes-agent (`<HA>`)

| File | Responsibility | Status |
|---|---|---|
| `run_agent.py` | Add `lifecycle_event_callback` field, `_emit_lifecycle_event` helper, wire emission into 3 transition points, add `_emit_chain_exhausted` | modify |
| `gateway/platforms/api_server.py` | Relay lifecycle events on streaming SSE, non-stream headers+body, and `/v1/runs` endpoint | modify |
| `tests/run_agent/test_provider_fallback.py` | New `TestLifecycleEventEmission` class (8 tests) | modify |
| `tests/gateway/test_api_server_fallback.py` | New 9 transport tests | create |
| `tests/integration/test_fallback_end_to_end.py` | 1 full-pipeline test | create |
| `tests/conftest.py` | `lifecycle_capture` fixture | modify |

### hermes-desktop (`<HD>`)

**Main process / preload:**
| File | Responsibility | Status |
|---|---|---|
| `src/main/sse-parser.ts` | Pure `parseSseLine` function (extracted for testability) | create |
| `src/main/sse-parser.test.ts` | 9 parser tests | create |
| `src/main/index.ts` | `yaml.load` refactor for `hermes:config`; SSE parser integration; `hermes:lifecycle` IPC channel | modify |
| `src/preload/index.ts` | Expose `onHermesLifecycle`, typed `hermesConfig` | modify |

**Renderer state:**
| File | Responsibility | Status |
|---|---|---|
| `src/renderer/src/api/types/index.ts` | Extend `ChatMessage`, add `FallbackActivatedPayload` / `PrimaryRestoredPayload` / `ChainExhaustedPayload` | modify |
| `src/renderer/src/stores/model.ts` | Full rewrite: tagged-union `ModelState` with 5 mutations | modify |
| `src/renderer/src/stores/model.test.ts` | 12 store tests | create |
| `src/renderer/src/stores/notification.ts` | Toast notification store | create |
| `src/renderer/src/stores/chat.ts` | Mid-stream sync watcher in `sendMessage`; non-stream path reads `_hermes_meta` | modify |
| `src/renderer/src/stores/connection.ts` | Call `modelStore.markStale()` on disconnect | modify |

**Renderer composables:**
| File | Responsibility | Status |
|---|---|---|
| `src/renderer/src/composables/useModelStoreBootstrap.ts` | Wire up bootstrap + live event subscription + toast debounce | create |
| `src/renderer/src/composables/useModelStoreBootstrap.test.ts` | 6 composable tests | create |

**Renderer components:**
| File | Responsibility | Status |
|---|---|---|
| `src/renderer/src/components/layout/ModelStateBadge.vue` | AppHeader top-right badge (Hybrid C visual) | create |
| `src/renderer/src/components/layout/ModelDropdown.vue` | Popover content (D-B chain + reason) | create |
| `src/renderer/src/components/layout/ModelToast.vue` | Toast item template (T-A top-right, detailed) | create |
| `src/renderer/src/components/layout/NotificationLayer.vue` | Toast host (Teleport to body) | create |
| `src/renderer/src/components/chat/FallbackChip.vue` | Per-message footer chip (style A) | create |
| `src/renderer/src/components/layout/AppHeader.vue` | Insert `ModelStateBadge` | modify |
| `src/renderer/src/views/chat/ChatPage.vue` | Insert `FallbackChip` into `.chat-bubble-meta` | modify |
| `src/renderer/src/App.vue` | Call `useModelStoreBootstrap()`, mount `<NotificationLayer>` | modify |

**Test fixtures:**
| File | Responsibility | Status |
|---|---|---|
| `src/renderer/src/test-utils/sse-fixtures.ts` | Payload factories + `makeSSELines` | create |

Total: **~28 files** (16 new + 12 modified) across both repos.

---

## Part A — Agent core (`<HA>/run_agent.py`)

### Task A1: Add `lifecycle_event_callback` field and `_emit_lifecycle_event` helper

**Files:**
- Modify: `<HA>/run_agent.py` (add field to `AIAgent.__init__`, add method)
- Modify: `<HA>/tests/conftest.py` (add `lifecycle_capture` fixture)
- Test: `<HA>/tests/run_agent/test_provider_fallback.py` (add `TestLifecycleEventEmission` class)

- [ ] **Step 1: Add the `lifecycle_capture` fixture to conftest.py**

Append to `<HA>/tests/conftest.py`:

```python
@pytest.fixture
def lifecycle_capture():
    """Capture lifecycle events emitted by an agent.

    Usage:
        def test_something(lifecycle_capture):
            events, cb = lifecycle_capture
            agent.lifecycle_event_callback = cb
            ...
            assert events[0][0] == "hermes.model.fallback_activated"
    """
    events: list[tuple[str, dict]] = []
    def cb(event_type: str, payload: dict) -> None:
        events.append((event_type, payload))
    return events, cb
```

- [ ] **Step 2: Write the failing test — no callback registered is a no-op**

Open `<HA>/tests/run_agent/test_provider_fallback.py`, find an appropriate insertion point after the existing test classes, and append:

```python
class TestLifecycleEventEmission:
    """Tests for the new lifecycle_event_callback channel (spec §2)."""

    def test_no_callback_registered_does_not_crash(self):
        agent = self._make_agent()
        agent.lifecycle_event_callback = None
        # Should not raise
        agent._emit_lifecycle_event(
            "hermes.model.fallback_activated",
            {"from_model": "x"},
        )

    def _make_agent(self):
        """Reuse pattern from existing test classes in this file."""
        # NOTE: copy the _make_agent helper from the nearest existing test class
        # (e.g. TestFallbackChainInit) if it's not already shared. If it IS
        # shared via a fixture or base class, just use it directly.
        raise NotImplementedError("copy from existing test helper")
```

After pasting, look at existing test classes (e.g. `TestFallbackChainInit`) and **replace the `_make_agent` body with an identical copy** of what they use. This keeps all lifecycle tests consistent with the rest of the file.

- [ ] **Step 3: Run the test and verify RED**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py::TestLifecycleEventEmission::test_no_callback_registered_does_not_crash -v
```

Expected: FAIL with `AttributeError: 'AIAgent' object has no attribute 'lifecycle_event_callback'` OR `_emit_lifecycle_event` not found.

- [ ] **Step 4: Add the field to `AIAgent.__init__`**

In `<HA>/run_agent.py`, find `AIAgent.__init__`. After the line that initializes `self.status_callback`, add:

```python
        self.lifecycle_event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None
```

Ensure `Optional`, `Callable`, `Dict`, `Any` are imported from `typing` at the top of the file (they almost certainly already are).

- [ ] **Step 5: Add the event-type constants near the top of `run_agent.py`**

Near the top of `<HA>/run_agent.py` (after imports, before class definitions), add:

```python
# --- Lifecycle event names (consumed by api_server.py and desktop clients) ---
LIFECYCLE_EVENT_FALLBACK_ACTIVATED = "hermes.model.fallback_activated"
LIFECYCLE_EVENT_PRIMARY_RESTORED   = "hermes.model.primary_restored"
LIFECYCLE_EVENT_CHAIN_EXHAUSTED    = "hermes.model.chain_exhausted"
```

- [ ] **Step 6: Add the `_emit_lifecycle_event` helper method**

Add this method to the `AIAgent` class (near `_try_activate_fallback` or at the end of the class):

```python
    def _emit_lifecycle_event(self, event_type: str, payload: Dict[str, Any]) -> None:
        """Emit a lifecycle event to the registered callback.

        - Always stamps schema_version=1 and ISO timestamp if not present
        - Swallows callback exceptions so a buggy consumer cannot crash the agent loop
        - No-op when callback is None
        """
        if self.lifecycle_event_callback is None:
            return

        full_payload = {
            "schema_version": 1,
            "timestamp": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
            **payload,
        }

        try:
            self.lifecycle_event_callback(event_type, full_payload)
        except Exception as exc:
            logger.warning(
                "lifecycle_event_callback raised %s (event=%s) — swallowed",
                type(exc).__name__, event_type,
            )
```

Ensure `datetime`, `timezone` are imported (`from datetime import datetime, timezone`). If not present, add the import.

- [ ] **Step 7: Run the test and verify GREEN**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py::TestLifecycleEventEmission::test_no_callback_registered_does_not_crash -v
```

Expected: PASS.

- [ ] **Step 8: Add test: timestamp and schema_version are stamped**

Append to `TestLifecycleEventEmission`:

```python
    def test_emit_stamps_timestamp_and_schema_version(self, lifecycle_capture):
        events, cb = lifecycle_capture
        agent = self._make_agent()
        agent.lifecycle_event_callback = cb

        agent._emit_lifecycle_event(
            "hermes.model.fallback_activated",
            {"from_model": "a", "to_model": "b"},
        )

        assert len(events) == 1
        _type, payload = events[0]
        assert payload["schema_version"] == 1
        assert payload["from_model"] == "a"
        assert payload["to_model"] == "b"
        # ISO 8601 with Z suffix
        assert "timestamp" in payload
        assert payload["timestamp"].endswith("Z")
```

- [ ] **Step 9: Run both tests and verify GREEN**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py::TestLifecycleEventEmission -v
```

Expected: 2 passed.

- [ ] **Step 10: Add test: callback exceptions are swallowed**

Append:

```python
    def test_callback_exception_is_swallowed(self):
        agent = self._make_agent()
        def raising_callback(t, p):
            raise RuntimeError("broken consumer")
        agent.lifecycle_event_callback = raising_callback
        # Must not raise
        agent._emit_lifecycle_event(
            "hermes.model.fallback_activated",
            {"from_model": "x"},
        )
```

- [ ] **Step 11: Run and verify GREEN**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py::TestLifecycleEventEmission -v
```

Expected: 3 passed.

- [ ] **Step 12: Commit**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
git add run_agent.py tests/conftest.py tests/run_agent/test_provider_fallback.py
git commit -m "$(cat <<'EOF'
feat(agent): add lifecycle_event_callback channel

Introduce a new structured event channel on AIAgent, separate from
status_callback (which has an existing IM-platform text contract that
cannot be broken). Consumers register a callback(event_type, payload)
and receive fallback/restore/exhausted events with schema_version=1 and
ISO timestamps. Callback exceptions are swallowed.

Part A1 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task A2: Emit `fallback_activated` from `_try_activate_fallback`

**Files:**
- Modify: `<HA>/run_agent.py` (change signature of `_try_activate_fallback`, add emission, update call sites)
- Test: `<HA>/tests/run_agent/test_provider_fallback.py`

- [ ] **Step 1: Write the failing test — correct payload**

Append to `TestLifecycleEventEmission`:

```python
    def test_fallback_activated_emitted_with_correct_payload(self, lifecycle_capture):
        from unittest.mock import MagicMock
        events, cb = lifecycle_capture
        agent = self._make_agent()
        agent.lifecycle_event_callback = cb

        # Stub runtime state so _try_activate_fallback can advance
        agent._fallback_chain = ["gpt-5.4", "gemini-2.5-pro"]
        agent._fallback_index = 0
        agent._current_runtime = MagicMock(model="gpt-5.4", provider="openai")
        agent._runtimes = [
            MagicMock(model="gpt-5.4", provider="openai"),
            MagicMock(model="gemini-2.5-pro", provider="google"),
        ]

        activated = agent._try_activate_fallback("auth_failed", "401 Unauthorized")

        assert activated is True
        assert len(events) == 1
        event_type, payload = events[0]
        assert event_type == "hermes.model.fallback_activated"
        assert payload["from_model"] == "gpt-5.4"
        assert payload["to_model"] == "gemini-2.5-pro"
        assert payload["from_provider"] == "openai"
        assert payload["to_provider"] == "google"
        assert payload["reason_code"] == "auth_failed"
        assert payload["reason_text"] == "401 Unauthorized"
        assert payload["fallback_chain"] == ["gpt-5.4", "gemini-2.5-pro"]
        assert payload["fallback_index"] == 1
```

- [ ] **Step 2: Run and verify RED**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py::TestLifecycleEventEmission::test_fallback_activated_emitted_with_correct_payload -v
```

Expected: FAIL. Exact error depends on current signature — likely `TypeError: _try_activate_fallback() takes 1 positional argument but 3 were given` or similar.

- [ ] **Step 3: Change `_try_activate_fallback` signature**

Find `_try_activate_fallback` in `<HA>/run_agent.py`. Change its signature to accept `reason_code: str, reason_text: str`:

```python
    def _try_activate_fallback(self, reason_code: str, reason_text: str) -> bool:
```

Inside the method, just before the tail call or `return True` statement (wherever the method commits to the transition — look for where `self._fallback_activated = True` is set or where `self._fallback_index` is advanced), capture the previous model state BEFORE the advance:

```python
        # Capture previous state for the lifecycle event
        previous_model = self._current_runtime.model
        previous_provider = self._current_runtime.provider
```

AFTER `self._current_runtime` is updated and `self._fallback_activated = True`, add:

```python
        self._emit_lifecycle_event(
            LIFECYCLE_EVENT_FALLBACK_ACTIVATED,
            {
                "from_model": previous_model,
                "to_model": self._current_runtime.model,
                "from_provider": previous_provider,
                "to_provider": self._current_runtime.provider,
                "reason_code": reason_code,
                "reason_text": reason_text[:200],  # clamp per spec
                "fallback_chain": list(self._fallback_chain),
                "fallback_index": self._fallback_index,
            },
        )
```

- [ ] **Step 4: Update all callers of `_try_activate_fallback`**

Search for all call sites in `<HA>/run_agent.py`:

```bash
cd /Users/youhebuke/.hermes/hermes-agent
grep -n "_try_activate_fallback" run_agent.py
```

For each call site, supply `reason_code` and `reason_text`. If the call site has a caught exception, derive them:

```python
        except Exception as exc:
            reason_code = getattr(exc, "reason_code", "other")
            reason_text = str(exc)
            if self._try_activate_fallback(reason_code, reason_text):
                # retry tail call
                ...
```

If the caller doesn't have a structured exception object, use sensible defaults:
- HTTP 401/403 → `"auth_failed"`
- HTTP 429 → `"rate_limited"`
- HTTP 5xx → `"server_error"`
- Network error / timeout → `"network_error"` or `"timeout"`
- Anything else → `"other"`

If there's only one such caller and the error classification is already done upstream, pass the pre-classified code.

- [ ] **Step 5: Run the test and verify GREEN**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py::TestLifecycleEventEmission::test_fallback_activated_emitted_with_correct_payload -v
```

Expected: PASS.

- [ ] **Step 6: Run the WHOLE test file to catch regressions**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py -v
```

Expected: all pre-existing tests still pass + new test passes. If pre-existing tests break due to the signature change, check whether they call `_try_activate_fallback` directly (unlikely but possible). If they do, update their calls to pass `"other", "test"`.

- [ ] **Step 7: Add test — no event when chain is exhausted and activation fails**

Append:

```python
    def test_try_activate_returns_false_and_no_event_when_exhausted(self, lifecycle_capture):
        from unittest.mock import MagicMock
        events, cb = lifecycle_capture
        agent = self._make_agent()
        agent.lifecycle_event_callback = cb
        agent._fallback_chain = ["only-one"]
        agent._fallback_index = 0
        agent._current_runtime = MagicMock(model="only-one", provider="openai")
        agent._runtimes = [MagicMock(model="only-one", provider="openai")]

        result = agent._try_activate_fallback("auth_failed", "401")

        assert result is False
        assert len(events) == 0  # no fallback_activated event on failed activation
```

- [ ] **Step 8: Run and verify GREEN**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py::TestLifecycleEventEmission -v
```

Expected: all tests pass.

- [ ] **Step 9: Add test — reason_text clamped to 200 chars**

Append:

```python
    def test_reason_text_clamped_to_200_chars(self, lifecycle_capture):
        from unittest.mock import MagicMock
        events, cb = lifecycle_capture
        agent = self._make_agent()
        agent.lifecycle_event_callback = cb
        agent._fallback_chain = ["a", "b"]
        agent._fallback_index = 0
        agent._current_runtime = MagicMock(model="a", provider="p1")
        agent._runtimes = [
            MagicMock(model="a", provider="p1"),
            MagicMock(model="b", provider="p2"),
        ]
        huge_reason = "X" * 500

        agent._try_activate_fallback("other", huge_reason)

        assert len(events[0][1]["reason_text"]) == 200
```

- [ ] **Step 10: Run and verify GREEN**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py::TestLifecycleEventEmission -v
```

Expected: all pass.

- [ ] **Step 11: Commit**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
git add run_agent.py tests/run_agent/test_provider_fallback.py
git commit -m "$(cat <<'EOF'
feat(agent): emit fallback_activated lifecycle event

Extend _try_activate_fallback signature with (reason_code, reason_text)
and emit hermes.model.fallback_activated via the new callback channel
when a transition succeeds. Includes fallback_chain, fallback_index,
and from/to model+provider fields for the desktop consumer.

Reason text clamped to 200 chars per spec.

Part A2 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task A3: Emit `primary_restored` from `_restore_primary_runtime`

**Files:**
- Modify: `<HA>/run_agent.py` (add emission in `_restore_primary_runtime`)
- Test: `<HA>/tests/run_agent/test_provider_fallback.py`

- [ ] **Step 1: Write the failing test — emission when restoring**

Append to `TestLifecycleEventEmission`:

```python
    def test_primary_restored_emitted_on_restore(self, lifecycle_capture):
        from unittest.mock import MagicMock
        events, cb = lifecycle_capture
        agent = self._make_agent()
        agent.lifecycle_event_callback = cb

        # Set up a fallback state to restore FROM
        agent._fallback_activated = True
        agent._fallback_index = 1
        agent._current_runtime = MagicMock(model="gemini-2.5-pro")
        agent._primary_runtime = MagicMock(model="gpt-5.4")

        agent._restore_primary_runtime()

        restore_events = [e for e in events if e[0] == "hermes.model.primary_restored"]
        assert len(restore_events) == 1
        payload = restore_events[0][1]
        assert payload["restored_to"] == "gpt-5.4"
        assert payload["restored_from"] == "gemini-2.5-pro"
        assert payload["primary_model"] == "gpt-5.4"
```

- [ ] **Step 2: Write the failing test — no emission when never fell back**

Append:

```python
    def test_primary_restored_not_emitted_when_never_fell_back(self, lifecycle_capture):
        events, cb = lifecycle_capture
        agent = self._make_agent()
        agent.lifecycle_event_callback = cb
        agent._fallback_activated = False

        agent._restore_primary_runtime()

        assert len(events) == 0
```

- [ ] **Step 3: Run both tests and verify RED**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py::TestLifecycleEventEmission::test_primary_restored_emitted_on_restore tests/run_agent/test_provider_fallback.py::TestLifecycleEventEmission::test_primary_restored_not_emitted_when_never_fell_back -v
```

Expected: `test_primary_restored_emitted_on_restore` FAILS (no event emitted). `test_primary_restored_not_emitted_when_never_fell_back` may already PASS if the current implementation short-circuits when `_fallback_activated` is False.

- [ ] **Step 4: Wire emission in `_restore_primary_runtime`**

Find `_restore_primary_runtime` in `<HA>/run_agent.py`. Add this at the top of the method (short-circuit branch) and at the end (emission branch):

```python
    def _restore_primary_runtime(self) -> None:
        if not self._fallback_activated:
            return  # no-op if we never fell back

        restored_from = self._current_runtime.model
        restored_to = self._primary_runtime.model

        # ... existing restore logic stays here (do NOT duplicate) ...

        self._emit_lifecycle_event(
            LIFECYCLE_EVENT_PRIMARY_RESTORED,
            {
                "restored_to": restored_to,
                "restored_from": restored_from,
                "primary_model": restored_to,
            },
        )
```

**Important:** you must capture `restored_from` BEFORE the existing logic reassigns `self._current_runtime`. The capture lines go at the TOP of the method body (after the short-circuit). The emission goes at the BOTTOM (after `self._fallback_activated = False`).

- [ ] **Step 5: Run and verify GREEN**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py::TestLifecycleEventEmission -v
```

Expected: all tests pass.

- [ ] **Step 6: Run the full test file and check for regressions**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py -v
```

Expected: all pre-existing tests + new tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
git add run_agent.py tests/run_agent/test_provider_fallback.py
git commit -m "$(cat <<'EOF'
feat(agent): emit primary_restored lifecycle event

When _restore_primary_runtime runs after a fallback was active,
emit hermes.model.primary_restored with restored_to/restored_from/
primary_model. No-op when fallback was never active.

Part A3 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task A4: Add `_emit_chain_exhausted` and wire to retry boundaries

**Files:**
- Modify: `<HA>/run_agent.py` (add method, call at 4 retry-boundary sites)
- Test: `<HA>/tests/run_agent/test_provider_fallback.py`

- [ ] **Step 1: Write the failing test — direct call to `_emit_chain_exhausted`**

Append to `TestLifecycleEventEmission`:

```python
    def test_chain_exhausted_emitted_with_attempted_models(self, lifecycle_capture):
        events, cb = lifecycle_capture
        agent = self._make_agent()
        agent.lifecycle_event_callback = cb
        agent._fallback_chain = ["gpt-5.4", "gemini-2.5-pro", "claude-3.5-sonnet"]
        agent._fallback_index = 2  # all tried

        agent._emit_chain_exhausted("server_error", "All models failed: 500/502/503")

        assert len(events) == 1
        event_type, payload = events[0]
        assert event_type == "hermes.model.chain_exhausted"
        assert payload["attempted_models"] == ["gpt-5.4", "gemini-2.5-pro", "claude-3.5-sonnet"]
        assert payload["last_error_code"] == "server_error"
        assert payload["last_error_text"] == "All models failed: 500/502/503"
        assert payload["fallback_chain"] == ["gpt-5.4", "gemini-2.5-pro", "claude-3.5-sonnet"]
```

- [ ] **Step 2: Run and verify RED**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py::TestLifecycleEventEmission::test_chain_exhausted_emitted_with_attempted_models -v
```

Expected: FAIL with `AttributeError: 'AIAgent' object has no attribute '_emit_chain_exhausted'`.

- [ ] **Step 3: Add the `_emit_chain_exhausted` method**

Add near `_emit_lifecycle_event` in `<HA>/run_agent.py`:

```python
    def _emit_chain_exhausted(self, last_error_code: str, last_error_text: str) -> None:
        """Emit hermes.model.chain_exhausted.

        Called at the OUTER retry boundary (not inside _try_activate_fallback,
        which may recurse on tail calls and would double-fire).
        """
        self._emit_lifecycle_event(
            LIFECYCLE_EVENT_CHAIN_EXHAUSTED,
            {
                "attempted_models": list(self._fallback_chain[: self._fallback_index + 1]),
                "last_error_code": last_error_code,
                "last_error_text": last_error_text[:500],
                "fallback_chain": list(self._fallback_chain),
            },
        )
```

- [ ] **Step 4: Run and verify GREEN**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py::TestLifecycleEventEmission::test_chain_exhausted_emitted_with_attempted_models -v
```

Expected: PASS.

- [ ] **Step 5: Wire the emission at retry boundaries**

Find the outer retry boundaries that call `_try_activate_fallback`. These are the `except` blocks where, if activation fails, the agent gives up and re-raises. Use `grep` to find them:

```bash
cd /Users/youhebuke/.hermes/hermes-agent
grep -n "_try_activate_fallback" run_agent.py
```

For each call site that has the pattern:

```python
        try:
            ...
        except SomeError as exc:
            if not self._try_activate_fallback(reason_code, reason_text):
                raise
```

change it to:

```python
        try:
            ...
        except SomeError as exc:
            if not self._try_activate_fallback(reason_code, reason_text):
                self._emit_chain_exhausted(reason_code, str(exc))
                raise
```

Expected: 4 such sites per the spec (chat completion, tool call, streaming chunk, structured output). Some may not be present — only wire the ones that actually exist.

- [ ] **Step 6: Run the full test file to check nothing broke**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py -v
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
git add run_agent.py tests/run_agent/test_provider_fallback.py
git commit -m "$(cat <<'EOF'
feat(agent): emit chain_exhausted lifecycle event

Add _emit_chain_exhausted and call it at outer retry boundaries where
_try_activate_fallback returns False (i.e. no more models to try).
Placed at the boundary rather than inside _try_activate_fallback to
avoid double-firing on recursive tail calls.

Part A4 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Part B — Transport layer (`<HA>/gateway/platforms/api_server.py`)

### Task B1: Stream SSE lifecycle frame relay

**Files:**
- Modify: `<HA>/gateway/platforms/api_server.py` (add `_on_lifecycle_event` closure in `_handle_chat_completions` streaming path, extend SSE emitter loop)
- Modify: `<HA>/gateway/platforms/api_server.py::_create_agent` (accept `lifecycle_event_callback` kwarg and forward to `AIAgent`)
- Test: `<HA>/tests/gateway/test_api_server_fallback.py` (new file)

- [ ] **Step 1: Create the new test file with class scaffolding**

Create `<HA>/tests/gateway/test_api_server_fallback.py`:

```python
"""Tests for lifecycle event relay in api_server.py.

Covers streaming SSE frames, non-stream headers/body, and /v1/runs endpoint.
See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §3.
"""

import json
import pytest
from unittest.mock import MagicMock, patch


class TestSSELifecycleFrames:
    """Streaming /v1/chat/completions SSE path."""
    pass


class TestNonStreamFallbackHeaders:
    """Non-streaming /v1/chat/completions header + _hermes_meta path."""
    pass


class TestRunsEndpointLifecycle:
    """/v1/runs async queue path."""
    pass
```

- [ ] **Step 2: Write failing test — fallback event appears as SSE frame**

This test needs to exercise the streaming path end-to-end at the api_server level. Look at the existing `test_api_server.py` or similar files for the pattern used to instantiate the server and drive requests. Use the same pattern.

Add to `TestSSELifecycleFrames`:

```python
    @pytest.mark.asyncio
    async def test_fallback_activated_emitted_as_sse_event(self):
        """When agent emits fallback_activated, it appears as an SSE frame."""
        # Arrange: create api_server with a fake agent that captures the
        # lifecycle_event_callback. Trigger a streaming request. Inject a
        # fallback event by calling the captured callback from a thread
        # (simulating the agent worker thread). Collect the SSE response
        # body and assert the frame is present.

        # NOTE: the exact fixture/harness depends on how test_api_server.py
        # constructs the server. Mirror that structure.

        from hermes.gateway.platforms.api_server import ApiServer  # adjust import to match

        # Placeholder for actual harness — replace with real pattern from
        # existing test_api_server_*.py files.
        pytest.skip("implement using pattern from test_api_server.py")
```

Note: the test is a `skip` stub right now. You will fill it in once you see the existing harness pattern. The actual implementation pattern comes from copying `test_api_server.py`'s setup.

- [ ] **Step 3: Read `test_api_server.py` to find the harness pattern**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
head -200 tests/gateway/test_api_server.py
```

Look for:
- How `ApiServer` is instantiated (fixture, helper, or direct)
- How a fake agent is injected
- How streaming responses are consumed (async iterator? `httpx` client?)

Copy this harness pattern into the placeholder test above.

- [ ] **Step 4: Rewrite `test_fallback_activated_emitted_as_sse_event` using the real harness**

Replace the `pytest.skip(...)` body with:

```python
        # 1. Build api_server + fake agent
        server, fake_agent = _build_server_with_fake_agent()  # from harness

        # 2. Start a streaming chat completion request in the background
        import asyncio, threading
        response_chunks: list[str] = []
        done_event = asyncio.Event()

        async def consume():
            async for chunk in server._handle_chat_completions(
                _make_stream_request()  # helper from harness
            ):
                response_chunks.append(chunk)
            done_event.set()

        task = asyncio.create_task(consume())
        await asyncio.sleep(0)  # let request start

        # 3. Simulate the agent firing a lifecycle event (from a worker thread)
        def worker():
            fake_agent.lifecycle_event_callback(
                "hermes.model.fallback_activated",
                {
                    "schema_version": 1,
                    "timestamp": "2026-04-14T10:00:00Z",
                    "from_model": "gpt-5.4",
                    "to_model": "gemini-2.5-pro",
                    "from_provider": "openai",
                    "to_provider": "google",
                    "reason_code": "auth_failed",
                    "reason_text": "401 Unauthorized",
                    "fallback_chain": ["gpt-5.4", "gemini-2.5-pro"],
                    "fallback_index": 1,
                },
            )
            fake_agent.finish_stream()  # emits [DONE]

        t = threading.Thread(target=worker)
        t.start()
        t.join()
        await done_event.wait()

        # 4. Assert the SSE frame is present
        joined = "".join(response_chunks)
        assert "event: hermes.model.fallback_activated" in joined
        assert '"from_model": "gpt-5.4"' in joined
        assert '"to_model": "gemini-2.5-pro"' in joined
```

If the harness from step 3 uses a different pattern (e.g. `httpx.AsyncClient` + real TCP), adapt accordingly. The assertion (`"event: hermes.model.fallback_activated" in joined`) is the same regardless.

- [ ] **Step 5: Run the test and verify RED**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/gateway/test_api_server_fallback.py::TestSSELifecycleFrames::test_fallback_activated_emitted_as_sse_event -v
```

Expected: FAIL. Likely reasons: `lifecycle_event_callback` not accepted by `_create_agent`, or the emitter loop doesn't handle the `__lifecycle__` tuple.

- [ ] **Step 6: Wire `lifecycle_event_callback` into `_create_agent`**

In `<HA>/gateway/platforms/api_server.py`, find `_create_agent` (around line 511 per spec). Add `lifecycle_event_callback` to its parameters and pass it through to `AIAgent`:

```python
    def _create_agent(
        self,
        ...,
        stream_delta_callback=None,
        tool_progress_callback=None,
        lifecycle_event_callback=None,  # NEW
    ):
        agent = AIAgent(
            ...,
            stream_delta_callback=stream_delta_callback,
            tool_progress_callback=tool_progress_callback,
        )
        agent.lifecycle_event_callback = lifecycle_event_callback  # NEW
        return agent
```

- [ ] **Step 7: Wire the callback in `_handle_chat_completions` streaming path**

Find `_handle_chat_completions` (around line 589 per spec). Find the streaming branch where `_stream_q` and `_on_tool_progress` are defined. Add a parallel `_on_lifecycle_event`:

```python
            def _on_lifecycle_event(event_type: str, payload: dict) -> None:
                _stream_q.put(("__lifecycle__", event_type, payload))
```

Pass it to `_create_agent`:

```python
            agent = self._create_agent(
                ...,
                stream_delta_callback=_on_delta,
                tool_progress_callback=_on_tool_progress,
                lifecycle_event_callback=_on_lifecycle_event,  # NEW
            )
```

- [ ] **Step 8: Extend the SSE emitter loop to handle `__lifecycle__` tuples**

Find the SSE emitter loop in the same method (where `_stream_q.get()` is called and the tuple is checked for `"__tool_progress__"`). Add a new branch:

```python
            while True:
                item = _stream_q.get()
                if isinstance(item, tuple):
                    if item[0] == "__tool_progress__":
                        yield f"event: hermes.tool.progress\ndata: {json.dumps(item[1])}\n\n"
                    elif item[0] == "__lifecycle__":
                        event_name = item[1]
                        yield f"event: {event_name}\ndata: {json.dumps(item[2])}\n\n"
                    # ... existing branches for other sentinels ...
                else:
                    # existing delta chunk handling
                    yield f"data: {item}\n\n"
```

Ensure `json` is imported at the top of the file (it almost certainly already is).

- [ ] **Step 9: Run the test and verify GREEN**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/gateway/test_api_server_fallback.py::TestSSELifecycleFrames::test_fallback_activated_emitted_as_sse_event -v
```

Expected: PASS.

- [ ] **Step 10: Add ordering test — lifecycle frame precedes new-model content**

Append to `TestSSELifecycleFrames`:

```python
    @pytest.mark.asyncio
    async def test_lifecycle_frame_precedes_new_model_content(self):
        """A fallback event emitted mid-stream must appear BEFORE the first
        delta from the new model. This is critical for correct mid-stream
        message stamping on the desktop."""
        server, fake_agent = _build_server_with_fake_agent()

        # Harness: emit in this order:
        #   1. Two deltas from primary ("hello", " world")
        #   2. Lifecycle event (fallback_activated)
        #   3. Two deltas from fallback ("!", " how are you?")
        #   4. [DONE]
        # Then assert the SSE bytes appear in that order (lifecycle before #3).

        import threading, asyncio
        response_chunks: list[str] = []
        done_event = asyncio.Event()

        async def consume():
            async for chunk in server._handle_chat_completions(_make_stream_request()):
                response_chunks.append(chunk)
            done_event.set()

        task = asyncio.create_task(consume())
        await asyncio.sleep(0)

        def worker():
            fake_agent.emit_delta("hello")
            fake_agent.emit_delta(" world")
            fake_agent.lifecycle_event_callback(
                "hermes.model.fallback_activated",
                {"from_model": "gpt-5.4", "to_model": "gemini-2.5-pro"},
            )
            fake_agent.emit_delta("!")
            fake_agent.emit_delta(" how are you?")
            fake_agent.finish_stream()

        threading.Thread(target=worker).start()
        await done_event.wait()

        joined = "".join(response_chunks)
        idx_lifecycle = joined.find("event: hermes.model.fallback_activated")
        idx_exclaim = joined.find('"!"') if '"!"' in joined else joined.find("!")

        assert idx_lifecycle != -1, "lifecycle frame missing"
        assert idx_exclaim != -1, "post-fallback delta missing"
        assert idx_lifecycle < idx_exclaim, "lifecycle must precede new-model content"
```

- [ ] **Step 11: Run and verify GREEN**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/gateway/test_api_server_fallback.py::TestSSELifecycleFrames -v
```

Expected: both tests pass. Ordering is guaranteed by `queue.Queue` FIFO, so no extra code needed.

- [ ] **Step 12: Add test — primary_restored SSE frame**

Append:

```python
    @pytest.mark.asyncio
    async def test_primary_restored_emitted_as_sse_event(self):
        server, fake_agent = _build_server_with_fake_agent()
        # (setup identical to test_fallback_activated_emitted_as_sse_event
        #  but emit primary_restored instead)
        import threading, asyncio
        response_chunks: list[str] = []
        done_event = asyncio.Event()

        async def consume():
            async for chunk in server._handle_chat_completions(_make_stream_request()):
                response_chunks.append(chunk)
            done_event.set()

        asyncio.create_task(consume())
        await asyncio.sleep(0)

        def worker():
            fake_agent.lifecycle_event_callback(
                "hermes.model.primary_restored",
                {"restored_to": "gpt-5.4", "restored_from": "gemini-2.5-pro"},
            )
            fake_agent.finish_stream()

        threading.Thread(target=worker).start()
        await done_event.wait()

        joined = "".join(response_chunks)
        assert "event: hermes.model.primary_restored" in joined
        assert '"restored_to": "gpt-5.4"' in joined
```

- [ ] **Step 13: Add test — chain_exhausted SSE frame**

Append:

```python
    @pytest.mark.asyncio
    async def test_chain_exhausted_emitted_as_sse_event(self):
        server, fake_agent = _build_server_with_fake_agent()
        import threading, asyncio
        response_chunks: list[str] = []
        done_event = asyncio.Event()

        async def consume():
            async for chunk in server._handle_chat_completions(_make_stream_request()):
                response_chunks.append(chunk)
            done_event.set()

        asyncio.create_task(consume())
        await asyncio.sleep(0)

        def worker():
            fake_agent.lifecycle_event_callback(
                "hermes.model.chain_exhausted",
                {
                    "attempted_models": ["a", "b", "c"],
                    "last_error_code": "server_error",
                    "last_error_text": "all failed",
                },
            )
            fake_agent.finish_stream()

        threading.Thread(target=worker).start()
        await done_event.wait()

        joined = "".join(response_chunks)
        assert "event: hermes.model.chain_exhausted" in joined
```

- [ ] **Step 14: Run all 4 streaming tests and verify GREEN**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/gateway/test_api_server_fallback.py::TestSSELifecycleFrames -v
```

Expected: 4 passed.

- [ ] **Step 15: Commit**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
git add gateway/platforms/api_server.py tests/gateway/test_api_server_fallback.py
git commit -m "$(cat <<'EOF'
feat(transport): relay lifecycle events over streaming SSE

Add _on_lifecycle_event closure in _handle_chat_completions streaming
path. Events are pushed onto the existing thread-safe _stream_q and
emitted as custom SSE 'event: hermes.model.*' frames alongside
'data:' delta chunks. FIFO ordering guarantees the lifecycle frame
arrives before any delta from the new model.

Part B1 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task B2: Non-stream response headers + `_hermes_meta` body field

**Files:**
- Modify: `<HA>/gateway/platforms/api_server.py` (add post-response fallback inspection in non-streaming branch)
- Test: `<HA>/tests/gateway/test_api_server_fallback.py` (add `TestNonStreamFallbackHeaders`)

- [ ] **Step 1: Write failing test — headers present when fallback active**

Append to `TestNonStreamFallbackHeaders`:

```python
    @pytest.mark.asyncio
    async def test_x_hermes_fallback_headers_when_active(self):
        server, fake_agent = _build_server_with_fake_agent()
        fake_agent._fallback_activated = True
        fake_agent._current_runtime = MagicMock(model="gemini-2.5-pro")
        fake_agent._primary_runtime = MagicMock(model="gpt-5.4")
        fake_agent._last_reason_code = "auth_failed"

        # Execute non-streaming request (stream=False)
        response = await server._handle_chat_completions(_make_nonstream_request())

        assert response.headers["X-Hermes-Fallback-Active"] == "true"
        assert response.headers["X-Hermes-Effective-Model"] == "gemini-2.5-pro"
        assert response.headers["X-Hermes-Primary-Model"] == "gpt-5.4"
        assert response.headers["X-Hermes-Fallback-Reason-Code"] == "auth_failed"
```

Note: the fake_agent needs a way to carry the "last reason code" so the server can synthesize the header. The cleanest approach is to add a `_last_fallback_reason_code` field on `AIAgent` that is set every time `_try_activate_fallback` fires. Add it as part of this task.

- [ ] **Step 2: Write failing test — `_hermes_meta` in body when fallback**

Append:

```python
    @pytest.mark.asyncio
    async def test_hermes_meta_in_response_body_when_fallback(self):
        server, fake_agent = _build_server_with_fake_agent()
        fake_agent._fallback_activated = True
        fake_agent._current_runtime = MagicMock(model="gemini-2.5-pro")
        fake_agent._primary_runtime = MagicMock(model="gpt-5.4")
        fake_agent._last_reason_code = "auth_failed"
        fake_agent._last_reason_text = "401 Unauthorized"

        response = await server._handle_chat_completions(_make_nonstream_request())
        body = json.loads(response.body)

        assert "_hermes_meta" in body
        meta = body["_hermes_meta"]["fallback"]
        assert meta["active"] is True
        assert meta["from_model"] == "gpt-5.4"
        assert meta["to_model"] == "gemini-2.5-pro"
        assert meta["reason_code"] == "auth_failed"
        assert meta["reason_text"] == "401 Unauthorized"
```

- [ ] **Step 3: Write failing test — no headers when normal**

Append:

```python
    @pytest.mark.asyncio
    async def test_no_fallback_headers_when_normal(self):
        server, fake_agent = _build_server_with_fake_agent()
        fake_agent._fallback_activated = False

        response = await server._handle_chat_completions(_make_nonstream_request())

        assert "X-Hermes-Fallback-Active" not in response.headers
        body = json.loads(response.body)
        assert "_hermes_meta" not in body or "fallback" not in body.get("_hermes_meta", {})
```

- [ ] **Step 4: Run the 3 tests and verify RED**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/gateway/test_api_server_fallback.py::TestNonStreamFallbackHeaders -v
```

Expected: 3 FAILs.

- [ ] **Step 5: Add `_last_reason_code` / `_last_reason_text` tracking in `run_agent.py`**

In `AIAgent.__init__`, add:

```python
        self._last_fallback_reason_code: Optional[str] = None
        self._last_fallback_reason_text: Optional[str] = None
```

In `_try_activate_fallback`, BEFORE the emission, add:

```python
        self._last_fallback_reason_code = reason_code
        self._last_fallback_reason_text = reason_text[:200]
```

In `_restore_primary_runtime`, clear them:

```python
        self._last_fallback_reason_code = None
        self._last_fallback_reason_text = None
```

- [ ] **Step 6: Wire non-stream fallback-metadata synthesis in `api_server.py`**

In `_handle_chat_completions`, find the non-streaming branch (where the response JSON is built and returned, NOT the streaming generator branch). After the `_run_agent` call returns, before constructing the response:

```python
            # Synthesize fallback metadata if active
            fallback_meta = None
            extra_headers = {}
            if agent._fallback_activated:
                fallback_meta = {
                    "active": True,
                    "from_model": agent._primary_runtime.model,
                    "to_model": agent._current_runtime.model,
                    "reason_code": agent._last_fallback_reason_code or "other",
                    "reason_text": agent._last_fallback_reason_text or "",
                    "switched_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
                }
                extra_headers = {
                    "X-Hermes-Fallback-Active": "true",
                    "X-Hermes-Effective-Model": agent._current_runtime.model,
                    "X-Hermes-Primary-Model": agent._primary_runtime.model,
                    "X-Hermes-Fallback-Reason-Code": agent._last_fallback_reason_code or "other",
                }

            response_body = {
                # ... existing response body construction ...
            }
            if fallback_meta is not None:
                response_body["_hermes_meta"] = {"fallback": fallback_meta}

            return JSONResponse(content=response_body, headers=extra_headers)
```

Adjust to match the actual non-streaming response construction idiom used in this file (it may be `web.json_response`, `JSONResponse`, or `dict` passed to a helper — follow whatever the existing code does).

- [ ] **Step 7: Run the 3 tests and verify GREEN**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/gateway/test_api_server_fallback.py::TestNonStreamFallbackHeaders -v
```

Expected: 3 passed.

- [ ] **Step 8: Commit**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
git add run_agent.py gateway/platforms/api_server.py tests/gateway/test_api_server_fallback.py
git commit -m "$(cat <<'EOF'
feat(transport): add X-Hermes-Fallback-* headers and _hermes_meta body

Non-streaming /v1/chat/completions now exposes fallback state via
response headers (X-Hermes-Fallback-Active, -Effective-Model, etc.)
and a _hermes_meta.fallback field in the JSON body. OpenAI-compatible
clients ignore unknown top-level fields; desktop reads them to stamp
the assistant message on creation.

AIAgent tracks _last_fallback_reason_code/_text so the server can
synthesize these without requiring an event emission.

Part B2 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task B3: `/v1/runs` endpoint lifecycle wiring

**Files:**
- Modify: `<HA>/gateway/platforms/api_server.py::_make_run_event_callback` (extend to accept lifecycle events)
- Modify: `<HA>/gateway/platforms/api_server.py::_handle_runs` (pass lifecycle callback to agent)
- Test: `<HA>/tests/gateway/test_api_server_fallback.py` (add `TestRunsEndpointLifecycle`)

- [ ] **Step 1: Write failing test — lifecycle event pushed to run stream**

Append to `TestRunsEndpointLifecycle`:

```python
    @pytest.mark.asyncio
    async def test_lifecycle_event_pushed_to_run_stream(self):
        import asyncio
        server, fake_agent = _build_server_with_fake_agent()

        # Create a run and grab its stream queue
        run_id = "run-abc123"
        server._run_streams[run_id] = asyncio.Queue()

        callback = server._make_run_event_callback(run_id)
        # Simulate agent emitting from a worker thread
        import threading
        t = threading.Thread(
            target=callback,
            args=(
                "hermes.model.fallback_activated",
                {"from_model": "gpt-5.4", "to_model": "gemini-2.5-pro"},
            ),
        )
        t.start()
        t.join()

        # The event should be on the queue
        frame = await asyncio.wait_for(server._run_streams[run_id].get(), timeout=1.0)
        assert frame["event"] == "hermes.model.fallback_activated"
        assert frame["data"]["from_model"] == "gpt-5.4"
```

- [ ] **Step 2: Write failing test — thread-safe put via call_soon_threadsafe**

Append:

```python
    @pytest.mark.asyncio
    async def test_make_run_event_callback_is_thread_safe(self):
        """Invoking the callback from a non-loop thread must not raise."""
        import asyncio, threading
        server, _ = _build_server_with_fake_agent()
        run_id = "run-xyz"
        server._run_streams[run_id] = asyncio.Queue()

        callback = server._make_run_event_callback(run_id)

        error = []
        def worker():
            try:
                callback("hermes.model.primary_restored", {"restored_to": "gpt-5.4"})
            except Exception as e:
                error.append(e)

        t = threading.Thread(target=worker)
        t.start()
        t.join()

        assert not error, f"callback raised from worker thread: {error}"
        frame = await asyncio.wait_for(server._run_streams[run_id].get(), timeout=1.0)
        assert frame["event"] == "hermes.model.primary_restored"
```

- [ ] **Step 3: Run and verify RED**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/gateway/test_api_server_fallback.py::TestRunsEndpointLifecycle -v
```

Expected: 2 FAILs.

- [ ] **Step 4: Extend `_make_run_event_callback` for lifecycle events**

Find `_make_run_event_callback` in `<HA>/gateway/platforms/api_server.py` (around line 1512 per spec). Modify it to capture the loop reference and use `call_soon_threadsafe`:

```python
    def _make_run_event_callback(self, run_id: str):
        stream = self._run_streams[run_id]
        loop = asyncio.get_running_loop()

        def _cb(event_type: str, payload: Dict[str, Any]) -> None:
            frame = {"event": event_type, "data": payload}
            loop.call_soon_threadsafe(stream.put_nowait, frame)

        return _cb
```

- [ ] **Step 5: Wire the callback in `_handle_runs`**

In `_handle_runs` (or whichever method creates the agent for a run), set:

```python
            agent.lifecycle_event_callback = self._make_run_event_callback(run_id)
```

If the existing code already uses `_make_run_event_callback` for other event kinds and you've just extended its signature, this step may already be wired.

- [ ] **Step 6: Run the 2 tests and verify GREEN**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/gateway/test_api_server_fallback.py::TestRunsEndpointLifecycle -v
```

Expected: 2 passed.

- [ ] **Step 7: Run ALL api_server fallback tests and verify 9 passed**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/gateway/test_api_server_fallback.py -v
```

Expected: 4 (streaming) + 3 (non-stream) + 2 (runs) = 9 passed.

- [ ] **Step 8: Run existing api_server test suites and check for regressions**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/gateway/test_api_server.py tests/gateway/test_api_server_jobs.py tests/gateway/test_api_server_normalize.py -v
```

Expected: all pre-existing tests pass.

- [ ] **Step 9: Commit**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
git add gateway/platforms/api_server.py tests/gateway/test_api_server_fallback.py
git commit -m "$(cat <<'EOF'
feat(transport): relay lifecycle events on /v1/runs endpoint

Extend _make_run_event_callback to use loop.call_soon_threadsafe for
thread-safe asyncio.Queue.put from the agent worker thread. The
emitted frame is {event, data} which the existing /v1/runs SSE
emitter already serializes.

Part B3 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Part C — Integration test (`<HA>/tests/integration/`)

### Task C1: End-to-end fallback pipeline test

**Files:**
- Create: `<HA>/tests/integration/test_fallback_end_to_end.py`

- [ ] **Step 1: Read existing integration tests for the harness pattern**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
head -100 tests/integration/test_batch_runner.py
```

Look for: how `httpx` (or other HTTP client) is used to drive a live api_server, how mock LLM providers are injected, how the agent is configured with `fallback_model`.

- [ ] **Step 2: Write the failing end-to-end test**

Create `<HA>/tests/integration/test_fallback_end_to_end.py`:

```python
"""End-to-end test: agent fallback → api_server SSE → visible event frame.

See docs/superpowers/specs/2026-04-14-hermes-desktop-fallback-visibility-design.md §7.5
"""

import pytest
import httpx


class TestFallbackEndToEnd:
    @pytest.mark.asyncio
    async def test_fallback_event_end_to_end(self, tmp_path):
        """
        Full pipeline:
        1. Configure AIAgent with fallback_chain=[failing, working]
           (using mock LLM providers).
        2. Start api_server with this agent.
        3. Send streaming chat completion via httpx.
        4. Consume SSE response.
        5. Assert: response contains `event: hermes.model.fallback_activated`
           frame BEFORE any content delta from the working model.
        6. Assert: response also contains content deltas (chat actually works).
        """
        # Replace with the real harness pattern discovered in Step 1.
        # Pseudocode skeleton:

        config_yaml = tmp_path / "config.yaml"
        config_yaml.write_text("""
model: mock-failing
fallback_model:
  - mock-working
""")

        # ... start api_server with this config
        # ... register mock providers: "mock-failing" → raises 401,
        #     "mock-working" → returns "hello from fallback"

        async with httpx.AsyncClient() as client:
            async with client.stream(
                "POST",
                "http://localhost:PORT/v1/chat/completions",  # replace PORT
                json={
                    "model": "mock-failing",
                    "messages": [{"role": "user", "content": "hi"}],
                    "stream": True,
                },
            ) as response:
                body_chunks: list[str] = []
                async for chunk in response.aiter_text():
                    body_chunks.append(chunk)

        joined = "".join(body_chunks)

        # Assertions
        assert "event: hermes.model.fallback_activated" in joined, \
            "lifecycle event missing from SSE output"
        assert '"from_model":"mock-failing"' in joined.replace(" ", "") or \
               '"from_model": "mock-failing"' in joined

        idx_lifecycle = joined.find("event: hermes.model.fallback_activated")
        idx_content = joined.find("hello from fallback")
        assert idx_lifecycle != -1
        assert idx_content != -1
        assert idx_lifecycle < idx_content, \
            "lifecycle frame must precede content from the fallback model"
```

- [ ] **Step 3: Run the test, discover what fails**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/integration/test_fallback_end_to_end.py -v
```

Expected: FAIL (likely on fixture setup or mock provider registration).

- [ ] **Step 4: Fill in the harness based on the existing integration pattern**

Using the pattern from step 1, replace the pseudocode with real harness calls. If `tests/integration/test_batch_runner.py` uses a `start_test_server()` helper or fixture, use the same. Add mock LLM providers the same way other integration tests do.

- [ ] **Step 5: Run and verify GREEN**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/integration/test_fallback_end_to_end.py -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
git add tests/integration/test_fallback_end_to_end.py
git commit -m "$(cat <<'EOF'
test(integration): end-to-end fallback pipeline

Full pipeline: config fallback_chain → AIAgent → api_server SSE →
httpx streaming consumer. Asserts lifecycle event frame appears
and precedes content from the fallback model.

Part C1 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Part D — Desktop types + state (`<HD>`)

### Task D1: Extend `ChatMessage` and add lifecycle payload types

**Files:**
- Modify: `<HD>/src/renderer/src/api/types/index.ts`

- [ ] **Step 1: Find the `ChatMessage` interface**

```bash
cd /Users/youhebuke/hermes-desktop
grep -n "interface ChatMessage" src/renderer/src/api/types/index.ts
```

Expected: line around 164 per spec exploration.

- [ ] **Step 2: Add three new optional fields to `ChatMessage`**

In `<HD>/src/renderer/src/api/types/index.ts`, locate the `ChatMessage` interface and add:

```typescript
export interface ChatMessage {
  // ... existing fields unchanged ...
  model?: string               // existing
  fromFallback?: boolean       // NEW
  fallbackFrom?: string        // NEW: the displaced primary model
  fallbackReasonText?: string  // NEW: for chip tooltip
}
```

- [ ] **Step 3: Add lifecycle payload types at the end of the file**

Append:

```typescript
// --- Model lifecycle events (spec §2.3) ---

export interface FallbackActivatedPayload {
  schema_version: number
  timestamp: string
  from_model: string
  to_model: string
  from_provider: string
  to_provider: string
  reason_code: string
  reason_text: string
  fallback_chain: string[]
  fallback_index: number
}

export interface PrimaryRestoredPayload {
  schema_version: number
  timestamp: string
  restored_to: string
  restored_from: string
  primary_model: string
}

export interface ChainExhaustedPayload {
  schema_version: number
  timestamp: string
  attempted_models: string[]
  last_error_code: string
  last_error_text: string
  fallback_chain: string[]
}

export type LifecycleEventName =
  | 'hermes.model.fallback_activated'
  | 'hermes.model.primary_restored'
  | 'hermes.model.chain_exhausted'

export interface LifecycleEvent {
  name: LifecycleEventName
  payload: FallbackActivatedPayload | PrimaryRestoredPayload | ChainExhaustedPayload
}
```

- [ ] **Step 4: Run typecheck and verify no errors**

```bash
cd /Users/youhebuke/hermes-desktop
npm run typecheck
```

Expected: no new errors. (Pre-existing errors, if any, are unrelated.)

- [ ] **Step 5: Commit**

```bash
cd /Users/youhebuke/hermes-desktop
git add src/renderer/src/api/types/index.ts
git commit -m "$(cat <<'EOF'
feat(types): add fallback lifecycle payload types

Extend ChatMessage with fromFallback/fallbackFrom/fallbackReasonText.
Add FallbackActivatedPayload, PrimaryRestoredPayload,
ChainExhaustedPayload, LifecycleEventName union, and LifecycleEvent.

Part D1 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task D2: Rewrite `useModelStore` with tagged-union state

**Files:**
- Modify: `<HD>/src/renderer/src/stores/model.ts` (full rewrite)
- Create: `<HD>/src/renderer/src/stores/model.test.ts`

- [ ] **Step 1: Read the current stub to know what to preserve**

```bash
cd /Users/youhebuke/hermes-desktop
cat src/renderer/src/stores/model.ts
```

Confirm it's a stub (~18 lines with `models: ref<ModelInfo[]>([])` and a no-op `fetchModels`). Note: if any other file imports `useModelStore.models` or `.fetchModels()`, those imports must be updated. Check:

```bash
grep -rn "useModelStore" src/renderer/src --include="*.ts" --include="*.vue"
```

Note any usages for later cleanup.

- [ ] **Step 2: Create the test file with the first failing test**

Create `<HD>/src/renderer/src/stores/model.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useModelStore } from './model'

describe('useModelStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts in unknown kind', () => {
    const store = useModelStore()
    expect(store.state.kind).toBe('unknown')
    expect(store.state.primaryModel).toBe(null)
    expect(store.state.currentModel).toBe(null)
  })
})
```

- [ ] **Step 3: Run and verify RED**

```bash
cd /Users/youhebuke/hermes-desktop
npm run test -- src/renderer/src/stores/model.test.ts
```

Expected: FAIL. The current stub doesn't expose `state.kind`.

- [ ] **Step 4: Rewrite `model.ts` with the full tagged-union state**

Replace the entire content of `<HD>/src/renderer/src/stores/model.ts` with:

```typescript
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  FallbackActivatedPayload,
  PrimaryRestoredPayload,
  ChainExhaustedPayload,
} from '@/api/types'

export type ModelStateKind =
  | 'unknown'
  | 'normal'
  | 'fallback'
  | 'exhausted'
  | 'stale'

export interface ModelState {
  kind: ModelStateKind
  primaryModel: string | null
  currentModel: string | null
  fallbackChain: string[]
  fallbackFrom: string | null
  reasonCode: string | null
  reasonText: string | null
  switchedAt: string | null
  attemptedModels: string[]
}

const INITIAL_STATE: ModelState = {
  kind: 'unknown',
  primaryModel: null,
  currentModel: null,
  fallbackChain: [],
  fallbackFrom: null,
  reasonCode: null,
  reasonText: null,
  switchedAt: null,
  attemptedModels: [],
}

export const useModelStore = defineStore('model', () => {
  const state = ref<ModelState>({ ...INITIAL_STATE })

  const isNormal = computed(() => state.value.kind === 'normal')
  const isFallback = computed(() => state.value.kind === 'fallback')
  const isExhausted = computed(() => state.value.kind === 'exhausted')
  const isStale = computed(() => state.value.kind === 'stale')
  const displayModel = computed(
    () => state.value.currentModel ?? state.value.primaryModel ?? 'unknown'
  )

  function bootstrap(params: {
    primary: string | null
    fallbackChain: string[]
  }): void {
    state.value = {
      ...INITIAL_STATE,
      kind: params.primary ? 'normal' : 'unknown',
      primaryModel: params.primary,
      currentModel: params.primary,
      fallbackChain: params.fallbackChain,
    }
  }

  function applyFallbackActivated(p: FallbackActivatedPayload): void {
    state.value = {
      ...state.value,
      kind: 'fallback',
      currentModel: p.to_model,
      fallbackFrom: p.from_model,
      reasonCode: p.reason_code,
      reasonText: p.reason_text,
      switchedAt: p.timestamp,
    }
  }

  function applyPrimaryRestored(p: PrimaryRestoredPayload): void {
    state.value = {
      ...state.value,
      kind: 'normal',
      currentModel: p.restored_to,
      fallbackFrom: null,
      reasonCode: null,
      reasonText: null,
      switchedAt: p.timestamp,
    }
  }

  function applyChainExhausted(p: ChainExhaustedPayload): void {
    state.value = {
      ...state.value,
      kind: 'exhausted',
      currentModel: null,
      attemptedModels: p.attempted_models,
      reasonCode: p.last_error_code,
      reasonText: p.last_error_text,
      switchedAt: p.timestamp,
    }
  }

  function markStale(): void {
    if (state.value.kind === 'unknown') return
    state.value = { ...state.value, kind: 'stale' }
  }

  function reset(): void {
    state.value = { ...INITIAL_STATE }
  }

  return {
    state,
    isNormal,
    isFallback,
    isExhausted,
    isStale,
    displayModel,
    bootstrap,
    applyFallbackActivated,
    applyPrimaryRestored,
    applyChainExhausted,
    markStale,
    reset,
  }
})
```

- [ ] **Step 5: Run the first test and verify GREEN**

```bash
cd /Users/youhebuke/hermes-desktop
npm run test -- src/renderer/src/stores/model.test.ts
```

Expected: 1 passed.

- [ ] **Step 6: Add the remaining 11 tests**

Append to `<HD>/src/renderer/src/stores/model.test.ts`:

```typescript
  it('bootstrap with primary sets normal kind', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'] })
    expect(store.state.kind).toBe('normal')
    expect(store.state.primaryModel).toBe('gpt-5.4')
    expect(store.state.currentModel).toBe('gpt-5.4')
    expect(store.state.fallbackChain).toEqual(['gpt-5.4', 'gemini-2.5-pro'])
  })

  it('bootstrap with null primary stays unknown', () => {
    const store = useModelStore()
    store.bootstrap({ primary: null, fallbackChain: [] })
    expect(store.state.kind).toBe('unknown')
    expect(store.state.primaryModel).toBe(null)
  })

  it('applyFallbackActivated from normal → fallback', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'] })
    store.applyFallbackActivated({
      schema_version: 1,
      timestamp: '2026-04-14T10:00:00Z',
      from_model: 'gpt-5.4',
      to_model: 'gemini-2.5-pro',
      from_provider: 'openai',
      to_provider: 'google',
      reason_code: 'auth_failed',
      reason_text: '401',
      fallback_chain: ['gpt-5.4', 'gemini-2.5-pro'],
      fallback_index: 1,
    })
    expect(store.state.kind).toBe('fallback')
    expect(store.state.currentModel).toBe('gemini-2.5-pro')
    expect(store.state.fallbackFrom).toBe('gpt-5.4')
    expect(store.state.reasonCode).toBe('auth_failed')
    expect(store.state.primaryModel).toBe('gpt-5.4')  // unchanged
  })

  it('applyFallbackActivated from fallback → fallback updates reason', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'a', fallbackChain: ['a', 'b', 'c'] })
    store.applyFallbackActivated({
      schema_version: 1, timestamp: 't1',
      from_model: 'a', to_model: 'b',
      from_provider: 'x', to_provider: 'y',
      reason_code: 'auth_failed', reason_text: 'first',
      fallback_chain: ['a', 'b', 'c'], fallback_index: 1,
    })
    store.applyFallbackActivated({
      schema_version: 1, timestamp: 't2',
      from_model: 'b', to_model: 'c',
      from_provider: 'y', to_provider: 'z',
      reason_code: 'server_error', reason_text: 'second',
      fallback_chain: ['a', 'b', 'c'], fallback_index: 2,
    })
    expect(store.state.currentModel).toBe('c')
    expect(store.state.reasonCode).toBe('server_error')
    expect(store.state.reasonText).toBe('second')
  })

  it('applyFallbackActivated from unknown → fallback', () => {
    const store = useModelStore()
    // no bootstrap — start from unknown
    store.applyFallbackActivated({
      schema_version: 1, timestamp: 't',
      from_model: 'a', to_model: 'b',
      from_provider: 'x', to_provider: 'y',
      reason_code: 'other', reason_text: '',
      fallback_chain: ['a', 'b'], fallback_index: 1,
    })
    expect(store.state.kind).toBe('fallback')
    expect(store.state.currentModel).toBe('b')
  })

  it('applyPrimaryRestored from fallback → normal and clears reason', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'] })
    store.applyFallbackActivated({
      schema_version: 1, timestamp: 't1',
      from_model: 'gpt-5.4', to_model: 'gemini-2.5-pro',
      from_provider: 'openai', to_provider: 'google',
      reason_code: 'auth_failed', reason_text: '401',
      fallback_chain: ['gpt-5.4', 'gemini-2.5-pro'], fallback_index: 1,
    })
    store.applyPrimaryRestored({
      schema_version: 1, timestamp: 't2',
      restored_to: 'gpt-5.4', restored_from: 'gemini-2.5-pro',
      primary_model: 'gpt-5.4',
    })
    expect(store.state.kind).toBe('normal')
    expect(store.state.currentModel).toBe('gpt-5.4')
    expect(store.state.fallbackFrom).toBe(null)
    expect(store.state.reasonCode).toBe(null)
    expect(store.state.reasonText).toBe(null)
  })

  it('applyChainExhausted → exhausted', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'a', fallbackChain: ['a', 'b', 'c'] })
    store.applyChainExhausted({
      schema_version: 1, timestamp: 't',
      attempted_models: ['a', 'b', 'c'],
      last_error_code: 'server_error',
      last_error_text: 'all failed',
      fallback_chain: ['a', 'b', 'c'],
    })
    expect(store.state.kind).toBe('exhausted')
    expect(store.state.currentModel).toBe(null)
    expect(store.state.attemptedModels).toEqual(['a', 'b', 'c'])
    expect(store.state.reasonCode).toBe('server_error')
  })

  it('markStale from normal keeps data, changes kind to stale', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4'] })
    store.markStale()
    expect(store.state.kind).toBe('stale')
    expect(store.state.currentModel).toBe('gpt-5.4')  // kept
    expect(store.state.primaryModel).toBe('gpt-5.4')
  })

  it('markStale from unknown is a no-op', () => {
    const store = useModelStore()
    store.markStale()
    expect(store.state.kind).toBe('unknown')
  })

  it('reset returns to initial state', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini'] })
    store.applyFallbackActivated({
      schema_version: 1, timestamp: 't',
      from_model: 'gpt-5.4', to_model: 'gemini',
      from_provider: 'openai', to_provider: 'google',
      reason_code: 'auth_failed', reason_text: '401',
      fallback_chain: ['gpt-5.4', 'gemini'], fallback_index: 1,
    })
    store.reset()
    expect(store.state.kind).toBe('unknown')
    expect(store.state.primaryModel).toBe(null)
    expect(store.state.currentModel).toBe(null)
    expect(store.state.fallbackFrom).toBe(null)
  })

  it('displayModel computed falls back: current → primary → "unknown"', () => {
    const store = useModelStore()
    expect(store.displayModel).toBe('unknown')  // unknown state
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4'] })
    expect(store.displayModel).toBe('gpt-5.4')
    store.applyFallbackActivated({
      schema_version: 1, timestamp: 't',
      from_model: 'gpt-5.4', to_model: 'gemini',
      from_provider: 'openai', to_provider: 'google',
      reason_code: 'auth_failed', reason_text: '401',
      fallback_chain: ['gpt-5.4', 'gemini'], fallback_index: 1,
    })
    expect(store.displayModel).toBe('gemini')
  })
})
```

- [ ] **Step 7: Run all 12 tests and verify GREEN**

```bash
cd /Users/youhebuke/hermes-desktop
npm run test -- src/renderer/src/stores/model.test.ts
```

Expected: 12 passed.

- [ ] **Step 8: Fix any broken imports found in Step 1**

If any files imported `.models` or `.fetchModels()` from the old stub, update them to use the new API. Likely none exist (the stub was 18 lines of no-op), but verify:

```bash
cd /Users/youhebuke/hermes-desktop
npm run typecheck
```

Expected: no errors. Fix any references that break.

- [ ] **Step 9: Commit**

```bash
cd /Users/youhebuke/hermes-desktop
git add src/renderer/src/stores/model.ts src/renderer/src/stores/model.test.ts
git commit -m "$(cat <<'EOF'
feat(stores): rewrite model store with tagged-union state

Replace the stub model store with a ModelState tagged union
(unknown | normal | fallback | exhausted | stale) and 5 ingest
methods (bootstrap, applyFallbackActivated, applyPrimaryRestored,
applyChainExhausted, markStale). 12 unit tests covering all
transitions and the displayModel computed.

Part D2 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task D3: Add `useNotificationStore`

**Files:**
- Create: `<HD>/src/renderer/src/stores/notification.ts`

- [ ] **Step 1: Create the store**

Create `<HD>/src/renderer/src/stores/notification.ts`:

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import type {
  FallbackActivatedPayload,
  ChainExhaustedPayload,
} from '@/api/types'

export type NotificationKind = 'fallback' | 'exhausted'

export interface NotificationItem {
  id: string
  kind: NotificationKind
  payload: FallbackActivatedPayload | ChainExhaustedPayload
  durationMs: number
  createdAt: number
}

export const useNotificationStore = defineStore('notification', () => {
  const items = ref<NotificationItem[]>([])

  function push(input: {
    kind: NotificationKind
    payload: FallbackActivatedPayload | ChainExhaustedPayload
    durationMs: number
  }): string {
    const id = `notif-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    items.value.push({
      id,
      kind: input.kind,
      payload: input.payload,
      durationMs: input.durationMs,
      createdAt: Date.now(),
    })
    // Auto-dismiss
    setTimeout(() => dismiss(id), input.durationMs)
    return id
  }

  function dismiss(id: string): void {
    items.value = items.value.filter((item) => item.id !== id)
  }

  function clear(): void {
    items.value = []
  }

  return { items, push, dismiss, clear }
})
```

- [ ] **Step 2: Run typecheck and verify no errors**

```bash
cd /Users/youhebuke/hermes-desktop
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/youhebuke/hermes-desktop
git add src/renderer/src/stores/notification.ts
git commit -m "$(cat <<'EOF'
feat(stores): add notification store for fallback toasts

Dedicated Pinia store for queueing and auto-dismissing toast
notifications. Supports fallback and exhausted kinds with per-item
duration. Used by useModelStoreBootstrap composable.

Part D3 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Part E — Desktop main process (`<HD>/src/main/`)

### Task E1: Extract `parseSseLine` to pure function + tests

**Files:**
- Create: `<HD>/src/main/sse-parser.ts`
- Create: `<HD>/src/main/sse-parser.test.ts`

- [ ] **Step 1: Create the test file with the first failing test**

Create `<HD>/src/main/sse-parser.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest'
import { parseSseLine, makeInitialSseParserState } from './sse-parser'
import type { SseParserState } from './sse-parser'

describe('parseSseLine', () => {
  let state: SseParserState

  beforeEach(() => {
    state = makeInitialSseParserState()
  })

  it('data: line without prior event has null event name', () => {
    const result = parseSseLine('data: {"hello":"world"}', state)
    expect(result).toEqual({ kind: 'data', event: null, data: '{"hello":"world"}' })
  })
})
```

- [ ] **Step 2: Run and verify RED**

```bash
cd /Users/youhebuke/hermes-desktop
npm run test -- src/main/sse-parser.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `sse-parser.ts`**

Create `<HD>/src/main/sse-parser.ts`:

```typescript
/**
 * Pure SSE line parser. Tracks the last-seen `event:` name across lines
 * so that subsequent `data:` lines can be associated with it.
 *
 * Usage:
 *   const state = makeInitialSseParserState()
 *   for (const line of lines) {
 *     const parsed = parseSseLine(line, state)
 *     if (parsed.kind === 'data') { ... }
 *   }
 */

export interface SseParserState {
  lastEventName: string | null
}

export type ParsedSseLine =
  | { kind: 'data'; event: string | null; data: string }
  | { kind: 'event'; name: string }
  | { kind: 'empty' }
  | { kind: 'skip' }

export function makeInitialSseParserState(): SseParserState {
  return { lastEventName: null }
}

export function parseSseLine(
  line: string,
  state: SseParserState
): ParsedSseLine {
  if (line.startsWith('event:')) {
    const name = line.slice('event:'.length).trim()
    state.lastEventName = name
    return { kind: 'event', name }
  }
  if (line.startsWith('data:')) {
    const data = line.slice('data:'.length).trim()
    return { kind: 'data', event: state.lastEventName, data }
  }
  if (line.trim() === '') {
    state.lastEventName = null
    return { kind: 'empty' }
  }
  // Comment lines (start with ':'), id:, retry:, unknown fields
  return { kind: 'skip' }
}
```

- [ ] **Step 4: Run and verify GREEN**

```bash
cd /Users/youhebuke/hermes-desktop
npm run test -- src/main/sse-parser.test.ts
```

Expected: 1 passed.

- [ ] **Step 5: Add the remaining 8 tests**

Append to `sse-parser.test.ts`:

```typescript
  it('event: then data: pairs data with event name', () => {
    parseSseLine('event: hermes.model.fallback_activated', state)
    const result = parseSseLine('data: {"x":1}', state)
    expect(result).toEqual({
      kind: 'data',
      event: 'hermes.model.fallback_activated',
      data: '{"x":1}',
    })
  })

  it('blank line resets lastEventName', () => {
    parseSseLine('event: foo', state)
    parseSseLine('', state)
    const result = parseSseLine('data: {}', state)
    expect(result).toEqual({ kind: 'data', event: null, data: '{}' })
  })

  it('blank line returns empty kind', () => {
    const result = parseSseLine('', state)
    expect(result).toEqual({ kind: 'empty' })
  })

  it('comment line (starts with colon) returns skip', () => {
    const result = parseSseLine(': heartbeat', state)
    expect(result).toEqual({ kind: 'skip' })
  })

  it('multiple data: lines after one event: share the event name', () => {
    parseSseLine('event: hermes.model.primary_restored', state)
    const r1 = parseSseLine('data: {"a":1}', state)
    const r2 = parseSseLine('data: {"b":2}', state)
    expect(r1).toMatchObject({ event: 'hermes.model.primary_restored' })
    expect(r2).toMatchObject({ event: 'hermes.model.primary_restored' })
  })

  it('strips whitespace in "data: " and "event: " prefixes', () => {
    const r = parseSseLine('data:   {"x":1}   ', state)
    expect(r).toEqual({ kind: 'data', event: null, data: '{"x":1}' })
  })

  it('unknown fields (id:, retry:) return skip', () => {
    expect(parseSseLine('id: 42', state)).toEqual({ kind: 'skip' })
    expect(parseSseLine('retry: 3000', state)).toEqual({ kind: 'skip' })
  })

  it('hermes.model.* event names detected correctly', () => {
    parseSseLine('event: hermes.model.chain_exhausted', state)
    const r = parseSseLine('data: {}', state)
    expect(r.kind).toBe('data')
    if (r.kind === 'data') {
      expect(r.event).toBe('hermes.model.chain_exhausted')
      expect(r.event?.startsWith('hermes.model.')).toBe(true)
    }
  })
```

- [ ] **Step 6: Run all 9 tests and verify GREEN**

```bash
cd /Users/youhebuke/hermes-desktop
npm run test -- src/main/sse-parser.test.ts
```

Expected: 9 passed.

- [ ] **Step 7: Commit**

```bash
cd /Users/youhebuke/hermes-desktop
git add src/main/sse-parser.ts src/main/sse-parser.test.ts
git commit -m "$(cat <<'EOF'
feat(main): extract pure SSE line parser with tests

Add sse-parser.ts exposing parseSseLine and makeInitialSseParserState
as pure functions. Tracks lastEventName across lines per the SSE spec
(blank line resets). 9 unit tests covering data/event pairing,
whitespace, unknown fields, and hermes.model.* detection.

Part E1a of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task E2: Refactor `hermes:config` to `yaml.load` and wire SSE parser into `hermes:chat`

**Files:**
- Modify: `<HD>/src/main/index.ts`
- Modify: `<HD>/src/preload/index.ts`

- [ ] **Step 1: Find the existing `hermes:config` handler**

```bash
cd /Users/youhebuke/hermes-desktop
grep -n "hermes:config" src/main/index.ts
```

Expected: around line 286 per spec exploration.

- [ ] **Step 2: Refactor `hermes:config` to parse YAML properly**

Replace the existing regex-based handler with a `yaml.load` version. Add the import at the top of `<HD>/src/main/index.ts` if not already present:

```typescript
import yaml from 'js-yaml'
```

Then replace the handler body:

```typescript
ipcMain.handle('hermes:config', async () => {
  try {
    const configPath = expandHome('~/.hermes/config.yaml')
    const raw = await fs.promises.readFile(configPath, 'utf-8')
    const parsed = yaml.load(raw) as any

    const primary = typeof parsed?.model === 'string' ? parsed.model : null

    // fallback_model may be a single string or a list of strings
    let fallbackList: string[] = []
    if (Array.isArray(parsed?.fallback_model)) {
      fallbackList = parsed.fallback_model.filter(
        (x: unknown): x is string => typeof x === 'string'
      )
    } else if (typeof parsed?.fallback_model === 'string') {
      fallbackList = [parsed.fallback_model]
    }

    // Full chain starts with primary if present
    const fullChain = primary ? [primary, ...fallbackList] : fallbackList

    return { primary, fallback_chain: fullChain }
  } catch (err) {
    console.warn('[hermes:config] parse failed', err)
    return { primary: null, fallback_chain: [] as string[] }
  }
})
```

Adjust `expandHome` / `fs.promises` to match the existing idioms in `src/main/index.ts`. If the existing code uses `readFileSync` and a custom home-expansion helper, follow that convention.

- [ ] **Step 3: Find the existing `hermes:chat` SSE handler**

```bash
cd /Users/youhebuke/hermes-desktop
grep -n "hermes:chat" src/main/index.ts
```

Expected: around line 220 per spec exploration.

- [ ] **Step 4: Integrate `parseSseLine` into the SSE loop**

Import the parser at the top:

```typescript
import { parseSseLine, makeInitialSseParserState } from './sse-parser'
```

Inside the `hermes:chat` handler, replace the existing line-parsing loop with:

```typescript
    const parserState = makeInitialSseParserState()
    let buffer = ''
    const decoder = new TextDecoder()

    for await (const chunk of response.body as any) {
      buffer += decoder.decode(chunk, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const parsed = parseSseLine(line, parserState)
        if (parsed.kind !== 'data') continue

        if (parsed.event && parsed.event.startsWith('hermes.model.')) {
          // Route to lifecycle channel
          try {
            const payload = JSON.parse(parsed.data)
            mainWindow?.webContents.send('hermes:lifecycle', {
              name: parsed.event,
              payload,
            })
          } catch (err) {
            console.warn('[hermes:lifecycle] JSON parse failed', err)
          }
        } else if (parsed.event && parsed.event.startsWith('hermes.tool.')) {
          // Existing tool-progress routing (preserve current behavior)
          mainWindow?.webContents.send('hermes:tool-progress', parsed.data)
        } else {
          // Default: chat chunk (OpenAI-compatible delta)
          mainWindow?.webContents.send('hermes:chat-chunk', parsed.data)
        }
      }
    }
```

Adjust the channel names (`hermes:chat-chunk`, `hermes:tool-progress`) to match what the existing code already sends — don't invent names, preserve the existing contract for the default path.

- [ ] **Step 5: Add `hermes:lifecycle` to the preload surface**

In `<HD>/src/preload/index.ts`, find the `api` object exposed via `contextBridge.exposeInMainWorld`. Add:

```typescript
  onHermesLifecycle: (
    callback: (event: { name: string; payload: unknown }) => void
  ) => {
    const listener = (_: Electron.IpcRendererEvent, event: { name: string; payload: unknown }) =>
      callback(event)
    ipcRenderer.on('hermes:lifecycle', listener)
    return () => ipcRenderer.removeListener('hermes:lifecycle', listener)
  },
```

And update the `hermesConfig` typing if needed:

```typescript
  hermesConfig: (): Promise<{ primary: string | null; fallback_chain: string[] }> =>
    ipcRenderer.invoke('hermes:config'),
```

- [ ] **Step 6: Update the TypeScript global typing**

Find `<HD>/src/preload/index.d.ts` (or wherever `window.api` is globally typed):

```bash
cd /Users/youhebuke/hermes-desktop
find src -name "*.d.ts" | xargs grep -l "window" 2>/dev/null
```

In whichever file declares the `Window.api` shape, add:

```typescript
    onHermesLifecycle: (
      callback: (event: { name: string; payload: unknown }) => void
    ) => () => void
    hermesConfig: () => Promise<{ primary: string | null; fallback_chain: string[] }>
```

- [ ] **Step 7: Typecheck**

```bash
cd /Users/youhebuke/hermes-desktop
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 8: Commit**

```bash
cd /Users/youhebuke/hermes-desktop
git add src/main/index.ts src/preload/index.ts src/preload/index.d.ts
git commit -m "$(cat <<'EOF'
feat(main): yaml.load config, SSE lifecycle routing, IPC channel

Replace regex-based hermes:config with js-yaml parsing so
fallback_model list syntax is supported. Integrate parseSseLine
into hermes:chat to route hermes.model.* event frames to a new
hermes:lifecycle IPC channel. Preload exposes onHermesLifecycle
subscriber and typed hermesConfig().

Part E1b+E2 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Part F — Desktop composable (`<HD>/src/renderer/src/composables/`)

### Task F1: Write `useModelStoreBootstrap` composable

**Files:**
- Create: `<HD>/src/renderer/src/composables/useModelStoreBootstrap.ts`
- Create: `<HD>/src/renderer/src/composables/useModelStoreBootstrap.test.ts`
- Create: `<HD>/src/renderer/src/test-utils/sse-fixtures.ts`

- [ ] **Step 1: Create the test-utils fixture file**

Create `<HD>/src/renderer/src/test-utils/sse-fixtures.ts`:

```typescript
import type {
  FallbackActivatedPayload,
  PrimaryRestoredPayload,
  ChainExhaustedPayload,
} from '@/api/types'

export function makeFallbackActivatedPayload(
  overrides: Partial<FallbackActivatedPayload> = {}
): FallbackActivatedPayload {
  return {
    schema_version: 1,
    timestamp: '2026-04-14T10:00:00Z',
    from_model: 'gpt-5.4',
    to_model: 'gemini-2.5-pro',
    from_provider: 'openai',
    to_provider: 'google',
    reason_code: 'auth_failed',
    reason_text: '401 Unauthorized',
    fallback_chain: ['gpt-5.4', 'gemini-2.5-pro'],
    fallback_index: 1,
    ...overrides,
  }
}

export function makePrimaryRestoredPayload(
  overrides: Partial<PrimaryRestoredPayload> = {}
): PrimaryRestoredPayload {
  return {
    schema_version: 1,
    timestamp: '2026-04-14T10:05:00Z',
    restored_to: 'gpt-5.4',
    restored_from: 'gemini-2.5-pro',
    primary_model: 'gpt-5.4',
    ...overrides,
  }
}

export function makeChainExhaustedPayload(
  overrides: Partial<ChainExhaustedPayload> = {}
): ChainExhaustedPayload {
  return {
    schema_version: 1,
    timestamp: '2026-04-14T10:10:00Z',
    attempted_models: ['gpt-5.4', 'gemini-2.5-pro', 'claude-3.5-sonnet'],
    last_error_code: 'server_error',
    last_error_text: 'All models failed',
    fallback_chain: ['gpt-5.4', 'gemini-2.5-pro', 'claude-3.5-sonnet'],
    ...overrides,
  }
}

export function makeSSELines(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}
```

- [ ] **Step 2: Create the failing composable test**

Create `<HD>/src/renderer/src/composables/useModelStoreBootstrap.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useModelStore } from '@/stores/model'
import { useNotificationStore } from '@/stores/notification'
import { makeFallbackActivatedPayload, makePrimaryRestoredPayload, makeChainExhaustedPayload } from '@/test-utils/sse-fixtures'

// We need a handle to the routeLifecycle function for unit testing.
// Export it (alongside the composable) as a named helper.
import { __routeLifecycleForTest as routeLifecycle } from './useModelStoreBootstrap'

describe('useModelStoreBootstrap', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.useFakeTimers()
  })

  it('routeLifecycle dispatches fallback_activated to store', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'] })
    routeLifecycle('hermes.model.fallback_activated', makeFallbackActivatedPayload())
    expect(store.state.kind).toBe('fallback')
    expect(store.state.currentModel).toBe('gemini-2.5-pro')
  })
})
```

- [ ] **Step 3: Run and verify RED**

```bash
cd /Users/youhebuke/hermes-desktop
npm run test -- src/renderer/src/composables/useModelStoreBootstrap.test.ts
```

Expected: FAIL — module does not exist.

- [ ] **Step 4: Create the composable**

Create `<HD>/src/renderer/src/composables/useModelStoreBootstrap.ts`:

```typescript
import { watch, onUnmounted } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useModelStore } from '@/stores/model'
import { useNotificationStore } from '@/stores/notification'
import { apiClient } from '@/api/http-client'
import type {
  FallbackActivatedPayload,
  PrimaryRestoredPayload,
  ChainExhaustedPayload,
} from '@/api/types'

const DEBOUNCE_MS = 60_000
const lastToastKey = new Map<string, number>()

/**
 * Test-only export of the pure routing function. Production callers
 * should use `useModelStoreBootstrap()` which wires this up with watchers.
 */
export function __routeLifecycleForTest(name: string, payload: unknown): void {
  routeLifecycle(name, payload)
}

function routeLifecycle(name: string, payload: unknown): void {
  const modelStore = useModelStore()
  switch (name) {
    case 'hermes.model.fallback_activated': {
      const p = payload as FallbackActivatedPayload
      modelStore.applyFallbackActivated(p)
      triggerFallbackToast(p)
      break
    }
    case 'hermes.model.primary_restored': {
      const p = payload as PrimaryRestoredPayload
      modelStore.applyPrimaryRestored(p)
      // No toast on restore — avoid nagging
      break
    }
    case 'hermes.model.chain_exhausted': {
      const p = payload as ChainExhaustedPayload
      modelStore.applyChainExhausted(p)
      triggerExhaustedToast(p)
      break
    }
    default:
      console.debug('[lifecycle] unknown event', name)
  }
}

function triggerFallbackToast(p: FallbackActivatedPayload): void {
  const key = `fallback:${p.from_model}->${p.to_model}:${p.reason_code}`
  const now = Date.now()
  const last = lastToastKey.get(key) ?? 0
  if (now - last < DEBOUNCE_MS) return
  lastToastKey.set(key, now)
  useNotificationStore().push({ kind: 'fallback', payload: p, durationMs: 3000 })
}

function triggerExhaustedToast(p: ChainExhaustedPayload): void {
  const key = `exhausted:${p.last_error_code}`
  const now = Date.now()
  const last = lastToastKey.get(key) ?? 0
  if (now - last < DEBOUNCE_MS) return
  lastToastKey.set(key, now)
  useNotificationStore().push({ kind: 'exhausted', payload: p, durationMs: 5000 })
}

export function useModelStoreBootstrap(): void {
  const connectionStore = useConnectionStore()
  const modelStore = useModelStore()

  // Reset debounce map on every fresh bootstrap so a previous session's
  // suppressed toasts don't silently block the new session.
  function resetDebounce(): void {
    lastToastKey.clear()
  }

  // 1. Re-bootstrap on connection transitions
  watch(
    () => connectionStore.status,
    async (status, prev) => {
      if (status === 'connected' && prev !== 'connected') {
        resetDebounce()
        await runBootstrap()
      } else if (status === 'disconnected') {
        modelStore.markStale()
      }
    },
    { flush: 'sync' }
  )

  // 2. Subscribe to live events
  const lifecycleUnsub = subscribeLifecycle()
  onUnmounted(() => lifecycleUnsub?.())

  async function runBootstrap(): Promise<void> {
    if (connectionStore.serverType === 'hermes-rest') {
      const config = await window.api.hermesConfig()
      modelStore.bootstrap({
        primary: config.primary,
        fallbackChain: config.fallback_chain,
      })
    } else if (connectionStore.serverType === 'acp-ws') {
      // Derive from the existing acp handshake model info if available.
      // Fields may vary — adjust to match connection store shape.
      const hello = (connectionStore as any).acpHelloModelInfo ?? null
      modelStore.bootstrap({
        primary: hello?.primary ?? null,
        fallbackChain: hello?.fallback_chain ?? [],
      })
    }
  }

  function subscribeLifecycle(): () => void {
    // hermes-rest path: main process SSE → IPC
    const removeIpc = window.api.onHermesLifecycle((event) => {
      routeLifecycle(event.name, event.payload)
    })

    // acp-ws path: WebSocket event:namespaced frames
    const removeWs1 = apiClient.on(
      'event:hermes.model.fallback_activated',
      (f: any) => routeLifecycle('hermes.model.fallback_activated', f.payload)
    )
    const removeWs2 = apiClient.on(
      'event:hermes.model.primary_restored',
      (f: any) => routeLifecycle('hermes.model.primary_restored', f.payload)
    )
    const removeWs3 = apiClient.on(
      'event:hermes.model.chain_exhausted',
      (f: any) => routeLifecycle('hermes.model.chain_exhausted', f.payload)
    )

    return () => {
      removeIpc()
      removeWs1()
      removeWs2()
      removeWs3()
    }
  }
}
```

- [ ] **Step 5: Run the first composable test and verify GREEN**

```bash
cd /Users/youhebuke/hermes-desktop
npm run test -- src/renderer/src/composables/useModelStoreBootstrap.test.ts
```

Expected: 1 passed.

- [ ] **Step 6: Add the remaining 5 tests**

Append to `useModelStoreBootstrap.test.ts`:

```typescript
  it('routeLifecycle dispatches primary_restored to store', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'] })
    store.applyFallbackActivated(makeFallbackActivatedPayload())
    routeLifecycle('hermes.model.primary_restored', makePrimaryRestoredPayload())
    expect(store.state.kind).toBe('normal')
    expect(store.state.currentModel).toBe('gpt-5.4')
  })

  it('routeLifecycle dispatches chain_exhausted to store', () => {
    const store = useModelStore()
    store.bootstrap({ primary: 'a', fallbackChain: ['a', 'b', 'c'] })
    routeLifecycle('hermes.model.chain_exhausted', makeChainExhaustedPayload())
    expect(store.state.kind).toBe('exhausted')
  })

  it('fallback toast is debounced by key within 60s', () => {
    const store = useModelStore()
    const notif = useNotificationStore()
    store.bootstrap({ primary: 'gpt-5.4', fallbackChain: ['gpt-5.4', 'gemini-2.5-pro'] })

    const payload = makeFallbackActivatedPayload()
    routeLifecycle('hermes.model.fallback_activated', payload)
    expect(notif.items.length).toBe(1)

    // Same key within 60s → suppressed
    routeLifecycle('hermes.model.fallback_activated', payload)
    expect(notif.items.length).toBe(1)  // still 1

    // Advance virtual time 61s
    vi.advanceTimersByTime(61_000)

    // Now allowed again
    routeLifecycle('hermes.model.fallback_activated', payload)
    expect(notif.items.length).toBeGreaterThan(0)
  })

  it('fallback toast allows different keys through', () => {
    const store = useModelStore()
    const notif = useNotificationStore()
    store.bootstrap({ primary: 'a', fallbackChain: ['a', 'b', 'c'] })

    routeLifecycle(
      'hermes.model.fallback_activated',
      makeFallbackActivatedPayload({ from_model: 'a', to_model: 'b' })
    )
    routeLifecycle(
      'hermes.model.fallback_activated',
      makeFallbackActivatedPayload({ from_model: 'b', to_model: 'c' })
    )

    // Different keys — both should land
    expect(notif.items.length).toBe(2)
  })

  it('unknown event name is logged and ignored (no crash)', () => {
    const store = useModelStore()
    const spy = vi.spyOn(console, 'debug').mockImplementation(() => {})
    routeLifecycle('hermes.model.unknown_future_event', {})
    expect(spy).toHaveBeenCalled()
    expect(store.state.kind).toBe('unknown')  // unchanged
    spy.mockRestore()
  })
```

- [ ] **Step 7: Run all 6 composable tests and verify GREEN**

```bash
cd /Users/youhebuke/hermes-desktop
npm run test -- src/renderer/src/composables/useModelStoreBootstrap.test.ts
```

Expected: 6 passed.

- [ ] **Step 8: Commit**

```bash
cd /Users/youhebuke/hermes-desktop
git add src/renderer/src/composables/useModelStoreBootstrap.ts src/renderer/src/composables/useModelStoreBootstrap.test.ts src/renderer/src/test-utils/sse-fixtures.ts
git commit -m "$(cat <<'EOF'
feat(composables): useModelStoreBootstrap wiring + 60s toast debounce

Bridge 3 data sources into useModelStore: (1) config.yaml via IPC,
(2) /v1/models via connection store, (3) live lifecycle events via
hermes:lifecycle IPC (hermes-rest) and apiClient event channel (acp-ws).
Debounces toast notifications by key within 60s window.

Test-only export __routeLifecycleForTest enables isolated unit testing
of the routing logic without mounting the composable.

Also adds sse-fixtures.ts with payload factories.

Part F1 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Part G — Desktop components (`<HD>/src/renderer/src/components/`)

### Task G1: `ModelStateBadge.vue` and `ModelDropdown.vue`

**Files:**
- Create: `<HD>/src/renderer/src/components/layout/ModelStateBadge.vue`
- Create: `<HD>/src/renderer/src/components/layout/ModelDropdown.vue`

- [ ] **Step 1: Create `ModelDropdown.vue`**

Create `<HD>/src/renderer/src/components/layout/ModelDropdown.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { useModelStore } from '@/stores/model'
import { formatDistanceToNow } from 'date-fns'

const modelStore = useModelStore()

const chainItems = computed(() => {
  const chain = modelStore.state.fallbackChain
  const current = modelStore.state.currentModel
  return chain.map((model) => ({
    model,
    isCurrent: model === current,
    isFallback: modelStore.state.kind === 'fallback' && model === current,
    isFailed:
      modelStore.state.kind === 'exhausted' &&
      modelStore.state.attemptedModels.includes(model),
  }))
})

const reasonLabel = computed(() => {
  const code = modelStore.state.reasonCode
  if (!code) return null
  // TODO(localization): map to i18n labels
  return code.replace(/_/g, ' ')
})

const switchedAgo = computed(() => {
  const ts = modelStore.state.switchedAt
  if (!ts) return null
  try {
    return formatDistanceToNow(new Date(ts), { addSuffix: true })
  } catch {
    return null
  }
})
</script>

<template>
  <div class="model-dropdown">
    <!-- Fallback chain -->
    <div class="dd-section">
      <div class="dd-label">Fallback Chain</div>
      <div class="dd-chain">
        <template v-for="(item, idx) in chainItems" :key="item.model">
          <span
            class="dd-chain-item"
            :class="{
              'is-current-normal': item.isCurrent && modelStore.state.kind === 'normal',
              'is-current-fallback': item.isFallback,
              'is-failed': item.isFailed,
            }"
          >
            {{ item.model }}
          </span>
          <span v-if="idx < chainItems.length - 1" class="dd-arrow">→</span>
        </template>
      </div>
      <div class="dd-subnote">from ~/.hermes/config.yaml</div>
    </div>

    <!-- Reason (only when fallback or exhausted) -->
    <div
      v-if="modelStore.state.kind === 'fallback' || modelStore.state.kind === 'exhausted'"
      class="dd-section"
    >
      <div class="dd-label">
        {{ modelStore.state.kind === 'fallback' ? 'Switch Reason' : 'Failure Reason' }}
      </div>
      <div class="dd-reason-code">{{ reasonLabel }}</div>
      <div class="dd-reason-text">{{ modelStore.state.reasonText }}</div>
      <div v-if="switchedAgo" class="dd-subnote">{{ switchedAgo }}</div>
    </div>
  </div>
</template>

<style scoped>
.model-dropdown {
  width: 280px;
  padding: 4px 0;
  font-family: -apple-system, system-ui, sans-serif;
  color: rgba(255, 255, 255, 0.85);
}
.dd-section {
  padding: 10px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.dd-section:last-child {
  border-bottom: none;
}
.dd-label {
  font-size: 9px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 6px;
}
.dd-chain {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.dd-chain-item {
  font-size: 11px;
  padding: 3px 10px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.55);
  border: 1px solid transparent;
}
.dd-chain-item.is-current-normal {
  background: rgba(34, 197, 94, 0.15);
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.3);
}
.dd-chain-item.is-current-fallback {
  background: rgba(245, 158, 11, 0.15);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.3);
}
.dd-chain-item.is-failed {
  background: rgba(239, 68, 68, 0.1);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.25);
  text-decoration: line-through;
}
.dd-arrow {
  color: rgba(255, 255, 255, 0.3);
  font-size: 10px;
}
.dd-reason-code {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.85);
  margin-bottom: 3px;
}
.dd-reason-text {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.65);
  line-height: 1.4;
  word-break: break-word;
}
.dd-subnote {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 4px;
}
</style>
```

- [ ] **Step 2: Create `ModelStateBadge.vue`**

Create `<HD>/src/renderer/src/components/layout/ModelStateBadge.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import { NPopover } from 'naive-ui'
import { useModelStore } from '@/stores/model'
import ModelDropdown from './ModelDropdown.vue'

const modelStore = useModelStore()

const kind = computed(() => modelStore.state.kind)

const badgeContent = computed(() => {
  const s = modelStore.state
  switch (s.kind) {
    case 'normal':
      return { icon: '●', main: s.currentModel ?? 'unknown', sub: null }
    case 'fallback':
      return {
        icon: '⚠',
        main: s.currentModel ?? 'unknown',
        sub: s.fallbackFrom ? `via ${s.fallbackFrom}` : null,
      }
    case 'exhausted':
      return {
        icon: '⚠',
        main: `all ${s.attemptedModels.length} models failed`,
        sub: null,
      }
    case 'stale':
      return { icon: '', main: s.currentModel ?? 'unknown', sub: null }
    case 'unknown':
    default:
      return { icon: '?', main: 'unknown', sub: null }
  }
})

const tooltipText = computed(() => {
  const s = modelStore.state
  if (s.kind === 'stale') return `${s.currentModel ?? 'unknown'} (stale)`
  if (s.kind === 'fallback' && s.reasonText) {
    return `${s.reasonText} — click for details`
  }
  return 'click for details'
})
</script>

<template>
  <NPopover placement="bottom-end" trigger="click" :show-arrow="false">
    <template #trigger>
      <button
        class="model-state-badge"
        :class="`is-${kind}`"
        :title="tooltipText"
        type="button"
      >
        <span v-if="badgeContent.icon" class="badge-icon">{{ badgeContent.icon }}</span>
        <span class="badge-main">{{ badgeContent.main }}</span>
        <span v-if="badgeContent.sub" class="badge-sub">{{ badgeContent.sub }}</span>
      </button>
    </template>
    <ModelDropdown />
  </NPopover>
</template>

<style scoped>
.model-state-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 11px;
  font-weight: 500;
  font-family: -apple-system, system-ui, sans-serif;
  border: 1px solid transparent;
  cursor: pointer;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.6);
  transition: background 0.15s ease;
}
.model-state-badge:hover {
  background: rgba(255, 255, 255, 0.08);
}
.model-state-badge.is-normal {
  background: rgba(34, 197, 94, 0.12);
  color: #22c55e;
  border-color: rgba(34, 197, 94, 0.25);
}
.model-state-badge.is-fallback {
  background: rgba(245, 158, 11, 0.14);
  color: #fbbf24;
  border-color: rgba(245, 158, 11, 0.3);
}
.model-state-badge.is-exhausted {
  background: rgba(239, 68, 68, 0.14);
  color: #f87171;
  border-color: rgba(239, 68, 68, 0.3);
}
.model-state-badge.is-stale {
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.4);
  border-color: rgba(255, 255, 255, 0.1);
}
.badge-icon {
  font-size: 8px;
}
.badge-main {
  font-weight: 500;
}
.badge-sub {
  font-size: 9px;
  opacity: 0.7;
}
</style>
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/youhebuke/hermes-desktop
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/youhebuke/hermes-desktop
git add src/renderer/src/components/layout/ModelStateBadge.vue src/renderer/src/components/layout/ModelDropdown.vue
git commit -m "$(cat <<'EOF'
feat(ui): ModelStateBadge + ModelDropdown (AppHeader)

Hybrid C visual per spec §4.3: normal state shows green pill with
current model, fallback state shows amber pill with current + "via
primary" subscript, exhausted state shows red pill with failure count.
Click opens NPopover with D-B dropdown: chain visualization and
reason text.

Part G1 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task G2: `ModelToast.vue` and `NotificationLayer.vue`

**Files:**
- Create: `<HD>/src/renderer/src/components/layout/ModelToast.vue`
- Create: `<HD>/src/renderer/src/components/layout/NotificationLayer.vue`

- [ ] **Step 1: Create `ModelToast.vue`**

Create `<HD>/src/renderer/src/components/layout/ModelToast.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'
import type { NotificationItem } from '@/stores/notification'
import { useNotificationStore } from '@/stores/notification'
import type {
  FallbackActivatedPayload,
  ChainExhaustedPayload,
} from '@/api/types'

const props = defineProps<{
  item: NotificationItem
}>()

const notif = useNotificationStore()

const title = computed(() => {
  if (props.item.kind === 'fallback') return '⚠ Switched to fallback model'
  return '⚠ All models unavailable'
})

const body1 = computed(() => {
  if (props.item.kind === 'fallback') {
    const p = props.item.payload as FallbackActivatedPayload
    return `${p.from_model} returned ${p.reason_code}: ${p.reason_text}`
  }
  const p = props.item.payload as ChainExhaustedPayload
  return `Attempted: ${p.attempted_models.join(', ')}`
})

const body2 = computed(() => {
  if (props.item.kind === 'fallback') {
    const p = props.item.payload as FallbackActivatedPayload
    return `now using ${p.to_model}`
  }
  const p = props.item.payload as ChainExhaustedPayload
  return p.last_error_text
})

function close(): void {
  notif.dismiss(props.item.id)
}
</script>

<template>
  <div class="model-toast" :class="`kind-${item.kind}`">
    <div class="toast-close" @click="close">×</div>
    <div class="toast-title">{{ title }}</div>
    <div class="toast-body">{{ body1 }}</div>
    <div class="toast-body">{{ body2 }}</div>
  </div>
</template>

<style scoped>
.model-toast {
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.35);
  border-radius: 8px;
  padding: 10px 28px 10px 14px;
  color: #fbbf24;
  font-size: 11px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);
  max-width: 260px;
  position: relative;
  animation: slideIn 0.3s ease;
  font-family: -apple-system, system-ui, sans-serif;
}
.model-toast.kind-exhausted {
  background: rgba(239, 68, 68, 0.12);
  border-color: rgba(239, 68, 68, 0.35);
  color: #f87171;
}
.toast-close {
  position: absolute;
  top: 4px;
  right: 8px;
  cursor: pointer;
  font-size: 14px;
  opacity: 0.6;
}
.toast-close:hover {
  opacity: 1;
}
.toast-title {
  font-weight: 600;
  margin-bottom: 4px;
}
.toast-body {
  font-size: 10px;
  opacity: 0.85;
  line-height: 1.4;
  word-break: break-word;
}
@keyframes slideIn {
  from {
    opacity: 0;
    transform: translateX(20px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}
</style>
```

- [ ] **Step 2: Create `NotificationLayer.vue`**

Create `<HD>/src/renderer/src/components/layout/NotificationLayer.vue`:

```vue
<script setup lang="ts">
import { useNotificationStore } from '@/stores/notification'
import ModelToast from './ModelToast.vue'

const notif = useNotificationStore()
</script>

<template>
  <Teleport to="body">
    <div class="notification-layer">
      <TransitionGroup name="toast-list">
        <ModelToast v-for="item in notif.items" :key="item.id" :item="item" />
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<style scoped>
.notification-layer {
  position: fixed;
  top: 50px;
  right: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  z-index: 9999;
  pointer-events: none;
}
.notification-layer > :deep(*) {
  pointer-events: auto;
}
.toast-list-enter-active,
.toast-list-leave-active {
  transition: all 0.3s ease;
}
.toast-list-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.toast-list-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
```

- [ ] **Step 3: Typecheck**

```bash
cd /Users/youhebuke/hermes-desktop
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/youhebuke/hermes-desktop
git add src/renderer/src/components/layout/ModelToast.vue src/renderer/src/components/layout/NotificationLayer.vue
git commit -m "$(cat <<'EOF'
feat(ui): ModelToast + NotificationLayer (top-right T-A toasts)

ModelToast renders a single notification item (fallback or exhausted
kind) with title, 2-line body, and manual close. NotificationLayer
teleports to body and hosts the transition group, positioned top-right
below the AppHeader to sit visually near the badge it's explaining.

Part G2 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task G3: `FallbackChip.vue`

**Files:**
- Create: `<HD>/src/renderer/src/components/chat/FallbackChip.vue`

- [ ] **Step 1: Create `FallbackChip.vue`**

Create `<HD>/src/renderer/src/components/chat/FallbackChip.vue`:

```vue
<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  model?: string
  from?: string
  reasonText?: string
}>()

const labelText = computed(() => {
  if (props.from) return `via ${props.from}`
  return 'fallback'
})

const tooltip = computed(() => {
  const parts: string[] = []
  if (props.model) parts.push(`Model: ${props.model}`)
  if (props.from) parts.push(`Primary was: ${props.from}`)
  if (props.reasonText) parts.push(`Reason: ${props.reasonText}`)
  return parts.join(' · ')
})
</script>

<template>
  <span class="fallback-chip" :title="tooltip">
    <span class="chip-icon">⚠</span>
    <span class="chip-text">{{ labelText }}</span>
  </span>
</template>

<style scoped>
.fallback-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 8px;
  border-radius: 10px;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.28);
  color: #fbbf24;
  font-size: 10px;
  font-weight: 500;
  cursor: help;
  font-family: -apple-system, system-ui, sans-serif;
}
.chip-icon {
  font-size: 9px;
}
.chip-text {
  white-space: nowrap;
}
</style>
```

- [ ] **Step 2: Typecheck**

```bash
cd /Users/youhebuke/hermes-desktop
npm run typecheck
```

Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/youhebuke/hermes-desktop
git add src/renderer/src/components/chat/FallbackChip.vue
git commit -m "$(cat <<'EOF'
feat(ui): FallbackChip per-message footer

Small amber chip rendered inline with chat-bubble-meta showing
"⚠ via {primary_model}" with a hover tooltip carrying the full
reason text. Style A from spec §4.6.

Part G3 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Part H — Desktop integration (`<HD>`)

### Task H1: Insert `ModelStateBadge` into `AppHeader`

**Files:**
- Modify: `<HD>/src/renderer/src/components/layout/AppHeader.vue`

- [ ] **Step 1: Read current AppHeader structure**

```bash
cd /Users/youhebuke/hermes-desktop
cat src/renderer/src/components/layout/AppHeader.vue
```

Confirm there's an `<NSpace :size="8" align="center">` containing `ConnectionStatus` and other buttons.

- [ ] **Step 2: Import `ModelStateBadge` in the `<script setup>` block**

Add to the imports section:

```typescript
import ModelStateBadge from './ModelStateBadge.vue'
import { useConnectionStore } from '@/stores/connection'

const connectionStore = useConnectionStore()
```

If `useConnectionStore` is already imported, reuse that binding.

- [ ] **Step 3: Insert `<ModelStateBadge>` before `<ConnectionStatus>` in the template**

Find the `<NSpace>` element and add:

```vue
<NSpace :size="8" align="center">
  <ModelStateBadge v-if="connectionStore.status === 'connected'" />
  <ConnectionStatus />
  <!-- existing buttons unchanged -->
</NSpace>
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/youhebuke/hermes-desktop
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/youhebuke/hermes-desktop
git add src/renderer/src/components/layout/AppHeader.vue
git commit -m "$(cat <<'EOF'
feat(ui): insert ModelStateBadge into AppHeader

Place the badge at the left edge of the right-aligned button group,
before ConnectionStatus. Only visible when a connection is active.

Part H1 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task H2: Insert `FallbackChip` into `ChatPage.vue`

**Files:**
- Modify: `<HD>/src/renderer/src/views/chat/ChatPage.vue`

- [ ] **Step 1: Find the chat bubble meta row**

```bash
cd /Users/youhebuke/hermes-desktop
grep -n "chat-bubble-meta" src/renderer/src/views/chat/ChatPage.vue
```

Expected: around line 2752 per spec exploration.

- [ ] **Step 2: Import `FallbackChip` in `<script setup>`**

Add:

```typescript
import FallbackChip from '@/components/chat/FallbackChip.vue'
```

- [ ] **Step 3: Insert `FallbackChip` in the meta row**

Find the `.chat-bubble-meta` wrapper around line 2752. Add the chip between the role NTag and the timestamp:

```vue
<div class="chat-bubble-meta">
  <NTag>{{ entry.item.role }}</NTag>
  <FallbackChip
    v-if="entry.item.role === 'assistant' && entry.item.fromFallback"
    :model="entry.item.model"
    :from="entry.item.fallbackFrom"
    :reason-text="entry.item.fallbackReasonText"
  />
  <span class="timestamp">{{ formatTime(entry.item.timestamp) }}</span>
</div>
```

Adjust element names/classes to match the actual surrounding code — the meta row may not be a `<div>` exactly, and the timestamp may be rendered differently. Preserve the existing structure and only insert the `<FallbackChip>` element.

- [ ] **Step 4: Typecheck**

```bash
cd /Users/youhebuke/hermes-desktop
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/youhebuke/hermes-desktop
git add src/renderer/src/views/chat/ChatPage.vue
git commit -m "$(cat <<'EOF'
feat(ui): insert FallbackChip into ChatPage bubble meta

Show the chip next to the role tag on assistant messages where
fromFallback is true. Uses model + fallbackFrom + fallbackReasonText
from the stamped ChatMessage.

Part H2 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task H3: Mount `useModelStoreBootstrap()` and `<NotificationLayer>` in `App.vue`

**Files:**
- Modify: `<HD>/src/renderer/src/App.vue`

- [ ] **Step 1: Read current App.vue structure**

```bash
cd /Users/youhebuke/hermes-desktop
cat src/renderer/src/App.vue
```

- [ ] **Step 2: Import and call the composable in `<script setup>`**

Add at the top of `<script setup>`:

```typescript
import { useModelStoreBootstrap } from '@/composables/useModelStoreBootstrap'
import NotificationLayer from '@/components/layout/NotificationLayer.vue'

useModelStoreBootstrap()
```

- [ ] **Step 3: Mount `<NotificationLayer>` in the template**

Add at the end of the root template (or as a direct child of the top-level wrapper):

```vue
<template>
  <!-- existing app content -->
  <NotificationLayer />
</template>
```

`NotificationLayer` uses `Teleport to body` internally, so its placement in the template is cosmetic — it just needs to be mounted.

- [ ] **Step 4: Typecheck**

```bash
cd /Users/youhebuke/hermes-desktop
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/youhebuke/hermes-desktop
git add src/renderer/src/App.vue
git commit -m "$(cat <<'EOF'
feat(ui): mount fallback bootstrap composable and NotificationLayer

Call useModelStoreBootstrap() at root so connection transitions,
live lifecycle events, and toast debouncing are wired up for the
whole app lifetime. Mount NotificationLayer (teleports to body) so
toasts have a host container.

Part H3 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task H4: Extend `chat.ts::sendMessage` with sync watcher and non-stream metadata read

**Files:**
- Modify: `<HD>/src/renderer/src/stores/chat.ts`

- [ ] **Step 1: Find the streaming `sendMessage` branch**

```bash
cd /Users/youhebuke/hermes-desktop
grep -n "sendMessage\|assistantMsg\|onHermesChatChunk" src/renderer/src/stores/chat.ts | head -30
```

Expected: `sendMessage` around line 920, assistant placeholder created around line 951, `onHermesChatChunk` handler around line 966.

- [ ] **Step 2: Import `watch` and `useModelStore`**

Ensure these imports are present at the top of `chat.ts`:

```typescript
import { watch } from 'vue'
import { useModelStore } from '@/stores/model'
```

- [ ] **Step 3: Stamp the assistant message on creation and wire the sync watcher**

Find where the assistant placeholder is pushed into `messages.value`. Modify the creation to initialize the fallback fields from current store state, and add the sync watcher:

```typescript
    const modelStore = useModelStore()

    const assistantMsg = reactive<ChatMessage>({
      id: genId(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
      // Stamp from current store state
      model: modelStore.state.currentModel ?? undefined,
      fromFallback: modelStore.state.kind === 'fallback',
      fallbackFrom: modelStore.state.fallbackFrom ?? undefined,
      fallbackReasonText: modelStore.state.reasonText ?? undefined,
    })
    messages.value.push(assistantMsg)

    // Watch for mid-stream fallback activation.
    // flush: 'sync' ensures the mark is visible to the very next delta handler.
    const stopFallbackWatch = watch(
      () => modelStore.state.kind,
      (kind) => {
        if (kind === 'fallback' && !assistantMsg.fromFallback) {
          assistantMsg.fromFallback = true
          assistantMsg.model = modelStore.state.currentModel ?? undefined
          assistantMsg.fallbackFrom = modelStore.state.fallbackFrom ?? undefined
          assistantMsg.fallbackReasonText = modelStore.state.reasonText ?? undefined
        }
      },
      { flush: 'sync' }
    )
```

- [ ] **Step 4: Stop the watcher when the stream completes or errors**

Find where the stream completes or errors (look for `[DONE]` handling, error catch blocks, or the function's return). In each terminal branch, call:

```typescript
    stopFallbackWatch()
```

Cover at least: successful completion, error path, user-initiated abort.

- [ ] **Step 5: (If non-stream path exists) Read `_hermes_meta` from response**

If `chat.ts` also has a non-streaming branch (look for `stream: false` or a branch that awaits `response.json()` instead of iterating), add after the fetch completes:

```typescript
    if (response.headers.get('X-Hermes-Fallback-Active') === 'true') {
      const meta = body?._hermes_meta?.fallback
      if (meta) {
        modelStore.applyFallbackActivated({
          schema_version: 1,
          timestamp: meta.switched_at,
          from_model: meta.from_model,
          to_model: meta.to_model,
          from_provider: 'unknown',  // non-stream may not include these
          to_provider: 'unknown',
          reason_code: meta.reason_code,
          reason_text: meta.reason_text,
          fallback_chain: modelStore.state.fallbackChain,
          fallback_index: modelStore.state.fallbackChain.indexOf(meta.to_model),
        })
      }
    }
```

If the non-stream path doesn't exist in `chat.ts`, skip this step.

- [ ] **Step 6: Typecheck**

```bash
cd /Users/youhebuke/hermes-desktop
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Run the existing chat tests (if any) to verify no regression**

```bash
cd /Users/youhebuke/hermes-desktop
npm run test -- src/renderer/src/stores
```

Expected: existing `model.test.ts` passes + any pre-existing chat tests pass.

- [ ] **Step 8: Commit**

```bash
cd /Users/youhebuke/hermes-desktop
git add src/renderer/src/stores/chat.ts
git commit -m "$(cat <<'EOF'
feat(chat): stamp assistant messages with fallback state

When creating the assistant placeholder, initialize fromFallback/model/
fallbackFrom/fallbackReasonText from current modelStore state. Attach
a watch({ flush: 'sync' }) that retroactively stamps the in-flight
message if fallback_activated fires mid-stream — sync flush guarantees
the mark lands before the next delta handler reads the message.

Non-stream path reads _hermes_meta.fallback from response body.

Part H4 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task H5: Wire `markStale()` into `connection.ts::disconnect`

**Files:**
- Modify: `<HD>/src/renderer/src/stores/connection.ts`

- [ ] **Step 1: Find the `disconnect` function**

```bash
cd /Users/youhebuke/hermes-desktop
grep -n "function disconnect\|hermesRealModel" src/renderer/src/stores/connection.ts
```

- [ ] **Step 2: Import `useModelStore`**

Add at the top:

```typescript
import { useModelStore } from '@/stores/model'
```

- [ ] **Step 3: Call `markStale` inside `disconnect`**

Find the existing `disconnect()` function body. Add (near the existing `hermesRealModel.value = null` line):

```typescript
    // Mark model state as stale so badge shows last known data with stale flag.
    // Note: the bootstrap composable also watches connection.status and calls
    // markStale on 'disconnected' transitions — this is a belt-and-suspenders
    // call for code paths that disconnect without changing status.
    try {
      useModelStore().markStale()
    } catch {
      // Pinia store may not be available in all call contexts; ignore.
    }
```

- [ ] **Step 4: Typecheck**

```bash
cd /Users/youhebuke/hermes-desktop
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/youhebuke/hermes-desktop
git add src/renderer/src/stores/connection.ts
git commit -m "$(cat <<'EOF'
feat(connection): markStale model state on disconnect

Belt-and-suspenders call to useModelStore().markStale() inside
disconnect(), in addition to the bootstrap composable's watcher.
Ensures the badge transitions to stale state for any disconnect path.

Part H5 of hermes-desktop fallback visibility design.

Co-Authored-By: Claude Opus 4.6 <noreply@anthropic.com>
EOF
)"
```

---

## Part I — Final acceptance

### Task I1: Run full test suites and manual acceptance

**Files:** none (verification)

- [ ] **Step 1: Agent full test sweep**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/test_provider_fallback.py tests/gateway/test_api_server_fallback.py tests/integration/test_fallback_end_to_end.py -v
```

Expected:
- `TestLifecycleEventEmission`: 8 passed
- `TestSSELifecycleFrames`: 4 passed
- `TestNonStreamFallbackHeaders`: 3 passed
- `TestRunsEndpointLifecycle`: 2 passed
- `TestFallbackEndToEnd`: 1 passed
- **Total: 18 passed**

- [ ] **Step 2: Agent regression sweep (existing tests)**

```bash
cd /Users/youhebuke/.hermes/hermes-agent
uv run pytest tests/run_agent/ tests/gateway/test_api_server.py tests/gateway/test_api_server_jobs.py tests/gateway/test_api_server_normalize.py tests/gateway/test_api_server_toolset.py -v
```

Expected: all pre-existing tests still pass.

- [ ] **Step 3: Desktop full test sweep**

```bash
cd /Users/youhebuke/hermes-desktop
npm run test
```

Expected:
- `model.test.ts`: 12 passed
- `sse-parser.test.ts`: 9 passed
- `useModelStoreBootstrap.test.ts`: 6 passed
- Any pre-existing tests (e.g. `hermes-git.test.ts`): still pass
- **Total new: 27 passed**

- [ ] **Step 4: Desktop typecheck**

```bash
cd /Users/youhebuke/hermes-desktop
npm run typecheck
```

Expected: zero errors.

- [ ] **Step 5: Manual acceptance scenario 1 — fallback mid-conversation**

**Setup:**
1. Edit `~/.hermes/config.yaml` to set `model:` to a deliberately bad model (e.g. use a real model name but an invalid API key for that provider). Set `fallback_model:` to a working model.
2. Start hermes-agent: `cd /Users/youhebuke/.hermes/hermes-agent && uv run python -m hermes.gateway.run` (or whatever the start command is).
3. Start hermes-desktop: `cd /Users/youhebuke/hermes-desktop && npm run dev`.
4. Connect to the local hermes-rest instance.

**Verify:**
- [ ] Badge in AppHeader top-right shows green `● <primary>` immediately after connect
- [ ] Send a chat message
- [ ] Badge flips to amber `⚠ <fallback> via <primary>` when primary fails
- [ ] Top-right toast appears with title "Switched to fallback model" and 2-line body
- [ ] Toast auto-dismisses after ~3 seconds
- [ ] Assistant message in chat shows a small amber `⚠ via <primary>` chip next to the role tag
- [ ] Hover the chip → tooltip shows full reason text
- [ ] Click the badge → NPopover opens showing the fallback chain with the fallback model highlighted amber, plus reason section with timestamp

- [ ] **Step 6: Manual acceptance scenario 2 — primary restored**

**Setup:** fix the primary API key.

**Verify:**
- [ ] Send another chat message
- [ ] Agent successfully uses primary → emits `primary_restored`
- [ ] Badge goes back to green `● <primary>`
- [ ] NO new toast appears (primary_restored is silent)
- [ ] New assistant message has NO chip

- [ ] **Step 7: Manual acceptance scenario 3 — chain exhausted**

**Setup:** break all models in the chain (bad keys everywhere).

**Verify:**
- [ ] Send a message
- [ ] Badge turns red `⚠ all N models failed`
- [ ] Red toast appears with 5-second duration
- [ ] Assistant message ends in error state (existing error handling)
- [ ] Dropdown shows all chain items with line-through styling

- [ ] **Step 8: Manual acceptance scenario 4 — disconnect stale**

**Verify:**
- [ ] During a fallback state, stop hermes-agent
- [ ] Desktop badge transitions to grey with `(stale)` in tooltip
- [ ] Last-known fallback model name still visible in badge
- [ ] Restart hermes-agent and reconnect
- [ ] Badge refreshes from bootstrap (fresh state)

- [ ] **Step 9: Manual acceptance scenario 5 — toast debounce**

**Setup:** configure a primary that fails only on specific requests (or restart-toggle between 3 rapid failures).

**Verify:**
- [ ] First fallback: toast appears
- [ ] Second fallback within 60s (same key): NO new toast, badge still updates
- [ ] Wait 61 seconds, trigger again: toast appears

- [ ] **Step 10: Non-regression — IM adapter status callback still works**

- [ ] Verify a pre-existing IM integration (Slack/Telegram/etc.) still emits text notifications via the existing `status_callback` path. The new `lifecycle_event_callback` is a separate channel and must not have touched the IM contract.

- [ ] **Step 11: Final commit (if any manual fixups needed)**

If scenarios uncovered bugs, fix them in their respective tasks' files, commit with descriptive messages, and re-run the relevant test sweep.

---

## Self-Review

**1. Spec coverage** (each section of the design doc → task that implements it):

| Spec section | Covered by |
|---|---|
| §1 Problem statement & chosen approach | (no task — design rationale) |
| §2.1 New callback field | A1 |
| §2.2 Event type constants | A1 |
| §2.3 Payload schemas | A2 (fallback), A3 (restore), A4 (exhausted) |
| §2.4 `_emit_lifecycle_event` helper | A1 |
| §2.5 Wiring in `_try_activate_fallback` | A2 |
| §2.6 Wiring in `_restore_primary_runtime` | A3 |
| §2.7 Chain-exhausted wiring | A4 |
| §2.8 Thread safety | A1 (agent-side) + B1, B3 (transport-side) |
| §3.2 hermes-rest streaming | B1 |
| §3.3 hermes-rest non-streaming | B2 |
| §3.4 `/v1/runs` SSE | B3 |
| §3.5 acp-ws contract (external) | F1 (client subscribes via `apiClient.on`) |
| §4.1 `useModelStore` rewrite | D2 |
| §4.2 `useModelStoreBootstrap` composable | F1 |
| §4.3 `ModelStateBadge` | G1 |
| §4.4 `ModelDropdown` | G1 |
| §4.5 `ModelToast` | G2 |
| §4.6 `FallbackChip` | G3 |
| §4.7 Extended `ChatMessage` type | D1 |
| §4.8 Mid-stream message marking | H4 |
| §4.9 IPC surface additions | E2 |
| §5 Data flow (informational diagrams) | (no task — design rationale) |
| §6.1 Stale badge on disconnect | H5 (+ F1 watcher) |
| §6.2 Toast debounce | F1 |
| §6.3 `yaml.load` refactor | E2 |
| §6.4 SSE parser extension | E1, E2 |
| §6.5 Error matrix | implicit across all transport/composable tasks |
| §6.6 Non-hermes model names | (no code needed — display verbatim) |
| §6.7 Config reload without reconnect | (out of scope per spec) |
| §6.8 First-turn fallback | tested by D2 test "applyFallbackActivated from unknown" |
| §7.1 Test pyramid | (no task — strategy) |
| §7.2 Agent unit tests | A1–A4 |
| §7.3 Transport tests | B1–B3 |
| §7.4 Desktop unit tests | D2 (store), E1 (parser), F1 (composable) |
| §7.5 Integration test | C1 |
| §7.6 Test fixtures | A1 (Python `lifecycle_capture`), F1 (TS `sse-fixtures.ts`) |

**Gaps found:** none.

**2. Placeholder scan:**
- No `TODO`/`TBD`/"implement later" in task bodies. (The `TODO(localization)` comment inside `ModelDropdown.vue` is an explicit deferred item noted in spec §8 Open Questions — acceptable.)
- No "write tests for the above" — every test is spelled out with real code.
- No "similar to Task N" — code is repeated where needed.

**3. Type consistency:**
- `useModelStore` methods consistently named: `bootstrap`, `applyFallbackActivated`, `applyPrimaryRestored`, `applyChainExhausted`, `markStale`, `reset`. Referenced consistently across D2, F1, G1, G2, H4, H5.
- `ModelState` fields consistent between definition (D2) and consumers (G1 dropdown, G1 badge, H4 chat).
- Lifecycle payload types (`FallbackActivatedPayload`, etc.) defined in D1, used in D2, F1, G2, H4 — all match.
- SSE parser: `parseSseLine`, `makeInitialSseParserState`, `SseParserState`, `ParsedSseLine` — consistent between E1 and E2.
- Agent event name constants: `LIFECYCLE_EVENT_FALLBACK_ACTIVATED`, `LIFECYCLE_EVENT_PRIMARY_RESTORED`, `LIFECYCLE_EVENT_CHAIN_EXHAUSTED` — defined in A1, used in A2/A3/A4.

**No mismatches found.**

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-04-14-hermes-desktop-fallback-visibility.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration. REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

2. **Inline Execution** — Execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints for review.

**Which approach?**
