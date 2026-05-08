export * from './rpc'
export * from './session'
export * from './channel'
export * from './config'
export * from './terminal'
export * from './remote-desktop'
export * from './backup'
import type { ModelConfig, ToolPolicyConfig } from './config'

export type SkillSource = 'bundled' | 'workspace' | 'managed' | 'extra' | 'user_created'

export interface SkillMeta {
  name: string
  description: string
  version: string
  author: string
  category: string
  platforms: string[]
  prerequisites?: { commands?: string[]; env_vars?: string[] }
  configVars?: { key: string; description: string; default?: any; prompt?: string }[]
  tags?: string[]
  license?: string
  dirPath: string
  relatedSkills?: string[]
  homepage?: string

  // Runtime fields populated by rpc-client.ts:normalizeSkillItem() from the
  // hermes-agent list response. They describe the install state of a skill
  // on the connected server, not its static manifest metadata, which is why
  // they're all optional — not every caller constructs SkillMeta from the
  // wire format.
  source?: SkillSource
  installed?: boolean
  eligible?: boolean
  disabled?: boolean
  bundled?: boolean
  skillKey?: string
  hasUpdate?: boolean
}

/** @deprecated Use SkillMeta instead. Kept as alias for backward compatibility. */
export type Skill = SkillMeta

export interface PluginPackage {
  name: string
  installed: boolean
  version?: string
  enabled?: boolean
  status?: string
}

export interface Tool {
  name: string
  description: string
  category: string
  enabled: boolean
}

export interface DeviceNode {
  id: string
  name: string
  platform: string
  connected: boolean
  capabilities: string[]
  lastSeen?: string
}

export interface NodeInvokeParams {
  nodeId: string
  action: string
  params?: Record<string, unknown>
}

export interface AgentParams {
  sessionKey: string
  message: string
  idempotencyKey?: string
  model?: string
  elevated?: boolean
  thinkingLevel?: 'off' | 'low' | 'high'
}

export interface AgentIdentity {
  name?: string
  theme?: string
  emoji?: string
  avatar?: string
  avatarUrl?: string
}

export interface AgentInfo {
  id: string
  name?: string
  identity?: AgentIdentity
  model?: string
  tools?: ToolPolicyConfig
}

export interface AgentsListResult {
  defaultId?: string
  mainKey?: string
  scope?: string
  agents: AgentInfo[]
}

export interface AgentFileEntry {
  name: string
  path: string
  missing: boolean
  size?: number
  updatedAtMs?: number
  content?: string
  type?: 'file' | 'directory'
  isDirectory?: boolean
}

export interface AgentFilesListResult {
  agentId: string
  workspace: string
  files: AgentFileEntry[]
}

export interface AgentFilesGetResult {
  agentId: string
  workspace: string
  file: AgentFileEntry
}

export interface AgentFilesSetResult {
  ok: boolean
  agentId: string
  workspace: string
  file: AgentFileEntry
}

export interface AgentEvent {
  event: string
  payload: unknown
  seq?: number
  timestamp: number
}

export interface SendParams {
  channelId: string
  recipient: string
  content: string
}

export interface ChatMessageContent {
  type: 'text' | 'thinking' | 'tool_call' | 'tool_result' | 'image'
  text?: string
  thinking?: string
  id?: string
  name?: string
  arguments?: Record<string, unknown>
  content?: unknown
  isError?: boolean
  mimeType?: string
  bytes?: number
  data?: string
  mediaPath?: string
}

export interface ChatMessage {
  id?: string
  role: 'user' | 'assistant' | 'tool' | 'system'
  content: string
  timestamp?: string
  name?: string
  model?: string
  provider?: string
  stopReason?: string
  toolCallId?: string
  toolName?: string
  isError?: boolean
  rawContent?: ChatMessageContent[]
  // --- Fallback stamping (spec §2.3 / Task D1) ---
  // When the hermes-agent fallback chain activates mid-stream, the gateway
  // marks subsequent assistant messages with these fields so the UI can
  // render a FallbackChip and tooltip without re-querying the backend.
  fromFallback?: boolean
  fallbackFrom?: string // the displaced primary model
  fallbackReasonText?: string // verbatim reason_text for chip tooltip
}

