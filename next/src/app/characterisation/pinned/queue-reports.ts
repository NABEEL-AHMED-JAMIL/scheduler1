// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "reports, as a tenant user with five pages": {
    "url": "/runs/analytics",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /report.json/runs?endDate=<date>&startDate=<date>",
      "GET /aiPrompt.json/usage?from=<date>&to=<date>"
    ],
    "headings": [
      "Run analytics",
      "Overview",
      "Outcomes and timing",
      "Outcome mix",
      "Duration spread",
      "Runs by day",
      "Pipeline health",
      "Pipelines (1 of 1)",
      "Model calls",
      "Prompts (2 of 2)",
      "Build your own view",
      "Chart",
      "Runs by task and outcome (1 of 1)"
    ],
    "buttons": [
      "0",
      "0 failing",
      "0 in flight",
      "1 healthy",
      "100% stacked",
      "2",
      "30 days",
      "7 days",
      "90 days",
      "A → Z",
      "Area",
      "Build your own view",
      "CSV",
      "Columns",
      "Custom",
      "Donut",
      "Excel",
      "Grouped bars",
      "Heatmap",
      "Highest first",
      "Line",
      "Pie",
      "Radar",
      "Ranked bars",
      "Refresh",
      "Save to bucket",
      "Stacked bars",
      "Swap rows and columns",
      "This month",
      "Today",
      "UI-REVIEW Ledger 2,000 rows with a long notes column",
      "—"
    ],
    "columns": [
      [
        "Pipeline",
        "Schedules",
        "Runs",
        "Completed",
        "Failed",
        "Interrupted",
        "Skipped",
        "Missed",
        "Other",
        "Success",
        "Median",
        "Slowest",
        "Last run",
        "State"
      ],
      [
        "Prompt",
        "Calls",
        "Failed",
        "Tries",
        "Tokens in",
        "Tokens out",
        "Median",
        "Last call"
      ],
      [
        "Task dimension",
        "Completed 2 runs",
        "Skip 0 runs",
        "All total"
      ]
    ],
    "fields": [
      "All owners",
      "All pipelines",
      "All schedules",
      "Columns",
      "Find a pipeline",
      "Find a task",
      "Measure",
      "Outcome",
      "Owner",
      "Pipeline",
      "Rows",
      "Schedule"
    ],
    "links": [
      "/runs",
      "/runs/analytics",
      "/runs/backfills",
      "/runs/by-date",
      "/runs/failed",
      "/runs/latest"
    ]
  },
  "reports, as a workspace administrator": {
    "url": "/runs/analytics",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /report.json/runs?endDate=<date>&startDate=<date>",
      "GET /billing.json/usage?from=<date>&groupBy=meter&to=<date>",
      "GET /aiPrompt.json/usage?from=<date>&to=<date>"
    ],
    "headings": [
      "Run analytics",
      "Overview",
      "Outcomes and timing",
      "Outcome mix",
      "Duration spread",
      "Runs by day",
      "Pipeline health",
      "Pipelines (1 of 1)",
      "Model calls",
      "Prompts (2 of 2)",
      "Build your own view",
      "Chart",
      "Runs by task and outcome (1 of 1)"
    ],
    "buttons": [
      "0",
      "0 failing",
      "0 in flight",
      "1 healthy",
      "100% stacked",
      "2",
      "30 days",
      "7 days",
      "90 days",
      "A → Z",
      "Area",
      "Build your own view",
      "CSV",
      "Columns",
      "Custom",
      "Donut",
      "Excel",
      "Grouped bars",
      "Heatmap",
      "Highest first",
      "Line",
      "Pie",
      "Radar",
      "Ranked bars",
      "Refresh",
      "Save to bucket",
      "Stacked bars",
      "Swap rows and columns",
      "This month",
      "Today",
      "UI-REVIEW Ledger 2,000 rows with a long notes column",
      "—"
    ],
    "columns": [
      [
        "Pipeline",
        "Schedules",
        "Runs",
        "Completed",
        "Failed",
        "Interrupted",
        "Skipped",
        "Missed",
        "Other",
        "Success",
        "Median",
        "Slowest",
        "Last run",
        "State"
      ],
      [
        "Prompt",
        "Calls",
        "Failed",
        "Tries",
        "Tokens in",
        "Tokens out",
        "Median",
        "Last call"
      ],
      [
        "Task dimension",
        "Completed 2 runs",
        "Skip 0 runs",
        "All total"
      ]
    ],
    "fields": [
      "All owners",
      "All pipelines",
      "All schedules",
      "Columns",
      "Find a pipeline",
      "Find a task",
      "Measure",
      "Outcome",
      "Owner",
      "Pipeline",
      "Rows",
      "Schedule"
    ],
    "links": [
      "/billing/usage",
      "/runs",
      "/runs/analytics",
      "/runs/backfills",
      "/runs/by-date",
      "/runs/failed",
      "/runs/latest"
    ]
  },
  "the queue's charts": {
    "requests": [],
    "headings": [
      "Runs",
      "Outcomes",
      "Busiest schedules",
      "Volume by day",
      "How long runs took",
      "How runs were started",
      "Runs (2 of 2)"
    ],
    "buttons": [
      "022 Sep",
      "023 Sep",
      "024 Sep",
      "025 Sep",
      "026 Sep",
      "027 Sep",
      "228 Sep",
      "30 days",
      "5-30s1 100%",
      "7 days",
      "Columns",
      "Completed 1",
      "Custom",
      "Hide charts",
      "Job #28351 50%",
      "Job #28381 50%",
      "Refresh",
      "Skip 1",
      "This month",
      "Today"
    ],
    "columns": [
      [
        "Run",
        "Schedule",
        "Created",
        "Duration",
        "Status",
        "Message",
        "Actions"
      ]
    ],
    "fields": [
      "Search runs",
      "Search schedule, run or message"
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
  "the queue, as a tenant user with five pages": {
    "url": "/runs/by-date",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "POST /message.json/fetchLogs {fromDate,limit,toDate}",
      "GET /sourceJob.json/listSourceJob"
    ],
    "headings": [
      "Runs",
      "Runs (2 of 2)"
    ],
    "buttons": [
      "30 days",
      "7 days",
      "Charts",
      "Columns",
      "Completed 1",
      "Custom",
      "Refresh",
      "Skip 1",
      "This month",
      "Today"
    ],
    "columns": [
      [
        "Run",
        "Schedule",
        "Created",
        "Duration",
        "Status",
        "Message",
        "Actions"
      ]
    ],
    "fields": [
      "Search runs",
      "Search schedule, run or message"
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
  "the queue, as a workspace administrator": {
    "url": "/runs/by-date",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "POST /message.json/fetchLogs {fromDate,limit,toDate}",
      "GET /sourceJob.json/listSourceJob"
    ],
    "headings": [
      "Runs",
      "Runs (2 of 2)"
    ],
    "buttons": [
      "30 days",
      "7 days",
      "Charts",
      "Columns",
      "Completed 1",
      "Custom",
      "Refresh",
      "Skip 1",
      "This month",
      "Today"
    ],
    "columns": [
      [
        "Run",
        "Schedule",
        "Created",
        "Duration",
        "Status",
        "Message",
        "Actions"
      ]
    ],
    "fields": [
      "Search runs",
      "Search schedule, run or message"
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
  }
};
