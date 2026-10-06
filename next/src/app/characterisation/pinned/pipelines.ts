// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "the AI step panel, for a pipeline with an AI step": {
    "dialogFields": [
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
      "What a task on this pipeline collects",
      "XML tag *(required)",
      "region"
    ],
    "requests": [
      "GET /aiPrompt.json/list"
    ],
    "headings": [
      "Edit registry task",
      "Fields",
      "Payload preview",
      "AI step · <summary>"
    ],
    "buttons": [
      "Add field",
      "Apply",
      "Cancel",
      "Change",
      "Clear",
      "Close",
      "Move down",
      "Move up",
      "Remove field",
      "Save changes"
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
      "Prompt",
      "Region",
      "Required",
      "Search active prompts…",
      "Search topics…",
      "Shown under the field",
      "Status",
      "Topic *(required)",
      "Type",
      "What a task on this pipeline collects",
      "XML tag *(required)",
      "region"
    ],
    "links": [],
    "items": []
  },
  "the dialog, editing a pipeline": {
    "requests": [
      "GET /pipeline.json/fields?pipelineKey=100167"
    ],
    "headings": [
      "Edit registry task",
      "Fields",
      "Payload preview"
    ],
    "buttons": [
      "Add field",
      "Cancel",
      "Clear",
      "Move down",
      "Move up",
      "Remove field",
      "Save changes"
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
      "What a task on this pipeline collects",
      "XML tag *(required)",
      "region"
    ],
    "links": [],
    "items": []
  },
  "the dialog, for a new pipeline": {
    "requests": [
      "GET /setting.json/topics?limit=1&q="
    ],
    "headings": [
      "New registry task",
      "Fields"
    ],
    "buttons": [
      "Add field",
      "Cancel",
      "Create pipeline"
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
      "What a task on this pipeline collects"
    ],
    "links": [],
    "items": []
  },
  "the list, as a platform administrator": {
    "url": "/configuration/task-registry",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /tenant.json/listTenants",
      "GET /pipeline.json/steps/tasks",
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
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "All topics",
      "All workspaces",
      "Filter by workspace",
      "Kind",
      "Search name, code, service or topic",
      "Search tasks",
      "State"
    ],
    "links": [
      "/configuration/kafka"
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
    "url": "/configuration/task-registry",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /pipeline.json/steps/tasks",
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
        "State",
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
      "/configuration/kafka"
    ]
  },
  "the old Configuration › Pipelines address": {
    "url": "/configuration/task-registry"
  },
  "the old forms address": {
    "url": "/configuration/task-registry",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /pipeline.json/steps/tasks",
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
        "State",
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
      "/configuration/kafka"
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