export interface ChatSendParams {
  sessionKey: string
  message: string
  model?: string
  idempotencyKey?: string
}

export type CronSchedule =
  | {
      kind: 'at'
      at: string
    }
  | {
      kind: 'every'
      everyMs: number
      anchorMs?: number
    }
  | {
      kind: 'cron'
      expr: string
      tz?: string
    }

export type CronPayload =
  | {
      kind: 'systemEvent'
      text: string
    }
  | {
      kind: 'agentTurn'
      message: string
      model?: string
      thinking?: string
      timeoutSeconds?: number
      allowUnsafeExternalContent?: boolean
      deliver?: boolean
      channel?: string
      to?: string
      bestEffortDeliver?: boolean
    }

export interface CronDelivery {
  mode: 'none' | 'announce'
  channel?: string
  to?: string
  bestEffort?: boolean
}

export interface CronJobState {
  nextRunAtMs?: number
  runningAtMs?: number
  lastRunAtMs?: number
  lastStatus?: 'ok' | 'error' | 'skipped'
  lastError?: string
  lastDurationMs?: number
  consecutiveErrors?: number
}

export interface CronJob {
  id: string
  agentId?: string
  name: string
  description?: string
  enabled: boolean
  deleteAfterRun?: boolean
  createdAtMs?: number
  updatedAtMs?: number
  scheduleObj?: CronSchedule
  sessionTarget?: 'main' | 'isolated'
  wakeMode?: 'next-heartbeat' | 'now'
  payload?: CronPayload
  delivery?: CronDelivery
  state?: CronJobState

  // Backward-compatible display fields
  schedule: string
  command?: string
  timezone?: string
  nextRun?: string
  lastRun?: string
}

export interface CronStatus {
  enabled: boolean
  jobs: number
  running?: number
  nextWakeAtMs?: number
}

export interface CronRunLogEntry {
  ts: number
  jobId: string
  action?: 'finished'
  status?: 'ok' | 'error' | 'skipped'
  error?: string
  summary?: string
  sessionId?: string
  sessionKey?: string
  runAtMs?: number
  durationMs?: number
  nextRunAtMs?: number
}

export interface CronUpsertParams {
  id?: string
  name?: string
  agentId?: string | null
  description?: string
  enabled?: boolean
  deleteAfterRun?: boolean
  schedule?: CronSchedule
  sessionTarget?: 'main' | 'isolated'
  wakeMode?: 'next-heartbeat' | 'now'
  payload?: CronPayload
  delivery?: CronDelivery
  // Legacy compatibility
  command?: string
  timezone?: string
  scheduleText?: string
}

export interface ModelInfo {
  id: string
  label?: string
  provider?: string
  family?: string
  enabled?: boolean
  available?: boolean
  description?: string
  contextWindow?: number
  capabilities?: string[]
}

export interface SessionsUsageParams {
  key?: string
  startDate?: string
  endDate?: string
  limit?: number
  includeContextWeight?: boolean
}

export interface SessionsUsageTotals {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  totalTokens: number
  totalCost: number
  inputCost: number
  outputCost: number
  cacheReadCost: number
  cacheWriteCost: number
  missingCostEntries: number
}

export interface SessionsUsageModelItem {
  provider?: string
  model?: string
  count: number
  totals: SessionsUsageTotals
}

export interface SessionsUsageDailyItem {
  date: string
  tokens: number
  cost: number
  messages: number
  toolCalls: number
  errors: number
}

export interface SessionsUsageSession {
  key: string
  label?: string
  sessionId?: string
  updatedAt?: number
  agentId?: string
  channel?: string
  chatType?: string
  modelProvider?: string
  model?: string
  usage: {
    input: number
    output: number
    cacheRead: number
    cacheWrite: number
    totalTokens: number
    totalCost: number
    messageCounts?: {
      total: number
      user: number
      assistant: number
      toolCalls: number
      toolResults: number
      errors: number
    }
    toolUsage?: {
      totalCalls: number
      uniqueTools: number
      tools: Array<{ name: string; count: number }>
    }
    dailyBreakdown?: Array<{ date: string; tokens: number; cost: number }>
  } | null
}

