# Hermes Desktop Fallback Visibility — Design

**Date:** 2026-04-14
**Target version:** v0.2.x
**Status:** Draft (pending implementation)
**Scope:** Make hermes-agent's `fallback_model` mechanism visible in hermes-desktop UI across both connection modes (`hermes-rest` and `acp-ws`)

---

## 0. TL;DR

**Problem.** hermes-desktop is completely blind to `fallback_model`. Config parsing ignores it, runtime state has no fallback concept, and the UI has no model indicator at all. When hermes-agent silently switches from `gpt-5.4` to `gemini-2.5-pro` because the primary fails auth, the user sees nothing.

**Approach.** Tier C — real-time event push. Agent emits structured lifecycle events (`fallback_activated` / `primary_restored` / `chain_exhausted`) over a new `lifecycle_event_callback` channel. Three transports relay them (hermes-rest SSE, hermes-rest non-stream headers+body, /v1/runs SSE). A fourth transport (acp-ws Gateway v3) is a contract-only spec — the Gateway server lives in an external project.

**UX.** Three coordinated surfaces: (1) a global badge in the AppHeader top-right (`ModelStateBadge`, hybrid C visual), (2) a toast on fallback activation (`ModelToast`, T-A style: top-right, detailed, 3 s), (3) a per-message footer chip on assistant messages produced by a fallback model (`FallbackChip`, style A). Click the badge → `ModelDropdown` popover (D-B style: chain visualization + reason + timestamp).

**Key architectural choice.** Unified Python callback, per-transport relay, unified desktop store. One `useModelStore` holds the tagged-union state regardless of which transport delivered the event.

---

## 1. Problem Statement & Chosen Approach

### 1.1 Current state (grep-verified)

| Layer | File | Today | Gap |
|---|---|---|---|
| Config parse | `src/main/index.ts::hermes:config` | Regex for top-level `model:` | `fallback_model:` silently dropped |
| Runtime state | `src/renderer/src/stores/model.ts` | 18-line stub, empty `models[]` | No concept of primary/fallback/chain |
| Connection state | `src/renderer/src/stores/connection.ts` | `hermesRealModel: string \| null` from `/v1/models` or regex | Single string, no fallback awareness |
| AppHeader UI | `src/renderer/src/components/layout/AppHeader.vue` | No model indicator | — |
| Chat UI | `src/renderer/src/views/chat/ChatPage.vue` | `ChatMessage.model?: string` unused in hermes-rest path | No per-message provenance |
| IPC | `src/preload/index.ts` | `hermesChat`, `onHermesChatChunk` | No lifecycle event channel |
| SSE parser | `src/main/index.ts::hermes:chat` handler | Recognizes `data:` lines only | Ignores named `event:` lines |

Meanwhile, hermes-agent (`run_agent.py`) already implements the whole fallback mechanism — `_fallback_chain`, `_fallback_index`, `_primary_runtime`, `_try_activate_fallback`, `_restore_primary_runtime`. It just has no way to tell anyone what it's doing.

### 1.2 Requirements

**Must**
1. User sees the current effective model at all times (not just the configured primary)
2. User is notified when fallback activates mid-conversation (toast)
3. Messages produced by a fallback model are visually tagged
4. User can inspect the full fallback chain + reason via click
5. Works for both `hermes-rest` and `acp-ws` connection modes

**Should**
6. Support `primary_restored` event (next turn switches back)
7. Support `chain_exhausted` event (all fallbacks failed)
8. Badge survives disconnect/reconnect without duplicate state
9. Toast is rate-limited to avoid spam on rapid flip-flop

**Won't** (out of scope)
- Manual "restore primary" button (requires new agent API)
- Historical replay of fallback events across app restarts
- Predictive "this turn will likely fallback" warnings
- Reload config without reconnect

### 1.3 Chosen approach: Tier C (real-time event push)

Three tiers were considered and the user chose **C**:

| Tier | Description | Freshness | Cost |
|---|---|---|---|
| A | Static — read config.yaml at connect time, show primary only | Stale immediately on fallback | Near zero |
| B | Polling — GET `/v1/models` every N seconds | N-second lag | Low but wasteful |
| **C** | **Push — agent emits events, transports relay, desktop reacts** | **Sub-second** | **Moderate (new code on both sides)** |

**Why C.** The whole point of visibility is that a silent switch is a UX bug; tier A delivers the same bug in a different wrapper, and tier B introduces a guaranteed lag window exactly at the moment when the user most needs to know what happened.

### 1.4 UX decisions (all chosen in brainstorm)

| Decision | Choice | Rationale |
|---|---|---|
| Implementation tier | C (real-time push) | Only option that is instantly correct |
| Transport scope | Both hermes-rest AND acp-ws | User uses both |
| Events | `fallback_activated` + `primary_restored` + `chain_exhausted` | Minimum set to explain any observable state transition |
| UX surfaces | Global badge + per-message tag + toast | Each answers a different question: "now?", "that message?", "just happened?" |
| Badge placement | AppHeader top-right | Cross-page visible, reuses existing slot, no new layout region |
| Badge visual | Hybrid C — current + "via primary" on degraded | Normal state stays simple; degraded state packs max info without hover |
| Per-message tag | A — footer chip | Lowest visual noise; doesn't intrude on content |
| Toast | T-A — top-right, detailed, 3 s | Sits near the badge it's explaining; enough info to understand without clicking |
| Dropdown | D-B — chain + reason | Visualizes the degradation path; primary interaction is glance-to-understand |
| Architecture | ③ Hybrid (unified Python callback + per-transport relay + unified desktop store) | Avoids both the "two parallel stacks" and "one giant god channel" failure modes |

---

## 2. Agent-side Changes (`hermes-agent/run_agent.py`)

### 2.1 New callback field

Add a dedicated structured event channel on `AIAgent`, separate from the existing `status_callback`:

```python
class AIAgent:
    def __init__(self, ...):
        ...
        self.status_callback: Optional[Callable[[str, str], None]] = None  # existing
        self.lifecycle_event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None  # NEW
```

**Why a new callback instead of reusing `status_callback`:** `status_callback` has an existing contract with IM adapters (see `gateway/run.py::_status_callback_sync`) — signature `(level, text)` where `text` is rendered verbatim into Slack/Telegram messages. Lifecycle events need a structured dict payload, not a formatted string. Repurposing `status_callback` would silently break every IM integration. Cleaner to have a dedicated structured channel.

### 2.2 Event types (constants)

```python
LIFECYCLE_EVENT_FALLBACK_ACTIVATED = "hermes.model.fallback_activated"
LIFECYCLE_EVENT_PRIMARY_RESTORED   = "hermes.model.primary_restored"
LIFECYCLE_EVENT_CHAIN_EXHAUSTED    = "hermes.model.chain_exhausted"
```

Event names are namespaced `hermes.model.*` so that transports can route by prefix and future event families (`hermes.tool.*`, `hermes.budget.*`, …) can coexist without collision.

### 2.3 Payload schemas (schema_version=1)

**`hermes.model.fallback_activated`**
```python
{
    "schema_version": 1,
    "timestamp": "2026-04-14T10:23:45.123Z",  # ISO 8601 UTC
    "from_model": "gpt-5.4",
    "to_model": "gemini-2.5-pro",
    "from_provider": "openai",
    "to_provider": "google",
    "reason_code": "auth_failed",    # enum: auth_failed | rate_limited | server_error | network_error | timeout | other
    "reason_text": "401 Unauthorized",  # human-readable, single line, max 200 chars
    "fallback_chain": ["gpt-5.4", "gemini-2.5-pro", "claude-3.5-sonnet"],
    "fallback_index": 1,             # current position in chain (0 = primary)
}
```

**`hermes.model.primary_restored`**
```python
{
    "schema_version": 1,
    "timestamp": "2026-04-14T10:26:01.456Z",
    "restored_to": "gpt-5.4",
    "restored_from": "gemini-2.5-pro",
    "primary_model": "gpt-5.4",
}
```

