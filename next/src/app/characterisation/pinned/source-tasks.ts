// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a new task": {
    "url": "/pipelines/new",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /kafkaConnectionProfile.json/fetchAllProfiles",
      "GET /setting.json/taskReferences?kind=TASK_GROUP",
      "GET /setting.json/taskReferences?kind=HOME_PAGE",
      "GET /setting.json/topics?kafkaConnectionProfileId=1009"
    ],
    "headings": [
      "New pipeline",
      "Basics",
      "Task payload"
    ],
    "buttons": [
      "Clear",
      "Create task"
    ],
    "columns": [],
    "fields": [
      "<pipeline>...</pipeline>",
      "Group",
      "Home page",
      "Hurricane Data Task",
      "Kafka connection",
      "Pick a topic first",
      "Pipeline",
      "Search connections…",
      "Search groups…",
      "Search home pages…",
      "Search this connection’s topics…",
      "Status *(required)",
      "Task name *(required)",
      "Topic *(required)",
      "XML configuration *(required)"
    ],
    "links": [
      "/pipelines"
    ]
  },
  "a task's XML payload, opened in the list": {
    "requests": [
      "POST /sourceTask.json/fetchAllLinkJobsWithSourceTaskId?limit=1000&sourceTaskId=1854 {}"
    ],
    "headings": [
      "Pipelines",
      "Tasks (2 of 2)"
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
        "Task",
        "Type",
        "Topic",
        "Pipeline",
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
      "/pipelines/bulk",
      "/pipelines/new"
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
      "/pipelines"
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
      "Edit pipeline",
      "Basics",
      "Reference: CSV check and summarise"
    ],
    "buttons": [
      "Clear",
      "Save changes"
    ],
    "columns": [],
    "fields": [
      "Group",
      "Home page",
      "Hurricane Data Task",
      "Input CSV (relative to the workspace) *(required)",
      "Kafka connection",
      "Output prefix *(required)",
      "Pipeline",
      "Search connections…",
      "Search groups…",
      "Search home pages…",
      "Search this connection’s topics…",
      "Search this topic’s pipelines…",
      "Status *(required)",
      "Task name *(required)",
      "Topic *(required)"
    ],
    "links": [
      "/pipelines"
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
      "Edit pipeline",
      "Basics",
      "Task payload"
    ],
    "buttons": [
      "Clear",
      "Save changes"
    ],
    "columns": [],
    "fields": [
      "<pipeline>...</pipeline>",
      "Group",
      "Home page",
      "Hurricane Data Task",
      "Kafka connection",
      "Pipeline",
      "Search connections…",
      "Search groups…",
      "Search home pages…",
      "Search this connection’s topics…",
      "Search this topic’s pipelines…",
      "Status *(required)",
      "Task name *(required)",
      "Topic *(required)",
      "XML configuration *(required)"
    ],
    "links": [
      "/pipelines"
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
    "url": "/pipelines",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "POST /sourceTask.json/listSourceTask?limit=1000 {}"
    ],
    "headings": [
      "Pipelines",
      "Tasks (2 of 2)"
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
        "Task",
        "Type",
        "Topic",
        "Pipeline",
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
    "links": []
  },
  "the list, as a workspace administrator": {
    "url": "/pipelines",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "POST /sourceTask.json/listSourceTask?limit=1000 {}"
    ],
    "headings": [
      "Pipelines",
      "Tasks (2 of 2)"
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
        "Task",
        "Type",
        "Topic",
        "Pipeline",
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
      "/pipelines/bulk",
      "/pipelines/new"
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
