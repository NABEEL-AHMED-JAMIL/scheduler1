// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "the AI step panel, for a pipeline with an AI step": {
    "dialogFields": [
      "Default value",
      "Description",
      "F768926",
      "First season",
      "Help text",
      "Hurricane season collection",
      "Label *(required)",
      "Name *(required)",
      "Nested under",
      "Pipeline ID *(required)",
      "Required",
      "Search topics…",
      "Shown under the field",
      "Status",
      "Topic *(required)",
      "Type",
      "What a task on this pipeline collects",
      "XML tag *(required)",
      "start_year"
    ],
    "requests": [
      "GET /aiPrompt.json/list"
    ],
    "headings": [
      "Edit pipeline",
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
      "F768926",
      "First season",
      "Help text",
      "Hurricane season collection",
      "Label *(required)",
      "Name *(required)",
      "Nested under",
      "Pipeline ID *(required)",
      "Prompt",
      "Required",
      "Search active prompts…",
      "Search topics…",
      "Shown under the field",
      "Status",
      "Topic *(required)",
      "Type",
      "What a task on this pipeline collects",
      "XML tag *(required)",
      "start_year"
    ],
    "links": [],
    "items": []
  },
  "the dialog, editing a pipeline": {
    "requests": [
      "GET /pipeline.json/fields?pipelineKey=100167"
    ],
    "headings": [
      "Edit pipeline",
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
      "F768926",
      "First season",
      "Help text",
      "Hurricane season collection",
      "Label *(required)",
      "Name *(required)",
      "Nested under",
      "Pipeline ID *(required)",
      "Required",
      "Search topics…",
      "Shown under the field",
      "Status",
      "Topic *(required)",
      "Type",
      "What a task on this pipeline collects",
      "XML tag *(required)",
      "start_year"
    ],
    "links": [],
    "items": []
  },
  "the dialog, for a new pipeline": {
    "requests": [],
    "headings": [
      "New pipeline",
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
      "F768926",
      "Hurricane season collection",
      "Name *(required)",
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
      "GET /pipeline.json/list?limit=50&page=1"
    ],
    "headings": [
      "Task Registry",
      "Pipelines (1 of 1)"
    ],
    "buttons": [
      "Actions for Reference: CSV check and summarise",
      "Cards",
      "Columns",
      "New pipeline",
      "Only mine",
      "Refresh",
      "Table"
    ],
    "columns": [
      [
        "Pipeline",
        "Topic",
        "Fields",
        "Created by",
        "Updated by",
        "Status",
        "Actions"
      ]
    ],
    "fields": [
      "All topics",
      "All workspaces",
      "Filter by workspace",
      "Search name, topic or pipeline",
      "Search pipelines",
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
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /pipeline.json/list?limit=50&page=1"
    ],
    "headings": [
      "Task Registry",
      "Pipelines (1 of 1)"
    ],
    "buttons": [
      "Actions for Reference: CSV check and summarise",
      "Cards",
      "Columns",
      "New pipeline",
      "Only mine",
      "Refresh",
      "Table"
    ],
    "columns": [
      [
        "Pipeline",
        "Topic",
        "Fields",
        "Created by",
        "Updated by",
        "Status",
        "Actions"
      ]
    ],
    "fields": [
      "All topics",
      "Search name, topic or pipeline",
      "Search pipelines",
      "State"
    ],
    "links": [
      "/configuration/kafka"
    ]
  },
  "the old forms address": {
    "url": "/configuration/task-registry",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /pipeline.json/list?limit=50&page=1"
    ],
    "headings": [
      "Task Registry",
      "Pipelines (1 of 1)"
    ],
    "buttons": [
      "Actions for Reference: CSV check and summarise",
      "Cards",
      "Columns",
      "New pipeline",
      "Only mine",
      "Refresh",
      "Table"
    ],
    "columns": [
      [
        "Pipeline",
        "Topic",
        "Fields",
        "Created by",
        "Updated by",
        "Status",
        "Actions"
      ]
    ],
    "fields": [
      "All topics",
      "Search name, topic or pipeline",
      "Search pipelines",
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