export interface SessionsUsageResult {
  updatedAt: number
  startDate: string
  endDate: string
  sessions: SessionsUsageSession[]
  totals: SessionsUsageTotals
  aggregates: {
    messages: {
      total: number
      user: number
      assistant: number
      toolCalls: number
      toolResults: number
      errors: number
    }
    tools: {
      totalCalls: number
      uniqueTools: number
      tools: Array<{ name: string; count: number }>
    }
    byModel: SessionsUsageModelItem[]
    byProvider: SessionsUsageModelItem[]
    byAgent: Array<{ agentId: string; totals: SessionsUsageTotals }>
    byChannel: Array<{ channel: string; totals: SessionsUsageTotals }>
    daily: SessionsUsageDailyItem[]
  }
}

export interface CostUsageDailyEntry extends SessionsUsageTotals {
  date: string
}

export interface CostUsageSummary {
  updatedAt: number
  days: number
  daily: CostUsageDailyEntry[]
  totals: SessionsUsageTotals
}

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal'

export interface LogEntry {
  raw: string
  time?: string | null
  level?: LogLevel | null
  subsystem?: string | null
  message?: string | null
  meta?: Record<string, unknown> | null
}

export interface LogsTailParams {
  cursor?: number
  limit?: number
  maxBytes?: number
}

export interface LogsTailResult {
  file: string
  cursor: number
  size: number
  lines: string[]
  truncated?: boolean
  reset?: boolean
}

export interface SystemPresenceEntry {
  instanceId?: string | null
  host?: string | null
  ip?: string | null
  version?: string | null
  platform?: string | null
  deviceFamily?: string | null
  modelIdentifier?: string | null
  roles?: string[] | null
  scopes?: string[] | null
  mode?: string | null
  lastInputSeconds?: number | null
  reason?: string | null
  tags?: string[] | null
  text?: string | null
  ts?: number | null
  deviceId?: string | null
}

export type ExecApprovalsSecurity = 'deny' | 'allowlist' | 'full'
export type ExecApprovalsAsk = 'off' | 'on-miss' | 'always'

export interface ExecApprovalsDefaults {
  security?: ExecApprovalsSecurity
  ask?: ExecApprovalsAsk
  askFallback?: ExecApprovalsSecurity
  autoAllowSkills?: boolean
}

export interface ExecApprovalsAllowlistEntry {
  id?: string
  pattern: string
  lastUsedAt?: number
  lastUsedCommand?: string
  lastResolvedPath?: string
}

export interface ExecApprovalsAgent extends ExecApprovalsDefaults {
  allowlist?: ExecApprovalsAllowlistEntry[]
}

export interface ExecApprovalsFile {
  version?: 1
  socket?: {
    path?: string
    token?: string
  }
  defaults?: ExecApprovalsDefaults
  agents?: Record<string, ExecApprovalsAgent>
}

export interface ExecApprovalsSnapshot {
  path: string
  exists: boolean
  hash: string
  file: ExecApprovalsFile
}

export interface UpdateRunStepResult {
  name: string
  command: string
  cwd?: string
  durationMs?: number
  exitCode?: number | null
  stdoutTail?: string | null
  stderrTail?: string | null
}

export interface UpdateRunResult {
  status: 'ok' | 'error' | 'skipped'
  mode: 'git' | 'pnpm' | 'bun' | 'npm' | 'unknown'
  root?: string
  reason?: string
  before?: {
    sha?: string | null
    version?: string | null
  } | null
  after?: {
    sha?: string | null
    version?: string | null
  } | null
  steps: UpdateRunStepResult[]
  durationMs: number
}

export interface UpdateRunResponse {
  ok: boolean
  result?: UpdateRunResult
  restart?: {
    ok?: boolean
    delayMs?: number
    pid?: number
    reason?: string
    error?: string
  } | null
  sentinel?: {
    path?: string | null
    payload?: Record<string, unknown> | null
  } | null
}

export interface HealthChannelAccountSummary {
  accountId: string
  configured?: boolean
  linked?: boolean
  authAgeMs?: number | null
  probe?: unknown
  lastProbeAt?: number | null
  [key: string]: unknown
}

export interface HealthChannelSummary extends HealthChannelAccountSummary {
  accounts?: Record<string, HealthChannelAccountSummary>
}

