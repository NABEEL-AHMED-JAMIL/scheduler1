// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a new prompt": {
    "url": "/ai/prompts/new",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiConnection.json/list"
    ],
    "headings": [
      "New prompt",
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
      "Claim {{claim_id}}. Summarise the attached file in four keys: diagnosis, procedures, total_billed, flags. {{document_text}}",
      "Connection",
      "Data sensitivity",
      "Description",
      "Max tokens",
      "Message template *(required)",
      "Model",
      "Name *(required)",
      "Output",
      "Summarise claim file",
      "System instructions",
      "Tags",
      "Temperature",
      "What this prompt is for",
      "Workspace default",
      "You are a claims analyst for a US health network. Be terse. Never invent a claim number.",
      "gemma3:1b",
      "pdf, docx"
    ],
    "links": [
      "/ai/prompts"
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
      "/ai/prompts/1049/edit"
    ],
    "items": [
      "Edit & try",
      "Activate",
      "Delete"
    ]
  },
  "editing a prompt": {
    "url": "/ai/prompts/1049/edit",
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
      "Claim {{claim_id}}. Summarise the attached file in four keys: diagnosis, procedures, total_billed, flags. {{document_text}}",
      "Connection",
      "Data sensitivity",
      "Description",
      "Max tokens",
      "Message template *(required)",
      "Model",
      "Name *(required)",
      "Output",
      "Summarise claim file",
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
      "You are a claims analyst for a US health network. Be terse. Never invent a claim number.",
      "claim_id",
      "gemma3:1b",
      "pdf, docx",
      "what Try it uses"
    ],
    "links": [
      "/ai/prompts"
    ]
  },
  "model connections, as a platform administrator": {
    "url": "/ai/connections",
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
      "/ai/prompts?connection=1047"
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
    "url": "/ai/connections",
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
      "/ai/prompts?connection=1047"
    ]
  },
  "prompts, as a tenant user with every page": {
    "url": "/ai/prompts",
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
    "links": []
  },
  "prompts, as a tenant user without the page": {
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
  "prompts, as a workspace administrator": {
    "url": "/ai/prompts",
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
      "/ai/prompts/1048/edit",
      "/ai/prompts/1049/edit",
      "/ai/prompts/new"
    ]
  }
};