**`hermes.model.chain_exhausted`**
```python
{
    "schema_version": 1,
    "timestamp": "2026-04-14T10:23:47.789Z",
    "attempted_models": ["gpt-5.4", "gemini-2.5-pro", "claude-3.5-sonnet"],
    "last_error_code": "server_error",
    "last_error_text": "All models failed: gpt-5.4=401, gemini=429, claude=500",  # max 500 chars
    "fallback_chain": ["gpt-5.4", "gemini-2.5-pro", "claude-3.5-sonnet"],
}
```

### 2.4 `_emit_lifecycle_event` helper

```python
def _emit_lifecycle_event(self, event_type: str, payload: Dict[str, Any]) -> None:
    """Emit a lifecycle event to the registered callback.

    - Always stamps schema_version and timestamp (if not already present)
    - Swallows callback exceptions so a buggy consumer never breaks the agent loop
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

### 2.5 Wiring in `_try_activate_fallback`

Signature change: `_try_activate_fallback(self, reason_code: str, reason_text: str) -> bool`. All 4 call sites in `run_conversation()` and its helpers must pass both arguments derived from the caught exception.

On a successful transition (`_fallback_index` advances, `_fallback_activated` flips to True), emit **before** the recursive tail call:

```python
def _try_activate_fallback(self, reason_code: str, reason_text: str) -> bool:
    if not self._has_next_fallback():
        return False

    previous_model = self._current_runtime.model
    previous_provider = self._current_runtime.provider

    self._fallback_index += 1
    self._current_runtime = self._runtimes[self._fallback_index]
    self._fallback_activated = True

    self._emit_lifecycle_event(
        LIFECYCLE_EVENT_FALLBACK_ACTIVATED,
        {
            "from_model": previous_model,
            "to_model": self._current_runtime.model,
            "from_provider": previous_provider,
            "to_provider": self._current_runtime.provider,
            "reason_code": reason_code,
            "reason_text": reason_text[:200],  # clamp
            "fallback_chain": list(self._fallback_chain),
            "fallback_index": self._fallback_index,
        },
    )

    return True
```

### 2.6 Wiring in `_restore_primary_runtime`

```python
def _restore_primary_runtime(self) -> None:
    if not self._fallback_activated:
        return  # no-op if we never fell back

    restored_from = self._current_runtime.model
    restored_to = self._primary_runtime.model

    # existing restore logic
    self._current_runtime = self._primary_runtime
    self._fallback_activated = False
    self._fallback_index = 0

    self._emit_lifecycle_event(
        LIFECYCLE_EVENT_PRIMARY_RESTORED,
        {
            "restored_to": restored_to,
            "restored_from": restored_from,
            "primary_model": restored_to,
        },
    )
```

### 2.7 Chain-exhausted wiring

**Subtle**: `_try_activate_fallback` can be invoked recursively (tail call when the new runtime also fails). Emitting `chain_exhausted` inside `_try_activate_fallback` would double-fire on recursion.

**Solution**: emit at the **outer retry boundary** — the call sites in `run_conversation()` that catch the outermost exception and give up. There are 4 such sites (roughly one per retryable operation type):

1. Main chat completion retry loop
2. Tool call retry loop
3. Streaming chunk retry path
4. Structured output / classification retry path

Helper method:
```python
def _emit_chain_exhausted(self, last_error_code: str, last_error_text: str) -> None:
    self._emit_lifecycle_event(
        LIFECYCLE_EVENT_CHAIN_EXHAUSTED,
        {
            "attempted_models": list(self._fallback_chain[:self._fallback_index + 1]),
            "last_error_code": last_error_code,
            "last_error_text": last_error_text[:500],
            "fallback_chain": list(self._fallback_chain),
        },
    )
```

Call-site pattern:
```python
try:
    result = self._call_model(...)
except ModelFailure as exc:
    if not self._try_activate_fallback(exc.reason_code, str(exc)):
        self._emit_chain_exhausted(exc.reason_code, str(exc))
        raise
```

### 2.8 Thread safety

`run_conversation()` runs inside `loop.run_in_executor(None, ...)` — a worker thread distinct from the main asyncio loop thread. The `lifecycle_event_callback` is therefore called from that worker thread.

**Agent-side contract** (what the agent promises):
- Callback is invoked synchronously, on whichever thread is running `run_conversation`
- Callback is invoked at most once per transition event
- Agent swallows exceptions from the callback

**Consumer-side responsibility** (what the transport must do):
- If the consumer needs to mutate state on the main event loop (e.g. push to an `asyncio.Queue`), it must use `loop.call_soon_threadsafe(queue.put_nowait, payload)`
- If the consumer uses a thread-safe `queue.Queue`, direct `.put()` is fine

See Section 3 for how each transport handles this.

---

## 3. Transport Layer

### 3.1 Overview

Four independent paths carry lifecycle events from agent to consumer:

| # | Path | Consumer | Frame format |
|---|---|---|---|
| 3.2 | hermes-rest streaming `/v1/chat/completions` | hermes-desktop via Electron fetch → SSE | custom SSE `event:` names |
| 3.3 | hermes-rest non-streaming `/v1/chat/completions` | hermes-desktop via fetch → JSON | response headers + `_hermes_meta` body field |
| 3.4 | `/v1/runs` SSE | hermes-desktop (public API, not heavily used today) | custom SSE `event:` names |
| 3.5 | acp-ws (Gateway protocol v3) | hermes-desktop via WebSocket | JSON-RPC event frame |

### 3.2 hermes-rest streaming (`api_server.py::_handle_chat_completions`)

**Existing pattern to mirror** (tool_progress, `api_server.py` line ~707):
```python
_stream_q: queue.Queue[Any] = queue.Queue()

def _on_tool_progress(payload):
    _stream_q.put(("__tool_progress__", payload))
```

and later in the SSE emitter:
```python
while True:
    item = _stream_q.get()
    if isinstance(item, tuple) and item[0] == "__tool_progress__":
        yield f"event: hermes.tool.progress\ndata: {json.dumps(item[1])}\n\n"
```

**New sibling** for lifecycle events:
```python
def _on_lifecycle_event(event_type: str, payload: Dict[str, Any]) -> None:
    _stream_q.put(("__lifecycle__", event_type, payload))

agent = self._create_agent(
    ...,
    lifecycle_event_callback=_on_lifecycle_event,
)

# in the emitter loop:
while True:
    item = _stream_q.get()
    if isinstance(item, tuple):
        if item[0] == "__tool_progress__":
            yield f"event: hermes.tool.progress\ndata: {json.dumps(item[1])}\n\n"
        elif item[0] == "__lifecycle__":
            event_name = item[1]                # e.g. "hermes.model.fallback_activated"
            yield f"event: {event_name}\ndata: {json.dumps(item[2])}\n\n"
    else:
        # existing delta chunk handling
        yield f"data: {item}\n\n"
