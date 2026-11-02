// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "Reports from pipelines, a PDF from a dataset": {
    "requests": [
      "GET /storage.json/buckets",
      "GET /documentConverter.json/renderFormats",
      "GET /documentConverter.json/fetchAllTemplates"
    ],
    "headings": [
      "Make a PDF"
    ],
    "buttons": [
      "A table in a bucket",
      "Close",
      "From a dataset",
      "From a run",
      "Make PDF",
      "Paste rows",
      "Preview"
    ],
    "columns": [],
    "fields": [
      "Default layout",
      "File name",
      "Make",
      "None",
      "Orientation",
      "Page",
      "Page size",
      "Rows (JSON)",
      "Save the file to a bucket",
      "Template",
      "The dataset's own title",
      "The title, or report",
      "Title",
      "Watermark",
      "[{\"region\": \"North\", \"revenue\": 1234.50}, {\"region\": \"South\", \"revenue\": 980}]"
    ],
    "links": [],
    "items": []
  },
  "Reports from pipelines, a PDF from a run": {
    "requests": [
      "GET /documentConverter.json/renderFormats",
      "GET /documentConverter.json/fetchAllTemplates",
      "GET /sourceJob.json/listSourceJob"
    ],
    "headings": [
      "Make a PDF"
    ],
    "buttons": [
      "Choose a dataset",
      "Choose a schedule first",
      "Close",
      "From a dataset",
      "From a run",
      "Make PDF",
      "Preview"
    ],
    "columns": [],
    "fields": [
      "Choose a schedule",
      "Dataset",
      "Default layout",
      "File name",
      "Make",
      "None",
      "Orientation",
      "Page",
      "Page size",
      "Run",
      "Save the file to a bucket",
      "Schedule",
      "Template",
      "The dataset's own title",
      "The title, or report",
      "Title",
      "Watermark"
    ],
    "links": [],
    "items": []
  },
  "Reports, as a tenant user without the page": {
    "url": "/unauthorized?page=tools-converter&title=Reports%20from%20pipelines",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Reports from pipelines isn't part of your access"
    ],
    "buttons": [
      "Request access"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/"
    ]
  },
  "Reports, as a workspace administrator": {
    "url": "/reports/from-pipelines",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/buckets",
      "GET /sourceJob.json/listSourceJob",
      "GET /storage.json/listObjects?bucket=ui-review-s3&maxKeys=100&prefix=reports/",
      "GET /sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=2849&limit=3",
      "GET /sourceJob.json/runOutputs?jobQueueId=7405"
    ],
    "headings": [
      "Reports from pipelines",
      "Generated outputs (3 of 3)"
    ],
    "buttons": [
      "Actions for UI-CHECK Q3.pdf",
      "Actions for customers-clean.json",
      "Clear",
      "Columns",
      "Created",
      "Name",
      "Owner",
      "PDF from a dataset or a run",
      "Pipeline",
      "Refresh",
      "Size",
      "Status",
      "Type"
    ],
    "columns": [
      [
        "Name",
        "Type",
        "Pipeline",
        "Created",
        "Size",
        "Status",
        "Owner",
        "Actions"
      ]
    ],
    "fields": [
      "Bucket",
      "Choose a bucket",
      "Find a report",
      "Find by name, type or pipeline",
      "Folder",
      "reports/"
    ],
    "links": [
      "/pipelines/schedules/2849/runs/7405",
      "/reports"
    ]
  },
  "a file's details, written by a recent run": {
    "requests": [
      "GET /storage.json/objectMetadata?bucket=ui-review-s3&key=registry-live-check/customers-clean.json",
      "GET /sourceJob.json/objectWriter?bucket=ui-review-s3&key=registry-live-check/customers-clean.json"
    ],
    "headings": [
      "customers-clean.json",
      "File",
      "Made by",
      "Retention"
    ],
    "buttons": [
      "Close"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/pipelines/schedules/2849/runs/7405"
    ],
    "items": []
  }
};
