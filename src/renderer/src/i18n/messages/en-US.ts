export default {
  app: {
    title: 'Hermes Desktop'
  },
  routes: {
    connection: 'Connect to Server',
    login: 'Login',
    dashboard: 'Dashboard',
    chat: 'Live Chat',
    sessions: 'Sessions',
    sessionDetail: 'Session Detail',
    memory: 'Memory',
    cron: 'Cron',
    models: 'Models',
    channels: 'Channels',
    skills: 'Skills',
    system: 'Services',
    alerts: 'Alerts',
    files: 'Files',
    agents: 'Agents',
    monitor: 'Operations',
    settings: 'Settings',
    backup: 'Data Backup',
    logs: 'Logs',
    insights: 'Insights'
  },
  common: {
    all: 'All',
    home: 'Home',
    empty: 'No data',
    httpsWsBlocked:
      'This page is HTTPS. Browsers block ws:// WebSocket. Use wss://, or connect via an SSH tunnel to ws://127.0.0.1:18789.',
    logout: 'Log out',
    refresh: 'Refresh',
    refreshSuccess: 'Refreshed successfully',
    save: 'Save',
    saveFailed: 'Save failed',
    saveAndApply: 'Save & apply',
    export: 'Export',
    reset: 'Reset',
    delete: 'Delete',
    viewAll: 'View all',
    enabled: 'Enabled',
    disabled: 'Disabled',
    online: 'Online',
    offline: 'Offline',
    cancel: 'Cancel',
    confirm: 'Confirm',
    required: 'Required',
    retry: 'Retry',
    complete: 'Complete',
    clear: 'Clear',
    edit: 'Edit',
    copy: 'Copy',
    copied: 'Copied',
    copyFailed: 'Copy failed',
    itemsCount: '{count} items',
    create: 'Create',
    currentValueSuffix: '{label} (current)',
    noDescription: 'No description',
    messagesCount: '{count} messages',
    noMessages: 'No messages',
    switchToLight: 'Switch to light mode',
    switchToDark: 'Switch to dark mode',
    switchToWideMode: 'Switch to wide mode',
    switchToNormalWidth: 'Switch to normal width',
    toggleLanguage: 'Switch language: {target}',
    languageZh: '中文',
    languageEn: 'English'
  },
  components: {
    connectionStatus: {
      installingIn: '{count}s until auto install...',
      ready: 'New version ready',
      downloading: 'Downloading {percent}%',
      updateDetected: 'Update detected',
      checking: 'Checking...',
      upToDate: 'Up to date',
      updateFailed: 'Update failed',
      currentVersion: 'Current Desktop version v{version}',
      upgradableTo: ', upgradable to v{version}',
      checkForUpdate: 'Check for updates',
      downloadUpdate: 'Download update',
      downloadInstaller: 'Download installer',
      installNow: 'Install now',
      installingInShort: '{count}s until auto install',
      downloadingInBackground: 'Downloading new version in background...',
      clickToCheck: 'Click to check for updates'
    },
    pdfViewer: {
      reset: 'Reset',
      resetZoom: 'Reset zoom',
      enterFullscreen: 'Fullscreen',
      exitFullscreen: 'Exit fullscreen'
    }
  },
  pages: {
    connection: {
      subtitle: 'Connect to your Hermes server',
      autoConnecting: 'Connecting to local Hermes server…',
      localHermes: 'Local Hermes',
      connectLocal: 'Connect',
      localConnectFailed: 'Cannot connect to local Hermes (localhost:8642)',
      encryptionWarning:
        'Secure storage is not available on this system. Passwords will be stored without encryption. Use a system with Keychain / Credential Manager support.',
      serverList: 'Server List',
      refreshStatus: 'Refresh Status',
      addServer: 'Add Server',
      emptyHint: 'No servers yet, click above to add',
      addFirst: 'Add First Server',
      connected: 'Connected',
      reconnect: 'Reconnect',
      connect: 'Connect',
      edit: 'Edit',
      deleteConfirm: 'Are you sure you want to delete this server?',
      noAuth: 'No Auth',
      healthOnline: 'Online',
      healthOffline: 'Offline',
      healthChecking: 'Checking...',
      healthUnknown: 'Unknown',
      supportedPlatforms: 'Supported Platforms',
      platformHint:
        'Deploy the Hermes service on the target host, then use this client to connect and manage remotely',
      modalTitleAdd: 'Add Server',
      modalTitleEdit: 'Edit Server',
      labelAddress: 'Address',
      labelAddressRequired: '(required, determines connection target)',
      placeholderAddress: 'e.g. 192.168.1.100:3002',
      labelName: 'Name',
      labelNameOptional: '(optional, display only)',
      placeholderName: 'e.g. My Mac Mini',
      labelPlatform: 'Platform',
      labelUsername: 'Username',
      labelUsernameOptional: '(optional, display only)',
      placeholderUsername: 'Any identifier (e.g. admin)',
      labelToken: 'Access\nToken',
      labelTokenRequired: '(required, determines authentication)',
      placeholderToken: 'Hermes REST: API_SERVER_KEY',
      tokenHint:
        'For Hermes REST, enter API_SERVER_KEY from the server ~/.hermes/.env. Legacy ACP Gateway uses gateway.auth.token.',
      probeButton: 'Probe Server',
      probeHermesRest:
        'Hermes Agent REST API detected — no authentication needed, ready to connect.',
      probeHermesRestAuth:
        'Hermes Agent REST API detected — please enter the API access token (API_SERVER_KEY).',
      probeNoAuth: 'Server is reachable. Authentication is disabled — no credentials needed.',
      probeAuth: 'Server is reachable. Please enter the Gateway access token.',
      probeUnreachable:
        'Cannot reach this address. Check: 1) Service is running 2) Port is correct 3) Firewall settings',
      httpWarning:
        'Using HTTP over public networks is insecure. Use HTTPS or restrict to local network.',
      localServer: 'Local Server',
      validationNameUrl: 'Please fill in server name and address',
      validationCredentials:
        'Please enter username and Gateway token (if the server has no auth, click "Probe Server" first)',
      saveSuccess: 'Server added',
      updateSuccess: 'Server updated',
      saveFailed: 'Save failed',
      unknownError: 'Unknown error',
      save: 'Save',
      add: 'Add',
      authFailed: 'Authentication failed',
      serverError: 'Server error',
      connectFailed: 'Connection failed',
      connectFailedNoAuth:
        'Connection failed. Check if the server address is correct and the service is running.',
      connectFailedAuth: 'Connection failed. Check the server address and access token.',
      deleted: 'Deleted',
      deleteFailed: 'Delete failed'
    },
    login: {
      subtitle: 'Connect to Hermes Gateway to manage your AI assistant',
      gatewayUrlLabel: 'Gateway URL',
      gatewayUrlPlaceholder: 'ws://127.0.0.1:18789',
      tokenLabel: 'Gateway Token',
      tokenPlaceholder: 'Enter your Gateway token',
      tokenHintPrefix: 'Run ',
      tokenHintSuffix: ' to get the token',
      connect: 'Connect',
      connecting: 'Connecting to backend service...',
      inputTokenRequired: 'Please enter the Gateway token',
      connectTimeout: 'Connection timed out. Please check the Gateway URL',
      tokenInvalid: 'Token verification failed',
      connectionClosed: 'Connection closed',
      connectionClosedWithCode: 'Connection closed (code {code})',
      connectFailed: 'Connection failed. Please check the Gateway URL',
      gatewayDisconnected: 'Backend service not connected to Gateway',
      retry: 'Retry',
      username: 'Username',
      usernamePlaceholder: 'Enter username',
      password: 'Password',
      passwordPlaceholder: 'Enter password',
      login: 'Login',
      loggingIn: 'Logging in...',
      credentialsRequired: 'Please enter username and password',
      invalidCredentials: 'Invalid username or password'
    },
    skills: {
      title: 'Skill Management',
      refresh: 'Refresh',
      metrics: {
        total: 'Total',
        enabled: 'Enabled',
        disabled: 'Disabled',
        configVars: 'Config Vars',
        userCreated: 'Custom Skills'
      },
      search: 'Search by name / description / tags',
      categoryFilter: 'Category',
      categoryAll: 'All',
      statusFilter: 'Status',
      statusAll: 'All',
      statusEnabled: 'Enabled',
      statusDisabled: 'Disabled',
      sourceFilter: 'Source',
      sourceAll: 'All Sources',
      sourceOther: 'Other Sources',
      source: {
        server: 'Server Skills',
        local: 'Local Skills',
        fallback: 'Failed to load server skills; showing local scan instead: {error}'
      },
      userCreated: {
        title: 'Custom Skills'
      },
      columns: {
        name: 'Name',
        category: 'Category',
        source: 'Source',
        platform: 'Platform',
        status: 'Status'
      },
      detail: {
        empty: 'Select a skill to view details',
        version: 'Version',
        author: 'Author',
        license: 'License',
        platforms: 'Platforms',
        platformAll: 'All Platforms',
        tags: 'Tags',
        enabled: 'Enabled',
        disabled: 'Disabled',
        prerequisites: 'Prerequisites',
        commands: 'Required Commands',
        envVars: 'Required Env Vars',
        noPrerequisites: 'No prerequisites',
        configVars: 'Config Variables',
        noConfigVars: 'No config variables',
        configDefault: 'Default: {value}',
        configSaved: 'Config saved',
        configFailed: 'Save failed',
        relatedSkills: 'Related Skills',
        homepage: 'Homepage'
      },
      toggle: {
        enabled: 'Enabled {name}',
        disabled: 'Disabled {name}',
        failed: 'Toggle failed'
      },
      externalDirs: {
        title: 'External Skill Directories',
        add: 'Add Directory',
        placeholder: 'Enter directory path, e.g. ~/my-skills',
        empty: 'No external directories',
        confirmRemove: 'Remove this directory?',
        added: 'Directory added',
        removed: 'Directory removed',
        failed: 'Operation failed'
      },
      empty: 'No skills found. Check ~/.hermes/skills/ directory.',
      sources: {
        userCreated: 'Custom',
        workspace: 'Created',
        managed: 'Installed',
        extra: 'External',
        bundled: 'Bundled'
      }
    },
    config: {
      title: 'hermes.json',
      noChanges: 'No changes to save',
      saved: 'Config saved',
      toolsSaved: 'Tools config saved',
      sessionsSaved: 'Sessions config saved',
      applyAndReload: 'Apply & reload',
      appliedAndReloading: 'Config applied. Gateway will reload',
      applyFailed: 'Apply failed',
      channelsMigratedHint:
        'Channel accounts, policies, auth pairing, and credential updates have been migrated to Channels. Use that page for daily operations.',
      goToChannels: 'Go to Channels',
      tabs: {
        general: 'General',
        tools: 'Tools policy',
        sessions: 'Sessions',
        raw: 'Raw hermes.json'
      },
      labels: {
        primaryModel: 'Primary model',
        gatewayPort: 'Gateway port',
        workspacePath: 'Workspace path',
        toolProfile: 'Tools profile',
        allowedTools: 'Allowed tools',
        deniedTools: 'Denied tools',
        resetMode: 'Reset mode',
        resetHourUtc: 'Reset hour (UTC)',
        idleMinutes: 'Idle minutes',
        queueMode: 'Queue mode'
      },
      placeholders: {
        model: 'Select or enter a model',
        workspacePath: '~/.hermes/workspace'
      },
      toolProfiles: {
        minimal: 'Minimal',
        coding: 'Coding',
        full: 'Full'
      },
      resetModes: {
        off: 'Off',
        daily: 'Daily reset',
        idle: 'Idle reset'
      },
      queueModes: {
        sequential: 'Sequential',
        concurrent: 'Concurrent',
        collect: 'Collect'
      },
      rawReadonlyHint: 'Full hermes.json config (read-only)'
    },
    channels: {
      title: 'Channels',
      refresh: 'Refresh',
      manageSettings: 'Open settings',
      empty: 'No channels configured. Visit Settings to add channel credentials.',
      unavailableHermesRest:
        'Channel management is not supported in Hermes REST mode. Connect to an ACP Gateway to view channels.',
      searchPlaceholder: 'Search by ID or account name',
      platformAll: 'All platforms',
      statusAll: 'All statuses',
      platformFilter: 'Filter by platform',
      statusFilter: 'Filter by status',
      auth: 'Authenticate',
      reauth: 'Re-authenticate',
      authStarted: 'Authentication started for {id}',
      authFailed: 'Authentication failed: {error}',
      pairingCodeRequired: 'Please enter the pairing code',
      pairSuccess: 'Paired successfully',
      pairFailed: 'Pairing failed: {error}',
      statusRefreshed: 'Status refreshed',
      metrics: {
        total: 'Total channels',
        connected: 'Connected',
        errors: 'Errors',
        members: 'Total members'
      },
      status: {
        connected: 'Connected',
        disconnected: 'Disconnected',
        authenticating: 'Authenticating',
        error: 'Error'
      },
      columns: {
        platform: 'Platform',
        identity: 'Identity',
        status: 'Status',
        members: 'Members',
        dmPolicy: 'DM Policy',
        actions: 'Actions'
      },
      pairingDialog: {
        title: 'Enter pairing code',
        description: 'Enter the pairing code returned by {id} to complete authentication.',
        codePlaceholder: 'e.g. 123-456',
        submit: 'Submit',
        cancel: 'Cancel'
      },
      detail: {
        platform: 'Platform',
        status: 'Status',
        accountName: 'Account name',
        accountId: 'Account ID',
        memberCount: 'Members',
        dmPolicy: 'DM policy',
        groupPolicy: 'Group policy',
        groups: 'Groups ({count})'
      }
    },
    memory: {
      title: 'Memory & Docs',
      coveredDocsPrefix: 'Covers Hermes managed docs: ',
      coveredDocsSuffix: '.',
      gatewayLimited:
        'This Gateway may not support agents.files.* or permission is restricted: {error}',
      agentPlaceholder: 'Select agent',
      stats: {
        docsCount: '{count} docs',
        highRiskCount: 'High risk {count}',
        currentDoc: 'Current {name}'
      },
      tags: {
        highRisk: 'High risk',
        unsaved: 'Unsaved'
      },
      nav: {
        title: 'Documents'
      },
      emptyDocs: 'No manageable documents',
      noDocSelected: 'No document selected',
      uncategorizedDoc: 'Uncategorized document',
      groups: {
        role: 'Role & persona',
        runtime: 'Runtime & policy',
        memory: 'Memory & preferences',
        other: 'Other'
      },
      fileState: {
        notLoaded: 'Not loaded',
        notCreated: 'Not created',
        exists: 'Exists'
      },
      emptyDocHtml: 'This file is empty. Click \"Edit\" to start.',
      editor: {
        stats: '{lines} lines · {chars} chars',
        placeholder: 'Maintain docs in Markdown. Saving empty content will write an empty file.',
        saveHint: 'Saved content will be written to the current agent workspace document.'
      },
      actions: {
        edit: 'Edit',
        cancelEdit: 'Cancel edit',
        saveDoc: 'Save',
        restore: 'Restore'
      },
      readonlyHint: 'Read-only mode. Click \"Edit\" to enable editing.',
      infoCard: {
        title: 'Document info',
        workspace: 'Workspace',
        filePath: 'File path',
        updatedAt: 'Updated',
        fileSize: 'Size'
      },
      snippets: {
        title: 'Snippets',
        insertToday: 'Insert today template',
        footerHintPrefix: 'Daily log memory defaults to ',
        footerHintSuffix: '. This page focuses on core managed documents.',
        facts: {
          label: 'Facts',
          heading: 'Facts',
          items: {
            background: 'Background:',
            decision: 'Decision:',
            conclusion: 'Conclusion:'
          }
        },
        principles: {
          label: 'Principles',
          heading: 'Principles',
          items: {
            goal: 'Goal:',
            constraints: 'Constraints:',
            prohibited: 'Prohibited:'
          }
        },
        persona: {
          label: 'Persona',
          heading: 'Persona',
          items: {
            tone: 'Tone:',
            style: 'Style:',
            principles: 'Principles:'
          }
        },
        bootstrap: {
          label: 'Bootstrap',
          heading: 'Bootstrap constraints',
          items: {
            goal: 'Goal:',
            environment: 'Environment:',
            firstRun: 'First-run strategy:'
          }
        },
        userPreference: {
          label: 'User preferences',
          heading: 'User preferences',
          items: {
            output: 'Preferred outputs:',
            taboo: 'Taboos:',
            tone: 'Tone preference:'
          }
        },
        heartbeat: {
          label: 'Heartbeat',
          heading: 'Tasks',
          items: {
            dailyStatus: 'Daily status check',
            cleanup: 'Clean up failed tasks'
          }
        },
        preferenceTemplate: {
          label: 'Preference template',
          heading: 'Preferences',
          items: {
            outputStyle: 'Output style:',
            disabled: 'Disabled:',
            pacing: 'Pacing:'
          }
        },
        projectConventions: {
          label: 'Project conventions',
          heading: 'Project conventions',
          items: {
            branching: 'Branching:',
            release: 'Release:',
            verification: 'Verification:'
          }
        }
      },
      messages: {
        initFailed: 'Failed to initialize memory module',
        discardConfirm: 'You have unsaved changes. Switching will discard them. Continue?',
        resetToLoaded: 'Restored to the last loaded content',
        switchAgentFailed: 'Failed to switch agent',
        loadDocFailed: 'Failed to load document',
        refreshed: 'Document refreshed',
        refreshFailed: 'Refresh failed',
        selectAgentAndDocFirst: 'Please select an agent and a document first',
        saveHighRiskConfirm: 'You are saving a high-impact document {name}. Continue?',
        saved: 'Document saved'
      },
      docs: {
        AGENTS: {
          description: 'Core behavior rules and constraints (high impact)'
        },
        SOUL: {
          description: 'Persona, tone, and style (high impact)'
        },
        IDENTITY: {
          description: 'Identity such as name, avatar, and theme'
        },
        USER: {
          description: 'User preferences and communication conventions'
        },
        TOOLS: {
          description: 'Tool usage notes (does not control availability)'
        },
        HEARTBEAT: {
          description: 'Heartbeat turn tasks'
        },
        BOOTSTRAP: {
          description: 'Bootstrap injected context (high impact)'
        },
        MEMORY: {
          description: 'Long-lived stable facts and preferences'
        }
      }
    },
    cron: {
      title: 'Cron (Scheduler)',
      tips: 'For recurring jobs use Cron/Every; for one-offs use At. Start with templates then adjust details.',
      schedulerDisabledHint: 'Gateway `cron.enabled` might be off; jobs won’t run automatically.',
      requestFailed: 'Cron request failed: {error}',
      quickTemplates: 'Quick templates',
      stats: {
        scheduler: 'Scheduler',
        schedulerEnabled: 'Enabled',
        schedulerDisabled: 'Disabled',
        totalJobs: 'Total jobs',
        enabledJobs: 'Enabled jobs',
        disabledJobs: 'Disabled jobs',
        nextRun: 'Next Run',
        nextWake: 'Next wake'
      },
      jobs: {
        title: 'Jobs',
        count: '{count} jobs',
        searchPlaceholder: 'Search name / description / payload',
        emptyHint: 'No jobs yet. Use a template above or click \"Create job\".'
      },
      jobStatus: {
        enabled: 'Enabled',
        disabled: 'Disabled'
      },
      detail: {
        schedule: 'Schedule',
        execMode: 'Execution',
        payloadKind: 'Payload',
        model: 'Model',
        agent: 'Agent',
        nextRun: 'Next run',
        lastRun: 'Last run',
        payload: 'Payload',
        delivery: 'Delivery',
        lastError: 'Last error: {error}',
        emptyHint: 'Select a job to view details'
      },
      runs: {
        title: 'Runs',
        subtitle: '{name} · {count} runs',
        noSelection: 'Select a job to view run history',
        detail: {
          summary: 'Run summary',
          jobId: 'Job ID',
          runAt: 'Run at',
          duration: 'Duration',
          nextRun: 'Next run',
          session: 'Session',
          error: 'Error',
          raw: 'Raw payload',
          empty: 'No run selected'
        }
      },
      table: {
        jobs: {
          task: 'Task',
          selected: 'Selected',
          schedule: 'Schedule',
          nextRun: 'Next run',
          lastRun: 'Last Run',
          lastStatus: 'Result',
          status: 'Status',
          actions: 'Actions'
        },
        runs: {
          runAt: 'Run at',
          status: 'Status',
          duration: 'Duration',
          summary: 'Summary',
          session: 'Session'
        }
      },
      sessionTargets: {
        main: 'Main session',
        isolated: 'Isolated session'
      },
      payloadKinds: {
        agentTurn: 'Agent turn',
        systemEvent: 'System event'
      },
      scheduleKinds: {
        cron: 'Cron expression',
        every: 'Fixed interval',
        at: 'At time'
      },
      units: {
        minutes: 'minutes',
        hours: 'hours',
        days: 'days'
      },
      schedule: {
        every: 'Every {value} {unit}',
        everyHoursAtMinute: 'Every {value} hours at {minute} min',
        dailyAt: 'Daily at {time}',
        weeklyAt: 'Weekly {weekdays} at {time}',
        weekdaySun: 'Sun',
        weekdayMon: 'Mon',
        weekdayTue: 'Tue',
        weekdayWed: 'Wed',
        weekdayThu: 'Thu',
        weekdayFri: 'Fri',
        weekdaySat: 'Sat',
        weekdayRange: '{start} to {end}',
        monthlyAt: 'Monthly on day {day} at {time}',
        yearlyAt: 'Yearly {month}/{day} at {time}',
        at: 'At {time}'
      },
      batchSetModel: 'Set All Models',
      batchSetModelConfirm: 'Set all cron jobs model to {model}?',
      batchSetModelSuccess: 'Updated {count} job(s)',
      batchSetModelFailed: 'Batch model update failed',
      defaultModel: 'Default ({model})',
      defaultModelNotConfigured: 'Default model (not configured)',
      defaultAgent: 'Default agent',
      delivery: {
        last: 'last (reuse latest reply channel)',
        channels: {
          qqbot: 'QQ bot',
          qq: 'QQ',
          wecom: 'WeCom',
          wechat: 'WeChat',
          dingtalk: 'DingTalk',
          feishu: 'Feishu'
        }
      },
      actions: {
        createJob: 'Create job',
        viewDetail: 'Details',
        run: 'Run',
        runNow: 'Run now',
        enable: 'Enable',
        disable: 'Disable',
        edit: 'Edit',
        editJob: 'Edit job',
        openSession: 'Open',
        refreshRuns: 'Refresh runs',
        saveChanges: 'Save changes'
      },
      confirmDeleteJob: 'Delete this job?',
      modal: {
        createTitle: 'Create job',
        editTitle: 'Edit job',
        detailTitle: 'Job details',
        runDetailTitle: 'Run details',
        footerHint:
          'Jobs are written to Gateway cron storage and scheduled by the Gateway process.',
        sections: {
          basic: 'Basic',
          schedule: 'Schedule',
          payload: 'Payload',
          delivery: 'Delivery',
          preview: 'Preview'
        }
      },
      form: {
        name: 'Name',
        namePlaceholder: 'e.g. Morning report',
        agentId: 'Agent ID',
        agentIdPlaceholder: 'Leave empty to use default agent',
        description: 'Description',
        descriptionPlaceholder: 'Optional: what does this job do',
        enabled: 'Enabled',
        deleteAfterRun: 'Delete after run',
        scheduleKind: 'Schedule kind',
        cronExpr: 'Cron expression',
        cronExprPlaceholder: 'e.g. 0 7 * * *',
        timezone: 'Timezone',
        timezonePlaceholder: 'e.g. Asia/Shanghai (optional)',
        everyValue: 'Interval value',
        everyValuePlaceholder: 'e.g. 2',
        everyUnit: 'Interval unit',
        atTime: 'Run at',
        sessionTarget: 'Session target',
        sessionTargets: {
          isolated: 'isolated (recommended)',
          main: 'main'
        },
        wakeMode: 'Wake mode',
        wakeModes: {
          nextHeartbeat: 'next-heartbeat',
          now: 'now'
        },
        payloadKind: 'Payload kind',
        payloadText: 'Payload text',
        payloadTextPlaceholders: {
          agentTurn: 'Prompt for the agent',
          systemEvent: 'System event content'
        },
        modelOverride: 'Model override',
        modelOverridePlaceholder: 'Select a model or input an alias (optional)',
        timeoutSeconds: 'Timeout (seconds)',
        timeoutSecondsPlaceholder: 'e.g. 120',
        deliveryMode: 'Delivery mode',
        deliveryModes: {
          announce: 'announce (post summary)',
          none: 'none (run internally)'
        },
        deliveryChannel: 'Delivery channel',
        deliveryTo: 'Delivery target',
        deliveryToPlaceholders: {
          last: 'Optional: leave empty to reuse latest routing',
          specific: 'Select a configured target or input manually'
        },
        bestEffort: 'bestEffort'
      },
      validation: {
        cronExprRequired: 'Please enter a Cron expression',
        everyValueInvalid: 'Interval value must be greater than 0',
        atTimeRequired: 'Please select a valid time',
        payloadRequired: 'Please enter payload text',
        nameRequired: 'Please enter a job name'
      },
      previewUnavailable: '// Preview unavailable: {error}',
      modelConfigLoadFailed: 'Failed to read model config; cannot filter by hermes.json: {error}',
      modelListLoadFailed: 'Failed to load model list; you can still input manually: {error}',
      messages: {
        jobEnabled: 'Job enabled',
        jobDisabled: 'Job disabled',
        updateFailed: 'Update failed',
        jobTriggered: 'Job triggered',
        triggerFailed: 'Trigger failed',
        jobDeleted: 'Job deleted',
        deleteFailed: 'Delete failed',
        jobUpdated: 'Job updated',
        jobCreated: 'Job created',
        fetchRunsFailed: 'Failed to load run history'
      },
      templates: {
        morningReport: {
          label: 'Morning report',
          description: 'Summarize key updates every morning and deliver',
          payloadText: 'Please summarize today’s key updates and output a readable morning brief.'
        },
        heartbeatCheck: {
          label: 'Health check',
          description: 'Run periodic health checks',
          payloadText: 'Check service health. If abnormal, give a brief reason and suggestion.'
        },
        mainReminder: {
          label: 'Main reminder',
          description: 'Post a system reminder in the main session',
          payloadText: 'Reminder: review today’s TODOs and sync progress.'
        }
      },
      expandedRow: {
        lastRunTime: 'Last Run Time',
        duration: 'Duration',
        consecutiveErrors: 'Consecutive Errors',
        errorDetail: 'Error Detail',
        nextRunTime: 'Next Run Time',
        noData: 'No run data yet'
      }
    },
    models: {
      overview: {
        title: 'Models overview',
        hintPrefix: 'Model refs use ',
        hintMiddle: '. Prefer managing providers in ',
        hintSuffix: '.',
        metrics: {
          providers: 'Providers',
          modelRefs: 'Model refs',
          editing: 'Editing',
          primaryModel: 'Primary model'
        }
      },
      actions: {
        refreshConfig: 'Refresh config',
        createProvider: 'Create provider',
        probeModels: 'Probe models',
        saveChanges: 'Save changes',
        prev: 'Previous',
        nextToModels: 'Next: Models',
        nextToPreview: 'Next: Preview'
      },
      workbench: {
        title: 'Provider workbench',
        searchPlaceholder: 'Search provider / Base URL / models',
        empty: 'No providers configured',
        emptyHint: 'Please check models.providers config or token permissions'
      },
      editor: {
        titleEdit: 'Edit provider: {id}',
        titleMissing: 'Provider detail missing: {id}',
        titleSelect: 'Select a provider to edit',
        empty: 'Select a provider from the left to edit',
        modelsCount: '{count} models',
        rawConfigTitle: 'View raw provider config (API key masked)'
      },
      tabs: {
        basic: '1. Basic',
        models: '2. Models',
        preview: '3. Preview'
      },
      form: {
        providerId: 'Provider ID',
        providerIdPlaceholder: 'e.g. moonshot / openrouter / myproxy',
        apiProtocol: 'API protocol',
        baseUrl: 'Base URL',
        baseUrlPlaceholder: 'e.g. https://api.openai.com/v1',
        apiKey: 'API key',
        apiKeyHint: 'The API key is masked. It won’t be revealed in UI; re-enter to overwrite.',
        apiKeyPlaceholderCreate: 'Enter provider API key',
        apiKeyPlaceholderCreateRequired: 'API key is required when creating a provider',
        apiKeyPlaceholderEdit: 'Enter new value (leave blank to keep)',
        apiKeyStatus: 'API key status',
        apiKeyStatusConfigured: 'Configured',
        apiKeyStatusNotConfigured: 'Not configured',
        modelInputTypes: 'Input types',
        modelInputTypesPlaceholder: 'Select supported input types',
        models: 'Models',
        modelsPlaceholder: 'Enter model ID and press Enter to add',
        modelsHint:
          'Click "Add model" button to add models. Each model can have its own input types.',
        addModel: 'Add model',
        modelIdPlaceholder: 'Model ID',
        setAsDefault: 'Set Default',
        isDefault: 'Default',
        pendingDefault: 'Pending',
        detectedModels: 'Detected',
        modelsCount: '{count} models'
      },
      fields: {
        providerId: 'Provider ID',
        baseUrl: 'Base URL',
        models: 'Models',
        apiKey: 'API key'
      },
      table: {
        providers: {
          provider: 'Provider',
          protocol: 'Protocol',
          baseUrl: 'Base URL',
          models: 'Model',
          sources: 'Sources',
          actions: 'Actions'
        },
        models: {
          modelRef: 'Model ref',
          actions: 'Actions'
        }
      },
      default: {
        active: 'Active',
        set: 'Set primary'
      },
      preview: {
        modelDiffTitle: 'Model changes',
        addedModels: 'Added',
        removedModels: 'Removed',
        unchanged: 'Unchanged',
        none: 'None',
        notProvided: 'Not provided',
        willWriteMasked: 'Will write (masked)',
        apiKeyOverwrite: 'Overwrite (masked)',
        apiKeyKeep: 'Keep existing',
        primaryModel: 'Primary model',
        patchPaths: 'Will write paths',
        patchPathsWithValue: 'Will write paths: {paths}',
        modelsListTitle: 'Models ({count})',
        models: 'Models',
        inputTypes: 'Input types',
        apiProtocol: 'API protocol',
        missingRequired: 'Missing required fields: {fields}.',
        noChangesHint: 'No config diff detected. Save is disabled.',
        warnings: {
          overwriteApiKey:
            'A new API key will be written. The plaintext key will not be shown after saving.',
          migrateLegacyPath:
            'Legacy provider path will be migrated (models.<id> -> models.providers.<id>).',
          removeModels:
            'Some configured models will be removed. Ensure this won’t impact primary model or routing rules.',
          providerIdMissing: 'Provider ID is missing',
          providerIdExists: 'Provider ID already exists; use another ID',
          baseUrlMissing: 'Base URL is missing',
          modelListMissing: 'Model list is missing',
          apiKeyMissing: 'API key is missing; cannot create provider'
        }
      },
      confirm: {
        titleEdit: 'Confirm provider update',
        titleCreate: 'Confirm create provider',
        buttonEdit: 'Confirm save',
        buttonCreate: 'Confirm create',
        editProvider: 'Edit provider',
        createProvider: 'Create provider',
        deleteProvider: 'Delete provider {id}?',
        deleteDefaultProviderBlocked:
          'Cannot delete the primary provider. Please switch the primary model first.',
        modelDiffTitle: 'Model changes (+{added} / -{removed})',
        warningPrefix: 'The changes below will be written to config. On confirm it will call ',
        warningSuffix: '.'
      },
      createModal: {
        title: 'Create provider',
        flowHint: 'Flow: fill basic -> manually enter model -> preview -> create provider.'
      },
      messages: {
        primaryModelRequired: 'Please select or enter a primary model first',
        primaryModelSaved: 'Primary model saved: {model}',
        noModelsForProvider: 'This provider has no models; cannot set as primary',
        deleteDefaultProviderBlocked:
          'Cannot delete the primary provider. Please switch the primary model first.',
        deleteWhitelistProviderBlocked:
          'This provider comes from a model allowlist (e.g. agents.defaults.models) and cannot be deleted',
        providerDeleted: 'Provider deleted: {id}',
        deleteFailed: 'Delete failed',
        apiKeyNotReadableForProbe: 'API key is not readable for probing',
        modelsProbed: 'Probed {count} models',
        modelsProbedFromGateway: 'Probed {count} models from Gateway',
        modelSelected: 'Selected model: {model}',
        modelProbeFailed: 'Model probe failed',
        selectProviderToEdit: 'Select a provider to edit',
        noConfigChanges: 'No config changes detected',
        providerSaved: 'Provider saved',
        providerSavedKeepKey: 'Provider saved (kept existing API key)',
        providerCreated: 'Provider created',
        createFailed: 'Create failed',
        saveFailed: 'Save failed: {reason}'
      },
      validation: {
        providerIdRequired: 'Provider ID is required',
        providerIdInvalid: 'Provider ID is invalid',
        providerIdExists: 'Provider ID already exists',
        baseUrlRequired: 'Base URL is required',
        modelsRequired: 'Models are required',
        apiKeyRequired: 'API key is required',
        apiKeyRequiredForCreate: 'API key is required when creating a provider'
      },
      probe: {
        failed: 'Probe failed',
        fetchFailed: 'Failed to fetch {url}: {reason}',
        fetchFailedCors: 'Failed to fetch {url} (CORS blocked). Try probing via Gateway instead.',
        noModelsParsed: 'No models parsed from {url}',
        gatewayNoModels:
          'Gateway returned no available models. Check provider config and ensure config has been applied.',
        selectTitle: 'Select probed model',
        selectHint: '{count} models were detected. Please choose one to replace the current model.',
        selectRequired: 'Please choose a model first',
        confirmSelect: 'Use this model'
      },
      index: {
        title: 'Model index',
        hint: 'Configured models from hermes.json. Quickly set any model as primary in the list.',
        empty: 'No models configured',
        emptyHint: 'Add models in the workbench above, then save.'
      }
    },
    dashboard: {
      title: 'Dashboard',
      refresh: 'Refresh',
      metrics: {
        conversations: 'Conversations',
        messages: 'Messages',
        cronJobs: 'Cron Jobs',
        server: 'Server',
        enabled: 'enabled',
        online: 'Online',
        offline: 'Offline'
      },
      recentConversations: 'Recent Conversations',
      recentCronRuns: 'Recent Cron Runs',
      serverInfo: 'Server Info',
      model: 'Model',
      syncStatus: 'Sync',
      syncConnected: 'Connected',
      syncLocalOnly: 'Local only',
      viewAll: 'View all →',
      emptyConversations: 'No conversations yet. Start a chat to see activity here.',
      emptyCronRuns: 'No cron runs yet.',
      messagesCount: '{count} messages',
      hero: {
        title: 'Hermes overview',
        subtitle:
          'Use official Usage aggregates to track tokens/cost, active sessions, and error distribution, then drill down into sessions.'
      },
      connection: {
        connected: 'Gateway connected',
        connecting: 'Gateway connecting',
        reconnecting: 'Gateway reconnecting',
        failed: 'Gateway connection failed',
        disconnected: 'Gateway disconnected'
      },
      lastUpdated: {
        none: 'Not synced yet',
        text: 'Last synced {time}'
      },
      range: {
        today: 'Today',
        yesterday: 'Yesterday',
        last7d: 'Last 7d',
        last15d: 'Last 15d',
        last30d: 'Last 30d',
        all: 'All',
        to: 'to'
      },
      usageMode: {
        tokens: 'Tokens',
        cost: 'Cost',
        tokensShort: 'tokens',
        costShort: 'cost'
      },
      usage: {
        error: 'Failed to fetch usage: {error}',
        coverage: {
          none: 'No usage sessions in this range',
          text: 'Usage coverage {withUsage}/{total} sessions'
        },
        totalTokens: 'Total tokens',
        totalCost: 'Total cost',
        missingCostEntries: 'Missing cost entries: {count}',
        unavailableHermesRest:
          'Token usage statistics are not supported in Hermes REST mode. Connect to an ACP Gateway to view usage.',
        segments: {
          input: 'Input',
          output: 'Output',
          cacheRead: 'Cache read',
          cacheWrite: 'Cache write',
          inputCost: 'Input cost',
          outputCost: 'Output cost',
          cacheReadCost: 'Cache read cost',
          cacheWriteCost: 'Cache write cost'
        }
      },
      stats: {
        sessions: 'Sessions',
        cronJobs: 'Enabled jobs',
        models: 'Models configured',
        skills: 'Skills installed',
        totalTokens: 'Total tokens',
        modelsSeen: 'Models Seen'
      },
      cards: {
        kpis: 'Usage KPIs',
        trend: 'Token trend (official Usage)',
        structure: 'Usage breakdown',
        top: 'Top distribution',
        sessions: 'Sessions overview (with usage)',
        events: 'Live event stream'
      },
      kpis: {
        messages: {
          label: 'Messages',
          hint: '{days} days in range',
          emptyHint: 'No message data'
        },
        toolCalls: {
          label: 'Tool calls',
          hint: 'Top tool {tool}',
          emptyHint: 'No tool calls'
        },
        errorRate: {
          label: 'Error rate',
          hint: '{errors} errors / {messages} messages'
        },
        avgTokens: {
          label: 'Avg tokens / message',
          hint: 'Computed as total tokens / total messages'
        },
        cacheReadRatio: {
          label: 'Cache read ratio',
          hint: '{cacheRead} / {input} input'
        },
        activeDays: {
          label: 'Active days',
          hint: '{days} days with activity in range'
        },
        totalTokens: {
          label: 'Total Tokens',
          hint: 'Cumulative tokens in range'
        },
        lastUsed: {
          label: 'Last Used',
          hint: 'Most recent token-consuming turn',
          never: 'Never'
        }
      },
      trend: {
        empty: 'No trend data in this range',
        pointTitle: '{date} · {value} · Messages {messages} · Errors {errors}'
      },
      top: {
        models: 'Top Models',
        providers: 'Top Providers',
        tools: 'Top Tools'
      },
      sessions: {
        columns: {
          channel: 'Channel',
          peer: 'Peer',
          messages: 'Messages',
          usage: 'Usage',
          lastActivity: 'Last active'
        },
        summary: 'Model: {model}, messages: {messages}, last: {last}',
        usageLabel: 'Usage ({mode})'
      },
      events: {
        placeholder: 'Filter events, e.g. chat / agent / tool',
        empty: 'Waiting for events...',
        payloadUnserializable: '[payload not serializable]'
      }
    },
    chat: {
      title: 'Live Chat (Workbench)',
      hermes: {
        newConversation: 'New Chat',
        model: 'Model',
        untitled: 'New Chat',
        msgCount: 'messages',
        renameConversation: 'Rename',
        remoteModelHint: 'Actual model shown for local servers only'
      },
      actions: {
        refreshChat: 'Refresh',
        send: 'Send',
        stop: 'Stop',
        clearInput: 'Clear input'
      },
      tokens: {
        total: 'Total',
        input: 'In',
        output: 'Out',
        cacheRead: 'Cache read',
        cacheWrite: 'Cache write',
        loading: 'Loading tokens...',
        unavailable: 'Tokens -'
      },
      stats: {
        total: 'Total messages',
        assistant: 'Assistant replies',
        lastMessage: 'Last message',
        breakdown: 'User {user} · Assistant {assistant} · System {system}'
      },
      sessionKey: 'Session key',
      sessionKeyPlaceholder: 'Enter or select session key (auto loads on select)',
      sessionTag: 'Session {key}',
      session: {
        label: 'Label',
        model: 'Model'
      },
      preferences: {
        autoFollow: 'Auto follow newest messages'
      },
      filters: {
        title: 'Message filter',
        roles: {
          all: 'All roles',
          user: 'User only',
          assistant: 'Assistant only',
          system: 'System only'
        }
      },
      roles: {
        user: 'User',
        assistant: 'Assistant',
        tool: 'Tool',
        system: 'System'
      },
      image: {
        preview: 'Image Preview',
        unavailable: 'Image Unavailable'
      },
      sync: {
        syncing: 'Syncing...',
        syncedAt: 'Synced {time}',
        notSynced: 'Not synced'
      },
      messages: {
        abortRequested: 'Stop requested',
        abortFailed: 'Stop failed: {reason}',
        waitForCurrentResponse: 'Wait for the current response to finish or stop it first',
        emptyFiltered: 'No messages for current filter'
      },
      input: {
        placeholder:
          'Type a message (type / for Hermes commands, Enter to send, Shift+Enter for new line)',
        sendHint: 'Sending to: {key} | Enter send, Shift+Enter newline, Ctrl/Cmd+Enter send'
      },
      quickReplies: {
        title: 'Quick replies',
        add: 'Add',
        insert: 'Insert',
        empty: 'No quick replies',
        confirmDelete: 'Delete this quick reply?',
        searchPlaceholder: 'Search quick replies...',
        storageHint:
          'Stored in this browser. For long-term content, consider putting it in workspace.',
        dirLabel: 'Suggested dir: ',
        copyDir: 'Copy directory',
        messages: {
          titleRequired: 'Please enter a title',
          contentRequired: 'Please enter content',
          updated: 'Updated',
          created: 'Created',
          deleted: 'Deleted',
          inserted: 'Inserted: {title}',
          dirCopied: 'Workspace dir copied',
          dirCopyFailed: 'Copy failed. Please copy the path manually.'
        },
        modal: {
          createTitle: 'Create quick reply',
          editTitle: 'Edit quick reply',
          title: 'Title',
          titlePlaceholder: 'Enter title',
          content: 'Content',
          contentPlaceholder: 'Enter content',
          saveChanges: 'Save changes'
        }
      },
      slash: {
        title: 'Hermes slash commands',
        hint: 'Up/Down select, Tab apply, Enter apply or send, Esc exit',
        noMatch: 'No matching commands',
        categories: {
          common: 'Common',
          session: 'Session',
          modelAndContext: 'Model & context'
        },
        commands: {
          new: {
            description: 'Reset and start a new session; optionally specify model',
            defaultLabel: 'Default model',
            defaultDesc: 'Start a new session with the default model'
          },
          skill: {
            description: 'Run a skill (auto suggests your skills)'
          },
          model: {
            description: 'View or switch model'
          },
          status: {
            description: 'View session and system status'
          },
          subagents: {
            description: 'Inspect/control sub-agent runs (list/kill/log/info/send/steer/spawn)',
            subcommands: {
              list: 'List sub-agent runs for the current session',
              kill: 'Kill a sub-agent run',
              log: 'View sub-agent logs',
              info: 'View sub-agent run details',
              send: 'Send a message to a sub-agent',
              steer: 'Steer a sub-agent run (append instructions)',
              spawn: 'Spawn a sub-agent deterministically (auto suggests agentId)'
            }
          },
          noMatch: 'No matching command. Supported: /new, /skill, /model, /status, /subagents.'
        },
        requiresFlag: 'Requires {flag}',
        fromConfig: 'From config',
        skills: {
          loading: 'Loading skills...',
          noMatch: 'No skills available'
        },
        models: {
          loading: 'Loading models...',
          noMatch: 'No models available'
        },
        subagents: {
          loading: 'Loading agents...',
          noMatch: 'No matching agentId, or no agents.list configured.',
          agentTag: 'Agent'
        }
      },
      agentStatus: {
        sending: 'Sending...',
        waiting: 'Waiting...',
        thinking: 'Thinking...',
        toolCall: 'Calling tool: {name}',
        toolRunning: 'Running tool...',
        replying: 'Replying...',
        aborting: 'Stopping...',
        done: 'Done',
        aborted: 'Stopped',
        error: 'Error',
        errorWithDetail: 'Error: {detail}',
        idle: 'Idle'
      },
      agentDetails: {
        show: 'Show details',
        hide: 'Hide details',
        phaseDuration: 'Current phase duration {duration}',
        tool: 'Tool: {name}',
        phase: 'Phase',
        elapsed: 'Elapsed',
        viewPartialResult: 'View partialResult',
        viewResult: 'View result',
        toolFailed: 'Tool execution failed (error result returned)'
      },
      structured: {
        thinking: 'Thinking',
        signed: 'Signed',
        signature: {
          details: 'View signature',
          id: 'Signature ID',
          summary: 'Summary'
        },
        toolCall: 'Tool call',
        timeout: 'Timeout {seconds}s',
        command: 'Command',
        workdir: 'Workdir',
        callId: 'Call ID',
        viewPartialJson: 'View partialJson',
        toolResult: 'Tool result',
        content: 'Content',
        validationFailed: 'Argument validation failed',
        issuesCount: '{count} issues',
        issues: 'Issues',
        viewArgs: 'View args',
        hideArgs: 'Hide args'
      }
    },
    sessions: {
      hermesRest: {
        activeToday: 'Active Today',
        newConversation: 'New Conversation',
        openInChat: 'Open in Chat',
        exportJson: 'Export JSON',
        untitled: 'Untitled',
        notFound: 'Conversation not found',
        notFoundHint: 'This conversation may have been deleted.'
      },
      roles: {
        user: 'User',
        assistant: 'AI',
        tool: 'Tool',
        system: 'System'
      },
      list: {
        title: 'Sessions',
        hint: 'Session actions are in the table action column: new uses the official new-session semantics, delete uses the official delete semantics.',
        metrics: {
          totalSessions: 'Total sessions',
          active24h: 'Active (24h)',
          totalMessages: 'Total messages',
          uniqueChannels: 'Channels'
        },
        units: {
          messages: 'msgs',
          channels: 'chs'
        },
        searchPlaceholder: 'Search key / agent / channel / peer / model',
        clearFilters: 'Reset filters',
        sort: {
          recent: 'Sort by recent activity',
          messages: 'Sort by message count'
        },
        filters: {
          allChannels: 'All channels',
          allModels: 'All models'
        },
        columns: {
          session: 'Session',
          messageCount: 'Messages',
          model: 'Model',
          tokenTotal: 'Token total',
          lastActivity: 'Last active',
          actions: 'Actions'
        },
        badges: {
          active24h: 'Active (24h)',
          inactive: 'Inactive'
        },
        listTitle: 'Session list',
        listCount: '{current} / {total}',
        actionsTitle: 'Actions',
        meta: {
          peer: 'Peer',
          messageCount: 'Messages',
          model: 'Model',
          lastActivity: 'Last active'
        },
        activeTime: 'Last active: {time}',
        viewDetail: 'View detail',
        newAction: 'New',
        confirmNew: 'Start a new run for this session?',
        newSuccess: 'New session started',
        newFailed: 'Failed to start a new session',
        batchSetModel: 'Set All Models',
        batchModelPlaceholder: 'Select target model',
        batchSetModelApply: 'Apply',
        batchSetModelSuccess: 'Updated {count} session(s)',
        batchSetModelFailed: 'Batch model update failed',
        createSession: 'Create Session',
        createSuccess: 'Session created',
        createFailed: 'Failed to create session',
        createModal: {
          title: 'Create New Session',
          agent: 'Agent',
          agentPlaceholder: 'Select Agent',
          channel: 'Channel',
          channelPlaceholder: 'Select channel',
          peer: 'Peer',
          peerPlaceholder: 'Optional, auto-generated by default',
          label: 'Label',
          labelPlaceholder: 'Optional, session label'
        },
        confirmReset: 'Reset this session?',
        summary: 'Summary: {text}',
        emptySide: 'Select a session on the left to view/export/reset/delete.',
        deleteSuccess: 'Session deleted',
        deleteFailed: 'Delete failed'
      },
      detail: {
        title: 'Session Detail',
        transcript: 'Transcript',
        meta: {
          agent: 'Agent',
          channel: 'Channel',
          peer: 'Peer',
          model: 'Model',
          label: 'Label',
          messages: 'Messages',
          tokens: 'Token Usage',
          lastActivity: 'Last Activity'
        },
        confirmReset: 'Reset this session?',
        confirmDelete: 'Delete this session? This action cannot be undone.',
        resetSuccess: 'Session reset',
        resetFailed: 'Reset failed',
        deleteSuccess: 'Session deleted',
        deleteFailed: 'Delete failed',
        exportSuccess: 'Exported',
        exportFailed: 'Export failed',
        labelSaved: 'Label saved',
        labelFailed: 'Failed to save label'
      }
    },
    monitor: {
      actions: {
        refreshAll: 'Refresh all'
      },
      subtitle:
        'Unified view of presence, logs tailing, approvals policies, and update run results.',
      summary: {
        presence: 'Presence {online}/{total}',
        logs: 'Logs {count}',
        lastSync: 'Last sync: {time}',
        neverSynced: 'Never synced'
      },
      connection: {
        connected: 'Gateway connected',
        connecting: 'Gateway connecting',
        reconnecting: 'Gateway reconnecting',
        failed: 'Gateway connection failed',
        disconnected: 'Gateway disconnected'
      },
      tabs: {
        presence: 'Presence (system-presence)',
        logs: 'Live logs (logs.tail)',
        approvals: 'Approvals (exec.approvals.*)',
        update: 'Update & restart (update.run)'
      },
      methodNotSupported: 'This Gateway does not support {method}',
      errors: {
        healthFailed: 'Failed to fetch health',
        statusFailed: 'Failed to fetch status',
        presenceFailed: 'Failed to fetch presence',
        logsFailed: 'Failed to fetch logs'
      },
      presence: {
        title: 'Presence',
        refresh: 'Refresh',
        notSupported: 'This Gateway does not support system-presence. Please upgrade and retry.',
        hint: 'From system-presence. Observe Gateway and clients online status.',
        empty: 'No presence reported',
        updatedAt: 'Updated at {time}'
      },
      diag: {
        title: 'Health / status diagnostics',
        hint: 'From health / status. health is cached ~60s by default; Probe triggers deeper checks and may take longer.',
        notSupported: 'This Gateway may not support health/status (or methods not reported).',
        healthError: 'Health error: {error}',
        statusError: 'Status error: {error}',
        probeResult: 'Probe result',
        probeAccounts: '{count} accounts',
        defaultAgent: 'Default agent: {id}',
        enabled: 'Enabled',
        healthUpdatedAt: 'Health updated {time}',
        diagUpdatedAt: 'Diag updated {time}',
        lastProbeAt: ' · Last probe {time}'
      },
      logs: {
        title: 'Live logs',
        keyword: 'Keyword',
        keywordPlaceholder: 'Search message/subsystem/raw',
        level: 'Log level',
        autoFollow: 'Auto follow',
        file: 'File: {file}',
        empty: 'No logs',
        truncatedHint:
          'Logs response is truncated. Only showing the latest part (increase maxBytes).',
        notSupportedPrefix: 'This Gateway does not support ',
        notSupportedSuffix: '. Please upgrade and retry.',
        hintPrefix: 'From ',
        hintSuffix: '. Supports cursor and level filtering.'
      },
      approvals: {
        title: 'Approvals policy',
        target: 'Target',
        node: 'Node',
        nodePlaceholder: 'Select nodeId',
        reload: 'Reload',
        save: 'Save',
        saved: 'Approvals policy saved',
        notSupportedPrefix: 'This Gateway does not support ',
        notSupportedSuffix: ' (or this node does not support it).',
        hintPrefix: 'From ',
        hintSuffix: '. Supports editing Gateway and node-level policies.',
        meta: {
          file: 'File: ',
          status: 'Status: ',
          exists: 'Exists',
          created: 'Created'
        },
        defaults: {
          security: 'Default security',
          ask: 'Default ask',
          askFallback: 'Default askFallback'
        },
        agent: {
          current: 'Current agent',
          currentPlaceholder: 'Select agent',
          new: 'New agent',
          newPlaceholder: 'Enter agent ID',
          actions: 'Actions',
          add: 'Add',
          remove: 'Remove'
        },
        allowlist: {
          count: '{count} allowlist rules',
          newPlaceholder: 'Enter allowlist pattern',
          rulePlaceholder: 'Pattern, e.g. **/*.md',
          add: 'Add rule',
          empty: 'No allowlist rules'
        },
        empty: 'No policy loaded',
        errors: {
          selectNodeBeforeLoad: 'Select a node before loading policy',
          loadFailed: 'Failed to load policy',
          missingBaseHash: 'Missing baseHash. Please reload policy first.',
          selectNodeBeforeSave: 'Select a node before saving policy',
          saveFailed: 'Failed to save policy',
          agentIdRequired: 'Agent ID is required',
          agentExists: 'Agent {id} already exists',
          cannotDeleteMain: 'main agent cannot be deleted',
          allowlistPatternRequired: 'allowlist pattern is required'
        }
      },
      update: {
        title: 'Update & restart',
        notSupportedPrefix: 'This Gateway does not support ',
        notSupportedSuffix: '. Please upgrade and retry.',
        restartWarning:
          'This operation will restart the Gateway. A brief disconnection is expected.',
        actions: {
          run: 'Run update'
        },
        confirm: {
          title: 'Run update?',
          positive: 'Run update',
          lines: {
            action: 'Action: run update.run (update & restart)',
            scope: 'Scope: Gateway',
            risk: 'Risk: triggers restart and disconnect',
            confirm: 'Continue?'
          }
        },
        params: {
          title: 'Parameters',
          hint: 'Optionally set sessionKey and timeout. Defaults to Gateway behavior if left blank.',
          sessionKey: 'sessionKey (optional)',
          sessionKeyPlaceholder: 'e.g. agent:main:main',
          note: 'note (optional)',
          notePlaceholder: 'e.g. triggered from Ops center',
          restartDelayMs: 'restartDelayMs (ms)',
          timeoutMs: 'timeoutMs (ms)'
        },
        messages: {
          ok: 'Update completed',
          skipped: 'Update skipped',
          failed: 'Update failed: {reason}',
          unknownReason: 'Unknown reason'
        },
        errors: {
          runFailed: 'Run update failed'
        },
        statusUnknown: 'Unknown',
        triggeredAt: 'Triggered at: {time}',
        duration: 'Duration: {duration}',
        meta: {
          mode: 'Mode',
          restart: 'Restart scheduling',
          noResponse: 'No response',
          reason: 'Failure reason'
        },
        sentinel: 'Sentinel file: {path}',
        stepsTitle: 'Steps ({count})'
      }
    },
    settings: {
      statusConnected: 'Connected',
      statusConnecting: 'Connecting...',
      statusReconnecting: 'Reconnecting (attempt {count})',
      statusFailed: 'Connection failed',
      statusDisconnected: 'Disconnected',
      appearanceSettings: 'Appearance',
      themeMode: 'Theme',
      themeLight: 'Light',
      themeDark: 'Dark',
      about: 'About',
      aboutLine1:
        'Hermes remote management terminal for connecting and managing your Hermes AI instances',
      aboutLine2: 'Built with Electron + Vue 3 + Naive UI',
      currentConnection: 'Current connection',
      serverName: 'Server name',
      serverAddress: 'Server address',
      authMethod: 'Auth method',
      noAuth: 'No auth',
      accountAuth: 'Account auth',
      gatewayVersion: 'Gateway version',
      switchServer: 'Switch server',
      disconnect: 'Disconnect',
      hermesConfig: 'Hermes Config',
      hermesConfigDesc: 'Edit ~/.hermes/config.yaml',
      hermesEnv: 'Environment Variables',
      hermesEnvDesc: 'Edit ~/.hermes/.env',
      loadingFile: 'Loading...',
      loadFileFailed: 'Failed to load file',
      saveFile: 'Save',
      saving: 'Saving...',
      saveSuccess: 'Saved successfully',
      saveFailed: 'Save failed',
      restartHermes: 'Restart Hermes',
      restarting: 'Restarting...',
      restartSuccess: 'Hermes service restarted',
      restartFailed: 'Restart failed',
      restartTip: 'Restart Hermes service after config changes to take effect',
      fileNotFound: 'File not found — it will be created on save',
      serverInfo: 'Server Info',
      serverPlatform: 'Platform',
      serverModel: 'Model',
      serverLocalOnly:
        'Version updates, config editing, and restart require the Hermes Management service running on the remote host (port 8643).',
      mgmtProbing: 'Probing management API...',
      mgmtNotAvailable: 'Remote management API not detected',
      mgmtRetryProbe: 'Retry probe',
      mgmtInstallHint:
        'Run `npm run mgmt-server:install` on the remote Hermes host, then click Retry (macOS only for now).',
      mgmtError: {
        'empty-url': 'Management API URL is empty — please ensure a valid server URL has been set.',
        network:
          'Cannot reach {url}. The management service may not be running or port 8643 may be blocked by a firewall.',
        timeout:
          'Connection to {url} timed out (5s). Check network connectivity and whether the service is alive.',
        http: '{url} returned an unexpected HTTP status — port 8643 may be occupied by another service.',
        parse: '{url} response was not JSON — port 8643 may be occupied by another service.',
        'wrong-platform':
          '{url} responded to /health but reported a platform other than hermes-mgmt — port 8643 may be occupied by another service.'
      },
      hermesVersion: 'Hermes Agent Version',
      currentVersion: 'Current version',
      releaseDate: 'Release date',
      checkUpdate: 'Check for updates',
      checking: 'Checking...',
      updateAvailable: 'New version available: {version}',
      noUpdate: 'Up to date',
      updateNow: 'Update now',
      updating: 'Updating...',
      updateSuccess: 'Hermes Agent updated, please restart service',
      updateFailed: 'Update failed',
      checkUpdateFailed: 'Update check failed',
      updateRetryHint: 'The network may be intermittent — you can retry later.',
      versionTag: 'Version tag'
    },
    tools: {
      title: 'Tools',
      searchPlaceholder: 'Search tools...',
      columns: {
        name: 'Name',
        category: 'Category',
        description: 'Description',
        status: 'Status'
      }
    },
    nodes: {
      title: 'Nodes',
      pair: 'Pair',
      empty: 'No paired device nodes yet',
      pairDialogTitle: 'Device pairing',
      confirmPair: 'Confirm pairing',
      pairPrompt: 'Enter the pairing code shown on the device:',
      pairCodePlaceholder: 'Enter pairing code',
      pairCodeRequired: 'Please enter the pairing code',
      pairSuccess: 'Paired successfully',
      pairFailed: 'Pairing failed'
    },
    system: {
      subtitle: 'Manage and monitor the running status of all Gateway services',
      loadFailed: 'Failed to load service status',
      running: 'Running',
      configured: 'Configured',
      offline: 'Offline',
      channels: 'AI Services',
      agents: 'Agents',
      instances: 'Instances',
      online: 'online',
      uptime: 'Uptime',
      defaultAgent: 'Default',
      sessions: 'Sessions',
      accounts: 'Accounts',
      noChannels: 'No AI services configured',
      noAgents: 'No agents online',
      noInstances: 'No connected instances',
      unknownHost: 'Unknown host',
      lastUpdated: 'Last updated: {time}',
      restart: {
        title: 'Gateway Control',
        warning:
          'Restarting the gateway will briefly disconnect all active connections. Running tasks may be affected.',
        description: 'Restart the Hermes Gateway process',
        action: 'Restart Gateway',
        confirmTitle: 'Confirm Gateway Restart',
        confirmMessage:
          'All WebSocket connections will be disconnected after restart. Clients will auto-reconnect. Continue?',
        confirm: 'Confirm Restart',
        delayLabel: 'Delay',
        delayUnit: 'seconds',
        scheduled: 'Gateway will restart in {delay} seconds',
        failed: 'Restart request failed',
        unknownError: 'Unknown error'
      }
    },
    alerts: {
      subtitle: 'View and manage system alerts',
      loadFailed: 'Failed to load alerts',
      unavailable: 'Alert service unavailable',
      active: 'Active',
      resolved: 'Resolved',
      silenced: 'Silenced',
      critical: 'Critical',
      warning: 'Warning',
      info: 'Info',
      allSeverity: 'All severity',
      allState: 'All states',
      source: 'Source',
      resolvedAt: 'Resolved at',
      noAlerts: 'No alerts',
      total: '{total} total',
      channelIssue: 'Channel issue',
      consecutiveFailures: 'consecutive failures',
      lastRunFailed: 'Last run failed',
      schedulerPaused: 'Scheduler paused',
      schedulerPausedMsg: 'The cron scheduler is currently disabled. All cron jobs are paused.'
    },
    files: {
      subtitle: 'Browse and manage agent workspace files',
      notSupported: 'File browsing is not supported by current Gateway',
      loadFailed: 'Failed to load file list',
      readFileFailed: 'Failed to read file',
      empty: 'No files',
      noPreview: 'Cannot preview this file',
      noContent: 'File content is empty',
      workspace: 'Workspace: {path}',
      deleteConfirm: 'Are you sure you want to delete "{name}"?',
      createFile: 'Create File',
      createFolder: 'Create Folder',
      fileName: 'File Name',
      folderName: 'Folder Name',
      namePlaceholder: 'Enter name',
      createDirNote: 'Directory will be created when first file is written',
      createSuccess: 'Created successfully',
      createDirSuccess: 'Directory created successfully',
      createFailed: 'Failed to create',
      deleteSuccess: 'Deleted successfully',
      deleteFailed: 'Failed to delete',
      saveSuccess: 'Saved successfully',
      saveFailed: 'Failed to save',
      uploadSuccess: 'Uploaded successfully',
      uploadFailed: 'Failed to upload',
      imageUploadSuccess: 'Image uploaded successfully',
      editPlaceholder: 'Edit file content here...',
      preview: 'Preview',
      source: 'Source',
      edit: 'Edit',
      toc: 'Contents',
      selectAgent: 'Select Agent',
      selectAgentFirst: 'Please select an Agent first',
      noWorkspace: 'Unable to get workspace path',
      operationNotSupported: 'This operation is not supported in direct Gateway mode',
      pdfNotSupported: 'PDF preview is not supported in direct Gateway mode',
      binaryNoPreview: 'Binary file preview is not supported',
      editor: {
        title: 'Editor',
        heading1: 'Heading 1',
        heading2: 'Heading 2',
        heading3: 'Heading 3',
        bold: 'Bold',
        italic: 'Italic',
        strikethrough: 'Strikethrough',
        inlineCode: 'Inline Code',
        codeBlock: 'Code Block',
        link: 'Link',
        image: 'Image',
        quote: 'Quote',
        unorderedList: 'Unordered List',
        orderedList: 'Ordered List',
        horizontalRule: 'Horizontal Rule',
        table: 'Table'
      },
      columns: {
        name: 'Name',
        size: 'Size',
        modified: 'Modified',
        type: 'Type',
        actions: 'Actions'
      },
      types: {
        directory: 'Directory',
        file: 'File',
        symlink: 'Symlink'
      },
      actions: {
        view: 'View',
        download: 'Download',
        delete: 'Delete',
        newFolder: 'New Folder',
        newFile: 'New File',
        upload: 'Upload',
        save: 'Save',
        open: 'Open',
        edit: 'Edit',
        rename: 'Rename',
        fullscreen: 'Fullscreen',
        exitFullscreen: 'Exit Fullscreen'
      }
    },
    agents: {
      tabs: {
        list: 'Agent List',
        world: 'Virtual Company'
      },
      subtitle: 'Manage all agent instances, view session statistics and token usage',
      notSupported: 'Agent listing is not supported by current Gateway',
      loadFailed: 'Failed to load agent list',
      empty: 'No agents',
      listTitle: 'Agent List',
      listCount: 'Total {count} agents',
      metrics: {
        totalAgents: 'Total Agents',
        totalSessions: 'Total Sessions',
        totalTokens: 'Total Tokens',
        configuredModels: 'Configured Models'
      },
      units: {
        tokens: 'K'
      },
      status: {
        active: 'Active',
        idle: 'Idle',
        offline: 'Offline'
      },
      columns: {
        agent: 'Agent',
        status: 'Status',
        sessions: 'Sessions',
        tokens: 'Tokens',
        theme: 'Theme',
        model: 'Model',
        tools: 'Tools',
        actions: 'Actions'
      },
      stats: {
        total: 'Total Agents',
        sessions: 'Total Sessions',
        tokens: 'Total Tokens',
        default: 'Default Agent'
      },
      lastUpdated: 'Last updated: {time}',
      actions: {
        create: 'Create Agent',
        detail: 'Detail',
        identity: 'Identity',
        model: 'Model',
        tools: 'Tools'
      },
      confirmDelete: 'Delete this agent? This action cannot be undone.',
      modal: {
        createTitle: 'Create Agent',
        detailTitle: 'Agent Detail',
        identityTitle: 'Set Identity',
        modelTitle: 'Set Model',
        toolsTitle: 'Set Tool Permissions'
      },
      form: {
        id: 'Agent ID',
        idPlaceholder: 'e.g. work',
        idRequired: 'Please enter Agent ID',
        idPattern: 'Agent ID can only contain letters, numbers, underscores and hyphens',
        workspace: 'Workspace',
        workspacePlaceholder: 'e.g. ~/.hermes/workspace-work',
        name: 'Name',
        namePlaceholder: 'e.g. Hermes',
        theme: 'Theme',
        themePlaceholder: 'e.g. space lobster',
        emoji: 'Emoji',
        emojiPlaceholder: 'e.g. 🦞',
        avatar: 'Avatar',
        avatarPlaceholder: 'e.g. avatars/hermes.png',
        model: 'Model',
        modelPlaceholder: 'Select model',
        toolsAllow: 'Allowed Tools (Allow)',
        toolsDeny: 'Denied Tools (Deny)',
        toolsAllowPlaceholder:
          'Enter tool names, comma-separated, e.g.: sessions_list, read, write',
        toolsDenyPlaceholder: 'Enter tool names, comma-separated, e.g.: exec, bash, apply_patch',
        addTool: 'Add tool',
        commonTools: 'Common tools (click to add to allow list)',
        toolsHint: 'Left-click to add to allow list, right-click to add to deny list',
        toolCategories: {
          files: 'Files',
          runtime: 'Runtime',
          web: 'Web',
          memory: 'Memory',
          sessions: 'Sessions',
          ui: 'UI',
          messaging: 'Messaging',
          automation: 'Automation',
          nodes: 'Nodes',
          agents: 'Agents',
          media: 'Media'
        }
      },
      detail: {
        id: 'ID',
        name: 'Name',
        theme: 'Theme',
        emoji: 'Emoji',
        avatar: 'Avatar',
        sessions: 'Sessions',
        tokens: 'Tokens'
      },
      messages: {
        created: 'Agent created',
        createFailed: 'Failed to create agent',
        deleted: 'Agent deleted',
        deleteFailed: 'Failed to delete agent',
        identitySaved: 'Identity saved',
        identityFailed: 'Failed to save identity',
        modelSaved: 'Model saved',
        modelFailed: 'Failed to save model',
        toolsSaved: 'Tool permissions saved',
        toolsFailed: 'Failed to save tool permissions'
      }
    },
    office: {
      subtitle:
        'Multi-agent collaborative workspace with scenario creation, task delegation, agent communication',
      loadFailed: 'Failed to load data',
      floor: 'Office Floor',
      view3d: '3D View',
      activity: 'Recent Activity',
      summary: 'Summary',
      noAgents: 'No agents. Please create agents in the Agents page first.',
      noActivity: 'No activity',
      totalAgents: 'Total Agents',
      activeAgents: 'Active Agents',
      totalSessions: 'Total Sessions',
      totalTokens: 'Total Tokens',
      totalTeams: 'Total Teams',
      totalTasks: 'Total Tasks',
      lastUpdated: 'Last updated: {time}',
      agentsCount: '{count} agents',
      agentsLabel: 'Agents',
      addAgent: 'Expect to Join',
      newSession: 'New Session',
      sessionsLabel: 'Sessions',
      selectAgentFirst: 'Please select an agent first',
      currentTask: 'Current task',
      createScenario: 'Create Scenario',
      chatWithAgent: 'Chat with agent',
      delegateTask: 'Delegate task',
      agentStatus: {
        working: 'Working',
        communicating: 'Communicating',
        idle: 'Idle',
        offline: 'Offline'
      },
      wizard: {
        title: 'Scenario Creation Wizard',
        steps: {
          scenario: 'Scenario Definition',
          scenarioDesc: 'Define scenario name and description',
          agents: 'Select Agents',
          agentsDesc: 'Select agents to participate',
          tasks: 'Create Tasks',
          tasksDesc: 'Define tasks to execute',
          bindings: 'Binding Config',
          bindingsDesc: 'Configure channel bindings',
          confirm: 'Confirm Config',
          confirmDesc: 'Confirm all settings',
          execution: 'Execute Tasks',
          executionDesc: 'Execute creation and config'
        },
        scenarioName: 'Scenario Name',
        scenarioNamePlaceholder: 'e.g., Product Development Collaboration',
        scenarioDescription: 'Description',
        scenarioDescriptionPlaceholder: 'Describe the goals and expected outcomes...',
        scenarioHint:
          'A scenario is a context where agents collaborate to achieve specific goals, containing multiple tasks and role assignments.',
        selectAgentsHint:
          'Select agents to participate in this scenario. They will collaborate to complete the tasks.',
        selectExisting: 'Select Existing Agents',
        aiCreateAgents: 'AI Auto-Create Agents',
        aiCreateHint:
          'Describe your scenario requirements and AI will automatically create suitable agent roles with configuration files.',
        workspaceMode: 'Workspace Mode',
        workspaceIndependent: 'Independent Workspace',
        workspaceIndependentHint: 'Each agent has its own independent workspace directory',
        workspaceShared: 'Shared Workspace',
        workspaceSharedHint: "All agents share the team leader's workspace directory",
        aiPromptPlaceholder:
          'e.g., I need a development team to build a web application, including frontend, backend, and testing...',
        aiPromptRequired: 'Please describe your scenario requirements',
        generateAgents: 'Generate Agents',
        generatingHint:
          'Calling AI to generate agent list, please wait patiently and do not perform other operations...',
        agentsGenerated: '{count} new agents generated',
        agentsGeneratedWithExisting:
          '{newCount} new agents generated, {existingCount} already exist',
        allAgentsExist: 'All {count} agents already exist, will use existing agents',
        agentGenerationFailed: 'AI agent generation failed, using default config',
        generatedAgents: 'Generated Agents',
        addCustomAgent: 'Add Custom Role',
        teamLeader: 'Team Leader',
        agentName: 'Name',
        agentRole: 'Role',
        agentCreationFailed: 'Failed to create agent',
        viewFiles: 'View Config Files',
        addTasksHint: 'Add tasks to be completed. You can assign tasks to specific agents later.',
        taskTitlePlaceholder: 'Enter task title',
        taskDescriptionPlaceholder: 'Describe the task details and requirements...',
        taskTitleRequired: 'Please enter task title',
        taskAgentRequired: 'Please select at least one agent',
        addTask: 'Add Task',
        noTasks: 'No tasks added yet',
        assignAgents: 'Assign Agents',
        selectAgentsPlaceholder: 'Select agents to assign',
        taskModeLabel: 'Execution Mode',
        persistentTask: 'Persistent Task',
        persistent: 'Persistent',
        modeRun: 'One-time Run',
        modeSession: 'Session Mode',
        priorityHigh: 'High Priority',
        priorityMedium: 'Medium Priority',
        priorityLow: 'Low Priority',
        taskTitle: 'Task Title',
        taskDescription: 'Task Description',
        taskPriority: 'Priority',
        bindingsHint:
          'Configure bindings between agents and external channels like Feishu groups, WeChat groups, etc.',
        addBinding: 'Add Binding',
        noBindingsHint: 'No bindings configured. Click the button above to add.',
        selectAgent: 'Select Agent',
        selectAgentPlaceholder: 'Select Agent ID',
        selectChannel: 'Select Channel',
        peerIdPlaceholder: 'Enter group/user ID',
        confirmTitle: 'Confirm Scenario Configuration',
        agentMode: 'Agent Mode',
        agentsCount: 'Agent Count',
        tasksCount: 'Task Count',
        bindingsCount: 'Binding Count',
        agentsList: 'Agents List',
        tasksList: 'Tasks List',
        confirmAndExecute: 'Confirm',
        executeTasksNow: 'Execute Tasks Now',
        done: 'Done',
        previous: 'Previous',
        next: 'Next',
        startWorking: 'Start Working',
        startExecution: 'Start Execution',
        executing: 'Executing...',
        executionComplete: 'Execution Complete'
      },
      chat: {
        title: 'Agent Communication',
        selectAgent: 'Please select an agent first',
        selectSession: 'Please select a session first',
        noMessages: 'No messages yet',
        chattingWith: 'Chatting with',
        you: 'You',
        system: 'System',
        inputPlaceholder: 'Type a message... (Enter to send, Shift+Enter for new line)',
        broadcast: 'Broadcast',
        send: 'Send',
        executing: 'Executing',
        activeTasks: '{count} tasks in progress',
        processing: 'Processing...',
        expandedTitle: 'Agent Collaboration Details'
      },
      sessions: {
        title: "{name}'s Sessions",
        noSessions: 'No sessions',
        newSession: 'New Session',
        createFirst: 'Create first session',
        statusActive: 'Active',
        statusIdle: 'Idle',
        lastActivity: 'Last activity',
        messages: 'messages',
        messageCount: 'Message count',
        tokenUsage: 'Token usage'
      },
      status: {
        thinking: 'Thinking...',
        toolCall: 'Calling tool: {name}',
        toolRunning: 'Running tool...',
        replying: 'Replying...',
        done: 'Done',
        error: 'Error',
        idle: 'Idle'
      },
      tasks: {
        title: 'Task Management',
        count: '{count} tasks',
        noTasks: 'No tasks yet',
        newTaskPlaceholder: 'Enter new task title...',
        create: 'Create',
        assignTo: 'Assign to...',
        priority: {
          low: 'Low Priority',
          medium: 'Medium Priority',
          high: 'High Priority'
        },
        status: {
          pending: 'Pending',
          inProgress: 'In Progress',
          in_progress: 'In Progress',
          completed: 'Completed',
          failed: 'Failed'
        },
        unassigned: 'Unassigned',
        start: 'Start',
        startHint: 'Start executing this task',
        complete: 'Complete',
        fail: 'Mark Failed',
        pending: 'Pending',
        inProgress: 'In Progress',
        completed: 'Completed',
        noAssignedAgents: 'No agents assigned',
        viewDetail: 'View Details',
        taskStarted: 'Task started',
        taskStartFailed: 'Failed to start task',
        conversations: 'Conversations',
        execute: 'Execute',
        executeSuccess: 'Task executed successfully',
        executeFailed: 'Task execution failed',
        mode: {
          default: 'Default Mode',
          sessionsSeed: 'Sessions Seed Mode',
          broadcast: 'Broadcast Mode',
          sequential: 'Sequential Mode'
        },
        detailLabels: {
          status: 'Status',
          priority: 'Priority',
          mode: 'Execution Mode',
          createdAt: 'Created At',
          description: 'Description',
          assignedAgents: 'Assigned Agents'
        },
        detail: {
          status: 'Status',
          priority: 'Priority',
          mode: 'Execution Mode',
          description: 'Description',
          createdAt: 'Created At',
          assignedAgents: 'Assigned Agents',
          conversations: 'Execution Records'
        }
      },
      '3d': {
        resetView: 'Reset View',
        hint: 'Drag to rotate, scroll to zoom'
      },
      scenarios: {
        title: 'Team Management',
        noScenarios: 'No team scenarios',
        agents: 'Agents',
        bindings: 'Channel Bindings',
        noAgents: 'No agents',
        noBindings: 'No bindings configured',
        tasksCount: '{count} tasks',
        status: {
          confirmed: 'Confirmed',
          executing: 'Executing',
          completed: 'Completed',
          archived: 'Archived'
        },
        detail: {
          status: 'Status',
          description: 'Description',
          createdAt: 'Created At'
        },
        agentExists: 'Exists',
        agentNotExists: 'Not Created',
        deleteTitle: 'Delete Team',
        deleteConfirm: 'Are you sure you want to delete team "{name}"?',
        deleteAgents: 'Also delete associated agents',
        deleteBindings: 'Also clear binding configurations'
      },
      teamManagement: {
        title: 'Team Management',
        noTeams: 'No teams',
        viewDetail: 'View Details',
        deleteTeam: 'Delete Team',
        deleteConfirm: 'Are you sure you want to delete team "{name}"?',
        deleteAgents: 'Also delete associated agents',
        deleteBindings: 'Also clear binding configurations',
        agents: 'Agents',
        bindings: 'Binding Configurations',
        agentExists: 'Exists',
        agentNotExists: 'Not Exists',
        status: {
          confirmed: 'Confirmed',
          executing: 'Executing',
          completed: 'Completed',
          archived: 'Archived'
        },
        detail: {
          status: 'Status',
          description: 'Description',
          createdAt: 'Created At',
          agents: 'Agent List',
          bindings: 'Binding Configurations',
          noAgents: 'No agents',
          noBindings: 'No binding configurations'
        },
        agentDetail: {
          title: 'Agent Details',
          id: 'ID',
          name: 'Name',
          role: 'Role',
          emoji: 'Emoji',
          skills: 'Skills',
          status: 'Status',
          noSkills: 'No skills'
        },
        bindingDetail: {
          title: 'Binding Details',
          agentId: 'Agent ID',
          channelType: 'Channel Type',
          peerId: 'Peer ID',
          peerKind: 'Peer Kind'
        }
      },
      teamTaskPanel: {
        title: 'Team Task Management',
        teamList: 'Team List',
        taskList: 'Task List',
        noTeamSelected: 'Please select a team to view tasks',
        createTeam: 'Create Team',
        teamName: 'Team Name',
        teamDescription: 'Team Description',
        teamMembers: 'Team Members',
        selectMembers: 'Select Members',
        addMembers: 'Add Members',
        removeMember: 'Remove Member',
        noMembers: 'No members',
        noTasks: 'No tasks',
        taskStats: 'Task Statistics',
        totalTasks: 'Total Tasks',
        pendingTasks: 'Pending',
        inProgressTasks: 'In Progress',
        completedTasks: 'Completed',
        createTask: 'Create Task',
        editTask: 'Edit Task',
        taskTitle: 'Task Title',
        taskDescription: 'Task Description',
        taskPriority: 'Priority',
        taskMode: 'Execution Mode',
        modeRun: 'One-time Run',
        modeSession: 'Persistent Session',
        assignAgents: 'Assign Agents',
        startTime: 'Start Time',
        endTime: 'End Time',
        execute: 'Execute',
        complete: 'Complete',
        completeSuccess: 'Task marked as completed',
        executing: 'Executing',
        executed: 'Executed',
        sessionMode: 'Session Mode',
        runMode: 'One-time Run',
        sessionKey: 'Session Key',
        viewHistory: 'View History',
        sendToSession: 'Send Message',
        sessionActive: 'Session Active',
        sessionInactive: 'Session Inactive',
        createMode: 'Create Mode',
        useExistingAgents: 'Use Existing Agents',
        aiCreateAgents: 'AI Auto-Create Agents',
        aiCreating: 'AI Creating...',
        aiCreateSuccess: 'AI Creation Successful',
        aiCreateFailed: 'AI Creation Failed',
        createdAgents: 'Newly Created Agents',
        editTeam: 'Edit Team',
        channelBindings: 'Channel Bindings',
        addBinding: 'Add Binding',
        editBinding: 'Edit Binding',
        deleteBinding: 'Delete Binding',
        bindingAgent: 'Agent',
        bindingChannel: 'Channel Type',
        bindingPeerId: 'Peer ID',
        bindingPeerKind: 'Peer Kind',
        noBindings: 'No Bindings',
        deleteAgentNone: 'Do Not Delete Any Agents',
        deleteAgentCreated: 'Only Delete Agents Created by This Team',
        deleteAgentAll: 'Delete All Associated Agents',
        deleteAgentLabel: 'Agent Deletion Option',
        taskDetail: 'Task Detail',
        viewInChat: 'View in Agent Communication',
        scrollTip: 'Scroll for more',
        deleteAll: 'Delete All (including agents, channel bindings, communication configs)',
        agentToAgent: 'Agent-to-Agent Communication Config',
        configuringAgentToAgent: 'Configuring agent-to-agent communication...',
        agentToAgentConfigured: 'Agent-to-agent communication configured',
        existingBindings: 'Existing Bindings',
        newBinding: 'New Binding',
        teamAgents: 'Team Agents',
        clickToChat: 'Click to open session',
        aiCreateWait: 'Waiting for AI response, please wait...',
        aiCreateTimeout: 'AI response timeout, please retry',
        aiTeamDescription: 'Team description for AI to generate',
        aiTeamDescriptionPlaceholder:
          'e.g., Create a content creation team with content planning, copywriting, and graphic design agents...',
        confirmAgents: 'Confirm Agent List',
        agentName: 'Agent Name',
        agentId: 'Agent ID',
        agentExists: 'Already Exists',
        modifyAgent: 'Modify',
        skipCreate: 'Skip Creation',
        confirmCreate: 'Confirm Creation',
        deleteTeamOnly: 'Delete Team Only (keep agents and configs in database)',
        deleteTeamAll: 'Delete All (team, all associated agents, communication configs)',
        teamAllAgents: 'Team Members',
        assignedAgents: 'Assigned Agents',
        deleting: 'Deleting agents...',
        totalAgents: 'Total',
        deletedAgents: 'Deleted',
        failedAgents: 'Failed',
        currentlyDeleting: 'Currently deleting'
      }
    },
    backup: {
      title: 'Data Backup',
      createNow: 'Back up now',
      upload: 'Upload backup',
      refresh: 'Refresh',
      empty: 'No backups yet. Click "Back up now" to create one.',
      restore: 'Restore',
      download: 'Download',
      delete: 'Delete',
      deleteConfirm: 'Are you sure you want to delete this backup?',
      createSuccess: 'Backup created: {filename}',
      createFailed: 'Failed to create backup: {error}',
      deleteSuccess: 'Backup deleted',
      deleteFailed: 'Failed to delete backup: {error}',
      downloadSuccess: 'Backup exported',
      downloadFailed: 'Failed to download backup: {error}',
      restoreSuccess: 'Backup restored. Some changes may require a service restart.',
      restoreFailed: 'Failed to restore backup: {error}',
      uploadSuccess: 'Backup uploaded: {filename}',
      uploadFailed: 'Failed to upload backup: {error}',
      restoreConfirmTitle: 'Confirm restore',
      restoreConfirmContent:
        'Restoring {filename} will overwrite current data. This cannot be undone. Continue?',
      restoreConfirmOk: 'Confirm restore',
      restoreConfirmCancel: 'Cancel',
      metrics: {
        total: 'Total backups',
        totalSize: 'Disk space',
        latest: 'Latest backup'
      },
      columns: {
        filename: 'Filename',
        size: 'Size',
        date: 'Date',
        actions: 'Actions'
      }
    },
    logs: {
      title: 'System Logs',
      refresh: 'Refresh',
      autoRefresh: 'Auto-refresh',
      pause: 'Pause',
      autoRefreshOn: 'Auto-refresh enabled',
      loading: 'Loading logs...',
      empty: 'No logs',
      cleared: 'Buffer cleared',
      unavailableHermesRest:
        'Live logs are not supported in Hermes REST mode. Connect to an ACP Gateway to view logs.',
      searchPlaceholder: 'Search log content',
      levelFilter: 'Filter by level',
      subsystemFilter: 'Filter by subsystem',
      levelAll: 'All levels',
      subsystemAll: 'All subsystems',
      autoScroll: 'Auto-scroll',
      showing: 'Showing {filtered} / {total}',
      clear: 'Clear buffer',
      reload: 'Reload',
      scrollBottom: 'Scroll to bottom',
      metrics: {
        total: 'Total entries',
        errors: 'Errors',
        warns: 'Warnings',
        fileSize: 'File size'
      }
    },
    insights: {
      title: 'Insights',
      refresh: 'Refresh',
      unavailableHermesRest:
        'Usage insights are not supported in Hermes REST mode. Connect to an ACP Gateway to view insights.',
      empty: 'No data',
      unknown: 'Unknown',
      calls: 'calls',
      tokenBreakdown: 'Token breakdown',
      input: 'Input',
      output: 'Output',
      cacheRead: 'Cache read',
      avgTokensPerSession: 'Avg tokens / session',
      avgCostPerSession: 'Avg cost / session',
      dailyTrend: 'Daily trend',
      topModels: 'Top models',
      topProviders: 'Top providers',
      topAgents: 'Top agents',
      topChannels: 'Top channels',
      topTools: 'Top tools',
      metrics: {
        totalTokens: 'Total tokens',
        totalCost: 'Total cost',
        sessions: 'Sessions',
        errorRate: 'Error rate'
      }
    }
  },
  myworld: {
    title: 'Virtual Company',
    subtitle:
      'Agent collaboration space with character movement, area interaction, real-time communication and visualization',
    loadFailed: 'Failed to load data',
    zoomIn: 'Zoom In',
    zoomOut: 'Zoom Out',
    resetView: 'Reset View',
    scene: 'Scene',
    characters: 'Characters',
    areasLabel: 'Areas',
    interactions: 'Interactions',
    noAgents: 'No agents. Please create agents in the Agents page first.',
    noCharacters: 'No characters',
    lastUpdated: 'Last updated: {time}',
    charactersCount: '{count} characters',
    charactersLabel: 'Characters',
    addCharacter: 'Add Character',
    selectCharacter: 'Select character',
    doubleClickChat: 'Double-click character to chat',
    myEmployees: 'My Employees',
    working: 'Working',
    totalEmployees: 'Total Employees',
    addEmployee: 'Add Employee',
    permissionControl: 'Permission Control',
    manage: 'Manage',
    refresh: 'Refresh',
    employeeId: 'Employee ID',
    employeeName: 'Employee Name',
    workspace: 'Workspace',
    employeeIdPlaceholder: 'Enter employee ID',
    employeeNamePlaceholder: 'Enter employee name',
    workspacePlaceholder: 'Enter workspace path',
    employeeIdRequired: 'Please enter employee ID',
    employeeCreated: 'Employee created successfully',
    employeeCreateFailed: 'Failed to create employee',
    modifyEmployeePermission: 'Modify Employee Permission',
    permissionSaved: 'Permission saved successfully',
    permissionSaveFailed: 'Failed to save permission',
    noConfigurableEmployees: 'No configurable employees',
    allowedPermissions: 'Allowed Permissions',
    deniedPermissions: 'Denied Permissions',
    addPermission: 'Add permission',
    commonPermissions: 'Common permissions (click to add to allow list)',
    permissionHint: 'Left-click to add to allow list, right-click to add to deny list',
    skillsList: 'Skills List',
    copiedToClipboard: 'Copied to clipboard',
    copyFailed: 'Copy failed',
    noContentToCopy: 'No content to copy',
    toolCategories: {
      files: 'Files',
      runtime: 'Runtime',
      web: 'Web',
      memory: 'Memory',
      sessions: 'Sessions',
      ui: 'UI',
      messaging: 'Messaging',
      automation: 'Automation',
      nodes: 'Nodes',
      agents: 'Agents',
      media: 'Media'
    },
    characterStatus: {
      idle: 'Idle',
      walking: 'Walking',
      working: 'Working',
      talking: 'Talking',
      resting: 'Resting'
    },
    areas: {
      reception: 'Reception',
      hallway: 'Hallway',
      desk1: 'Desk Area A',
      desk2: 'Desk Area B',
      desk3: 'Desk Area C',
      desk4: 'Desk Area D',
      cafeteria: 'Cafeteria',
      lounge: 'Lounge',
      meetingRoom: 'Meeting Room',
      office1: 'Office 1',
      office2: 'Office 2',
      office3: 'Office 3',
      office4: 'Office 4',
      office5: 'Office 5',
      office6: 'Office 6',
      meetingSmall1: 'Meeting Room 1',
      meetingSmall2: 'Meeting Room 2',
      meetingSmall3: 'Meeting Room 3',
      meetingSmall4: 'Meeting Room 4',
      manager1: 'Manager Office 1',
      manager2: 'Manager Office 2',
      restroomM: "Men's Room",
      restroomF: "Ladies' Room",
      storage: 'Storage',
      pantry: 'Pantry',
      openDesk: 'Open Office'
    },
    entrance: 'Entrance',
    areaActions: {
      moveTo: 'Move to',
      workAt: 'Work here',
      restAt: 'Rest here',
      meetAt: 'Meet here'
    },
    controls: {
      hint: 'Scroll to zoom, drag to pan',
      zoom: 'Zoom',
      pan: 'Pan',
      reset: 'Reset'
    },
    chat: {
      title: 'Employee Chat',
      inputPlaceholder: 'Type a message... (Enter to send, Shift+Enter for new line)',
      send: 'Send',
      close: 'Close',
      noMessages: 'No messages',
      you: 'You',
      agent: '{name}'
    },
    status: {
      loading: 'Loading...',
      connected: 'Connected',
      disconnected: 'Disconnected'
    },
    popup: {
      sessions: 'Sessions',
      noSessions: 'No sessions',
      close: 'Close'
    },
    hints: {
      clickToSelect: 'Click to select character',
      doubleClickToChat: 'Double-click to open sessions',
      clickToMove: 'Click empty area to move character',
      dragToPan: 'Drag to pan canvas',
      scrollToZoom: 'Scroll to zoom'
    }
  }
} as const
