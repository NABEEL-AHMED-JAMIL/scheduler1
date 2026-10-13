// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a new task": {
    "url": "/pipelines/new",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /setting.json/topics?limit=50&q=",
      "POST /sourceTask.json/listSourceTask?limit=1000&page=1 {}"
    ],
    "headings": [
      "New pipeline",
      "Describe it to the AI Assistant",
      "Add steps yourself",
      "Copy an existing pipeline"
    ],
    "buttons": [
      "Copy it",
      "Create and add steps",
      "Open the AI Assistant"
    ],
    "columns": [],
    "fields": [
      "Name *",
      "Name of the copy",
      "Pipeline to copyChoose…Reference: CSV check and summariseUI-REVIEW Clean customers CSV check",
      "Read the daily admissions file, flag readmissions within 30 days, and keep a dataset for the dashboard.",
      "Readmission risk (daily)",
      "Topic (optional)",
      "What should it do?"
    ],
    "links": [
      "/pipelines",
      "/pipelines/new/form"
    ]
  },
  "a task's XML payload, opened in the list": {
    "requests": [
      "POST /sourceTask.json/fetchAllLinkJobsWithSourceTaskId?limit=1000&sourceTaskId=1854 {}"
    ],
    "headings": [
      "Pipelines",
      "Pipelines (2 of 2)"
    ],
    "buttons": [
      "Actions for Reference: CSV check and summarise",
      "Actions for UI-REVIEW Clean customers CSV check",
      "Cards",
      "Columns",
      "Copy",
      "Hide payload",
      "Only mine",
      "Refresh",
      "Show payload",
      "Table"
    ],
    "columns": [
      [
        "",
        "Pipeline",
        "Type",
        "Topic",
        "Registry task",
        "Storage",
        "Created by",
        "Updated by",
        "Status",
        "Actions"
      ]
    ],
    "fields": [
      "All pipelines",
      "All topics",
      "Filter by pipeline",
      "Filter by topic",
      "Search id, name, topic or pipeline",
      "Search tasks"
    ],
    "links": [
      "/pipelines",
      "/pipelines/bulk",
      "/pipelines/list",
      "/pipelines/new",
      "/pipelines/prompts",
      "/pipelines/schedules"
    ],
    "details": {
      "terms": [],
      "code": [
        "<csvCheck><inputKey>reference/input/sample.csv</inputKey><outputPrefix>reference/output</outputPrefix><maxRejectPercent>50</maxRejectPercent><requiredColumns>id,name</requiredColumns><numericColumns>amount</numericColumns><deleteInput>false</deleteInput><bucket>etl-bucket</bucket></csvCheck>"
      ]
    }
  },
  "bulk tasks": {
    "url": "/pipelines/bulk",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Bulk pipelines",
      "Import",
      "Export"
    ],
    "buttons": [
      "Download the import template",
      "Export all pipelines"
    ],
    "columns": [],
    "fields": [
      "Choose a file"
    ],
    "links": [
      "/pipelines/list"
    ]
  },
  "editing a task": {
    "url": "/pipelines/1854/edit",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /kafkaConnectionProfile.json/fetchAllProfiles",
      "GET /sourceTask.json/fetchSourceTaskWithSourceTaskId?sourceTaskId=1854",
      "GET /setting.json/taskReferences?kind=TASK_GROUP&tenantId=2924",
      "GET /setting.json/taskReferences?kind=HOME_PAGE&tenantId=2924",
      "GET /setting.json/topics?ids=11831",
      "GET /pipeline.json/definition?pipelineId=REF_CSV_CHECK_V1&tenantId=2924",
      "GET /pipeline.json/listForTopic?sourceTaskTypeId=11831",
      "GET /setting.json/topics?kafkaConnectionProfileId=1009",
      "GET /pipeline.json/steps/definition?pipelineKey=100167"
    ],
    "headings": [
      "Reference: CSV check and summarise",
      "Basics",
      "Reference: CSV check and summarise"
    ],
    "buttons": [
      "Clear",
      "Save changes"
    ],
    "columns": [],
    "fields": [
      "Daily orders import",
      "Group",
      "Home page",
      "Input CSV (relative to the workspace) *(required)",
      "Kafka connection",
      "Output prefix *(required)",
      "Pipeline name *(required)",
      "Registry task",
      "Search connections…",
      "Search groups…",
      "Search home pages…",
      "Search this connection’s topics…",
      "Search this topic’s registry tasks…",
      "Status *(required)",
      "Topic *(required)"
    ],
    "links": [
      "/pipelines",
      "/pipelines/list"
    ]
  },
  "editing a task, as a tenant user (the editor is admin-only)": {
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
  "the editor: the payload as the pipeline's fields": [
    "taskName=Reference: CSV check and summarise",
    "taskProfile=Platform Local Broker [PF] (platform default)",
    "taskType=service-1 reference worker",
    "pipeline=Reference: CSV check and summarise (REF_CSV_CHECK_V1)",
    "group=",
    "homePage=",
    "taskStatus=Active",
    "ff-|inputKey=reference/input/sample.csv",
    "ff-|outputPrefix=reference/output"
  ],
  "the editor: the raw XML payload, for a pipeline without a definition": {
    "headings": [
      "Reference: CSV check and summarise",
      "Basics",
      "Payload"
    ],
    "buttons": [
      "Clear",
      "Save changes"
    ],
    "columns": [],
    "fields": [
      "<pipeline>...</pipeline>",
      "Daily orders import",
      "Group",
      "Home page",
      "Kafka connection",
      "Pipeline name *(required)",
      "Registry task",
      "Search connections…",
      "Search groups…",
      "Search home pages…",
      "Search this connection’s topics…",
      "Search this topic’s registry tasks…",
      "Status *(required)",
      "Topic *(required)",
      "XML configuration *(required)"
    ],
    "links": [
      "/pipelines",
      "/pipelines/list"
    ],
    "values": [
      "taskName=Reference: CSV check and summarise",
      "taskProfile=Platform Local Broker [PF] (platform default)",
      "taskType=service-1 reference worker",
      "pipeline=Reference: CSV check and summarise (REF_CSV_CHECK_V1)",
      "group=",
      "homePage=",
      "taskStatus=Active",
      "payload=<csvCheck><inputKey>reference/input/sample.csv</inputKey><outputPrefix>reference/output</outputPrefix><maxRejectPercent>50</maxRejectPercent><requiredColumns>id,name</requiredColumns><numericColumns>amount</numericColumns><deleteInput>false</deleteInput><bucket>etl-bucket</bucket></csvCheck>"
    ]
  },
  "the list, as a tenant user with five pages": {
    "url": "/pipelines/list",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "POST /sourceTask.json/listSourceTask?limit=1000 {}"
    ],
    "headings": [
      "Pipelines",
      "Pipelines (2 of 2)"
    ],
    "buttons": [
      "Cards",
      "Columns",
      "Only mine",
      "Refresh",
      "Show payload",
      "Table"
    ],
    "columns": [
      [
        "",
        "Pipeline",
        "Type",
        "Topic",
        "Registry task",
        "Storage",
        "Created by",
        "Updated by",
        "Status",
        "Actions"
      ]
    ],
    "fields": [
      "All pipelines",
      "All topics",
      "Filter by pipeline",
      "Filter by topic",
      "Search id, name, topic or pipeline",
      "Search tasks"
    ],
    "links": [
      "/pipelines",
      "/pipelines/list",
      "/pipelines/schedules"
    ]
  },
  "the list, as a workspace administrator": {
    "url": "/pipelines/list",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "POST /sourceTask.json/listSourceTask?limit=1000 {}"
    ],
    "headings": [
      "Pipelines",
      "Pipelines (2 of 2)"
    ],
    "buttons": [
      "Actions for Reference: CSV check and summarise",
      "Actions for UI-REVIEW Clean customers CSV check",
      "Cards",
      "Columns",
      "Only mine",
      "Refresh",
      "Show payload",
      "Table"
    ],
    "columns": [
      [
        "",
        "Pipeline",
        "Type",
        "Topic",
        "Registry task",
        "Storage",
        "Created by",
        "Updated by",
        "Status",
        "Actions"
      ]
    ],
    "fields": [
      "All pipelines",
      "All topics",
      "Filter by pipeline",
      "Filter by topic",
      "Search id, name, topic or pipeline",
      "Search tasks"
    ],
    "links": [
      "/pipelines",
      "/pipelines/bulk",
      "/pipelines/list",
      "/pipelines/new",
      "/pipelines/prompts",
      "/pipelines/schedules"
    ]
  },
  "the row menu, as a workspace administrator": {
    "headings": [],
    "buttons": [
      "Delete In use · 1",
      "Duplicate",
      "Edit"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/pipelines/1854/edit"
    ],
    "items": [
      "Edit",
      "Duplicate",
      "Delete In use · 1"
    ]
  }
};
