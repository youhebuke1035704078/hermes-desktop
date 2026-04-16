# REST Mode Token Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display cumulative token usage per conversation when hermes-desktop connects via REST mode (hermes-agent API).

**Architecture:** hermes-agent already sends `usage: { prompt_tokens, completion_tokens, total_tokens }` in the final SSE chunk (the one with `finish_reason: "stop"`). The desktop client currently ignores this data. We add a `tokenUsage` field to `HermesConversation`, extract usage from the final chunk, accumulate across turns, and feed it into the existing `SessionTokenUsage` display in `ChatPage.vue`. All changes are client-side.

**Tech Stack:** Vue 3 + Pinia + TypeScript, vitest for tests

---

### Task 1: Add `tokenUsage` field to `HermesConversation` and `accumulateTokenUsage` action

**Files:**
- Modify: `src/renderer/src/stores/hermes-chat.ts` (interface + new action)
- Create: `src/renderer/src/stores/hermes-chat-token-usage.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/renderer/src/stores/hermes-chat-token-usage.test.ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useHermesChatStore } from './hermes-chat'

describe('hermes-chat token usage', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('new conversation has no tokenUsage', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    const conv = store.conversations.find(c => c.id === id)
    expect(conv?.tokenUsage).toBeUndefined()
  })

  it('accumulateTokenUsage adds to a fresh conversation', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    store.accumulateTokenUsage(id, 100, 200)
    const conv = store.conversations.find(c => c.id === id)
    expect(conv?.tokenUsage).toEqual({ totalInput: 100, totalOutput: 200 })
  })

  it('accumulateTokenUsage accumulates across multiple calls', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    store.accumulateTokenUsage(id, 100, 200)
    store.accumulateTokenUsage(id, 50, 80)
    const conv = store.conversations.find(c => c.id === id)
    expect(conv?.tokenUsage).toEqual({ totalInput: 150, totalOutput: 280 })
  })

  it('accumulateTokenUsage is a no-op for unknown conversation id', () => {
    const store = useHermesChatStore()
    store.accumulateTokenUsage('nonexistent', 100, 200)
    // Should not throw
    expect(store.conversations.every(c => !c.tokenUsage)).toBe(true)
  })

  it('accumulateTokenUsage ignores zero values', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    store.accumulateTokenUsage(id, 0, 0)
    // Zero usage should not create a tokenUsage object
    expect(store.conversations.find(c => c.id === id)?.tokenUsage).toBeUndefined()
  })

  it('tokenUsage survives round-trip through JSON serialization', () => {
    const store = useHermesChatStore()
    const id = store.createConversation()
    store.accumulateTokenUsage(id, 100, 200)
    const conv = store.conversations.find(c => c.id === id)!
    const roundTripped = JSON.parse(JSON.stringify(conv))
    expect(roundTripped.tokenUsage).toEqual({ totalInput: 100, totalOutput: 200 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/youhebuke/hermes-desktop && npx vitest run src/renderer/src/stores/hermes-chat-token-usage.test.ts`

Expected: FAIL — `accumulateTokenUsage` does not exist on store, property `tokenUsage` is never set.

- [ ] **Step 3: Implement — add field and action**

In `src/renderer/src/stores/hermes-chat.ts`:

1. Add `tokenUsage` to the `HermesConversation` interface (after `updatedAt`):

```typescript
export interface HermesConversation {
  id: string
  title: string
  messages: ChatMessage[]
  model: string
  /** Actual model resolved from API response (e.g. "gpt-5.4") */
  resolvedModel?: string
  createdAt: number
  updatedAt: number
  /** Cumulative token usage across all turns in this conversation */
  tokenUsage?: { totalInput: number; totalOutput: number }
}
```

2. Add the `accumulateTokenUsage` action inside the store function (after `setModel`):

```typescript
  /** Accumulate token usage from a single turn into the conversation total */
  function accumulateTokenUsage(id: string, inputTokens: number, outputTokens: number) {
    if (inputTokens <= 0 && outputTokens <= 0) return
    const conv = conversations.value.find(c => c.id === id)
    if (!conv) return
    const prev = conv.tokenUsage || { totalInput: 0, totalOutput: 0 }
    conv.tokenUsage = {
      totalInput: prev.totalInput + inputTokens,
      totalOutput: prev.totalOutput + outputTokens,
    }
    conv.updatedAt = Date.now()
    save()
  }
```

