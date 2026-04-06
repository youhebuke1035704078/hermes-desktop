// === Monitor Types (from OpenClaw Monitor) ===

export type SystemStatus = 'healthy' | 'degraded' | 'down' | 'unknown'
export type ServiceStatus = 'online' | 'offline' | 'degraded' | 'starting' | 'paused' | 'unknown'
export type TaskStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout' | 'cancelled'
export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertState = 'active' | 'resolved' | 'silenced'
export type ServiceType = 'main' | 'worker' | 'scheduler' | 'mcp' | 'database' | 'cache' | 'queue' | 'api_gateway' | 'other'

export interface SystemSummary {
  status: SystemStatus
  total_services: number
  online_services: number
  total_instances: number
  active_tasks_24h: number
  active_alerts: number
  requests_24h: number
  error_rate_24h: number
  avg_response_time_ms: number
}

export interface TrendPoint {
  timestamp: string
  requests: number
  error_rate: number
  avg_latency_ms: number
  active_tasks: number
}

export interface TrendData {
  window: string
  points: TrendPoint[]
}

export interface Service {
  id: string
  name: string
  type: ServiceType
  status: ServiceStatus
  cpu_percent: number
  memory_mb: number
  error_rate: number
  avg_latency_ms: number
  uptime_seconds: number
}

export interface ServiceInstance {
  id: string
  service_id: string
  status: ServiceStatus
  cpu_percent: number
  memory_mb: number
  disk_usage_percent: number
}

export interface TaskExecution {
  id: string
  name: string
  status: TaskStatus
  started_at: string
  duration_ms: number
  skill_name?: string
  model_name?: string
  error?: string
  source: string
}

export interface SkillMetric {
  name: string
  total_calls: number
  success_rate: number
  avg_duration_ms: number
  p95_duration_ms: number
}

export interface ToolMetric {
  name: string
  type: string
  availability: boolean
  call_count: number
  success_rate: number
}

export interface ModelMetric {
  provider: string
  model: string
  total_calls: number
  total_input_tokens: number
  total_output_tokens: number
  cost_estimate_usd: number
  avg_latency_ms: number
}

export interface AlertEvent {
  id: string
  title: string
  severity: AlertSeverity
  state: AlertState
  message: string
  source: string
  created_at: string
  resolved_at?: string
  labels: Record<string, string>
}

export interface LogEntry {
  timestamp: string
  level: string
  message: string
  service_name?: string
  trace_id?: string
  fields?: Record<string, unknown>
}

export interface PaginationParams {
  page?: number
  page_size?: number
}

export interface TaskQueryParams extends PaginationParams {
  status?: TaskStatus
  skill?: string
  source?: string
}

export interface AlertQueryParams extends PaginationParams {
  severity?: AlertSeverity
  state?: AlertState
}

export interface LogQueryParams extends PaginationParams {
  level?: string
  search?: string
}

export interface PaginatedResponse<T> {
  data: T[]
  total: number
  page: number
  page_size: number
}

export interface MonitorResponse<T> {
  status: 'ok' | 'unavailable'
  data: T | null
  message?: string
}

// === Admin/Gateway Types ===

export interface Agent {
  id: string
  name: string
  displayName?: string
  description?: string
  status: string
}

export interface Session {
  id: string
  agentId: string
  channelType: string
  senderId: string
  status: string
  createdAt: string
  updatedAt: string
  messageCount: number
}

export interface Channel {
  id: string
  type: string
  name: string
  status: string
  config: Record<string, unknown>
}

export interface Model {
  id: string
  provider: string
  name: string
  displayName?: string
  apiKey?: string
  baseUrl?: string
  enabled: boolean
}

export interface CronJob {
  id: string
  name: string
  schedule: string
  enabled: boolean
  lastRun?: string
  nextRun?: string
  status: string
}

export interface GatewayEvent {
  type: string
  data: unknown
  timestamp: string
}

export interface NoiseLogReport {
  noiseRatio: number
  totalLines: number
  noisyLines: number
  patterns: Array<{ pattern: string; count: number; ratio: number }>
  subsystems: Array<{ name: string; lines: number; noiseRatio: number }>
  timeline: Array<{ hour: string; total: number; noisy: number }>
}

export interface NoiseOutputReport {
  qualityScore: number
  totalOutputs: number
  repetitionPairs: Array<{ a: string; b: string; similarity: number }>
  hollowPatterns: Array<{ pattern: string; count: number }>
  dailyTrends: Array<{ date: string; score: number }>
}

export interface NoiseAlert {
  id: string
  type: string
  severity: AlertSeverity
  message: string
  timestamp: string
  resolved: boolean
}

export interface VersionInfo {
  current: string
  latest?: string
  updateAvailable: boolean
}

// === Gateway Admin Types (used by migrated Admin pages) ===

export interface ConfigPatch {
  op?: 'add' | 'remove' | 'replace'
  path: string
  value?: unknown
}

export interface OpenClawConfig {
  [key: string]: unknown
}

export interface Skill {
  name: string
  description?: string
  source?: string
  installed?: boolean
  version?: string
  [key: string]: unknown
}

export interface Tool {
  name: string
  type?: string
  description?: string
  source?: string
  [key: string]: unknown
}

export interface DeviceNode {
  id: string
  name?: string
  platform?: string
  status?: string
  capabilities?: string[]
  [key: string]: unknown
}

export interface AgentInfo {
  id: string
  name?: string
  displayName?: string
  workspace?: string
  model?: string
  identity?: Record<string, unknown>
  [key: string]: unknown
}

export interface ModelInfo {
  id?: string
  provider?: string
  model?: string
  name?: string
  [key: string]: unknown
}

export interface PluginPackage {
  name: string
  installed: boolean
  version?: string
  [key: string]: unknown
}
