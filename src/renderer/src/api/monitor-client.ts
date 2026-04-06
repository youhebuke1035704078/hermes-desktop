import { apiFetch } from './http-client'
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
  MonitorResponse,
  PaginatedResponse,
  TaskQueryParams,
  AlertQueryParams,
  LogQueryParams
} from './types'

function buildQuery(params?: Record<string, unknown>): string {
  if (!params) return ''
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
  if (entries.length === 0) return ''
  return '?' + entries.map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`).join('&')
}

export const monitorApi = {
  getSummary: () =>
    apiFetch<MonitorResponse<SystemSummary>>('/api/monitor/summary'),

  getServices: (params?: Record<string, string>) =>
    apiFetch<MonitorResponse<Service[]>>(`/api/monitor/services${buildQuery(params)}`),

  getService: (id: string) =>
    apiFetch<MonitorResponse<{ service: Service; instances: ServiceInstance[] }>>(
      `/api/monitor/services/${id}`
    ),

  getMetrics: () =>
    apiFetch<MonitorResponse<Record<string, unknown>>>('/api/monitor/metrics'),

  getTrends: (window = '24h') =>
    apiFetch<MonitorResponse<TrendData>>(`/api/monitor/trends?window=${window}`),

  getAlerts: (params?: AlertQueryParams) =>
    apiFetch<MonitorResponse<PaginatedResponse<AlertEvent>>>(
      `/api/monitor/alerts${buildQuery(params as unknown as Record<string, unknown>)}`
    ),

  getLogs: (params?: LogQueryParams) =>
    apiFetch<MonitorResponse<PaginatedResponse<LogEntry>>>(
      `/api/monitor/logs${buildQuery(params as unknown as Record<string, unknown>)}`
    ),

  getTasks: (params?: TaskQueryParams) =>
    apiFetch<MonitorResponse<PaginatedResponse<TaskExecution>>>(
      `/api/monitor/tasks${buildQuery(params as unknown as Record<string, unknown>)}`
    ),

  getSkills: () =>
    apiFetch<MonitorResponse<SkillMetric[]>>('/api/monitor/skills'),

  getTools: (type?: string) =>
    apiFetch<MonitorResponse<ToolMetric[]>>(
      `/api/monitor/tools${type ? `?type=${type}` : ''}`
    ),

  getModels: () =>
    apiFetch<MonitorResponse<ModelMetric[]>>('/api/monitor/models'),

  getNoiseLogs: () =>
    apiFetch<MonitorResponse<NoiseLogReport>>('/api/monitor/noise/logs'),

  getNoiseOutputs: () =>
    apiFetch<MonitorResponse<NoiseOutputReport>>('/api/monitor/noise/outputs'),

  getNoiseAlerts: () =>
    apiFetch<MonitorResponse<NoiseAlert[]>>('/api/monitor/noise/alerts'),

  getVersion: () =>
    apiFetch<MonitorResponse<VersionInfo>>('/api/monitor/version')
}
