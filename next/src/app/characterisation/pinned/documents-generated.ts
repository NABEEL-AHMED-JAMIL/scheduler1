// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "Reports, as a tenant user without the page": {
    "url": "/unauthorized?page=tools-converter",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Document Converter isn't part of your access"
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
    "url": "/documents/reports",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/buckets",
      "GET /sourceJob.json/listSourceJob",
      "GET /storage.json/listObjects?bucket=ui-review-s3&maxKeys=100&prefix=reports/",
      "GET /sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=2849",
      "GET /sourceJob.json/runOutputs?jobQueueId=7405"
    ],
    "headings": [
      "Reports",
      "Generated outputs (3 of 3)"
    ],
    "buttons": [
      "Clear",
      "Columns",
      "Download UI-CHECK Q3.pdf",
      "Download customers-clean.json",
      "Email UI-CHECK Q3.pdf",
      "Email customers-clean.json",
      "Open customers-clean.json in storage",
      "Preview UI-CHECK Q3.pdf",
      "Preview customers-clean.json",
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
      "/documents/converter",
      "/documents/files?bucket=ui-review-s3&prefix=registry-live-check%2F",
      "/documents/files?bucket=ui-review-s3&prefix=reports%2F",
      "/pipelines/schedules/2849/runs/7405/logs"
    ]
  },
  "a file's details, written by a recent run": {
    "requests": [
      "GET /storage.json/objectMetadata?bucket=ui-review-s3&key=registry-live-check/customers-clean.json",
      "GET /sourceJob.json/listSourceJob",
      "GET /sourceJob.json/fetchSourceJobQueueListWithJobId?jobId=2849",
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
      "/pipelines/schedules/2849/runs/7405/logs"
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
      "Dataset → PDF",
      "Delete this conversion",
      "From a bucket",
      "From an execution",
      "Make PDF",
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
      "/documents/files?bucket=ui-review-s3&prefix=UI-REVIEW%20converted%2F1034%2Foutput%2F"
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
      "Dataset → PDF",
      "Delete this conversion",
      "From a bucket",
      "From an execution",
      "Make PDF",
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
      "/documents/files?bucket=ui-review-s3&prefix=UI-REVIEW%20converted%2F1034%2Foutput%2F"
    ]
  }
};
