// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "Reports, as a tenant user without the page": {
    "url": "/unauthorized?page=tools-converter&title=Generated%20reports",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Generated reports isn't part of your access"
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
    "url": "/data/reports",
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
      "Generated reports",
      "Generated outputs (3 of 3)"
    ],
    "buttons": [
      "Actions for UI-CHECK Q3.pdf",
      "Actions for customers-clean.json",
      "Clear",
      "Columns",
      "Refresh"
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
      "/data",
      "/data/analytics",
      "/data/ask",
      "/data/catalog",
      "/data/files",
      "/data/reports",
      "/pipelines/schedules/2849/runs/7405",
      "/tools/converter?mode=dataset"
    ]
  },
  "a file's details, written by a recent run": {
    "requests": [
      "GET /storage.json/objectMetadata?bucket=ui-review-s3&key=registry-live-check/customers-clean.json",
      "GET /sourceJob.json/listSourceJob",
      "GET /sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=2849&limit=3",
      "GET /sourceJob.json/runOutputs?jobQueueId=7405"
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
  },
  "the converter, Dataset → PDF": {
    "requests": [
      "GET /documentConverter.json/renderFormats",
      "GET /documentConverter.json/fetchAllTemplates"
    ],
    "headings": [
      "Document Converter",
      "Recent conversions (1 of 1)"
    ],
    "buttons": [
      "A table in a bucket",
      "Columns",
      "Delete this conversion",
      "From a bucket",
      "Make PDF",
      "PDF from a dataset",
      "PDF from a run",
      "Paste rows",
      "Preview",
      "Refresh",
      "Supported formats",
      "Upload a file",
      "View the converted file",
      "View the original file"
    ],
    "columns": [
      [
        "Name",
        "Conversion",
        "Size",
        "Location",
        "Created",
        "Actions"
      ]
    ],
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
    "links": [
      "/data/files?bucket=ui-review-s3&prefix=UI-REVIEW%20converted%2F1034%2Foutput%2F",
      "/data/reports",
      "/tools",
      "/tools/converter",
      "/tools/transcript"
    ]
  },
  "the converter, From an execution": {
    "requests": [
      "GET /documentConverter.json/renderFormats",
      "GET /documentConverter.json/fetchAllTemplates",
      "GET /sourceJob.json/listSourceJob"
    ],
    "headings": [
      "Document Converter",
      "Recent conversions (1 of 1)"
    ],
    "buttons": [
      "Columns",
      "Delete this conversion",
      "From a bucket",
      "Make PDF",
      "PDF from a dataset",
      "PDF from a run",
      "Preview",
      "Refresh",
      "Supported formats",
      "Upload a file",
      "View the converted file",
      "View the original file"
    ],
    "columns": [
      [
        "Name",
        "Conversion",
        "Size",
        "Location",
        "Created",
        "Actions"
      ]
    ],
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
    "links": [
      "/data/files?bucket=ui-review-s3&prefix=UI-REVIEW%20converted%2F1034%2Foutput%2F",
      "/data/reports",
      "/tools",
      "/tools/converter",
      "/tools/transcript"
    ]
  }
};
