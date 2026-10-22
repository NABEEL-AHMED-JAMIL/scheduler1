// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a job's details, with its schedule": {
    "requests": [
      "GET /sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=2833&limit=25",
      "GET /sourceJob.json/inboxTrigger?jobId=2833",
      "GET /sourceTask.json/fetchSourceTaskWithSourceTaskId?sourceTaskId=1854"
    ],
    "headings": [
      "Schedules & triggers",
      "Schedules (2 of 2)",
      "Pipeline payload",
      "Recent runs"
    ],
    "buttons": [
      "40 sec#7331",
      "Actions for Reference CSV check (e2e)",
      "Actions for UI-REVIEW Clean customers (manual, notify on completion)",
      "Change",
      "Columns",
      "Copy",
      "Hide details for Reference CSV check (e2e)",
      "Only mine",
      "Refresh",
      "Show details for UI-REVIEW Clean customers (manual, notify on completion)"
    ],
    "columns": [
      [
        "",
        "",
        "Schedule",
        "Pipeline",
        "Mode",
        "When",
        "Created",
        "Created by",
        "Updated by",
        "Next / last run",
        "Run status",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Filter by execution type",
      "Filter by run status",
      "Search id, schedule or pipeline",
      "Search schedules",
      "Select Reference CSV check (e2e)",
      "Select UI-REVIEW Clean customers (manual, notify on completion)",
      "Select all schedules on this page"
    ],
    "links": [
      "/data/files?bucket=etl-bucket&prefix=",
      "/pipelines",
      "/pipelines/1854/edit",
      "/pipelines/list",
      "/pipelines/prompts",
      "/pipelines/schedules",
      "/pipelines/schedules/2833/executions",
      "/pipelines/schedules/bulk",
      "/pipelines/schedules/new"
    ],
    "details": {
      "terms": [
        "Type: service-1 reference worker",
        "Pipeline: REF_CSV_CHECK_V1",
        "Bucket: etl-bucket",
        "Assigned to: person@example.com",
        "Pipeline: #1854 Reference: CSV check and summarise",
        "Topic: etl.reference (all partitions)",
        "Storage: View in bucket",
        "Email notifications: Emails person@example.com when this schedule completes, fails or is skipped.Change completes fails is skipped"
      ],
      "code": [
        "<csvCheck><inputKey>reference/input/sample.csv</inputKey><outputPrefix>reference/output</outputPrefix><maxRejectPercent>50</maxRejectPercent><requiredColumns>id,name</requiredColumns><numericColumns>amount</numericColumns><deleteInput>false</deleteInput><bucket>etl-bucket</bucket></csvCheck>"
      ]
    }
  },
  "a job's run history": {
    "url": "/pipelines/schedules/2833/executions",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /sourceJob.json/listSourceJob",
      "GET /sourceJob.json/inboxArrivals?jobId=2833",
      "GET /sourceJob.json/documentApprovals?jobId=2833&limit=200",
      "GET /sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=2833&limit=500",
      "GET /sourceJob.json/fetchSourceJobDetailWithSourceJobId?jobId=2833",
      "GET /sourceJob.json/documentTrigger?jobId=2833",
      "GET /sourceJob.json/inboxTrigger?jobId=2833",
      "POST /sourceJob.json/runItems/counts {jobQueueIds}"
    ],
    "headings": [
      "Reference CSV check (e2e) · runs",
      "Runs (1 of 1)"
    ],
    "buttons": [
      "Ask about this schedule",
      "Backfill…",
      "Columns",
      "Completed 1",
      "Expand the schedule details",
      "Refresh",
      "Schedule details#2833Pipeline: Reference: CSV check and summarise · On demand",
      "Show the full message for run #7331"
    ],
    "columns": [
      [
        "Run",
        "Queued",
        "Started",
        "Ended",
        "Duration",
        "Status",
        "Message",
        "Actions"
      ]
    ],
    "fields": [
      "Search run id or message",
      "Search runs"
    ],
    "links": [
      "/pipelines",
      "/pipelines/schedules",
      "/pipelines/schedules/2833/runs/7331"
    ]
  },
  "a new job": {
    "url": "/pipelines/schedules/new",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "POST /sourceTask.json/listSourceTask?limit=1000 {}"
    ],
    "headings": [
      "New schedule",
      "1What runs",
      "2When it runs",
      "Also starts when",
      "3Email me when",
      "What you will get",
      "Next runs (server time, Chicago)",
      "Emails"
    ],
    "buttons": [
      "Advanced (cron)",
      "Create schedule",
      "Daily",
      "End date: none picked",
      "Hourly",
      "Minutes",
      "Monthly",
      "On a timetable",
      "Only when started",
      "Start date: 28 Sep 2026",
      "Weekly"
    ],
    "columns": [],
    "fields": [
      "A document is approvedEach approved document of a type starts a run; one approved while a run is going waits its turn.",
      "A file arrivesEach file in the workspace inbox starts a run; one that lands while a run is going waits its turn.",
      "A run completes",
      "A run fails",
      "A run is skipped",
      "Active: runs as soon as it is saved",
      "Attempts",
      "Ends",
      "Nightly orders export",
      "Pipeline *(required)",
      "Priority",
      "Repeat every",
      "Schedule name *(required)",
      "Search pipelines…",
      "Start time, hour",
      "Start time, minute"
    ],
    "links": [
      "/pipelines",
      "/pipelines/schedules"
    ]
  },
  "a run's logs": {
    "url": "/pipelines/schedules/2833/runs/7331/logs",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /sourceJob.json/findSourceJobAuditLog?jobId=2833&jobQueueId=7331",
      "GET /sourceJob.json/backfills/ofRun?jobQueueId=7331",
      "GET /analyticsWorkspace.json/fetchAllDashboards",
      "GET /aiPrompt.json/runsForJob?jobQueueId=7331",
      "GET /billing.json/runCost?jobQueueId=7331",
      "GET /sourceJob.json/stepExecutions?jobQueueId=7331",
      "POST /sourceJob.json/runItems {jobQueueId,page,size,status}",
      "GET /sourceJob.json/review?jobQueueId=7331"
    ],
    "headings": [
      "Run #7331 · Reference CSV check (e2e)",
      "Review",
      "Log"
    ],
    "buttons": [
      "Copy the shown lines",
      "Download the shown lines",
      "Errors 0",
      "Info 2",
      "Log (2)",
      "Map",
      "Outputs",
      "Refresh",
      "Steps",
      "Timing",
      "Warnings 0",
      "Wrap long lines"
    ],
    "columns": [],
    "fields": [
      "Search log entries",
      "Search the log",
      "Step"
    ],
    "links": [
      "/billing/usage?run=7331",
      "/data/analytics/dashboards",
      "/pipelines",
      "/pipelines/1854/edit?tab=steps",
      "/pipelines/schedules",
      "/pipelines/schedules/2833/executions"
    ]
  },
  "bulk jobs": {
    "url": "/pipelines/schedules/bulk",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Bulk schedules",
      "Import",
      "Export"
    ],
    "buttons": [
      "Download the import template",
      "Export all schedules"
    ],
    "columns": [],
    "fields": [
      "Choose a file"
    ],
    "links": [
      "/pipelines",
      "/pipelines/schedules"
    ]
  },
  "editing a job": {
    "url": "/pipelines/schedules/2833/edit",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "POST /sourceTask.json/listSourceTask?limit=1000 {}",
      "GET /sourceJob.json/fetchSourceJobDetailWithSourceJobId?jobId=2833",
      "GET /sourceJob.json/inboxTrigger?jobId=2833",
      "GET /sourceJob.json/documentTrigger?jobId=2833",
      "GET /sourceJob.json/aiModelChoice?jobId=2833"
    ],
    "headings": [
      "Reference CSV check (e2e)",
      "1What runs",
      "2When it runs",
      "Also starts when",
      "3Email me when",
      "What you will get",
      "Emails"
    ],
    "buttons": [
      "Backfill…",
      "Clear",
      "On a timetable",
      "Only when started",
      "Save changes"
    ],
    "columns": [],
    "fields": [
      "A document is approvedEach approved document of a type starts a run; one approved while a run is going waits its turn.",
      "A file arrivesEach file in the workspace inbox starts a run; one that lands while a run is going waits its turn.",
      "A run completes",
      "A run fails",
      "A run is skipped",
      "Active: runs as soon as it is saved",
      "Attempts",
      "Nightly orders export",
      "Pipeline *(required)",
      "Priority",
      "Schedule name *(required)",
      "Search pipelines…"
    ],
    "links": [
      "/pipelines",
      "/pipelines/1854/edit",
      "/pipelines/schedules"
    ]
  },
  "every job's run history": {
    "url": "/runs/latest",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /sourceJob.json/listSourceJob",
      "POST /message.json/runFacets {fromDate,limit,toDate}",
      "POST /message.json/fetchLogs {fromDate,limit,toDate}",
      "GET /sourceJob.json/review/waiting",
      "POST /sourceJob.json/runItems/counts {jobQueueIds}"
    ],
    "headings": [
      "Runs",
      "Runs over time",
      "Runs (2 of 2)"
    ],
    "buttons": [
      "Charts",
      "Columns",
      "Refresh",
      "Show the full message for run #7381"
    ],
    "columns": [
      [
        "Run",
        "Schedule",
        "Queued",
        "Started",
        "Ended",
        "Duration",
        "Status",
        "Message",
        "Actions"
      ]
    ],
    "fields": [
      "Last 30 days",
      "Last 7 days",
      "Search run id or message",
      "Search runs",
      "Since yesterday",
      "Today"
    ],
    "links": [
      "/pipelines/schedules/2835/executions",
      "/pipelines/schedules/2835/runs/7381",
      "/pipelines/schedules/2838/executions",
      "/pipelines/schedules/2838/runs/7382",
      "/runs",
      "/runs/analytics",
      "/runs/backfills",
      "/runs/by-date",
      "/runs/failed",
      "/runs/latest"
    ]
  },
  "the job assistant": {
    "url": "/pipelines/schedules/2833/assistant",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /aiAgent.json/fetchAllAgents",
      "GET /sourceJob.json/fetchSourceJobDetailWithSourceJobId?jobId=2833",
      "GET /sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=2833&limit=500"
    ],
    "headings": [
      "Schedule assistant — Reference CSV check (e2e)"
    ],
    "buttons": [
      "Ask",
      "Failures",
      "Quick stats",
      "Recent runs",
      "Schedule",
      "Summary",
      "Where it writes"
    ],
    "columns": [],
    "fields": [
      "Ask about this schedule",
      "Ask about this schedule — when it runs, its files, failures or history",
      "Other questions are answered by"
    ],
    "links": [
      "/pipelines",
      "/pipelines/schedules",
      "/pipelines/schedules/2833/executions"
    ]
  },
  "the list, as a tenant user with five pages": {
    "url": "/pipelines/schedules",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /sourceJob.json/listSourceJob"
    ],
    "headings": [
      "Schedules & triggers",
      "Schedules (2 of 2)"
    ],
    "buttons": [
      "Actions for Reference CSV check (e2e)",
      "Actions for UI-REVIEW Clean customers (manual, notify on completion)",
      "Columns",
      "Refresh",
      "Show details for Reference CSV check (e2e)",
      "Show details for UI-REVIEW Clean customers (manual, notify on completion)"
    ],
    "columns": [
      [
        "",
        "",
        "Schedule",
        "Pipeline",
        "Mode",
        "When",
        "Created",
        "Created by",
        "Updated by",
        "Next / last run",
        "Run status",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Filter by execution type",
      "Filter by run status",
      "Search id, schedule or pipeline",
      "Search schedules",
      "Select Reference CSV check (e2e)",
      "Select UI-REVIEW Clean customers (manual, notify on completion)",
      "Select all schedules on this page"
    ],
    "links": [
      "/pipelines",
      "/pipelines/list",
      "/pipelines/schedules",
      "/pipelines/schedules/bulk",
      "/pipelines/schedules/new"
    ]
  },
  "the list, as a workspace administrator": {
    "url": "/pipelines/schedules",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /sourceJob.json/listSourceJob"
    ],
    "headings": [
      "Schedules & triggers",
      "Schedules (2 of 2)"
    ],
    "buttons": [
      "Actions for Reference CSV check (e2e)",
      "Actions for UI-REVIEW Clean customers (manual, notify on completion)",
      "Columns",
      "Only mine",
      "Refresh",
      "Show details for Reference CSV check (e2e)",
      "Show details for UI-REVIEW Clean customers (manual, notify on completion)"
    ],
    "columns": [
      [
        "",
        "",
        "Schedule",
        "Pipeline",
        "Mode",
        "When",
        "Created",
        "Created by",
        "Updated by",
        "Next / last run",
        "Run status",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Filter by execution type",
      "Filter by run status",
      "Search id, schedule or pipeline",
      "Search schedules",
      "Select Reference CSV check (e2e)",
      "Select UI-REVIEW Clean customers (manual, notify on completion)",
      "Select all schedules on this page"
    ],
    "links": [
      "/pipelines",
      "/pipelines/list",
      "/pipelines/prompts",
      "/pipelines/schedules",
      "/pipelines/schedules/bulk",
      "/pipelines/schedules/new"
    ]
  },
  "the row menu, as a tenant user with five pages": {
    "headings": [],
    "buttons": [
      "Ask about this schedule",
      "Backfill…",
      "Deactivate",
      "Delete",
      "Duplicate",
      "Edit",
      "Email notifications 3",
      "Executions",
      "Run now",
      "Skip next run"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/pipelines/schedules/2833/edit",
      "/pipelines/schedules/2833/executions"
    ],
    "items": [
      "Run now",
      "Backfill…",
      "Skip next run",
      "Edit",
      "Executions",
      "Ask about this schedule",
      "Duplicate",
      "Email notifications 3",
      "Deactivate",
      "Delete"
    ]
  },
  "the row menu, as a workspace administrator": {
    "headings": [],
    "buttons": [
      "Ask about this schedule",
      "Backfill…",
      "Deactivate",
      "Delete",
      "Duplicate",
      "Edit",
      "Email notifications 3",
      "Executions",
      "Run now",
      "Skip next run"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/pipelines/schedules/2833/edit",
      "/pipelines/schedules/2833/executions"
    ],
    "items": [
      "Run now",
      "Backfill…",
      "Skip next run",
      "Edit",
      "Executions",
      "Ask about this schedule",
      "Duplicate",
      "Email notifications 3",
      "Deactivate",
      "Delete"
    ]
  }
};