```

**`_create_agent` update**: accept `lifecycle_event_callback` kwarg and forward to `AIAgent` constructor (analogous to how it already forwards `stream_delta_callback` and `tool_progress_callback`).

**Thread safety**: `queue.Queue` is already thread-safe, so the agent's worker thread can call `.put()` directly. No extra bridging needed on this path.

**Frame ordering** (critical, enforced by queue FIFO): a `fallback_activated` emitted before the first delta of the new model will arrive on the wire before any delta from that model. The desktop relies on this to correctly stamp the assistant message (Section 4.8, Section 5.5).

### 3.3 hermes-rest non-streaming

Non-streaming returns one JSON body. Two complementary mechanisms:

**Response headers** (always present when fallback is active):
```
X-Hermes-Fallback-Active: true
X-Hermes-Effective-Model: gemini-2.5-pro
X-Hermes-Primary-Model: gpt-5.4
X-Hermes-Fallback-Reason-Code: auth_failed
```

**Response body extension** — a new `_hermes_meta` key at the top level:
```json
{
  "id": "chatcmpl-...",
  "object": "chat.completion",
  "choices": [...],
  "usage": {...},
  "_hermes_meta": {
    "fallback": {
      "active": true,
      "from_model": "gpt-5.4",
      "to_model": "gemini-2.5-pro",
      "reason_code": "auth_failed",
      "reason_text": "401 Unauthorized",
      "switched_at": "2026-04-14T10:23:45.123Z"
    }
  }
}
```

OpenAI-compatible clients ignore unknown top-level fields. The `_hermes_` prefix makes the namespace unambiguous.

**Capture logic**: this path doesn't emit events — it inspects `agent._fallback_activated` after the call returns. If true, synthesize the meta block from agent state and attach both to headers and body.

**Desktop reaction** (this path): the renderer inspects response headers or `_hermes_meta` in `chat.ts::sendMessage` and calls `modelStore.applyFallbackActivated(...)` directly before appending the completed message. No IPC lifecycle channel involvement for this path.

### 3.4 `/v1/runs` SSE (`api_server.py::_handle_runs`)

This endpoint uses `asyncio.Queue` (not `queue.Queue`) because it lives on the main event loop. The callback is invoked from the agent worker thread, so we need thread-safe queue.put.

Extend `_make_run_event_callback(run_id)`:
```python
def _make_run_event_callback(self, run_id: str):
    stream = self._run_streams[run_id]
    loop = asyncio.get_running_loop()

    def _cb(event_type: str, payload: Dict[str, Any]) -> None:
        frame = {"event": event_type, "data": payload}
        loop.call_soon_threadsafe(stream.put_nowait, frame)

    return _cb
```

Wire via `agent.lifecycle_event_callback = self._make_run_event_callback(run_id)`.

The SSE emitter (already exists for other run events) serializes each frame dict as `event: {event}\ndata: {json(data)}\n\n`.

### 3.5 acp-ws (Gateway protocol v3) — contract only

**Important scope note**: the acp-ws server implementation lives in an **external project**, not in hermes-agent. This spec defines the wire contract; the implementation happens in that other repo.

**Wire format** (Gateway v3 event frame):
```json
{
  "type": "event",
  "event": "hermes.model.fallback_activated",
  "payload": {
    "schema_version": 1,
    "timestamp": "2026-04-14T10:23:45.123Z",
    "from_model": "gpt-5.4",
    "to_model": "gemini-2.5-pro",
    "from_provider": "openai",
    "to_provider": "google",
    "reason_code": "auth_failed",
    "reason_text": "401 Unauthorized",
    "fallback_chain": ["gpt-5.4", "gemini-2.5-pro"],
    "fallback_index": 1
  },
  "seq": 42
}
```

The `seq` field is owned by the Gateway server (monotonic per WebSocket session).

**Desktop consumer** (`api/websocket.ts`): uses the existing `apiClient.on('event:<name>')` namespaced subscription pattern:
```typescript
apiClient.on('event:hermes.model.fallback_activated', (frame) => {
  modelStore.applyFallbackActivated(frame.payload)
})
```

**Contract for external Gateway implementers**:
- Events are per-session (NOT broadcast across connections)
- At-most-once delivery is acceptable (desktop is idempotent — `applyFallbackActivated` on an already-fallback state is a no-op upgrade)
- Order preserved within a session
- If the Gateway doesn't wire them yet, acp-ws mode degrades gracefully: no fallback events visible, no error, normal chat continues. Documented fallback behavior, not a bug.

### 3.6 Other routes (out of scope)

| Route | Action |
|---|---|
| `/v1/completions` (text completion, legacy) | Mirror 3.2 if used; otherwise skip |
| `/v1/embeddings` | No fallback semantics, skip |
| `/v1/models` | Enumerate primary + chain (already does model enumeration); not an event path |

---

## 4. Desktop State + Components

### 4.1 `useModelStore` — full rewrite with tagged-union state

Replace the 18-line stub at `src/renderer/src/stores/model.ts` entirely.

```typescript
// src/renderer/src/stores/model.ts
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type {
  FallbackActivatedPayload,
  PrimaryRestoredPayload,
  ChainExhaustedPayload,
} from '@/api/types'

export type ModelStateKind =
  | 'unknown'    // no data yet (pre-bootstrap)
  | 'normal'     // running on primary
  | 'fallback'   // running on a fallback
  | 'exhausted'  // all models failed
  | 'stale'      // last known state, connection lost

export interface ModelState {
  kind: ModelStateKind
  primaryModel: string | null        // from config.yaml
  currentModel: string | null        // what's actually running now
  fallbackChain: string[]            // all configured models in order [primary, ...fallbacks]
  fallbackFrom: string | null        // kind='fallback': the displaced primary (for "via gpt-5.4")
  reasonCode: string | null
  reasonText: string | null
  switchedAt: string | null          // ISO timestamp
  attemptedModels: string[]          // kind='exhausted': all tried
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

  // --- Computed ---
  const isNormal     = computed(() => state.value.kind === 'normal')
  const isFallback   = computed(() => state.value.kind === 'fallback')
  const isExhausted  = computed(() => state.value.kind === 'exhausted')
  const isStale      = computed(() => state.value.kind === 'stale')
  const displayModel = computed(
    () => state.value.currentModel ?? state.value.primaryModel ?? 'unknown'
  )

  // --- Ingest ---
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

  // --- Lifecycle ---
  function markStale(): void {
    // Keeps last known values but flags as possibly outdated.
    // No-op if we never had data.
    if (state.value.kind === 'unknown') return
    state.value = { ...state.value, kind: 'stale' }
  }

  function reset(): void {
    state.value = { ...INITIAL_STATE }
  }

  return {
    state,
    isNormal, isFallback, isExhausted, isStale, displayModel,
    bootstrap,
    applyFallbackActivated,
    applyPrimaryRestored,
    applyChainExhausted,
    markStale,
    reset,
  }
})
```

### 4.2 `useModelStoreBootstrap` composable

Bridges three sources into the store:
1. Config.yaml read at connect time (via IPC `hermes:config`)
2. `/v1/models` endpoint (for hermes-rest) or hello-ok handshake (for acp-ws)
3. Live lifecycle events (IPC `hermes:lifecycle` for hermes-rest; WebSocket for acp-ws)

```typescript
// src/renderer/src/composables/useModelStoreBootstrap.ts
import { watch, onUnmounted } from 'vue'
import { useConnectionStore } from '@/stores/connection'
import { useModelStore } from '@/stores/model'
import { useNotificationStore } from '@/stores/notification'
import { apiClient } from '@/api/http-client'

