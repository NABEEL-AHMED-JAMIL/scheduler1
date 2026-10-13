// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a new chat, as a workspace administrator": {
    "url": "/ai/assistant",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiPrompt.json/assistant/conversationList?limit=50&zone=America/Chicago",
      "GET /aiPrompt.json/assistant/conversations?limit=30",
      "GET /aiPrompt.json/tools/list",
      "GET /appUser.json/me",
      "GET /aiPrompt.json/dataPolicy",
      "GET /aiConnection.json/list"
    ],
    "headings": [
      "AI Assistant",
      "Conversations",
      "Today",
      "New conversation"
    ],
    "buttons": [
      "Actions for Run the job named \"UI-CHECK step engine job 0928\" now.",
      "All",
      "Close the conversations",
      "Context",
      "Design a pipeline: every night read orders.csv from storage, keep the paid orders, and save them as a CSV.",
      "Design a pipeline: pull patients and observations from FHIR daily, compute risk flags, summarise with AI, approve, dashboard.",
      "Design a pipeline: when a lab results CSV lands in the inbox, validate it against the lab contract, flag abnormal values, ask the reviewer to approve, then save a PDF and notify the doctor.",
      "Flow",
      "Fold the conversations to icons",
      "History",
      "How did my last run go?",
      "List the data sources in this workspace.",
      "New chat",
      "Pin Run the job named \"UI-CHECK step engine job 0928\" now.",
      "Pipelines",
      "Questions",
      "Refresh the conversations",
      "Run the job named \"UI-CHECK step engine job 0928\" now.",
      "Runs",
      "Send",
      "Tool calls",
      "What can a pipeline step point at here?",
      "Which pipeline jobs do I have?",
      "Which runs failed this week?"
    ],
    "columns": [],
    "fields": [
      "Describe a pipeline, or ask about runs, sources or files…",
      "Message the assistant",
      "Model connection",
      "Search the conversations, titles and messages",
      "Search titles and messages"
    ],
    "links": [
      "/ai/assistant/conversations"
    ],
    "thread": {
      "messages": [],
      "cards": [],
      "links": [],
      "calls": [],
      "context": [],
      "policy": []
    }
  },
  "conversation 1000, confirmed and run, with its tool calls": {
    "url": "/ai/assistant?c=1000",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiPrompt.json/assistant/conversationList?limit=50&zone=America/Chicago",
      "GET /aiPrompt.json/assistant/conversations?limit=30",
      "GET /aiPrompt.json/tools/list",
      "GET /appUser.json/me",
      "GET /aiPrompt.json/dataPolicy",
      "GET /aiConnection.json/list",
      "GET /aiPrompt.json/assistant/conversation?conversationId=1000",
      "GET /aiPrompt.json/tools/trace?toolRunId=1004",
      "GET /sourceJob.json/stepExecutions?jobQueueId=7404"
    ],
    "headings": [
      "AI Assistant",
      "Conversations",
      "Today",
      "Run the job named \"UI-CHECK step engine job 0928\" now."
    ],
    "buttons": [
      "1get_jobsAllowed436 ms",
      "2run_pipelineConfirmed612 ms",
      "Actions for Run the job named \"UI-CHECK step engine job 0928\" now.",
      "All",
      "Close the conversations",
      "Context",
      "Delete this conversation",
      "Flow",
      "Fold the conversations to icons",
      "History",
      "New chat",
      "Pin Run the job named \"UI-CHECK step engine job 0928\" now.",
      "Pipelines",
      "Questions",
      "Refresh the conversations",
      "Rename this conversation",
      "Run the job named \"UI-CHECK step engine job 0928\" now.",
      "Runs",
      "Send",
      "Tool calls"
    ],
    "columns": [],
    "fields": [
      "Describe a pipeline, or ask about runs, sources or files…",
      "Message the assistant",
      "Model connection",
      "Search the conversations, titles and messages",
      "Search titles and messages"
    ],
    "links": [
      "/ai/assistant/conversations",
      "/pipelines/schedules/2848/executions",
      "/pipelines/schedules/2848/runs/7404/logs"
    ],
    "opened": [],
    "thread": {
      "messages": [
        "user: Run the job named \"UI-CHECK step engine job 0928\" now.06:56",
        "tool-summary: Tools: get_jobs (allowed), run_pipeline (waiting for you).",
        "assistant: Please confirm: Run a pipeline job (jobId=2848).ConfirmationConfirmedRun a pipeline job (jobId=2848).Toolrun_pipelinejobId2848",
        "tool-summary: You confirmed: Run a pipeline job (jobId=2848).",
        "assistant: The job 'UI-CHECK step engine job 0928' (jobId: 2848) has been successfully added to the queue. Confirm if you need further actions. Completed UI-CHECK step eng"
      ],
      "cards": [
        "confirmed"
      ],
      "links": [
        "execution: Completed UI-CHECK step engine job 0928run #7404Run logsExecutions"
      ],
      "calls": [
        "get_jobs allowed: 1get_jobsAllowed436 ms",
        "run_pipeline confirmed: 2run_pipelineConfirmed612 ms"
      ],
      "context": [
        "Tool: run_pipeline",
        "jobId: 2848",
        "Model: qwen3:8b",
        "Tool calling: —",
        "Turns · calls: 0 · 2",
        "Time · tokens: — · 0"
      ],
      "policy": []
    }
  },
  "the assistant, as a tenant user with every page": {
    "url": "/ai/assistant",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiPrompt.json/assistant/conversationList?limit=50&zone=America/Chicago",
      "GET /aiPrompt.json/assistant/conversations?limit=30",
      "GET /aiPrompt.json/tools/list",
      "GET /appUser.json/me",
      "GET /aiPrompt.json/dataPolicy"
    ],
    "headings": [
      "AI Assistant",
      "Conversations",
      "Today",
      "New conversation"
    ],
    "buttons": [
      "Actions for Run the job named \"UI-CHECK step engine job 0928\" now.",
      "All",
      "Close the conversations",
      "Context",
      "Design a pipeline: every night read orders.csv from storage, keep the paid orders, and save them as a CSV.",
      "Design a pipeline: pull patients and observations from FHIR daily, compute risk flags, summarise with AI, approve, dashboard.",
      "Design a pipeline: when a lab results CSV lands in the inbox, validate it against the lab contract, flag abnormal values, ask the reviewer to approve, then save a PDF and notify the doctor.",
      "Flow",
      "Fold the conversations to icons",
      "History",
      "How did my last run go?",
      "List the data sources in this workspace.",
      "New chat",
      "Pin Run the job named \"UI-CHECK step engine job 0928\" now.",
      "Pipelines",
      "Questions",
      "Refresh the conversations",
      "Run the job named \"UI-CHECK step engine job 0928\" now.",
      "Runs",
      "Send",
      "Tool calls",
      "What can a pipeline step point at here?",
      "Which pipeline jobs do I have?",
      "Which runs failed this week?"
    ],
    "columns": [],
    "fields": [
      "Describe a pipeline, or ask about runs, sources or files…",
      "Message the assistant",
      "Search the conversations, titles and messages",
      "Search titles and messages"
    ],
    "links": [
      "/ai/assistant/conversations"
    ],
    "thread": {
      "messages": [],
      "cards": [],
      "links": [],
      "calls": [],
      "context": [],
      "policy": []
    }
  },
  "the assistant, as a tenant user without the page": {
    "url": "/unauthorized?page=ai-prompts&title=AI%20Assistant",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "AI Assistant isn't part of your access"
    ],
    "buttons": [
      "Request access"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/"
    ]
  },
  "the tool registry, as a platform administrator": {
    "url": "/ai/tools",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /tenant.json/listTenants"
    ],
    "headings": [
      "Tool Registry",
      "Tools (0 of 0)"
    ],
    "buttons": [
      "Refresh"
    ],
    "columns": [],
    "fields": [
      "Choose a workspace…",
      "Kind",
      "Search tools",
      "State",
      "Workspace"
    ],
    "links": [
      "/ai/assistant"
    ],
    "rows": []
  },
  "the tool registry, as a tenant user with every page": {
    "url": "/ai/tools",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiPrompt.json/tools/list"
    ],
    "headings": [
      "Tool Registry",
      "Tools (6 of 6)"
    ],
    "buttons": [
      "Columns",
      "Refresh"
    ],
    "columns": [
      [
        "Tool",
        "Service",
        "Input → output",
        "Permission",
        "Asks first",
        "Enabled",
        "Last used"
      ]
    ],
    "fields": [
      "Kind",
      "Search tools",
      "State"
    ],
    "links": [
      "/ai/assistant"
    ],
    "rows": [
      "get_sourcesData sources | Sources | search?, page?, limit? → list | Tenant userReads | — | Enabled | Never",
      "call_apiCall a saved API request | API collections | requestId, environmentId?, variables? → dataset ref | Tenant administratorReads | — | Enabled | Never",
      "get_jobsPipeline jobs | Pipelines | search?, limit? → list | Tenant userReads | — | Enabled | 29 Sep, 06:57",
      "run_pipelineRun a pipeline job | Pipelines | jobId → result | Tenant userWrites | Asks first | Enabled | 29 Sep, 06:58",
      "delete_fileDelete a file | Storage | bucket, key → result | Tenant userWrites | Asks first | Enabled | Never",
      "join_dataJoin datasets | Pipeline engine | datasetRef, config? → list | Tenant userReads | — | BlockedNo user-facing endpoint runs a pipeline step on rows outside a pipeline run. | Never"
    ]
  },
  "the tool registry, as a workspace administrator": {
    "url": "/ai/tools",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiPrompt.json/tools/list"
    ],
    "headings": [
      "Tool Registry",
      "Tools (6 of 6)"
    ],
    "buttons": [
      "Columns",
      "Refresh"
    ],
    "columns": [
      [
        "Tool",
        "Service",
        "Input → output",
        "Permission",
        "Asks first",
        "Enabled",
        "Last used"
      ]
    ],
    "fields": [
      "Kind",
      "Search tools",
      "State",
      "Switch call_api on in this workspace",
      "Switch delete_file on in this workspace",
      "Switch get_jobs on in this workspace",
      "Switch get_sources on in this workspace",
      "Switch join_data on in this workspace",
      "Switch run_pipeline on in this workspace"
    ],
    "links": [
      "/ai/assistant"
    ],
    "rows": [
      "get_sourcesData sources | Sources | search?, page?, limit? → list | Tenant userReads | — | Enabled | Never",
      "call_apiCall a saved API request | API collections | requestId, environmentId?, variables? → dataset ref | Tenant administratorReads | — | Enabled | Never",
      "get_jobsPipeline jobs | Pipelines | search?, limit? → list | Tenant userReads | — | Enabled | 29 Sep, 06:57",
      "run_pipelineRun a pipeline job | Pipelines | jobId → result | Tenant userWrites | Asks first | Enabled | 29 Sep, 06:58",
      "delete_fileDelete a file | Storage | bucket, key → result | Tenant userWrites | Asks first | Enabled | Never",
      "join_dataJoin datasets | Pipeline engine | datasetRef, config? → list | Tenant userReads | — | BlockedNo user-facing endpoint runs a pipeline step on rows outside a pipeline run. | Never"
    ]
  }
};
