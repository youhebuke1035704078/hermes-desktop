import { apiFetch } from './http-client'

// Gateway RPC proxy — sends method + params to /api/rpc
export async function rpcCall<T>(method: string, params?: Record<string, unknown>): Promise<T> {
  return apiFetch<T>('/api/rpc', {
    method: 'POST',
    body: JSON.stringify({ method, params: params || {} })
  })
}

// Convenience methods for common Gateway RPC calls
export const rpcClient = {
  // Sessions
  getSessionList: (params?: Record<string, unknown>) => rpcCall('getSessionList', params),
  getSessionDetail: (id: string) => rpcCall('getSessionDetail', { id }),
  sendMessage: (sessionId: string, content: string) =>
    rpcCall('sendMessage', { sessionId, content }),

  // Agents
  getAgentList: () => rpcCall('getAgentList'),
  getAgentDetail: (id: string) => rpcCall('getAgentDetail', { id }),

  // Channels
  getChannels: () => rpcCall('getChannels'),

  // Models
  getModels: () => rpcCall('getModels'),

  // Skills
  listSkills: () => rpcCall('listSkills'),

  // Config
  getConfig: () => rpcCall('getConfig'),
  updateConfig: (config: Record<string, unknown>) => rpcCall('updateConfig', config),

  // Cron
  listCrons: () => rpcCall('listCrons'),
  listCronRuns: (jobId: string, limit?: number) =>
    rpcCall('listCronRuns', { jobId, limit }),

  // Nodes
  listNodes: () => rpcCall('listNodes'),

  // Memory
  getMemory: (agentId: string, type: string) => rpcCall('getMemory', { agentId, type }),
  updateMemory: (agentId: string, type: string, content: string) =>
    rpcCall('updateMemory', { agentId, type, content }),

  // Logs
  tailLogs: (params?: Record<string, unknown>) => rpcCall('tailLogs', params)
}