export function useModelStoreBootstrap(): void {
  const connectionStore = useConnectionStore()
  const modelStore = useModelStore()
  const notificationStore = useNotificationStore()

  // Toast debounce: dedupe-by-key within 60s window
  const lastToastKey = new Map<string, number>()
  const DEBOUNCE_MS = 60_000

  // 1. Re-bootstrap on connection transitions
  watch(
    () => connectionStore.status,
    async (status, prev) => {
      if (status === 'connected' && prev !== 'connected') {
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

  // --- Helpers ---

  async function runBootstrap(): Promise<void> {
    if (connectionStore.serverType === 'hermes-rest') {
      const config = await window.api.hermesConfig()
      modelStore.bootstrap({
        primary: config.primary,
        fallbackChain: config.fallback_chain,
      })
    } else if (connectionStore.serverType === 'acp-ws') {
      const helloModel = connectionStore.acpHelloModelInfo
      modelStore.bootstrap({
        primary: helloModel?.primary ?? null,
        fallbackChain: helloModel?.fallback_chain ?? [],
      })
    }
  }

  function subscribeLifecycle(): () => void {
    // hermes-rest path: main process SSE parser → IPC
    const removeIpc = window.api.onHermesLifecycle((event) => {
      routeLifecycle(event.name, event.payload)
    })

    // acp-ws path: WebSocket event frames
    const removeWs1 = apiClient.on('event:hermes.model.fallback_activated',
      (f: any) => routeLifecycle('hermes.model.fallback_activated', f.payload))
    const removeWs2 = apiClient.on('event:hermes.model.primary_restored',
      (f: any) => routeLifecycle('hermes.model.primary_restored', f.payload))
    const removeWs3 = apiClient.on('event:hermes.model.chain_exhausted',
      (f: any) => routeLifecycle('hermes.model.chain_exhausted', f.payload))

    return () => {
      removeIpc()
      removeWs1()
      removeWs2()
      removeWs3()
    }
  }

  function routeLifecycle(name: string, payload: any): void {
    switch (name) {
      case 'hermes.model.fallback_activated':
        modelStore.applyFallbackActivated(payload)
        triggerFallbackToast(payload)
        break
      case 'hermes.model.primary_restored':
        modelStore.applyPrimaryRestored(payload)
        // no toast on restore — avoid nagging
        break
      case 'hermes.model.chain_exhausted':
        modelStore.applyChainExhausted(payload)
        triggerExhaustedToast(payload)
        break
      default:
        console.debug('[lifecycle] unknown event', name)
    }
  }

  function triggerFallbackToast(p: any): void {
    const key = `fallback:${p.from_model}->${p.to_model}:${p.reason_code}`
    const now = Date.now()
    const last = lastToastKey.get(key) ?? 0
    if (now - last < DEBOUNCE_MS) return
    lastToastKey.set(key, now)
    notificationStore.push({ kind: 'fallback', payload: p, durationMs: 3000 })
  }

  function triggerExhaustedToast(p: any): void {
    const key = `exhausted:${p.last_error_code}`
    const now = Date.now()
    const last = lastToastKey.get(key) ?? 0
    if (now - last < DEBOUNCE_MS) return
    lastToastKey.set(key, now)
    notificationStore.push({ kind: 'exhausted', payload: p, durationMs: 5000 })
  }
}
```

Called once from `App.vue`'s `<script setup>` at mount.

### 4.3 `ModelStateBadge.vue` — AppHeader top-right (visual: Hybrid C)

Insertion point in `AppHeader.vue`:
```vue
<NSpace :size="8" align="center">
  <ModelStateBadge v-if="connectionStore.status === 'connected'" />
  <ConnectionStatus />
  <!-- existing theme/language/logout buttons -->
</NSpace>
```

Visual states:

| Kind | Appearance |
|---|---|
| `normal` | Green pill, `● gpt-5.4` |
| `fallback` | Amber pill, `⚠ gemini-2.5-pro` with small `via gpt-5.4` subscript |
| `exhausted` | Red pill, `⚠ all 3 models failed` |
| `stale` | Grey pill, `gpt-5.4` with `(stale)` in tooltip |
| `unknown` | Grey pill, `? unknown` |

Interaction:
- Click → opens `ModelDropdown` in an `NPopover`
- Hover → tooltip with full model name + provider + reason

### 4.4 `ModelDropdown.vue` — popover content (visual: D-B chain + reason)

Sections (order):
1. **Fallback chain** — row of pills with arrows, e.g. `gpt-5.4 → [gemini-2.5-pro] → claude-3.5-sonnet`, current model highlighted (amber for fallback, green for normal). Subtitle: "from `~/.hermes/config.yaml`"
2. **Switch reason** (only in fallback/exhausted states) — reason_code as localized label, reason_text on next line, relative timestamp ("2 minutes ago")

Width ~280 px. No manual "restore primary" button in this version (see §8 open questions).

### 4.5 `ModelToast.vue` — T-A design (top-right, detailed)

Triggered by `notificationStore.push({ kind: 'fallback', ... })` via `<NotificationLayer>` at App.vue root.
- Position: absolute top-right, ~50 px from top (aligned with badge)
- Size: ≤ 260 px max-width
- Content: title "Switched to fallback model" + 2-line subtitle:
  - `{from} returned {reason_code}: {reason_text}`
  - `now using {to_model}`
- Auto-dismiss: 3 s for fallback_activated, 5 s for chain_exhausted
- Manual close: × icon
- Animation: slide-in from right, 300 ms ease
- Debounced at the trigger site (Section 4.2), not here

Implementation: dedicated `useNotificationStore` (Pinia) + Teleport to body, rendered by `<NotificationLayer>` component. Not NaiveUI's `useNotification` — we need full control over positioning and animation.

### 4.6 `FallbackChip.vue` — per-message footer (visual: A)

Insertion point in `ChatPage.vue` (line ~2752, inside `.chat-bubble-meta`):
```vue
<div class="chat-bubble-meta">
  <NTag>{{ entry.item.role }}</NTag>
  <FallbackChip
    v-if="entry.item.fromFallback"
    :model="entry.item.model"
    :from="entry.item.fallbackFrom"
    :reason-text="entry.item.fallbackReasonText"
  />
  <span class="timestamp">{{ formatTime(entry.item.timestamp) }}</span>
</div>
```

Visual: small amber chip `⚠ via gpt-5.4` with tooltip on hover showing full reason text + timestamp.

### 4.7 Extended `ChatMessage` type

In `src/renderer/src/api/types/index.ts`:
```typescript
interface ChatMessage {
  // ... existing fields ...
  model?: string                // existing; now populated in hermes-rest path
  fromFallback?: boolean        // NEW
  fallbackFrom?: string         // NEW: the displaced primary
  fallbackReasonText?: string   // NEW: for tooltip
}

// NEW: lifecycle payload types
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
```

### 4.8 Mid-stream message marking (critical)

**The problem**: the assistant placeholder is pushed to `messages[]` BEFORE any chunk arrives. If `fallback_activated` fires mid-stream (primary fails on the first tool call, fallback takes over), we must stamp the in-flight message retroactively. If we stamp after the delta handler writes the next chunk, we may race against Vue's render cycle.

**Solution**: a synchronous-flush watcher tied to the lifetime of this specific message.

In `stores/chat.ts::sendMessage()`:
```typescript
const assistantMsg = reactive<ChatMessage>({
  id: genId(),
  role: 'assistant',
  content: '',
  timestamp: Date.now(),
  model: modelStore.state.currentModel ?? undefined,
  fromFallback: modelStore.state.kind === 'fallback',
  fallbackFrom: modelStore.state.fallbackFrom ?? undefined,
  fallbackReasonText: modelStore.state.reasonText ?? undefined,
})
messages.value.push(assistantMsg)

// Watch for mid-stream fallback activation on THIS message
const stopWatch = watch(
  () => modelStore.state.kind,
  (kind) => {
    if (kind === 'fallback' && !assistantMsg.fromFallback) {
      assistantMsg.fromFallback = true
      assistantMsg.model = modelStore.state.currentModel ?? undefined
      assistantMsg.fallbackFrom = modelStore.state.fallbackFrom ?? undefined
      assistantMsg.fallbackReasonText = modelStore.state.reasonText ?? undefined
    }
  },
  { flush: 'sync' }  // ← CRITICAL
)

// ... stream handler ...

onStreamComplete(() => stopWatch())
// Also stop on error/abort branches
```

**Why `flush: 'sync'`**: default `flush: 'pre'` defers the watcher callback to the next microtask. If a delta chunk's IPC message arrives between the fallback event handler completing and the next tick, the delta handler's synchronous access to `assistantMsg.fromFallback` would still see `false`. `flush: 'sync'` runs the watcher callback synchronously inside the Pinia dispatch that mutated `modelStore.state.kind`, guaranteeing the mark is visible before any other reactive effect reads the message.

### 4.9 IPC surface additions

**Preload** (`src/preload/index.ts`):
```typescript
contextBridge.exposeInMainWorld('api', {
  // ... existing ...
  onHermesLifecycle: (cb: (event: { name: string; payload: any }) => void) => {
    const listener = (_: any, event: { name: string; payload: any }) => cb(event)
    ipcRenderer.on('hermes:lifecycle', listener)
    return () => ipcRenderer.removeListener('hermes:lifecycle', listener)
  },
  hermesConfig: () => ipcRenderer.invoke('hermes:config'),
})
```

**Main process** (`src/main/index.ts`):
- `hermes:lifecycle` — NEW event channel (main → renderer), sent by SSE parser when a `hermes.model.*` event frame is parsed
- `hermes:config` — REFACTORED to return `{ primary: string | null, fallback_chain: string[] }` instead of raw text

---

## 5. Data Flow + Sequence Diagrams

### 5.1 hermes-rest streaming: fallback mid-conversation

```
User           Renderer          MainProc        api_server.py        AIAgent
 │                │                  │                  │                 │
 │─"send msg"────>│                  │                  │                 │
 │                │─hermes:chat─────>│                  │                 │
 │                │                  │─POST /v1/chat───>│                 │
 │                │                  │                  │─run_conv──────>│
 │                │                  │                  │                 │ (primary 401)
 │                │                  │                  │ lifecycle_cb────┤
 │                │                  │                  │  fallback_      │
 │                │                  │                  │  activated      │
 │                │                  │                  │ queue.put(...)  │
 │                │                  │ SSE frame        │                 │
 │                │                  │ event: hermes.   │                 │
 │                │                  │  model.fallback  │<──emit──────────┤
 │                │                  │  _activated      │                 │
 │                │                  │ data: {...}      │                 │
 │                │ IPC hermes:      │                  │                 │
 │                │  lifecycle       │                  │                 │
 │                │<─────────────────┤                  │                 │
 │                │                  │                  │                 │
 │                │ modelStore       │                  │                 │
 │                │  .applyFallback  │                  │                 │
 │                │  Activated()     │                  │                 │
 │                │                  │                  │                 │
 │                │ watch(state.kind)│                  │                 │
 │                │  fires SYNC      │                  │                 │
 │                │  → stamps msg    │                  │                 │
 │                │                  │                  │                 │
 │                │ triggerToast()   │                  │                 │
 │ ← toast visible│                  │                  │                 │
 │                │                  │                  │ (delta chunks   │
 │                │                  │ SSE: data chunks │  begin arriving)│
 │                │ content updates, │<──emit chunks────│                 │
 │ ← msg with     │ already marked   │                  │                 │
 │   footer chip  │  fromFallback    │                  │                 │
 │                │                  │                  │                 │
 │                │                  │ SSE: [DONE]      │                 │
 │                │                  │<─────────────────│                 │
 │                │ onStreamComplete │                  │                 │
 │                │  stopWatch()     │                  │                 │
```

### 5.2 hermes-rest non-streaming

Simpler. The response body includes `_hermes_meta.fallback` and headers include `X-Hermes-Fallback-Active`. In `chat.ts::sendMessage`, after `fetch` resolves:

```typescript
const response = await fetch(...)
const body = await response.json()

if (response.headers.get('X-Hermes-Fallback-Active') === 'true'
    && body._hermes_meta?.fallback) {
  modelStore.applyFallbackActivated(body._hermes_meta.fallback)
}

const assistantMsg: ChatMessage = {
  // ... from body.choices[0].message ...
  fromFallback: modelStore.state.kind === 'fallback',
  fallbackFrom: modelStore.state.fallbackFrom ?? undefined,
  fallbackReasonText: modelStore.state.reasonText ?? undefined,
}
messages.value.push(assistantMsg)
```

Because the message is stamped at creation time (not mid-stream), no watcher is needed on this path.

### 5.3 acp-ws mid-conversation

```
User      Renderer         WebSocket      Gateway (external)    hermes-agent
 │           │                 │                 │                   │
 │─"send"───>│                 │                 │                   │
 │           │─send frame─────>│─JSON-RPC───────>│                   │
 │           │                 │                 │─run_conv─────────>│
 │           │                 │                 │                   │ (fallback fires)
 │           │                 │                 │ lifecycle_cb──────┤
 │           │                 │                 │<──────────────────│
 │           │                 │ event frame     │                   │
 │           │                 │<────────────────│                   │
 │           │<─event:hermes   │                 │                   │
 │           │  .model.        │                 │                   │
 │           │  fallback_      │                 │                   │
 │           │  activated      │                 │                   │
 │           │                 │                 │                   │
 │           │ modelStore      │                 │                   │
 │           │  .applyFallback │                 │                   │
 │           │  Activated()    │                 │                   │
 │           │                 │                 │                   │
 │           │ watch fires,    │                 │                   │
 │           │  msg marked,    │                 │                   │
 │           │  toast shown    │                 │                   │
```

Note the Gateway is external — the implementer of that project must emit the event frame when hermes-agent's callback fires. The contract is §3.5.

### 5.4 Chain exhausted

All transports end the same way on the desktop side:
1. `modelStore.applyChainExhausted(payload)` → kind → `exhausted`
2. Badge turns red
3. `triggerExhaustedToast(payload)` → 5 s red toast
4. The pending assistant message never receives its final content — existing chat error handling either removes the placeholder or converts it to an error message. No changes to error-handling logic needed.

### 5.5 Code ordering requirements

| Requirement | Why | Enforced at |
|---|---|---|
| `queue.put(lifecycle)` before first delta of new model | Desktop must see fallback BEFORE content of fallback, so stamping happens in the right order | `api_server.py` stream emitter (implicit — callback is called synchronously from `_try_activate_fallback` before the new model's first call) |
| `watch` with `flush: 'sync'` | Stamp must be visible inside the same tick as the state mutation | `chat.ts::sendMessage` watcher |
| `applyFallbackActivated` before `triggerFallbackToast` | Toast reads from store | `useModelStoreBootstrap::routeLifecycle` |
| `reset()` on fresh connect, `markStale()` on transient disconnect | Distinguish "fresh state" from "last known state" | `useModelStoreBootstrap` watch |

### 5.6 Concurrency table

| Scenario | Behavior |
|---|---|
| Two overlapping requests, one hits fallback | Badge flips to fallback. Both in-flight assistant messages get stamped via the shared watcher (Pinia state is shared). |
| Fallback during stream, then primary restored on next turn | Badge returns to green at turn boundary. The new turn's message is NOT marked (created fresh with current state = `normal`). |
| Rapid flip-flop (3 fallbacks in 10 s) | First fallback shows toast; next 2 suppressed by 60 s debounce. Badge still updates on every event. |
| Disconnect during fallback | Badge goes `stale` (grey with last known model). Reconnect calls `bootstrap()` which resets to fresh state. |
| `chain_exhausted` during stream | Partial content is preserved in the placeholder until the error handler converts it. Badge red. Toast 5 s. |
| Event arrives before store is bootstrapped | `applyFallbackActivated` on `kind='unknown'` still transitions to `fallback`. `primaryModel` stays null until next bootstrap. Display falls back to `currentModel`. |

---

## 6. Error Handling + Edge Cases

### 6.1 Stale badge on disconnect

Goal: distinguish "connection lost mid-session, last known data may be outdated" from "never connected, no data at all".

Behavior:
- `connectionStore.status === 'disconnected'` → `modelStore.markStale()`
- Badge renders grey pill with the last known model name and `(stale)` in the hover tooltip
- On reconnect → `bootstrap()` overwrites with fresh source-of-truth data
- `connection.ts::disconnect()` clears `hermesRealModel = null` as today, AND now also calls `modelStore.markStale()` (NOT `reset()` — we want the last known name for continuity)
- On full app shutdown or explicit logout → `modelStore.reset()`

### 6.2 Toast debounce (60 s, per-key)

Problem: a flipping primary (keeps failing, gets retried, fails again) would spam toasts.

Solution: the `lastToastKey` map in `useModelStoreBootstrap` keyed on `{kind}:{from}->{to}:{reason_code}` (for fallback) or `exhausted:{reason_code}` (for exhausted). Within 60 s, duplicate keys are suppressed.

The **badge** still updates every time — only the toast is debounced. That way the user always sees the current state without being nagged.

### 6.3 `yaml.load` refactor in `main/index.ts`

The current `hermes:config` handler (line ~286) uses a regex to extract `model:` from config.yaml. This is fragile and will not handle:
- `fallback_model:` (needed here)
- Commented-out lines
- List syntax (`fallback_model: [a, b, c]` or multi-line `fallback_model:\n  - a\n  - b`)
- Quoted strings (`model: "gpt-5.4"`)

Refactor to use `js-yaml` (already installed as main-process dep per the skill-management design):
```typescript
ipcMain.handle('hermes:config', async () => {
  try {
    const raw = await fs.readFile(expandHomePath('~/.hermes/config.yaml'), 'utf-8')
    const parsed = yaml.load(raw) as any
    const primary = typeof parsed?.model === 'string' ? parsed.model : null

    // fallback_model may be a single string or a list
    let fallback_chain: string[] = []
    if (Array.isArray(parsed?.fallback_model)) {
      fallback_chain = parsed.fallback_model.filter((x: any) => typeof x === 'string')
    } else if (typeof parsed?.fallback_model === 'string') {
      fallback_chain = [parsed.fallback_model]
    }

    // The full chain starts with primary if present
    const fullChain = primary ? [primary, ...fallback_chain] : fallback_chain

    return { primary, fallback_chain: fullChain }
  } catch (err) {
    console.warn('[hermes:config] parse failed', err)
    return { primary: null, fallback_chain: [] }
  }
})
```

### 6.4 SSE parser extension (extracted to pure function for testability)

Current parser in `main/index.ts::hermes:chat` handler recognizes `data:` only. Extract a pure function and extend it to track `event:` names across lines.

```typescript
// src/main/sse-parser.ts
export interface SseParserState {
  lastEventName: string | null
}

export type ParsedSseLine =
  | { kind: 'data'; event: string | null; data: string }
  | { kind: 'event'; name: string }
  | { kind: 'empty' }   // also resets state.lastEventName
  | { kind: 'skip' }

export function parseSseLine(line: string, state: SseParserState): ParsedSseLine {
  // SSE field-prefix detection
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
    state.lastEventName = null  // per SSE spec: blank line resets
    return { kind: 'empty' }
  }
  // Comment lines (start with ':'), id:, retry:, unknown fields
  return { kind: 'skip' }
}

export function makeInitialSseParserState(): SseParserState {
  return { lastEventName: null }
}
```

Integration in `main/index.ts`:
```typescript
const parserState = makeInitialSseParserState()
let buffer = ''
for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop() ?? ''
  for (const line of lines) {
    const parsed = parseSseLine(line, parserState)
    if (parsed.kind !== 'data') continue

    if (parsed.event && parsed.event.startsWith('hermes.model.')) {
      // Route to lifecycle channel
      try {
        mainWindow.webContents.send('hermes:lifecycle', {
          name: parsed.event,
          payload: JSON.parse(parsed.data),
        })
      } catch (err) {
        console.warn('[hermes:lifecycle] JSON parse failed', err)
      }
    } else if (parsed.event && parsed.event.startsWith('hermes.tool.')) {
      // Existing tool-progress routing (unchanged)
      mainWindow.webContents.send('hermes:tool-progress', parsed.data)
    } else {
      // Default: chat chunk
      mainWindow.webContents.send('hermes:chat-chunk', parsed.data)
    }
  }
}
```

### 6.5 Error matrix

| Error condition | Detection | Handling |
|---|---|---|
| Malformed lifecycle payload JSON | `JSON.parse` throws in main proc | Log warning, drop event, continue stream |
| Unknown `hermes.model.*` event name (forward compat) | Name starts with prefix but doesn't match 3 known | Log debug, drop; `routeLifecycle` default case |
| `schema_version > 1` | Store destructures known fields only | Log warning once, apply known fields |
| Event during `kind='unknown'` | State mutation still applies | `applyFallbackActivated` transitions `unknown → fallback` directly; `primaryModel` stays null until next bootstrap |
| Event with missing required fields | Destructure with defaults (`?? null`, `?? []`) | Display `unknown` where data is missing |
| `config.yaml` missing `model:` | Bootstrap with `primary: null` | Badge shows `? unknown` |
| `config.yaml` parse error | `yaml.load` throws in main proc | Caught, return `{primary: null, fallback_chain: []}`, log error |
| `lifecycle_event_callback` raises | Agent `_emit_lifecycle_event` try/except | Logged, agent continues normally |
| Desktop IPC listener not yet registered when event fires | Event dispatched to no-subscriber `webContents.send` | Best-effort; next turn's bootstrap recovers authoritative state |
| Chain exhausted + user retries | Agent re-enters with `_fallback_index=0` | If primary works → `primary_restored`; if not → another `chain_exhausted` |
| Network disconnect mid-stream | Electron fetch aborts, SSE parser ends | `chat.ts` error handler converts placeholder to error; `modelStore.markStale()` via connection watcher |
| Two lifecycle events in same tick | Vue batches reactivity, but `flush: 'sync'` forces per-mutation dispatch | Both apply in order; last-write-wins for conflicting fields |
| Fallback chain with primary repeated (`model: x`, `fallback_model: [x, y]`) | Agent advances index to 1, uses y | Works; event payload shows `from=x, to=y` |

### 6.6 Non-hermes model names

The desktop doesn't validate model names against a whitelist. If hermes-agent is configured with a custom Ollama or local model (`model: ollama/llama3:70b`), the badge displays that string verbatim. No special handling.

### 6.7 Config reload without reconnect

Out of scope. If the user edits `~/.hermes/config.yaml` while hermes-agent is running, neither side reloads. This is consistent with hermes-agent's existing startup-only config read.

### 6.8 First-turn fallback (no prior normal state)

If the very first chat in a session hits fallback on its first primary call, the sequence is:
1. `kind='normal'` → `kind='fallback'` (transition captured normally)
2. Toast and chip appear as usual

No edge case — the `kind='unknown' → 'fallback'` transition is also supported if bootstrap hadn't completed for some reason.

---

## 7. Testing Strategy (TDD)

All work is test-first. Each implementation step has a failing test before production code is written. See the 11-step checklist in §7.8.

### 7.1 Test pyramid

```
          ┌─────────────┐
          │ Integration │   1 test (full pipeline)
          └─────────────┘
        ┌─────────────────┐
        │    Transport    │   ~9 tests (SSE frames, headers, runs endpoint)
        └─────────────────┘
      ┌───────────────────────┐
      │       Unit Tests      │   ~35 tests (agent 8, store 12, parser 9, composable 6)
      └───────────────────────┘
```

No Playwright / browser E2E (too slow, too flaky for a feature this small). No visual regression (manual QA instead).

### 7.2 Agent-side unit tests

**File**: extend `hermes-agent/tests/run_agent/test_provider_fallback.py`

New test class `TestLifecycleEventEmission` using the existing `_make_agent()` helper:

```python
class TestLifecycleEventEmission:
    """Tests for the new lifecycle_event_callback channel."""

    def _make_agent_with_capture(self) -> tuple[AIAgent, list[tuple[str, dict]]]:
        agent = self._make_agent()
        events: list[tuple[str, dict]] = []
        agent.lifecycle_event_callback = lambda t, p: events.append((t, p))
        return agent, events

    def test_no_callback_registered_does_not_crash(self):
        agent = self._make_agent()
        agent.lifecycle_event_callback = None
        agent._emit_lifecycle_event(
            "hermes.model.fallback_activated", {"from_model": "x"}
        )  # should not raise

    def test_fallback_activated_emitted_with_correct_payload(self):
        agent, events = self._make_agent_with_capture()
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
        assert payload["reason_code"] == "auth_failed"
        assert payload["reason_text"] == "401 Unauthorized"
        assert payload["fallback_chain"] == ["gpt-5.4", "gemini-2.5-pro"]
        assert payload["fallback_index"] == 1
        assert payload["schema_version"] == 1
        assert "timestamp" in payload

    def test_try_activate_returns_false_when_chain_exhausted_no_event(self):
        agent, events = self._make_agent_with_capture()
        agent._fallback_chain = ["only-one"]
        agent._fallback_index = 0
        agent._runtimes = [MagicMock(model="only-one", provider="openai")]
        # No next runtime — activation fails
        assert agent._try_activate_fallback("auth_failed", "401") is False
        assert len(events) == 0  # no fallback_activated event

    def test_primary_restored_emitted_on_restore(self):
        agent, events = self._make_agent_with_capture()
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

    def test_primary_restored_not_emitted_when_never_fell_back(self):
        agent, events = self._make_agent_with_capture()
        agent._fallback_activated = False
        agent._restore_primary_runtime()
        assert len(events) == 0

    def test_chain_exhausted_emitted_with_attempted_models(self):
        agent, events = self._make_agent_with_capture()
        agent._fallback_chain = ["gpt-5.4", "gemini-2.5-pro", "claude-3.5-sonnet"]
        agent._fallback_index = 2

        agent._emit_chain_exhausted("server_error", "All models failed: 500/502/503")

        assert len(events) == 1
        event_type, payload = events[0]
        assert event_type == "hermes.model.chain_exhausted"
        assert payload["attempted_models"] == ["gpt-5.4", "gemini-2.5-pro", "claude-3.5-sonnet"]
        assert payload["last_error_code"] == "server_error"

    def test_callback_exception_is_swallowed(self):
        agent = self._make_agent()
        def raising_callback(t, p):
            raise RuntimeError("broken consumer")
        agent.lifecycle_event_callback = raising_callback
        agent._emit_lifecycle_event(
            "hermes.model.fallback_activated", {"from_model": "x"}
        )  # should not raise — logs warning

    def test_reason_text_clamped_to_200_chars(self):
        agent, events = self._make_agent_with_capture()
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

8 tests. Run: `uv run pytest hermes-agent/tests/run_agent/test_provider_fallback.py::TestLifecycleEventEmission -v`.

### 7.3 Transport-layer tests

**File**: new `hermes-agent/tests/gateway/test_api_server_fallback.py`

```python
class TestSSELifecycleFrames:
    async def test_fallback_activated_emitted_as_sse_event(self):
        # Arrange: api_server with a fake agent whose lifecycle_event_callback is captured
        # Act: trigger a streaming chat completion; simulate fallback mid-stream
        # Assert: response body contains "event: hermes.model.fallback_activated\ndata: {...}\n\n"

    async def test_lifecycle_frame_precedes_new_model_content(self):
        """Ordering: fallback event MUST come before first delta of new model."""

    async def test_primary_restored_emitted_as_sse_event(self):
        ...

    async def test_chain_exhausted_emitted_as_sse_event(self):
        ...

class TestNonStreamFallbackHeaders:
    async def test_x_hermes_fallback_headers_when_active(self):
        # Assert X-Hermes-Fallback-Active, -Effective-Model, -Primary-Model,
        #        -Fallback-Reason-Code present on response

    async def test_hermes_meta_in_response_body_when_fallback(self):
        # Assert response JSON has _hermes_meta.fallback.{active,from_model,to_model,...}

    async def test_no_fallback_headers_when_normal(self):
        # Assert X-Hermes-Fallback-* headers absent when fallback not active

class TestRunsEndpointLifecycle:
    async def test_lifecycle_event_pushed_to_run_stream(self):
        ...

    async def test_make_run_event_callback_thread_safe(self):
        """Verify loop.call_soon_threadsafe path works from a worker thread."""
```

9 tests (4 + 3 + 2). Mock the agent; test the api_server wiring only.

### 7.4 Desktop unit tests

**File 1**: new `src/renderer/src/stores/model.test.ts`

Vitest + @pinia/testing. 12 tests:

```typescript
describe('useModelStore', () => {
  it('starts in unknown kind')
  it('bootstrap with primary sets normal kind')
  it('bootstrap with null primary stays unknown')
  it('applyFallbackActivated from normal → fallback')
  it('applyFallbackActivated from fallback → fallback (re-activation updates reason)')
  it('applyFallbackActivated from unknown → fallback')
  it('applyPrimaryRestored from fallback → normal (clears reason fields)')
  it('applyChainExhausted → exhausted')
  it('markStale from normal keeps data, changes kind to stale')
  it('markStale from unknown is a no-op')
  it('reset returns to initial state')
  it('displayModel computed falls back through current → primary → "unknown"')
})
```

**File 2**: new `src/main/sse-parser.test.ts`

Vitest. 9 tests for the pure `parseSseLine`:

```typescript
describe('parseSseLine', () => {
  it('data: line without prior event has null event name')
  it('event: then data: pairs data with event name')
  it('blank line resets lastEventName')
  it('blank line returns empty kind')
  it('comment line (starts with :) returns skip')
  it('multiple data: lines after one event: share the event name')
  it('strips whitespace in "data: " and "event: " prefixes')
  it('unknown fields (id:, retry:) return skip')
  it('hermes.model.* event names detected correctly')
})
```

**File 3**: new `src/renderer/src/composables/useModelStoreBootstrap.test.ts`

Vitest + @vue/test-utils + fake window.api. ~6 tests:

```typescript
describe('useModelStoreBootstrap', () => {
  it('routeLifecycle dispatches fallback_activated to store')
  it('routeLifecycle dispatches primary_restored to store')
  it('routeLifecycle dispatches chain_exhausted to store')
  it('triggerFallbackToast is debounced by 60s per key')
  it('bootstraps on connection status transition to connected')
  it('marks stale on disconnect')
})
```

### 7.5 Integration test (end-to-end pipeline)

**File**: new `hermes-agent/tests/integration/test_fallback_end_to_end.py`

ONE test validating the full agent → transport → SSE pipeline:

```python
async def test_fallback_event_end_to_end():
    """
    Full pipeline:
    1. Configure AIAgent with fallback_chain=[failing-model, working-model]
       using mock LLM providers
    2. Start api_server with this agent
    3. Send streaming chat completion request via httpx async client
    4. Consume SSE response
    5. Assert: response contains `event: hermes.model.fallback_activated` frame
       BEFORE any content delta from working-model
    6. Assert: response also contains content deltas (chat actually completes)
    """
```

Dependencies: `pytest-asyncio`, `httpx`, mock LLM provider factory.

### 7.6 Test fixtures

**Python** (`hermes-agent/tests/conftest.py`):
```python
@pytest.fixture
def lifecycle_capture():
    """Shared fixture for capturing lifecycle events from an agent.

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

**TypeScript** (`hermes-desktop/src/test-utils/sse-fixtures.ts`):
```typescript
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

export function makeSSELines(event: string, payload: any): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
}

