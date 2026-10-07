// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a job's details, with its schedule": {
    "requests": [
      "GET /sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=2833&limit=25",
      "GET /sourceJob.json/inboxTrigger?jobId=2833",
      "GET /sourceTask.json/fetchSourceTaskWithSourceTaskId?sourceTaskId=1854"
    ],
    "headings": [
      "Schedules",
      "Schedules (2 of 2)",
      "Task payload",
      "Recent runs"
    ],
    "buttons": [
      "40s#7331",
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
        "Job",
        "Task",
        "Execution",
        "Schedule",
        "Next / last run",
        "Created",
        "Run status",
        "Created by",
        "Updated by",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Filter by execution type",
      "Filter by run status",
      "Search id, job or task",
      "Search jobs",
      "Select Reference CSV check (e2e)",
      "Select UI-REVIEW Clean customers (manual, notify on completion)",
      "Select all jobs on this page"
    ],
    "links": [
      "/documents/files?bucket=etl-bucket&prefix=",
      "/pipelines/1854/edit",
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
        "Task: #1854 Reference: CSV check and summarise",
        "Topic: etl.reference (all partitions)",
        "Storage: View in bucket",
        "Email notifications: Emails person@example.com when this job completes, fails or is skipped.Change completes fails is skipped"
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
      "GET /sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=2833&limit=500",
      "GET /sourceJob.json/fetchSourceJobDetailWithSourceJobId?jobId=2833",
      "GET /sourceJob.json/inboxTrigger?jobId=2833"
    ],
    "headings": [
      "Executions — Reference CSV check (e2e)",
      "Runs (1 of 1)"
    ],
    "buttons": [
      "Ask about this job",
      "Collapse job detail",
      "Columns",
      "Completed 1",
      "Copy",
      "Job & task detail#2833",
      "Refresh",
      "Show the full message for run #7331"
    ],
    "columns": [
      [
        "Run",
        "Queued",
        "Started",
        "Ended",
        "Duration",
        "Message",
        "Status · Logs"
      ]
    ],
    "fields": [
      "Search run id or message",
      "Search runs"
    ],
    "links": [
      "/pipelines/1854/edit",
      "/pipelines/schedules",
      "/pipelines/schedules/2833/runs/7331/logs"
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
      "A run completes",
      "A run fails",
      "A run is skipped",
      "Active: runs as soon as it is saved",
      "Also when a file arrivesEach file in the workspace inbox starts a run.",
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
      "GET /sourceJob.json/stepExecutions?jobQueueId=7331",
      "GET /aiPrompt.json/runsForJob?jobQueueId=7331"
    ],
    "headings": [
      "Run logs",
      "Log entries (2 of 2)"
    ],
    "buttons": [
      "Console",
      "Job & queue detail Completed",
      "Refresh",
      "Table",
      "Timeline",
      "Timing"
    ],
    "columns": [],
    "fields": [
      "Search entries",
      "Search log entries"
    ],
    "links": [
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
      "GET /sourceJob.json/aiModelChoice?jobId=2833"
    ],
    "headings": [
      "Edit schedule",
      "1What runs",
      "2When it runs",
      "3Email me when",
      "What you will get",
      "Emails"
    ],
    "buttons": [
      "Clear",
      "On a timetable",
      "Only when started",
      "Save changes"
    ],
    "columns": [],
    "fields": [
      "A run completes",
      "A run fails",
      "A run is skipped",
      "Active: runs as soon as it is saved",
      "Also when a file arrivesEach file in the workspace inbox starts a run.",
      "Attempts",
      "Nightly orders export",
      "Pipeline *(required)",
      "Priority",
      "Schedule name *(required)",
      "Search pipelines…"
    ],
    "links": [
      "/pipelines/schedules"
    ]
  },
  "every job's run history": {
    "url": "/pipelines/executions",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /sourceJob.json/listSourceJob",
      "POST /message.json/fetchLogs {fromDate,limit,toDate}",
      "GET /sourceJob.json/review/waiting"
    ],
    "headings": [
      "Executions",
      "Runs (2 of 2)"
    ],
    "buttons": [
      "Charts",
      "Columns",
      "Completed 1",
      "Refresh",
      "Show the full message for run #7381",
      "Skip 1"
    ],
    "columns": [
      [
        "Run",
        "Job",
        "Queued",
        "Started",
        "Ended",
        "Duration",
        "Message",
        "Status · Logs"
      ]
    ],
    "fields": [
      "Search run id or message",
      "Search runs"
    ],
    "links": [
      "/pipelines/schedules/2835/executions",
      "/pipelines/schedules/2835/runs/7381/logs",
      "/pipelines/schedules/2838/executions",
      "/pipelines/schedules/2838/runs/7382/logs"
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
      "CSV",
      "Excel",
      "Failures",
      "Quick stats",
      "Recent runs",
      "Schedule",
      "Summary",
      "Where it writes"
    ],
    "columns": [],
    "fields": [
      "Anything else, ask",
      "Ask about this job",
      "Ask about this job — its schedule, files, failures or history"
    ],
    "links": [
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
      "Schedules",
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
        "Job",
        "Task",
        "Execution",
        "Schedule",
        "Next / last run",
        "Created",
        "Run status",
        "Created by",
        "Updated by",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Filter by execution type",
      "Filter by run status",
      "Search id, job or task",
      "Search jobs",
      "Select Reference CSV check (e2e)",
      "Select UI-REVIEW Clean customers (manual, notify on completion)",
      "Select all jobs on this page"
    ],
    "links": [
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
      "Schedules",
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
        "Job",
        "Task",
        "Execution",
        "Schedule",
        "Next / last run",
        "Created",
        "Run status",
        "Created by",
        "Updated by",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Filter by execution type",
      "Filter by run status",
      "Search id, job or task",
      "Search jobs",
      "Select Reference CSV check (e2e)",
      "Select UI-REVIEW Clean customers (manual, notify on completion)",
      "Select all jobs on this page"
    ],
    "links": [
      "/pipelines/schedules/bulk",
      "/pipelines/schedules/new"
    ]
  },
  "the row menu, as a tenant user with five pages": {
    "headings": [],
    "buttons": [
      "Ask about this job",
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
      "Skip next run",
      "Edit",
      "Executions",
      "Ask about this job",
      "Duplicate",
      "Email notifications 3",
      "Deactivate",
      "Delete"
    ]
  },
  "the row menu, as a workspace administrator": {
    "headings": [],
    "buttons": [
      "Ask about this job",
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
      "Skip next run",
      "Edit",
      "Executions",
      "Ask about this job",
      "Duplicate",
      "Email notifications 3",
      "Deactivate",
      "Delete"
    ]
  }
};
