// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "JSON": {
    "headings": [
      "Edit pipeline",
      "Basics",
      "Task payload"
    ],
    "buttons": [
      "Clear",
      "Details",
      "JSON",
      "Run now",
      "Save",
      "Save changes",
      "Schedule",
      "Settings",
      "Steps",
      "Test with sample",
      "Validate",
      "YAML"
    ],
    "columns": [],
    "fields": [
      "<pipeline>...</pipeline>",
      "Definition as JSON",
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
    "details": {
      "terms": [],
      "code": [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?> <pipeline> <note>MIG-230 live check</note> </pipeline>",
        "{ \"version\": 1, \"steps\": [ { \"key\": \"read\", \"task\": \"sample\", \"config\": { \"rows\": [ { \"id\": 1, \"name\": \"Ada\" }, { \"id\": 2, \"name\": \"Bo\" } ] } }, { \"key\": \"keep\", \"task\": \"select\", \"config\": { \"columns\": { \"name\": \"patient\" } } } ] }"
      ]
    }
  },
  "Settings": {
    "headings": [
      "Edit pipeline",
      "Basics",
      "Task payload",
      "Pipeline settings",
      "Tasks in this workspace",
      "Versions"
    ],
    "buttons": [
      "Clear",
      "Details",
      "JSON",
      "Run now",
      "Save",
      "Save changes",
      "Schedule",
      "Settings",
      "Show all 124 characters of Why it is unavailable",
      "Show all 127 characters of Why it is unavailable",
      "Show all 136 characters of Why it is unavailable",
      "Steps",
      "Test with sample",
      "Validate",
      "YAML"
    ],
    "columns": [
      [
        "Task",
        "Kind",
        "In this workspace",
        "Switch"
      ],
      [
        "Version",
        "Saved",
        "By"
      ]
    ],
    "fields": [
      "<pipeline>...</pipeline>",
      "Default timeout (seconds)",
      "Group",
      "Home page",
      "Hurricane Data Task",
      "If a step fails",
      "Kafka connection",
      "Keep datasets (hours)",
      "Pipeline",
      "Search connections…",
      "Search groups…",
      "Search home pages…",
      "Search this connection’s topics…",
      "Search this topic’s pipelines…",
      "Source",
      "Status *(required)",
      "Switch Aggregate on in this workspace",
      "Switch Enrich on in this workspace",
      "Switch Filter on in this workspace",
      "Switch Join on in this workspace",
      "Switch Read API on in this workspace",
      "Switch Read CSV/JSON/Parquet on in this workspace",
      "Switch Read Database on in this workspace",
      "Switch Read S3 on in this workspace",
      "Switch Sample rows on in this workspace",
      "Switch Save File on in this workspace",
      "Switch Select columns on in this workspace",
      "Switch Send Notification on in this workspace",
      "Switch Transform on in this workspace",
      "Switch Upload to bucket on in this workspace",
      "Switch Validate on in this workspace",
      "Switch Write Database on in this workspace",
      "Task name *(required)",
      "Topic *(required)",
      "XML configuration *(required)"
    ],
    "links": [
      "/pipelines"
    ]
  },
  "Validate, with a problem on a step": {
    "requests": [
      "POST /pipeline.json/steps/validate {format,text}"
    ],
    "headings": [
      "Edit pipeline",
      "Basics",
      "Task payload",
      "Steps"
    ],
    "buttons": [
      "Clear",
      "Delete step keep",
      "Delete step read",
      "Details",
      "Edit step keep",
      "Edit step read",
      "JSON",
      "Move keep down",
      "Move keep up",
      "Move read down",
      "Move read up",
      "Open step keep",
      "Open step read",
      "Reorder keep: drag, or use the arrow keys",
      "Reorder read: drag, or use the arrow keys",
      "Run now",
      "Save",
      "Save changes",
      "Schedule",
      "Settings",
      "Steps",
      "Test with sample",
      "Validate",
      "YAML"
    ],
    "columns": [],
    "fields": [
      "<pipeline>...</pipeline>",
      "Add step",
      "Add step from the Task Registry…",
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
    "problems": [
      "keep"
    ]
  },
  "YAML": {
    "headings": [
      "Edit pipeline",
      "Basics",
      "Task payload"
    ],
    "buttons": [
      "Clear",
      "Details",
      "JSON",
      "Run now",
      "Save",
      "Save changes",
      "Schedule",
      "Settings",
      "Steps",
      "Test with sample",
      "Validate",
      "YAML"
    ],
    "columns": [],
    "fields": [
      "<pipeline>...</pipeline>",
      "Definition as YAML",
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
    "details": {
      "terms": [],
      "code": [
        "<?xml version=\"1.0\" encoding=\"UTF-8\" standalone=\"no\"?> <pipeline> <note>MIG-230 live check</note> </pipeline>",
        "version: 1 steps: - key: read task: sample config: rows: - id: 1 name: Ada - id: 2 name: Bo - key: keep task: select config: columns: name: patient"
      ]
    }
  },
  "a legacy pipeline asked for its steps": {
    "url": "/pipelines/1854/edit?tab=steps",
    "requests": [
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
      "GET /pipeline.json/steps/definition?pipelineKey=100167",
      "GET /pipeline.json/steps/tasks",
      "POST /sourceTask.json/fetchAllLinkJobsWithSourceTaskId?limit=1000&sourceTaskId=1854 {}"
    ],
    "headings": [
      "Edit pipeline",
      "Basics",
      "Task payload",
      "Steps"
    ],
    "buttons": [
      "Clear",
      "Details",
      "JSON",
      "Open step legacy",
      "Run now",
      "Save",
      "Save changes",
      "Schedule",
      "Settings",
      "Steps",
      "Test with sample",
      "Validate",
      "YAML"
    ],
    "columns": [],
    "fields": [
      "<pipeline>...</pipeline>",
      "Add step",
      "Add step from the Task Registry…",
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
    ]
  },
  "a new schedule for the pipeline": {
    "url": "/pipelines/schedules/new?taskDetailId=1864",
    "task": "UI-CHECK step engine task 0928"
  },
  "a pipeline with steps opens on them": {
    "url": "/pipelines/1864/edit",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /kafkaConnectionProfile.json/fetchAllProfiles",
      "GET /sourceTask.json/fetchSourceTaskWithSourceTaskId?sourceTaskId=1864",
      "GET /setting.json/taskReferences?kind=TASK_GROUP&tenantId=2924",
      "GET /setting.json/taskReferences?kind=HOME_PAGE&tenantId=2924",
      "GET /setting.json/topics?ids=11831",
      "GET /pipeline.json/definition?pipelineId=UI_CHECK_STEPS_0928&tenantId=2924",
      "GET /pipeline.json/listForTopic?sourceTaskTypeId=11831",
      "GET /setting.json/topics?kafkaConnectionProfileId=1009",
      "GET /pipeline.json/steps/definition?pipelineKey=100175",
      "GET /pipeline.json/steps/tasks",
      "POST /sourceTask.json/fetchAllLinkJobsWithSourceTaskId?limit=1000&sourceTaskId=1864 {}"
    ],
    "headings": [
      "Edit pipeline",
      "Basics",
      "Task payload",
      "Steps"
    ],
    "buttons": [
      "Clear",
      "Delete step keep",
      "Delete step read",
      "Details",
      "Edit step keep",
      "Edit step read",
      "JSON",
      "Move keep down",
      "Move keep up",
      "Move read down",
      "Move read up",
      "Open step keep",
      "Open step read",
      "Reorder keep: drag, or use the arrow keys",
      "Reorder read: drag, or use the arrow keys",
      "Run now",
      "Save",
      "Save changes",
      "Schedule",
      "Settings",
      "Steps",
      "Test with sample",
      "Validate",
      "YAML"
    ],
    "columns": [],
    "fields": [
      "<pipeline>...</pipeline>",
      "Add step",
      "Add step from the Task Registry…",
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
    ]
  },
  "a step in the side panel": {
    "headings": [
      "Step 2 · keep",
      "Task settings"
    ],
    "buttons": [
      "Apply",
      "Cancel",
      "Close",
      "Edit as JSON"
    ],
    "columns": [],
    "fields": [
      "Columns *(required)",
      "Fail on a missing column",
      "If it fails",
      "Key *(required)",
      "Name",
      "Reads",
      "Seconds between tries",
      "Timeout (seconds)",
      "Tries",
      "What this step does",
      "Yes"
    ],
    "links": [],
    "items": []
  },
  "its Details tab is the task form": {
    "headings": [
      "Edit pipeline",
      "Basics",
      "Task payload",
      "Steps"
    ],
    "buttons": [
      "Clear",
      "Delete step keep",
      "Delete step read",
      "Details",
      "Edit step keep",
      "Edit step read",
      "JSON",
      "Move keep down",
      "Move keep up",
      "Move read down",
      "Move read up",
      "Open step keep",
      "Open step read",
      "Reorder keep: drag, or use the arrow keys",
      "Reorder read: drag, or use the arrow keys",
      "Run now",
      "Save",
      "Save changes",
      "Schedule",
      "Settings",
      "Steps",
      "Test with sample",
      "Validate",
      "YAML"
    ],
    "columns": [],
    "fields": [
      "<pipeline>...</pipeline>",
      "Add step",
      "Add step from the Task Registry…",
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
    "hidden": [
      "app-step-builder"
    ]
  }
};
