// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a new chat, as a workspace administrator": {
    "url": "/ai/assistant",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiPrompt.json/assistant/conversations?limit=30",
      "GET /aiPrompt.json/tools/list",
      "GET /appUser.json/me",
      "GET /aiPrompt.json/dataPolicy",
      "GET /aiConnection.json/list"
    ],
    "headings": [
      "AI Assistant",
      "New conversation",
      "Context",
      "Recent conversations"
    ],
    "buttons": [
      "Actions for Run the job named \"UI-CHECK step engine job 0928\" now.",
      "How did my last run go?",
      "List the data sources in this workspace.",
      "New chat",
      "Refresh the conversations",
      "Run the job named \"UI-CHECK step engine job 0928\" now.29 Sep, 06:58",
      "Send",
      "Which pipeline jobs do I have?"
    ],
    "columns": [],
    "fields": [
      "Ask about pipelines, sources, runs or files…",
      "Message the assistant",
      "Model connection"
    ],
    "links": [
      "/administration/data-policies",
      "/ai/tools"
    ],
    "thread": {
      "messages": [],
      "cards": [],
      "links": [],
      "calls": [],
      "context": [
        "Workspace: UI-CHECK workspace",
        "Acting as: Casey BaselineTenant administrator",
        "Model: Local Ollama",
        "Data policy: Defaults (not saved)",
        "Tools allowed: 5 of 6",
        "Asks first for: run_pipeline, delete_file"
      ],
      "policy": [
        "Public: Any model · write tools on · pipeline retention",
        "Internal: Any model · write tools on · pipeline retention",
        "Sensitive: Local only · write tools off · pipeline retention"
      ]
    }
  },
  "conversation 1000, confirmed and run, with its tool calls": {
    "url": "/ai/assistant?c=1000",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiPrompt.json/assistant/conversations?limit=30",
      "GET /aiPrompt.json/tools/list",
      "GET /appUser.json/me",
      "GET /aiPrompt.json/dataPolicy",
      "GET /aiConnection.json/list",
      "GET /aiPrompt.json/assistant/conversation?conversationId=1000"
    ],
    "headings": [
      "AI Assistant",
      "Run the job named \"UI-CHECK step engine job 0928\" now.",
      "Context",
      "Recent conversations"
    ],
    "buttons": [
      "Actions for Run the job named \"UI-CHECK step engine job 0928\" now.",
      "Delete this conversation",
      "Hide tool calls",
      "New chat",
      "Refresh the conversations",
      "Rename this conversation",
      "Run the job named \"UI-CHECK step engine job 0928\" now.29 Sep, 06:58",
      "Send"
    ],
    "columns": [],
    "fields": [
      "Ask about pipelines, sources, runs or files…",
      "Message the assistant",
      "Model connection"
    ],
    "links": [
      "/administration/data-policies",
      "/ai/tools",
      "/pipelines/schedules/2848/runs/7404/logs"
    ],
    "opened": [
      "GET /aiPrompt.json/tools/trace?toolRunId=1004"
    ],
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
        "execution: Completed UI-CHECK step engine job 0928run #7404Started 29 Sep, 06:58Open execution"
      ],
      "calls": [
        "get_jobs allowed: get_jobsAllowedHTTP 200 · 436 ms · 1 row · 229 B{\"search\":\"UI-CHECK step engine job 0928\",\"limit\":1}",
        "run_pipeline confirmed: run_pipelineConfirmedHTTP 200 · 612 ms · 134 B{\"jobId\":2848}"
      ],
      "context": [
        "Workspace: UI-CHECK workspace",
        "Acting as: Casey BaselineTenant administrator",
        "Model: Local Ollama",
        "Data policy: Defaults (not saved)",
        "Tools allowed: 5 of 6",
        "Asks first for: run_pipeline, delete_file"
      ],
      "policy": [
        "Public: Any model · write tools on · pipeline retention",
        "Internal: Any model · write tools on · pipeline retention",
        "Sensitive: Local only · write tools off · pipeline retention"
      ]
    }
  },
  "the assistant, as a tenant user with every page": {
    "url": "/ai/assistant",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiPrompt.json/assistant/conversations?limit=30",
      "GET /aiPrompt.json/tools/list",
      "GET /appUser.json/me",
      "GET /aiPrompt.json/dataPolicy"
    ],
    "headings": [
      "AI Assistant",
      "New conversation",
      "Context",
      "Recent conversations"
    ],
    "buttons": [
      "Actions for Run the job named \"UI-CHECK step engine job 0928\" now.",
      "How did my last run go?",
      "List the data sources in this workspace.",
      "New chat",
      "Refresh the conversations",
      "Run the job named \"UI-CHECK step engine job 0928\" now.29 Sep, 06:58",
      "Send",
      "Which pipeline jobs do I have?"
    ],
    "columns": [],
    "fields": [
      "Ask about pipelines, sources, runs or files…",
      "Message the assistant"
    ],
    "links": [
      "/administration/data-policies",
      "/ai/tools"
    ],
    "thread": {
      "messages": [],
      "cards": [],
      "links": [],
      "calls": [],
      "context": [
        "Workspace: UI-CHECK workspace",
        "Acting as: Casey BaselineTenant user",
        "Model: Workspace default model",
        "Data policy: Defaults (not saved)",
        "Tools allowed: 5 of 6",
        "Asks first for: run_pipeline, delete_file"
      ],
      "policy": [
        "Public: Any model · write tools on · pipeline retention",
        "Internal: Any model · write tools on · pipeline retention",
        "Sensitive: Local only · write tools off · pipeline retention"
      ]
    }
  },
  "the assistant, as a tenant user without the page": {
    "url": "/unauthorized?page=ai-prompts",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Prompts isn't part of your access"
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
      "GET /aiPrompt.json/tools/list",
      "GET /aiPrompt.json/tools/runs?limit=25",
      "GET /aiPrompt.json/tools/trace?toolRunId=1004"
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
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiPrompt.json/tools/list",
      "GET /aiPrompt.json/tools/runs?limit=25",
      "GET /aiPrompt.json/tools/trace?toolRunId=1004"
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
