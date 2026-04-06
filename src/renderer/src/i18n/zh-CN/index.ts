export default {
  nav: {
    dashboard: '总览',
    sessions: '会话管理',
    agents: 'Agent 配置',
    models: '模型管理',
    channels: '渠道管理',
    services: '服务状态',
    tasks: '任务监控',
    alerts: '告警中心',
    logs: '日志检索',
    skills: '技能统计',
    tools: '工具与 MCP',
    noise: '噪声检测',
    terminal: '终端',
    remoteDesktop: '远程桌面',
    files: '文件管理',
    backup: '备份恢复',
    office: '协作空间',
    settings: '系统设置'
  },
  navGroup: {
    agentManagement: 'Agent 管理',
    opsMonitor: '运维监控',
    tools: '工具箱',
    system: '系统'
  },
  connection: {
    title: 'OpenClaw 桌面管理终端',
    recentServers: '最近连接',
    addServer: '添加新服务器',
    serverUrl: '服务器地址',
    username: '用户名',
    password: '密码',
    connect: '连接',
    connecting: '正在连接...',
    serverName: '服务器名称',
    delete: '删除',
    edit: '编辑',
    httpsWarning: '使用 HTTP 连接不安全，建议使用 HTTPS',
    noServers: '暂无保存的服务器，请添加一个',
    confirmDelete: '确定删除此服务器？',
    connectFailed: '连接失败，请检查地址和凭据'
  },
  common: {
    loading: '加载中...',
    error: '出错了',
    retry: '重试',
    noData: '暂无数据',
    confirm: '确认',
    cancel: '取消',
    save: '保存',
    search: '搜索',
    filter: '筛选',
    export: '导出',
    refresh: '刷新',
    noDescription: '暂无描述',
    itemsCount: '{count} 项',
    disconnected: '连接已断开，正在重连...',
    cannotConnect: '无法连接到服务器，请检查网络',
    reconnect: '手动重连',
    loginExpired: '登录已过期，请重新连接',
    switchServer: '切换服务器',
    disconnect: '断开连接'
  },
  status: {
    healthy: '正常',
    degraded: '降级',
    down: '宕机',
    unknown: '未知',
    online: '在线',
    offline: '离线',
    starting: '启动中',
    paused: '已暂停'
  },
  pages: {
    skills: {
      title: '技能管理',
      info: '技能是 OpenClaw 的核心能力单元，可通过插件系统扩展。',
      showBundled: '显示内置',
      showBundledInChat: '聊天中显示内置',
      searchPlaceholder: '搜索技能...',
      loadFailed: '加载失败: {error}',
      hasUpdate: '有更新',
      version: 'v{version}',
      noVersion: '无版本号',
      eligibleOk: '可用',
      eligibleRestricted: '受限',
      noMatches: '没有匹配的技能',
      sources: {
        workspace: '工作区',
        managed: '托管',
        extra: '扩展',
        bundled: '内置'
      },
      stats: {
        total: '可用技能总数',
        bundledAvailable: '内置可用',
        user: '用户技能'
      },
      groups: {
        user: {
          title: '用户技能',
          description: '工作区、托管和扩展来源的技能',
          empty: '暂无用户技能'
        },
        bundled: {
          title: '内置技能',
          description: '系统自带的技能',
          empty: '暂无内置技能'
        }
      }
    }
  },
  dashboard: {
    title: '系统总览',
    totalServices: '服务总数',
    onlineServices: '在线服务',
    activeTasks: '24h 活跃任务',
    activeAlerts: '活跃告警',
    requests24h: '24h 请求数',
    errorRate: '错误率',
    avgResponseTime: '平均响应时间',
    trends: '趋势图'
  }
}
