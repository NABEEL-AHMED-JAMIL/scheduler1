// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a new prompt": {
    "url": "/pipelines/prompts/new",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiConnection.json/list"
    ],
    "headings": [
      "New prompt",
      "1 About it",
      "2 Model",
      "3 What it says",
      "4 The answer",
      "Try it"
    ],
    "buttons": [
      "Add variable",
      "Run",
      "Save & activate",
      "Save draft"
    ],
    "columns": [],
    "fields": [
      "0.2",
      "800",
      "Connection",
      "Data sensitivity",
      "Description",
      "Max tokens",
      "Message template *(required)",
      "Model",
      "Name *(required)",
      "Output",
      "Record {{record_id}}. Summarise the attached file in four keys: summary, items, total, flags. {{document_text}}",
      "Summarise a document",
      "System instructions",
      "Tags",
      "Temperature",
      "What this prompt is for",
      "Workspace default",
      "You are an analyst. Be terse. Never invent a value the document does not hold.",
      "gemma3:1b",
      "pdf, docx"
    ],
    "links": [
      "/pipelines",
      "/pipelines/prompts"
    ]
  },
  "a prompt's row menu": {
    "headings": [],
    "buttons": [
      "Activate",
      "Delete",
      "Edit & try"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/pipelines/prompts/1049/edit"
    ],
    "items": [
      "Edit & try",
      "Activate",
      "Delete"
    ]
  },
  "editing a prompt": {
    "url": "/pipelines/prompts/1049/edit",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiConnection.json/list",
      "GET /aiPrompt.json/get?promptId=1049",
      "GET /aiPrompt.json/runs?limit=10&promptId=1049"
    ],
    "headings": [
      "UI-REVIEW Zürich – 東京 ✓ draft prompt (never activated) with a deliberately long name for truncation checks in the prompt list v1Inactive",
      "1 About it",
      "2 Model",
      "3 What it says",
      "4 The answer",
      "Try it",
      "Recent runs"
    ],
    "buttons": [
      "Add variable",
      "Clear",
      "Fill from a file",
      "Remove variable",
      "Run",
      "Save & activate",
      "Save as v2",
      "{{city}}",
      "{{rows}}",
      "{{url}}"
    ],
    "columns": [
      [
        "Name",
        "Type",
        "Required",
        "Sample value · or a file",
        "Actions"
      ]
    ],
    "fields": [
      "0.2",
      "800",
      "Connection",
      "Data sensitivity",
      "Description",
      "Max tokens",
      "Message template *(required)",
      "Model",
      "Name *(required)",
      "Output",
      "Record {{record_id}}. Summarise the attached file in four keys: summary, items, total, flags. {{document_text}}",
      "Summarise a document",
      "System instructions",
      "Tags",
      "Temperature",
      "Variable 1 name",
      "Variable 1 required",
      "Variable 1 sample value",
      "Variable 1 type",
      "Variable 2 name",
      "Variable 2 required",
      "Variable 2 sample value",
      "Variable 2 type",
      "Variable 3 name",
      "Variable 3 required",
      "Variable 3 sample value",
      "Variable 3 type",
      "What this prompt is for",
      "Workspace default",
      "You are an analyst. Be terse. Never invent a value the document does not hold.",
      "gemma3:1b",
      "pdf, docx",
      "record_id",
      "what Try it uses"
    ],
    "links": [
      "/pipelines",
      "/pipelines/prompts"
    ]
  },
  "model connections, as a platform administrator": {
    "url": "/settings/model-connections",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiConnection.json/list",
      "GET /tenant.json/listTenants",
      "GET /aiConnection.json/activity?connectionId=1047"
    ],
    "headings": [
      "Model connections",
      "Local Ollama",
      "Models",
      "Usage · last 30 days",
      "Runs · last 30 days",
      "Recent runs",
      "Prompts on this connection"
    ],
    "buttons": [
      "Actions for Local Ollama",
      "Back to list",
      "Last test failedUI-REVIEW Zürich – 東京 ✓ unreachable Ollama with a deliberately long connection name for truncation Ollama (local) · gemma3:1b",
      "Last test passedLocal Ollama Ollama (local) · gemma3:1b · default",
      "New connection",
      "Only mine",
      "Refresh",
      "Test connection"
    ],
    "columns": [],
    "fields": [
      "Find a connection",
      "Find by name, provider or model",
      "Provider",
      "State"
    ],
    "links": [
      "/pipelines/prompts?connection=1047",
      "/settings",
      "/settings/alerts",
      "/settings/home-pages",
      "/settings/kafka",
      "/settings/model-connections",
      "/settings/task-groups",
      "/settings/task-registry",
      "/settings/tools",
      "/settings/values"
    ]
  },
  "model connections, as a tenant user": {
    "url": "/unauthorized",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "This page isn't available to you"
    ],
    "buttons": [
      "Go back"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/"
    ]
  },
  "model connections, as a workspace administrator": {
    "url": "/settings/model-connections",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiConnection.json/list",
      "GET /aiConnection.json/activity?connectionId=1047"
    ],
    "headings": [
      "Model connections",
      "Local Ollama",
      "Models",
      "Usage · last 30 days",
      "Runs · last 30 days",
      "Recent runs",
      "Prompts on this connection"
    ],
    "buttons": [
      "Actions for Local Ollama",
      "Back to list",
      "Last test failedUI-REVIEW Zürich – 東京 ✓ unreachable Ollama with a deliberately long connection name for truncation Ollama (local) · gemma3:1b",
      "Last test passedLocal Ollama Ollama (local) · gemma3:1b · default",
      "New connection",
      "Only mine",
      "Refresh",
      "Test connection"
    ],
    "columns": [],
    "fields": [
      "Find a connection",
      "Find by name, provider or model",
      "Provider",
      "State"
    ],
    "links": [
      "/pipelines/prompts?connection=1047",
      "/settings",
      "/settings/alerts",
      "/settings/home-pages",
      "/settings/kafka",
      "/settings/model-connections",
      "/settings/task-groups",
      "/settings/task-registry",
      "/settings/tools",
      "/settings/values"
    ]
  },
  "prompts, as a tenant user with every page": {
    "url": "/pipelines/prompts",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiPrompt.json/list"
    ],
    "headings": [
      "Prompts",
      "Prompts (2 of 2)"
    ],
    "buttons": [
      "Cards",
      "Columns",
      "Only mine",
      "Refresh",
      "Table"
    ],
    "columns": [
      [
        "Prompt",
        "Connection · model",
        "Variables",
        "Output",
        "Used by",
        "Runs",
        "Last run",
        "State"
      ]
    ],
    "fields": [
      "Output",
      "Search name, model or variable",
      "Search prompts",
      "State"
    ],
    "links": [
      "/pipelines",
      "/pipelines/list",
      "/pipelines/prompts",
      "/pipelines/schedules"
    ]
  },
  "prompts, as a tenant user without the page": {
    "url": "/unauthorized?page=ai-prompts&title=Prompts",
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
  "prompts, as a workspace administrator": {
    "url": "/pipelines/prompts",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiPrompt.json/list"
    ],
    "headings": [
      "Prompts",
      "Prompts (2 of 2)"
    ],
    "buttons": [
      "Actions for UI-REVIEW Summarise a CSV run in one paragraph",
      "Actions for UI-REVIEW Zürich – 東京 ✓ draft prompt (never activated) with a deliberately long name for truncation checks in the prompt list",
      "Cards",
      "Columns",
      "Only mine",
      "Refresh",
      "Table"
    ],
    "columns": [
      [
        "Prompt",
        "Connection · model",
        "Variables",
        "Output",
        "Used by",
        "Runs",
        "Last run",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Output",
      "Search name, model or variable",
      "Search prompts",
      "State"
    ],
    "links": [
      "/pipelines",
      "/pipelines/list",
      "/pipelines/prompts",
      "/pipelines/prompts/1048/edit",
      "/pipelines/prompts/1049/edit",
      "/pipelines/prompts/new",
      "/pipelines/schedules"
    ]
  }
};
