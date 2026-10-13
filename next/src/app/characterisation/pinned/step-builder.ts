// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "JSON": {
    "headings": [
      "UI-CHECK step engine task 0928",
      "Basics",
      "Payload"
    ],
    "buttons": [
      "1. Source: Set. Sample rows",
      "2. Steps: Set. 2 steps in 2 stages",
      "3. Review: Optional. Not required: results are final when the run ends",
      "4. Outputs: Missing. Add a Write step: a file, a bucket, a PDF or a webhook",
      "5. Schedule & triggers: Set. 1 schedule · 1 active",
      "Clear",
      "Details",
      "History",
      "JSON",
      "Run now",
      "Save",
      "Schedule",
      "Schedules",
      "Settings",
      "Steps",
      "Validate",
      "YAML"
    ],
    "columns": [],
    "fields": [
      "<pipeline>...</pipeline>",
      "Daily orders import",
      "Definition as JSON",
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
      "UI-CHECK step engine task 0928",
      "Basics",
      "Payload",
      "Source",
      "Run parameters",
      "Run defaults",
      "Data sensitivity",
      "Review"
    ],
    "buttons": [
      "1. Source: Set. Sample rows",
      "2. Steps: Set. 2 steps in 2 stages",
      "3. Review: Optional. Not required: results are final when the run ends",
      "4. Outputs: Missing. Add a Write step: a file, a bucket, a PDF or a webhook",
      "5. Schedule & triggers: Set. 1 schedule · 1 active",
      "Add a parameter",
      "Clear",
      "Details",
      "History",
      "JSON",
      "Run now",
      "Save",
      "Schedule",
      "Schedules",
      "Settings",
      "Steps",
      "Validate",
      "YAML"
    ],
    "columns": [],
    "fields": [
      "<pipeline>...</pipeline>",
      "Daily orders import",
      "Data sensitivity",
      "Default timeout (seconds)",
      "Group",
      "Home page",
      "If a step fails",
      "Individual review",
      "Kafka connection",
      "Keep datasets (hours)",
      "Our team",
      "Pipeline name *(required)",
      "Registry task",
      "Requires individual review (never approved or rejected in bulk)",
      "Results need review by",
      "Search connections…",
      "Search groups…",
      "Search home pages…",
      "Search this connection’s topics…",
      "Search this topic’s registry tasks…",
      "Source",
      "Status *(required)",
      "The customer (through the API)",
      "Topic *(required)",
      "XML configuration *(required)"
    ],
    "links": [
      "/pipelines",
      "/settings/task-registry",
      "/workflows/designer?key=pipeline-run-review",
      "/workflows/designer?key=pipeline-step-approval"
    ]
  },
  "Validate, with a problem on a step": {
    "requests": [
      "POST /pipeline.json/steps/validate {format,text}"
    ],
    "headings": [
      "UI-CHECK step engine task 0928",
      "Basics",
      "Payload",
      "Steps"
    ],
    "buttons": [
      "1. Source: Set. Sample rows",
      "2. Steps: Set. 2 steps in 2 stages",
      "3. Review: Optional. Not required: results are final when the run ends",
      "4. Outputs: Missing. Add a Write step: a file, a bucket, a PDF or a webhook",
      "5. Schedule & triggers: Set. 1 schedule · 1 active",
      "Clear",
      "Delete step keep",
      "Delete step read",
      "Details",
      "Edit step keep",
      "Edit step read",
      "Flow",
      "History",
      "JSON",
      "List",
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
      "Schedule",
      "Schedules",
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
      "/pipelines"
    ],
    "problems": [
      "keep"
    ]
  },
  "YAML": {
    "headings": [
      "UI-CHECK step engine task 0928",
      "Basics",
      "Payload"
    ],
    "buttons": [
      "1. Source: Set. Sample rows",
      "2. Steps: Set. 2 steps in 2 stages",
      "3. Review: Optional. Not required: results are final when the run ends",
      "4. Outputs: Missing. Add a Write step: a file, a bucket, a PDF or a webhook",
      "5. Schedule & triggers: Set. 1 schedule · 1 active",
      "Clear",
      "Details",
      "History",
      "JSON",
      "Run now",
      "Save",
      "Schedule",
      "Schedules",
      "Settings",
      "Steps",
      "Validate",
      "YAML"
    ],
    "columns": [],
    "fields": [
      "<pipeline>...</pipeline>",
      "Daily orders import",
      "Definition as YAML",
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
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /kafkaConnectionProfile.json/fetchAllProfiles",
      "GET /sourceTask.json/fetchSourceTaskWithSourceTaskId?sourceTaskId=1854",
      "POST /sourceTask.json/fetchAllLinkJobsWithSourceTaskId?limit=1000&sourceTaskId=1854 {}",
      "GET /setting.json/taskReferences?kind=TASK_GROUP&tenantId=2924",
      "GET /setting.json/taskReferences?kind=HOME_PAGE&tenantId=2924",
      "GET /setting.json/topics?ids=11831",
      "GET /pipeline.json/definition?pipelineId=REF_CSV_CHECK_V1&tenantId=2924",
      "GET /pipeline.json/listForTopic?sourceTaskTypeId=11831",
      "GET /setting.json/topics?kafkaConnectionProfileId=1009",
      "GET /pipeline.json/steps/definition?pipelineKey=100167",
      "GET /pipeline.json/steps/tasks"
    ],
    "headings": [
      "UI-CHECK step engine task 0928",
      "Basics",
      "Payload",
      "Steps"
    ],
    "buttons": [
      "1. Source: Set. Its worker reads the topic (legacy step)",
      "2. Steps: Missing. None yet: it runs as its legacy step",
      "3. Review: Optional. Not required: results are final when the run ends",
      "4. Outputs: Optional. Written by its worker",
      "5. Schedule & triggers: Set. 1 schedule · 1 active",
      "Clear",
      "Details",
      "Flow",
      "History",
      "JSON",
      "List",
      "Open step legacy",
      "Run now",
      "Save",
      "Schedule",
      "Schedules",
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
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /kafkaConnectionProfile.json/fetchAllProfiles",
      "GET /sourceTask.json/fetchSourceTaskWithSourceTaskId?sourceTaskId=1864",
      "POST /sourceTask.json/fetchAllLinkJobsWithSourceTaskId?limit=1000&sourceTaskId=1864 {}",
      "GET /setting.json/taskReferences?kind=TASK_GROUP&tenantId=2924",
      "GET /setting.json/taskReferences?kind=HOME_PAGE&tenantId=2924",
      "GET /setting.json/topics?ids=11831",
      "GET /pipeline.json/definition?pipelineId=UI_CHECK_STEPS_0928&tenantId=2924",
      "GET /pipeline.json/listForTopic?sourceTaskTypeId=11831",
      "GET /setting.json/topics?kafkaConnectionProfileId=1009",
      "GET /pipeline.json/steps/definition?pipelineKey=100175",
      "GET /pipeline.json/steps/tasks"
    ],
    "headings": [
      "UI-CHECK step engine task 0928",
      "Basics",
      "Payload",
      "Steps"
    ],
    "buttons": [
      "1. Source: Set. Sample rows",
      "2. Steps: Set. 2 steps in 2 stages",
      "3. Review: Optional. Not required: results are final when the run ends",
      "4. Outputs: Missing. Add a Write step: a file, a bucket, a PDF or a webhook",
      "5. Schedule & triggers: Set. 1 schedule · 1 active",
      "Clear",
      "Delete step keep",
      "Delete step read",
      "Details",
      "Edit step keep",
      "Edit step read",
      "Flow",
      "History",
      "JSON",
      "List",
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
      "Schedule",
      "Schedules",
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
      "/pipelines"
    ]
  },
  "a step in the side panel": {
    "headings": [
      "Step 2 · keep",
      "Task settings",
      "How it runs"
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
      "UI-CHECK step engine task 0928",
      "Basics",
      "Payload",
      "Steps"
    ],
    "buttons": [
      "1. Source: Set. Sample rows",
      "2. Steps: Set. 2 steps in 2 stages",
      "3. Review: Optional. Not required: results are final when the run ends",
      "4. Outputs: Missing. Add a Write step: a file, a bucket, a PDF or a webhook",
      "5. Schedule & triggers: Set. 1 schedule · 1 active",
      "Clear",
      "Delete step keep",
      "Delete step read",
      "Details",
      "Edit step keep",
      "Edit step read",
      "Flow",
      "History",
      "JSON",
      "List",
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
      "Schedule",
      "Schedules",
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
      "/pipelines"
    ],
    "hidden": [
      "app-step-builder"
    ]
  }
};
