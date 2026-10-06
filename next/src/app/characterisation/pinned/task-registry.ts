// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "Edit pipeline from a Legacy row's panel opens the pipeline dialog": {
    "requests": [],
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
  "Legacy only": {
    "rows": [
      "Reference: CSV check and summariseREF_CSV_CHECK_V1service-1 reference pipeline. Reads a CSV, validates it, writes summary.json and rejects.csv. | Legacy | workerservice-1 reference worker | Payload: 7 fields → Worker | On"
    ],
    "options": [
      "All kinds (17)",
      "Read (5)",
      "Process (7)",
      "Output (4)",
      "Legacy (1)"
    ]
  },
  "a Legacy row in the side panel": {
    "requests": [
      "GET /pipeline.json/fields?pipelineKey=100167"
    ],
    "headings": [
      "Reference: CSV check and summarise",
      "Pipeline",
      "Settings",
      "Input",
      "Output",
      "How it runs"
    ],
    "buttons": [
      "Close",
      "Edit registry task"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/configuration/kafka"
    ],
    "items": [],
    "terms": [
      "Pipeline ID: REF_CSV_CHECK_V1",
      "Topic: service-1 reference workeretl.reference",
      "Status: Active",
      "Created by: Casey Baseline",
      "Service: worker",
      "Runs: By its worker, outside the step engine",
      "Retry: Once, no retry",
      "Timeout: No limit",
      "Who may add it: Any member",
      "AI tool name: —"
    ],
    "code": [],
    "settings": [
      "pipelineId"
    ],
    "state": "On",
    "switchable": false
  },
  "a step task in the side panel, as a workspace administrator": {
    "requests": [],
    "headings": [
      "Filter",
      "In this workspace",
      "Settings",
      "Input",
      "Output",
      "How it runs"
    ],
    "buttons": [
      "Close"
    ],
    "columns": [],
    "fields": [
      "Switch Filter on in this workspace"
    ],
    "links": [],
    "items": [],
    "terms": [
      "Service: core",
      "Runs: In the step engine",
      "Retry: Once, no retry",
      "Timeout: No limit",
      "Who may add it: Any member",
      "AI tool name: —"
    ],
    "code": [],
    "settings": [
      "match",
      "conditions",
      "column",
      "operator",
      "value",
      "values",
      "ignoreCase"
    ],
    "state": "On",
    "switchable": true
  },
  "an unavailable task in the side panel": {
    "terms": [
      "Service: integration-service",
      "Runs: In the step engine",
      "Retry: Once, no retry",
      "Timeout: 15 min",
      "Who may add it: Workspace administrators",
      "AI tool name: —"
    ],
    "code": [],
    "settings": [
      "connectionId",
      "table",
      "mode",
      "keyColumns",
      "columns"
    ],
    "state": "Unavailableintegration-service has no database write path; MIG-229's connections are read-only (process.pipeline.integration.database-write is off)Show all",
    "switchable": false
  },
  "switching a task off from its panel": {
    "requests": [
      "POST /pipeline.json/steps/tasks/enabled {code,enabled}"
    ],
    "terms": [
      "Service: core",
      "Runs: In the step engine",
      "Retry: Once, no retry",
      "Timeout: No limit",
      "Who may add it: Any member",
      "AI tool name: —"
    ],
    "code": [],
    "settings": [
      "with",
      "on",
      "left",
      "right",
      "type",
      "prefix"
    ],
    "state": "OffSwitched hereSwitched off in this workspace.",
    "switchable": true,
    "buttons": [
      "Close",
      "Put Join back to its default"
    ],
    "row": "JoinjoinJoins the rows with an earlier step's output on equal keys (inner or left). | Process | core | Rows → Rows | OffSwitched hereSwitched off in this workspace."
  },
  "the registry when Core cannot read it": {
    "rows": [
      "Reference: CSV check and summariseREF_CSV_CHECK_V1service-1 reference pipeline. Reads a CSV, validates it, writes summary.json and rejects.csv. | Legacy | workerservice-1 reference worker | Payload: 7 fields → Worker | On"
    ],
    "alert": "The step tasks could not be read: The Task Registry is not available. The pipelines are listed as usual.Try again"
  },
  "the registry, as a platform administrator": {
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
      "Tasks (17 of 17)"
    ],
    "buttons": [
      "Actions for Reference: CSV check and summarise",
      "Columns",
      "New registry task",
      "Only mine",
      "Open Aggregate",
      "Open Enrich",
      "Open Filter",
      "Open Join",
      "Open Read API",
      "Open Read CSV/JSON/Parquet",
      "Open Read Database",
      "Open Read S3",
      "Open Reference: CSV check and summarise",
      "Open Sample rows",
      "Open Save File",
      "Open Select columns",
      "Open Send Notification",
      "Open Transform",
      "Open Upload to bucket",
      "Open Validate",
      "Open Write Database",
      "Refresh",
      "Show all 124 characters of Why it is unavailable",
      "Show all 127 characters of Why it is unavailable",
      "Show all 136 characters of Why it is unavailable"
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
    ],
    "rows": [
      "Read APIread_apiRuns a saved API request (integration-service's runner) and takes its answer as rows. | Read | integration-service | None → Rows | Unavailableintegration-service's internal pipeline endpoints are not deployed yet (process.pipeline.integration.internal-endpoints is off)Show all",
      "Read Databaseread_databaseRuns a read-only query on a workspace database connection (integration-service) and takes its rows. | Read | integration-service | None → Rows | Unavailableintegration-service's internal pipeline endpoints are not deployed yet (process.pipeline.integration.internal-endpoints is off)Show all",
      "Read CSV/JSON/Parquetread_fileReads one file of a workspace bucket — CSV, JSON, JSON Lines or Parquet — as rows (storage-service). | Read | storage-service | None → Rows | Unavailablestorage-service does not accept Core's pipeline caller (CORE_PIPELINES) yet (process.pipeline.storage.trusted-caller is off)Show all",
      "Read S3read_s3Lists the objects under a prefix of a workspace bucket, or reads all of them as rows (storage-service). | Read | storage-service | None → Rows | Unavailablestorage-service does not accept Core's pipeline caller (CORE_PIPELINES) yet (process.pipeline.storage.trusted-caller is off)Show all",
      "Sample rowssampleRows written in the step itself: a sample to build and test a pipeline on. | Read | core | None → Rows | On",
      "AggregateaggregateGroups rows by columns and computes count, count_distinct, sum, avg, min, max, first or last. | Process | core | Rows → Rows | On",
      "EnrichenrichCalls a saved API request per row (integration-service's runner) and adds fields of its answer as columns. | Process | integration-service | Rows → Rows | Unavailableintegration-service's internal pipeline endpoints are not deployed yet (process.pipeline.integration.internal-endpoints is off)Show all",
      "FilterfilterKeeps the rows that meet all (or any) of its conditions. | Process | core | Rows → Rows | On",
      "JoinjoinJoins the rows with an earlier step's output on equal keys (inner or left). | Process | core | Rows → Rows | On",
      "Select columnsselectKeeps the columns it names, in that order, optionally renamed. | Process | core | Rows → Rows | On",
      "TransformtransformMaps each row to new columns: copy, constant, concat, upper/lower/trim, cast, coalesce, replace. | Process | core | Rows → Rows | On",
      "ValidatevalidateChecks each row against a data contract (integration-service): fail, drop or flag the rows that do not hold. | Process | integration-service | Rows → Rows | Unavailableintegration-service's internal pipeline endpoints are not deployed yet (process.pipeline.integration.internal-endpoints is off)Show all",
      "Save Filesave_fileKeeps the rows as a CSV, JSON or JSON Lines file with the run. | Output | core | Rows → Rows | On",
      "Send Notificationsend_notificationSends a notice about the run to the job's owner, the workspace's admins, everyone, or named people. | Output | notifications-service | Rows → Rows | On",
      "Upload to bucketupload_bucketWrites the rows as a CSV, JSON or JSON Lines object in a workspace bucket (storage-service). | Output | storage-service | Rows → Rows | Unavailablestorage-service does not accept Core's pipeline caller (CORE_PIPELINES) yet (process.pipeline.storage.trusted-caller is off)Show all",
      "Write Databasewrite_databaseInserts or upserts the rows into a table of a workspace database connection (integration-service). Off by default. | Output | integration-service | Rows → Rows | Unavailableintegration-service has no database write path; MIG-229's connections are read-only (process.pipeline.integration.database-write is off)Show all",
      "Reference: CSV check and summariseREF_CSV_CHECK_V1service-1 reference pipeline. Reads a CSV, validates it, writes summary.json and rejects.csv. | Legacy | workerservice-1 reference worker | Payload: 7 fields → Worker | On"
    ]
  },
  "the registry, as a tenant user (admin-only)": {
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
  "the registry, as a workspace administrator": {
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
      "Tasks (17 of 17)"
    ],
    "buttons": [
      "Actions for Reference: CSV check and summarise",
      "Columns",
      "New registry task",
      "Only mine",
      "Open Aggregate",
      "Open Enrich",
      "Open Filter",
      "Open Join",
      "Open Read API",
      "Open Read CSV/JSON/Parquet",
      "Open Read Database",
      "Open Read S3",
      "Open Reference: CSV check and summarise",
      "Open Sample rows",
      "Open Save File",
      "Open Select columns",
      "Open Send Notification",
      "Open Transform",
      "Open Upload to bucket",
      "Open Validate",
      "Open Write Database",
      "Refresh",
      "Show all 124 characters of Why it is unavailable",
      "Show all 127 characters of Why it is unavailable",
      "Show all 136 characters of Why it is unavailable"
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
    ],
    "rows": [
      "Read APIread_apiRuns a saved API request (integration-service's runner) and takes its answer as rows. | Read | integration-service | None → Rows | Unavailableintegration-service's internal pipeline endpoints are not deployed yet (process.pipeline.integration.internal-endpoints is off)Show all",
      "Read Databaseread_databaseRuns a read-only query on a workspace database connection (integration-service) and takes its rows. | Read | integration-service | None → Rows | Unavailableintegration-service's internal pipeline endpoints are not deployed yet (process.pipeline.integration.internal-endpoints is off)Show all",
      "Read CSV/JSON/Parquetread_fileReads one file of a workspace bucket — CSV, JSON, JSON Lines or Parquet — as rows (storage-service). | Read | storage-service | None → Rows | Unavailablestorage-service does not accept Core's pipeline caller (CORE_PIPELINES) yet (process.pipeline.storage.trusted-caller is off)Show all",
      "Read S3read_s3Lists the objects under a prefix of a workspace bucket, or reads all of them as rows (storage-service). | Read | storage-service | None → Rows | Unavailablestorage-service does not accept Core's pipeline caller (CORE_PIPELINES) yet (process.pipeline.storage.trusted-caller is off)Show all",
      "Sample rowssampleRows written in the step itself: a sample to build and test a pipeline on. | Read | core | None → Rows | On",
      "AggregateaggregateGroups rows by columns and computes count, count_distinct, sum, avg, min, max, first or last. | Process | core | Rows → Rows | On",
      "EnrichenrichCalls a saved API request per row (integration-service's runner) and adds fields of its answer as columns. | Process | integration-service | Rows → Rows | Unavailableintegration-service's internal pipeline endpoints are not deployed yet (process.pipeline.integration.internal-endpoints is off)Show all",
      "FilterfilterKeeps the rows that meet all (or any) of its conditions. | Process | core | Rows → Rows | On",
      "JoinjoinJoins the rows with an earlier step's output on equal keys (inner or left). | Process | core | Rows → Rows | On",
      "Select columnsselectKeeps the columns it names, in that order, optionally renamed. | Process | core | Rows → Rows | On",
      "TransformtransformMaps each row to new columns: copy, constant, concat, upper/lower/trim, cast, coalesce, replace. | Process | core | Rows → Rows | On",
      "ValidatevalidateChecks each row against a data contract (integration-service): fail, drop or flag the rows that do not hold. | Process | integration-service | Rows → Rows | Unavailableintegration-service's internal pipeline endpoints are not deployed yet (process.pipeline.integration.internal-endpoints is off)Show all",
      "Save Filesave_fileKeeps the rows as a CSV, JSON or JSON Lines file with the run. | Output | core | Rows → Rows | On",
      "Send Notificationsend_notificationSends a notice about the run to the job's owner, the workspace's admins, everyone, or named people. | Output | notifications-service | Rows → Rows | On",
      "Upload to bucketupload_bucketWrites the rows as a CSV, JSON or JSON Lines object in a workspace bucket (storage-service). | Output | storage-service | Rows → Rows | Unavailablestorage-service does not accept Core's pipeline caller (CORE_PIPELINES) yet (process.pipeline.storage.trusted-caller is off)Show all",
      "Write Databasewrite_databaseInserts or upserts the rows into a table of a workspace database connection (integration-service). Off by default. | Output | integration-service | Rows → Rows | Unavailableintegration-service has no database write path; MIG-229's connections are read-only (process.pipeline.integration.database-write is off)Show all",
      "Reference: CSV check and summariseREF_CSV_CHECK_V1service-1 reference pipeline. Reads a CSV, validates it, writes summary.json and rejects.csv. | Legacy | workerservice-1 reference worker | Payload: 7 fields → Worker | On"
    ]
  }
};