3. Add `accumulateTokenUsage` to the returned object:

```typescript
  return {
    conversations,
    activeId,
    model,
    serverSyncAvailable,
    activeConversation,
    load,
    loadFromServer,
    save,
    createConversation,
    switchTo,
    deleteConversation,
    renameConversation,
    setMessages,
    setModel,
    accumulateTokenUsage,
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/youhebuke/hermes-desktop && npx vitest run src/renderer/src/stores/hermes-chat-token-usage.test.ts`

Expected: 6 passed

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/hermes-chat.ts src/renderer/src/stores/hermes-chat-token-usage.test.ts
git commit -m "feat: add tokenUsage field and accumulateTokenUsage action to HermesConversation"
```

---

### Task 2: Extract usage from the final SSE chunk and accumulate

**Files:**
- Modify: `src/renderer/src/stores/chat.ts` (chunk handler + post-stream accumulation)
- Create: `src/renderer/src/stores/chat-rest-token-usage.test.ts`

The final SSE chunk from hermes-agent looks like:
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion.chunk",
  "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
  "usage": {"prompt_tokens": 100, "completion_tokens": 200, "total_tokens": 300}
}
```

The chunk handler receives this via IPC as `{ done: false, data: <parsed JSON> }`, followed by `{ done: true }`.

- [ ] **Step 1: Write failing test**

We need to test the extraction logic in isolation. The chunk handler is deep inside `sendMessage()`, so we extract a pure function for testability.

```typescript
// src/renderer/src/stores/chat-rest-token-usage.test.ts
import { describe, it, expect } from 'vitest'
import { extractUsageFromChunk } from './chat'

describe('extractUsageFromChunk', () => {
  it('returns null for content delta chunk (no usage)', () => {
    const chunk = {
      choices: [{ index: 0, delta: { content: 'hello' } }],
    }
    expect(extractUsageFromChunk(chunk)).toBeNull()
  })

  it('extracts usage from finish chunk with usage field', () => {
    const chunk = {
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
      usage: { prompt_tokens: 150, completion_tokens: 250, total_tokens: 400 },
    }
    expect(extractUsageFromChunk(chunk)).toEqual({
      inputTokens: 150,
      outputTokens: 250,
    })
  })

  it('returns null for finish chunk without usage field', () => {
    const chunk = {
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    }
    expect(extractUsageFromChunk(chunk)).toBeNull()
  })

  it('handles missing or malformed usage gracefully', () => {
    expect(extractUsageFromChunk(null)).toBeNull()
    expect(extractUsageFromChunk(undefined)).toBeNull()
    expect(extractUsageFromChunk({})).toBeNull()
    expect(extractUsageFromChunk({ usage: 'bad' })).toBeNull()
    expect(extractUsageFromChunk({ usage: { prompt_tokens: 'nan' } })).toBeNull()
  })

  it('treats missing token fields as zero', () => {
    const chunk = {
      usage: { prompt_tokens: 100 },
    }
    expect(extractUsageFromChunk(chunk)).toEqual({
      inputTokens: 100,
      outputTokens: 0,
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd /Users/youhebuke/hermes-desktop && npx vitest run src/renderer/src/stores/chat-rest-token-usage.test.ts`

Expected: FAIL — `extractUsageFromChunk` is not exported from `./chat`.

- [ ] **Step 3: Implement — add extraction function and wire into chunk handler**

In `src/renderer/src/stores/chat.ts`:

1. Add the exported pure function (near the top of the file, outside the store definition):

```typescript
/**
 * Extract token usage from an SSE chunk.
 * hermes-agent sends usage in the final chunk (the one with finish_reason: "stop").
 * Returns { inputTokens, outputTokens } or null if no usage data present.
 */
export function extractUsageFromChunk(
  chunkData: unknown,
): { inputTokens: number; outputTokens: number } | null {
  if (!chunkData || typeof chunkData !== 'object') return null
  const usage = (chunkData as Record<string, unknown>).usage
  if (!usage || typeof usage !== 'object') return null
  const u = usage as Record<string, unknown>
  const input = typeof u.prompt_tokens === 'number' ? u.prompt_tokens : 0
  const output = typeof u.completion_tokens === 'number' ? u.completion_tokens : 0
  if (input === 0 && output === 0) return null
  return { inputTokens: input, outputTokens: output }
}
```

