// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "reports, as a tenant user with five pages": {
    "url": "/pipelines/run-analytics",
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
      "Task health",
      "Tasks (1 of 1)",
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
      "A → Z",
      "Area",
      "Build your own view",
      "CSV",
      "Columns",
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
      "UI-REVIEW Ledger 2,000 rows with a long notes column",
      "—"
    ],
    "columns": [
      [
        "Task",
        "Jobs",
        "Runs",
        "Completed",
        "Failed",
        "Interrupted",
        "Skipped",
        "Missed",
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
      "All jobs",
      "All owners",
      "All tasks",
      "Columns",
      "Find a task",
      "From",
      "Job",
      "Measure",
      "Outcome",
      "Owner",
      "Rows",
      "Task",
      "To"
    ],
    "links": []
  },
  "reports, as a workspace administrator": {
    "url": "/pipelines/run-analytics",
    "requests": [
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
      "Task health",
      "Tasks (1 of 1)",
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
      "A → Z",
      "Area",
      "Build your own view",
      "CSV",
      "Columns",
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
      "UI-REVIEW Ledger 2,000 rows with a long notes column",
      "—"
    ],
    "columns": [
      [
        "Task",
        "Jobs",
        "Runs",
        "Completed",
        "Failed",
        "Interrupted",
        "Skipped",
        "Missed",
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
      "All jobs",
      "All owners",
      "All tasks",
      "Columns",
      "Find a task",
      "From",
      "Job",
      "Measure",
      "Outcome",
      "Owner",
      "Rows",
      "Task",
      "To"
    ],
    "links": [
      "/billing/usage"
    ]
  },
  "the queue's charts": {
    "requests": [],
    "headings": [
      "Queue",
      "Outcomes",
      "Busiest jobs",
      "Volume by day",
      "How long runs took",
      "How runs were started",
      "Queue (2 of 2)"
    ],
    "buttons": [
      "022 Sep",
      "023 Sep",
      "024 Sep",
      "025 Sep",
      "026 Sep",
      "027 Sep",
      "228 Sep",
      "5-30s1 100%",
      "Columns",
      "Completed 1",
      "Hide charts",
      "Job #28351 50%",
      "Job #28381 50%",
      "Refresh",
      "Skip 1"
    ],
    "columns": [
      [
        "Run",
        "Job",
        "Created",
        "Duration",
        "Message",
        "Status"
      ]
    ],
    "fields": [
      "From date",
      "Search job, run or message",
      "Search queue messages",
      "To date"
    ],
    "links": [
      "/pipelines/schedules/2835/executions",
      "/pipelines/schedules/2835/runs/7381/logs",
      "/pipelines/schedules/2838/executions",
      "/pipelines/schedules/2838/runs/7382/logs"
    ]
  },
  "the queue, as a tenant user with five pages": {
    "url": "/pipelines/queue",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "POST /message.json/fetchLogs {fromDate,toDate}",
      "GET /sourceJob.json/listSourceJob"
    ],
    "headings": [
      "Queue",
      "Queue (2 of 2)"
    ],
    "buttons": [
      "Charts",
      "Columns",
      "Completed 1",
      "Refresh",
      "Skip 1"
    ],
    "columns": [
      [
        "Run",
        "Job",
        "Created",
        "Duration",
        "Message",
        "Status"
      ]
    ],
    "fields": [
      "From date",
      "Search job, run or message",
      "Search queue messages",
      "To date"
    ],
    "links": [
      "/pipelines/schedules/2835/executions",
      "/pipelines/schedules/2835/runs/7381/logs",
      "/pipelines/schedules/2838/executions",
      "/pipelines/schedules/2838/runs/7382/logs"
    ]
  },
  "the queue, as a workspace administrator": {
    "url": "/pipelines/queue",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "POST /message.json/fetchLogs {fromDate,toDate}",
      "GET /sourceJob.json/listSourceJob"
    ],
    "headings": [
      "Queue",
      "Queue (2 of 2)"
    ],
    "buttons": [
      "Charts",
      "Columns",
      "Completed 1",
      "Refresh",
      "Skip 1"
    ],
    "columns": [
      [
        "Run",
        "Job",
        "Created",
        "Duration",
        "Message",
        "Status"
      ]
    ],
    "fields": [
      "From date",
      "Search job, run or message",
      "Search queue messages",
      "To date"
    ],
    "links": [
      "/pipelines/schedules/2835/executions",
      "/pipelines/schedules/2835/runs/7381/logs",
      "/pipelines/schedules/2838/executions",
      "/pipelines/schedules/2838/runs/7382/logs"
    ]
  }
};