export interface HealthSessionsSummary {
  path: string
  count: number
  recent: Array<{
    key: string
    updatedAt: number | null
    age: number | null
  }>
}

export interface HealthAgentSummary {
  agentId: string
  name?: string
  isDefault: boolean
  heartbeat: Record<string, unknown>
  sessions: HealthSessionsSummary
}

export interface HealthSummary {
  ok: true
  ts: number
  durationMs: number
  channels: Record<string, HealthChannelSummary>
  channelOrder: string[]
  channelLabels: Record<string, string>
  heartbeatSeconds: number
  defaultAgentId: string
  agents: HealthAgentSummary[]
  sessions: HealthSessionsSummary
}

export interface StatusSessionStatus {
  agentId?: string
  key: string
  kind: 'direct' | 'group' | 'global' | 'unknown'
  sessionId?: string
  updatedAt: number | null
  age: number | null
  thinkingLevel?: string
  verboseLevel?: string
  reasoningLevel?: string
  elevatedLevel?: string
  systemSent?: boolean
  abortedLastRun?: boolean
  inputTokens?: number
  outputTokens?: number
  totalTokens: number | null
  totalTokensFresh: boolean
  remainingTokens: number | null
  percentUsed: number | null
  model: string | null
  contextTokens: number | null
  flags: string[]
}

export interface HeartbeatStatus {
  agentId: string
  enabled: boolean
  every: string
  everyMs: number | null
}

export interface StatusSummary {
  linkChannel?: {
    id: string
    label: string
    linked: boolean
    authAgeMs: number | null
  }
  heartbeat: {
    defaultAgentId: string
    agents: HeartbeatStatus[]
  }
  channelSummary: string[]
  queuedSystemEvents: string[]
  sessions: {
    paths: string[]
    count: number
    defaults: { model: string | null; contextTokens: number | null }
    recent: StatusSessionStatus[]
    byAgent: Array<{
      agentId: string
      path: string
      count: number
      recent: StatusSessionStatus[]
    }>
  }
}

export interface SystemMetrics {
  cpu: {
    usage: number
    cores: number
    model?: string
  }
  memory: {
    total: number
    used: number
    free: number
    usagePercent: number
  }
  disk: {
    total: number
    used: number
    free: number
    usagePercent: number
  }
  network: {
    bytesReceived: number
    bytesSent: number
    connections?: number
  }
  uptime: number
  loadAverage?: number[]
  platform?: string
  hostname?: string
}

export interface FileEntry {
  name: string
  path: string
  type: 'file' | 'directory' | 'symlink'
  size?: number
  modifiedAt?: string
  createdAt?: string
  permissions?: string
  isReadable?: boolean
  isWritable?: boolean
  extension?: string
}

export interface FileBrowseResult {
  path: string
  entries: FileEntry[]
  parentPath?: string
}

export interface FileReadResult {
  path: string
  content: string
  encoding: string
  size: number
  modifiedAt?: string
}

export interface AgentWithStats {
  id: string
  name?: string
  identity?: AgentIdentity
  workspace?: string
  model?: string
  status?: 'active' | 'idle' | 'offline'
  sessionCount?: number
  tokenUsage?: {
    input: number
    output: number
    total: number
  }
  lastActivity?: string
}

export interface AgentAddParams {
  id: string
  workspace?: string
  model?: ModelConfig
  tools?: ToolPolicyConfig
  identity?: AgentIdentity
}

export interface AgentSetIdentityParams {
  agentId?: string
  workspace?: string
  identityFile?: string
  fromIdentity?: boolean
  name?: string
  theme?: string
  emoji?: string
  avatar?: string
}

export interface AgentSetModelParams {
  agentId?: string
  workspace?: string
  model?: string
  fallback?: string[]
}

export interface AgentDeleteParams {
  agentId: string
}

// ---------------------------------------------------------------------
// Model lifecycle events (spec §2.3 / Task D1)
//
// These mirror the JSON payloads emitted by hermes-agent's
// ``_emit_lifecycle_event`` on the three ``hermes.model.*`` event
// types.  The gateway relays them unchanged to the desktop client via
// SSE frames (stream path) and /v1/runs event stream.
// ---------------------------------------------------------------------

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