2. Inside the `sendMessage()` function's REST branch, capture usage from chunks. Add a variable before the chunk listener (before line 996):

```typescript
      let lastChunkUsage: { inputTokens: number; outputTokens: number } | null = null
```

3. In the `onHermesChatChunk` callback, add usage extraction after the existing `delta?.content` block (inside the same callback, after the content handling):

```typescript
      const cleanupChunkListener = window.api.onHermesChatChunk((chunk) => {
        if (chunk.done) return
        const delta = chunk.data?.choices?.[0]?.delta
        if (delta?.content) {
          const idx = messages.value.findIndex(m => m.id === assistantMsgId)
          if (idx >= 0) {
            const existing = messages.value[idx]
            const stamped = applyFallbackStamp(existing, modelStore.state)
            const base = stamped ?? existing
            messages.value[idx] = { ...base, content: base.content + delta.content }
            messages.value = [...messages.value] // trigger Vue reactivity
          }
        }
        // Capture usage from the final chunk (finish_reason: "stop")
        const usage = extractUsageFromChunk(chunk.data)
        if (usage) lastChunkUsage = usage
      })
```

4. After the `hermesChat` call succeeds (after line 1028 `throw new Error(...)` check, before `setAgentStatusPhase`), accumulate the usage:

```typescript
        // Accumulate token usage into the conversation
        if (lastChunkUsage && hermesChatStore.activeId) {
          hermesChatStore.accumulateTokenUsage(
            hermesChatStore.activeId,
            lastChunkUsage.inputTokens,
            lastChunkUsage.outputTokens,
          )
        }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd /Users/youhebuke/hermes-desktop && npx vitest run src/renderer/src/stores/chat-rest-token-usage.test.ts`

Expected: 5 passed

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/stores/chat.ts src/renderer/src/stores/chat-rest-token-usage.test.ts
git commit -m "feat: extract token usage from SSE chunks and accumulate per conversation"
```

---

### Task 3: Display token usage in ChatPage.vue for REST mode

**Files:**
- Modify: `src/renderer/src/views/chat/ChatPage.vue` (remove isHermesRest gate, add REST usage source)

No new test file — this is a template wiring change. The data flow is: `hermesChatStore.activeConversation.tokenUsage` → `currentSessionTokenUsage` → existing `sessionTokenMetricTags` → existing template.

- [ ] **Step 1: Add a computed that reads from HermesConversation in REST mode**

In `ChatPage.vue`, find `sessionTokenUsageFromList` (line 237). Add a new computed after it:

```typescript
/** Token usage from hermes-chat store (REST mode — accumulated from SSE chunks) */
const hermesTokenUsage = computed<SessionTokenUsage | null>(() => {
  if (!isHermesRest.value) return null
  const conv = hermesChatStore.activeConversation
  if (!conv?.tokenUsage) return null
  return createSessionTokenUsage({
    input: conv.tokenUsage.totalInput,
    output: conv.tokenUsage.totalOutput,
  })
})
```

- [ ] **Step 2: Update `currentSessionTokenUsage` to include REST source**

Change the existing computed (line 247):

```typescript
// Before:
const currentSessionTokenUsage = computed<SessionTokenUsage | null>(() =>
  sessionTokenUsage.value || sessionTokenUsageFromList.value
)