export function makePrimaryRestoredPayload(overrides = {}): PrimaryRestoredPayload {
  return {
    schema_version: 1,
    timestamp: '2026-04-14T10:05:00Z',
    restored_to: 'gpt-5.4',
    restored_from: 'gemini-2.5-pro',
    primary_model: 'gpt-5.4',
    ...overrides,
  }
}

export function makeChainExhaustedPayload(overrides = {}): ChainExhaustedPayload {
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
```

### 7.7 Non-goals

- Concurrent run isolation (two parallel runs with independent fallback states) — future work if users need it. For now, `useModelStore` is session-global.
- acp-ws server-side emission implementation (external project, out of repo)
- Playwright / Selenium end-to-end browser tests — too slow
- Visual regression tests — manual QA after implementation
- Load / throughput tests — fallback events are inherently low-frequency

### 7.8 Implementation checklist (suggested order, TDD)

Each step: write failing test first, watch it fail, write minimal code, watch it pass, refactor.

| # | Step | Files touched | Est. |
|---|---|---|---|
| 1 | Agent: add `lifecycle_event_callback` field + `_emit_lifecycle_event` helper; unit test no-op + timestamp stamping | `run_agent.py`, `test_provider_fallback.py` | 30 min |
| 2 | Agent: extend `_try_activate_fallback(reason_code, reason_text)` signature + wire emission; test 7.2 #3, #4, #8 | `run_agent.py`, `test_provider_fallback.py` | 45 min |
| 3 | Agent: wire `_restore_primary_runtime` emission; test 7.2 #5, #6 | `run_agent.py`, `test_provider_fallback.py` | 20 min |
| 4 | Agent: add `_emit_chain_exhausted` + wire 4 retry call sites; test 7.2 #7 | `run_agent.py`, `test_provider_fallback.py` | 60 min |
| 5 | Transport: wire lifecycle callback into `_handle_chat_completions` streaming path; TDD §7.3 `TestSSELifecycleFrames` | `api_server.py`, `test_api_server_fallback.py` | 2 h |
| 6 | Transport: non-stream headers + `_hermes_meta` body; TDD §7.3 `TestNonStreamFallbackHeaders` | `api_server.py`, `test_api_server_fallback.py` | 90 min |
| 7 | Transport: extend `_make_run_event_callback`; TDD §7.3 `TestRunsEndpointLifecycle` | `api_server.py`, `test_api_server_fallback.py` | 45 min |
| 8 | Integration test §7.5 | `test_fallback_end_to_end.py` | 90 min |
| 9 | Desktop: extract `parseSseLine` to pure function + 9 tests; extend `main/index.ts` to route `hermes.model.*` events to new `hermes:lifecycle` IPC channel | `main/sse-parser.ts` (new), `main/sse-parser.test.ts` (new), `main/index.ts` | 90 min |
| 10 | Desktop: rewrite `stores/model.ts` + 12 tests; add payload types to `api/types/index.ts` | `stores/model.ts`, `stores/model.test.ts`, `api/types/index.ts` | 2 h |
| 11 | Desktop: refactor `hermes:config` with `yaml.load`; `useModelStoreBootstrap` composable + tests; `ModelStateBadge`, `ModelDropdown`, `ModelToast`, `FallbackChip` components; insert Badge into `AppHeader`, Chip into `ChatPage`; extend `chat.ts::sendMessage` with sync watcher | 12 files (8 new, 4 modified) | 3 h |
| **Total** | | | **≈ 16 h / 2 days** |

### 7.9 Acceptance criteria

**Automated:**
- [ ] 35 unit tests pass (8 agent + 12 store + 9 parser + 6 composable)
- [ ] 9 transport tests pass including the `test_lifecycle_frame_precedes_new_model_content` ordering assertion
- [ ] 1 integration test passes end-to-end
- [ ] Existing `test_provider_fallback.py` still green (no regression)
- [ ] Existing hermes-desktop tests still green (chat flow, connection, hermes-git)

**Manual:**
- [ ] Start hermes-rest with a deliberately failing primary (bad API key) and working fallback; send chat → badge turns amber with `via {primary}`, toast appears top-right, assistant message has footer chip
- [ ] On next turn (primary still broken, fallback works) → same fallback state, no new toast (no transition)
- [ ] Fix primary credentials → next turn → agent emits `primary_restored` → badge green, no toast, new message has NO chip
- [ ] Break all models → badge red, exhausted toast (5 s), error message
- [ ] Disconnect during fallback → badge goes grey stale with last known model; reconnect → badge refreshes from fresh bootstrap
- [ ] Rapid 3 fallbacks within 60 s (trigger 3 primary failures) → only 1 toast shown, badge reflects latest

**Non-regression:**
- [ ] IM adapters (Slack/Telegram) still receive status_callback messages correctly
- [ ] Existing `/v1/chat/completions` streaming flow works for non-fallback users
- [ ] `~/.hermes/config.yaml` with only `model:` (no `fallback_model:`) bootstraps cleanly

**Docs:**
- [ ] Schema for `hermes.model.*` events documented somewhere external Gateway implementers can find (likely in hermes-agent's `docs/` or Gateway project's wire spec)

---

## 8. Open Questions / Follow-ups

1. **Localization.** reason_code values are English enums (`auth_failed`, `rate_limited`, …). Display labels in the UI should be localized — add to `src/renderer/src/locales/{en,zh}.json` under new `modelState.reason.*` keys. Not blocking for v1; acceptable to ship with English labels first.
2. **Badge icon choice.** Should transitional states use `●` (dot), `⚠` (warning), or a spinner? Left for implementation review — mockups in the brainstorm used `⚠` for both fallback and exhausted, which may be too samey.
3. **Persistence across restart.** Should fallback history survive app restart? Currently no — fresh app start = fresh modelStore. Revisit if users request "what models did I use yesterday?".
4. **Manual primary restore button.** Mentioned in the brainstorm dropdown design but deferred. Requires a new agent API endpoint (`POST /v1/agent/restore-primary`). Out of scope for this design; worth a follow-up spec.
5. **Concurrent runs.** Current design assumes one active run at a time from the desktop's perspective. If future work adds parallel conversations, the modelStore may need per-run state. Not urgent — the existing chat.ts code already serializes user sends.

---

## 9. Files Touched (summary)

**hermes-agent** (5 files)

| File | Change |
|---|---|
| `run_agent.py` | Add `lifecycle_event_callback` field, `_emit_lifecycle_event`, `_emit_chain_exhausted`; extend `_try_activate_fallback` signature; wire restore emission; call `_emit_chain_exhausted` at 4 retry boundaries |
| `gateway/platforms/api_server.py` | Accept `lifecycle_event_callback` in `_create_agent`; wire for streaming `/v1/chat/completions` (queue-based), non-streaming (header + `_hermes_meta` body), and `/v1/runs` (asyncio.Queue via `call_soon_threadsafe`) |
| `tests/run_agent/test_provider_fallback.py` | New `TestLifecycleEventEmission` class (8 tests) |
| `tests/gateway/test_api_server_fallback.py` | NEW — 9 transport tests |
| `tests/integration/test_fallback_end_to_end.py` | NEW — 1 end-to-end test |
| `tests/conftest.py` | NEW `lifecycle_capture` fixture |

**hermes-desktop** (~20 files)

*New:*
- `src/renderer/src/components/layout/ModelStateBadge.vue`
- `src/renderer/src/components/layout/ModelDropdown.vue`
- `src/renderer/src/components/layout/ModelToast.vue`
- `src/renderer/src/components/layout/NotificationLayer.vue`
- `src/renderer/src/components/chat/FallbackChip.vue`
- `src/renderer/src/composables/useModelStoreBootstrap.ts`
- `src/renderer/src/composables/useModelStoreBootstrap.test.ts`
- `src/renderer/src/stores/model.test.ts`
- `src/renderer/src/stores/notification.ts`
- `src/renderer/src/test-utils/sse-fixtures.ts`
- `src/main/sse-parser.ts`
- `src/main/sse-parser.test.ts`

*Modified:*
- `src/renderer/src/stores/model.ts` — full rewrite
- `src/renderer/src/stores/chat.ts` — sync watcher on sendMessage
- `src/renderer/src/stores/connection.ts` — call modelStore.markStale on disconnect
- `src/renderer/src/api/types/index.ts` — extend ChatMessage, add payload types
- `src/renderer/src/components/layout/AppHeader.vue` — insert ModelStateBadge
- `src/renderer/src/views/chat/ChatPage.vue` — insert FallbackChip into chat-bubble-meta
- `src/renderer/src/App.vue` — call useModelStoreBootstrap, mount NotificationLayer
- `src/main/index.ts` — yaml.load refactor, SSE parser integration, hermes:lifecycle channel
- `src/preload/index.ts` — expose onHermesLifecycle, update hermesConfig typing

Total: **~25 files** (14 new + 11 modified) across both repos.
