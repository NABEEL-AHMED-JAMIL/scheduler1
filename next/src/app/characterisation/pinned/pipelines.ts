// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "the AI step panel, for a pipeline with an AI step": {
    "pageFields": [
      "Default value",
      "Description",
      "Help text",
      "Label *(required)",
      "Name *(required)",
      "Nested under",
      "ORDERS_IMPORT",
      "Orders import",
      "Pipeline ID *(required)",
      "Region",
      "Required",
      "Search topics…",
      "Shown under the field",
      "Status",
      "Topic *(required)",
      "Type",
      "What a pipeline on this registry task collects",
      "XML tag *(required)",
      "region"
    ],
    "requests": [
      "GET /aiPrompt.json/list"
    ],
    "headings": [
      "AI step · <summary>"
    ],
    "buttons": [
      "Apply",
      "Cancel",
      "Clear",
      "Close"
    ],
    "columns": [],
    "fields": [
      "Prompt",
      "Search active prompts…"
    ],
    "links": [],
    "items": []
  },
  "the Edit registry task page": {
    "url": "/settings/task-registry/100167",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /pipeline.json/get?pipelineKey=100167",
      "GET /pipeline.json/steps/tasks/pipelines?pipelineKey=100167"
    ],
    "headings": [
      "Reference: CSV check and summarise",
      "1 Registry task",
      "2 Payload fields",
      "Payload preview",
      "Used by",
      "About these settings"
    ],
    "buttons": [
      "Add field",
      "Cancel",
      "Clear",
      "Move down",
      "Move up",
      "Remove field",
      "Save changes",
      "Task Registry"
    ],
    "columns": [],
    "fields": [
      "Default value",
      "Description",
      "Help text",
      "Label *(required)",
      "Name *(required)",
      "Nested under",
      "ORDERS_IMPORT",
      "Orders import",
      "Pipeline ID *(required)",
      "Region",
      "Required",
      "Search topics…",
      "Shown under the field",
      "Status",
      "Topic *(required)",
      "Type",
      "What a pipeline on this registry task collects",
      "XML tag *(required)",
      "region"
    ],
    "links": [
      "/settings",
      "/settings/task-registry"
    ]
  },
  "the New registry task page": {
    "fromTheList": [],
    "url": "/settings/task-registry/new",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /setting.json/topics?limit=1&q="
    ],
    "headings": [
      "New registry task",
      "1 Registry task",
      "2 Payload fields",
      "Payload preview",
      "About these settings"
    ],
    "buttons": [
      "Add field",
      "Cancel",
      "Create registry task",
      "Task Registry"
    ],
    "columns": [],
    "fields": [
      "Description",
      "Name *(required)",
      "ORDERS_IMPORT",
      "Orders import",
      "Pipeline ID *(required)",
      "Search topics…",
      "Status",
      "Topic *(required)",
      "What a pipeline on this registry task collects"
    ],
    "links": [
      "/settings",
      "/settings/task-registry"
    ]
  },
  "the list, as a platform administrator": {
    "url": "/settings/task-registry",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /tenant.json/listTenants",
      "GET /pipeline.json/steps/tasks",
      "GET /pipeline.json/steps/tasks/usage",
      "GET /pipeline.json/list?limit=1000&page=1"
    ],
    "headings": [
      "Task Registry",
      "Tasks (1 of 1)"
    ],
    "buttons": [
      "Actions for Reference: CSV check and summarise",
      "Columns",
      "New registry task",
      "Only mine",
      "Open Reference: CSV check and summarise",
      "Refresh"
    ],
    "columns": [
      [
        "Task",
        "Kind",
        "Service",
        "Input → output",
        "Pipelines",
        "Runs this month",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "All topics",
      "All workspaces",
      "Kind",
      "Search name, code, service or topic",
      "Search tasks",
      "State",
      "Workspace"
    ],
    "links": [
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
  "the list, as a tenant user (admin-only)": {
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
  "the list, as a workspace administrator": {
    "url": "/settings/task-registry",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /pipeline.json/steps/tasks",
      "GET /pipeline.json/steps/tasks/usage",
      "GET /pipeline.json/steps/tasks/history",
      "GET /pipeline.json/list?limit=1000&page=1"
    ],
    "headings": [
      "Task Registry",
      "Tasks (1 of 1)"
    ],
    "buttons": [
      "Actions for Reference: CSV check and summarise",
      "Columns",
      "New registry task",
      "Only mine",
      "Open Reference: CSV check and summarise",
      "Refresh"
    ],
    "columns": [
      [
        "Task",
        "Kind",
        "Service",
        "Input → output",
        "Pipelines",
        "Runs this month",
        "In this workspace",
        "Actions"
      ]
    ],
    "fields": [
      "All topics",
      "Kind",
      "Search name, code, service or topic",
      "Search tasks",
      "State"
    ],
    "links": [
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
  "the old Configuration › Pipelines address": {
    "url": "/settings/task-registry"
  },
  "the old forms address": {
    "url": "/settings/task-registry",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /pipeline.json/steps/tasks",
      "GET /pipeline.json/steps/tasks/usage",
      "GET /pipeline.json/steps/tasks/history",
      "GET /pipeline.json/list?limit=1000&page=1"
    ],
    "headings": [
      "Task Registry",
      "Tasks (1 of 1)"
    ],
    "buttons": [
      "Actions for Reference: CSV check and summarise",
      "Columns",
      "New registry task",
      "Only mine",
      "Open Reference: CSV check and summarise",
      "Refresh"
    ],
    "columns": [
      [
        "Task",
        "Kind",
        "Service",
        "Input → output",
        "Pipelines",
        "Runs this month",
        "In this workspace",
        "Actions"
      ]
    ],
    "fields": [
      "All topics",
      "Kind",
      "Search name, code, service or topic",
      "Search tasks",
      "State"
    ],
    "links": [
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
  "the row menu": {
    "headings": [],
    "buttons": [
      "Delete",
      "Duplicate",
      "Edit"
    ],
    "columns": [],
    "fields": [],
    "links": [],
    "items": [
      "Edit",
      "Duplicate",
      "Delete"
    ]
  }
};