// After:
const currentSessionTokenUsage = computed<SessionTokenUsage | null>(() =>
  sessionTokenUsage.value || sessionTokenUsageFromList.value || hermesTokenUsage.value
)
```

- [ ] **Step 3: Update template to show token metrics in REST mode**

Change the template block (lines 2528-2551). Replace the `v-if="!isHermesRest"` gate on token metrics with always-shown metrics, and keep the model indicator for REST mode alongside:

```html
          <!-- Token metrics (both ACP and Hermes REST) -->
          <template v-if="sessionTokenMetricTags.length">
            <div class="chat-token-metrics">
              <NTag
                v-for="metric in sessionTokenMetricTags"
                :key="metric.key"
                size="small"
                :bordered="false"
                round
                class="chat-token-chip"
                :class="{ 'chat-token-chip--total': metric.highlight }"
              >
                <span class="chat-token-chip__label">{{ metric.label }}</span>
                <span class="chat-token-chip__value">{{ metric.value }}</span>
              </NTag>
            </div>
          </template>
          <!-- Hermes REST: model indicator (when no token data yet) -->
          <NTag v-else-if="isHermesRest" size="small" :bordered="false" round type="info">
            {{ connectionStore.hermesRealModel || hermesModel }}
          </NTag>
          <!-- ACP: loading/unavailable state -->
          <NTag v-else-if="!isHermesRest" size="small" :bordered="false" round class="chat-token-chip chat-token-chip--loading">
            {{ sessionTokenStatusText }}
          </NTag>
```

- [ ] **Step 4: Verify locally**

Run: `cd /Users/youhebuke/hermes-desktop && npx vitest run`

Expected: All existing and new tests pass. No regressions.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/src/views/chat/ChatPage.vue
git commit -m "feat: display cumulative token usage in REST mode"
```

---

### Task 4: Filter out zero-value cache metrics in REST mode

**Files:**
- Modify: `src/renderer/src/views/chat/ChatPage.vue`

hermes-agent's REST API does not return `cacheRead` / `cacheWrite` — they'll always be 0. Showing `Cache Read: 0 | Cache Write: 0` is noise. Filter them out when zero.

- [ ] **Step 1: Update `sessionTokenMetricTags` to omit zero-value optional metrics**

```typescript
// Before:
const sessionTokenMetricTags = computed(() => {
  const usage = currentSessionTokenUsage.value
  if (!usage) return []

  return [
    { key: 'total', label: t('pages.chat.tokens.total'), value: formatTokenCount(usage.total), highlight: true },
    { key: 'input', label: t('pages.chat.tokens.input'), value: formatTokenCount(usage.input), highlight: false },
    { key: 'output', label: t('pages.chat.tokens.output'), value: formatTokenCount(usage.output), highlight: false },
    { key: 'cacheRead', label: t('pages.chat.tokens.cacheRead'), value: formatTokenCount(usage.cacheRead), highlight: false },
    { key: 'cacheWrite', label: t('pages.chat.tokens.cacheWrite'), value: formatTokenCount(usage.cacheWrite), highlight: false },
  ]
})

// After:
const sessionTokenMetricTags = computed(() => {
  const usage = currentSessionTokenUsage.value
  if (!usage) return []

  const tags = [
    { key: 'total', label: t('pages.chat.tokens.total'), value: formatTokenCount(usage.total), highlight: true },
    { key: 'input', label: t('pages.chat.tokens.input'), value: formatTokenCount(usage.input), highlight: false },
    { key: 'output', label: t('pages.chat.tokens.output'), value: formatTokenCount(usage.output), highlight: false },
  ]
  // Only show cache metrics when they have non-zero values (REST API doesn't report them)
  if (usage.cacheRead > 0) {
    tags.push({ key: 'cacheRead', label: t('pages.chat.tokens.cacheRead'), value: formatTokenCount(usage.cacheRead), highlight: false })
  }
  if (usage.cacheWrite > 0) {
    tags.push({ key: 'cacheWrite', label: t('pages.chat.tokens.cacheWrite'), value: formatTokenCount(usage.cacheWrite), highlight: false })
  }
  return tags
})
```

- [ ] **Step 2: Run tests**

Run: `cd /Users/youhebuke/hermes-desktop && npx vitest run`

Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/src/views/chat/ChatPage.vue
git commit -m "fix: hide zero-value cache token metrics in REST mode"
```

---

### Summary

| Task | What | Files |
|------|------|-------|
| 1 | `tokenUsage` field + `accumulateTokenUsage` action | `hermes-chat.ts` + test |
| 2 | `extractUsageFromChunk` + wire into chunk handler | `chat.ts` + test |
| 3 | Remove `isHermesRest` gate, add `hermesTokenUsage` computed | `ChatPage.vue` |
| 4 | Filter zero-value cache metrics | `ChatPage.vue` |

Total: 2 files modified, 2 test files created. ~60 lines of production code, ~80 lines of tests.
