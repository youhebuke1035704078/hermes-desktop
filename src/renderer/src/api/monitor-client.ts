import { apiFetch } from './desktop-http-client'
import type {
  SystemSummary,
  TrendData,
  Service,
  ServiceInstance,
  TaskExecution,
  SkillMetric,
  ToolMetric,
  ModelMetric,
  AlertEvent,
  LogEntry,
  NoiseLogReport,
  NoiseOutputReport,
  NoiseAlert,
  VersionInfo,
  MetricsData,
  MonitorResponse,
  PaginatedResponse,
  TaskQueryParams,
  AlertQueryParams,
  LogQueryParams
} from './monitor-types'

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return ''
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (entries.length === 0) return ''
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
}

export const monitorApi = {
  getSummary: () =>
    apiFetch<MonitorResponse<SystemSummary>>('/api/summary'),

  getServices: (params?: Record<string, string>) =>
    apiFetch<MonitorResponse<Service[]>>(`/api/services${buildQuery(params)}`),

  getService: (id: string) =>
    apiFetch<MonitorResponse<{ service: Service; instances: ServiceInstance[] }>>(
      `/api/services/${id}`
    ),

  getMetrics: () =>
    apiFetch<MonitorResponse<MetricsData>>('/api/metrics'),

  getTrends: (window = '24h') =>
    apiFetch<MonitorResponse<TrendData>>(`/api/trends?window=${window}`),

  getAlerts: (params?: AlertQueryParams) =>
    apiFetch<MonitorResponse<PaginatedResponse<AlertEvent>>>(
      `/api/alerts${buildQuery(params as unknown as Record<string, unknown>)}`
    ),

  getLogs: (params?: LogQueryParams) =>
    apiFetch<MonitorResponse<PaginatedResponse<LogEntry>>>(
      `/api/logs${buildQuery(params as unknown as Record<string, unknown>)}`
    ),

  getTasks: (params?: TaskQueryParams) =>
    apiFetch<MonitorResponse<PaginatedResponse<TaskExecution>>>(
      `/api/tasks${buildQuery(params as unknown as Record<string, unknown>)}`
    ),

  getSkills: () =>
    apiFetch<MonitorResponse<SkillMetric[]>>('/api/skills'),

  getTools: (type?: string) =>
    apiFetch<MonitorResponse<ToolMetric[]>>(
      `/api/tools${type ? `?type=${type}` : ''}`
    ),

  getModels: () =>
    apiFetch<MonitorResponse<ModelMetric[]>>('/api/models'),

  getNoiseLogs: () =>
    apiFetch<MonitorResponse<NoiseLogReport>>('/api/noise/logs'),

  getNoiseOutputs: () =>
    apiFetch<MonitorResponse<NoiseOutputReport>>('/api/noise/outputs'),

  getNoiseAlerts: () =>
    apiFetch<MonitorResponse<NoiseAlert[]>>('/api/noise/alerts'),

  getVersion: () =>
    apiFetch<MonitorResponse<VersionInfo>>('/api/version'),

  restartService: (id: string, action: 'restart' | 'stop' | 'start' = 'restart') =>
    apiFetch<MonitorResponse<{ id: string; action: string; success: boolean }>>(
      `/api/monitor/services/${id}/restart`,
      { method: 'POST', body: JSON.stringify({ action }) }
    )
}
