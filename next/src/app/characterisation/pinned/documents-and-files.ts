// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "FileChat on a CSV: a question and its answer": {
    "asked": true,
    "requests": [
      "POST /fileChat.json/sendMessage {aiAgentId,bucket,history,key,message}",
      "POST /fileChat.json/prepareContext {aiAgentId,bucket,key}"
    ],
    "headings": [],
    "buttons": [
      "Close",
      "Copy",
      "Email",
      "Minimise",
      "Regenerate",
      "Send",
      "View"
    ],
    "columns": [],
    "fields": [
      "Agent",
      "Message",
      "Message about customers.csv"
    ],
    "links": []
  },
  "FileChat on a CSV: the panel and what it asks for": {
    "requests": [
      "GET /aiAgent.json/fetchAllAgents",
      "POST /fileChat.json/prepareContext {aiAgentId,bucket,key}"
    ],
    "headings": [],
    "buttons": [
      "Close",
      "List any dates mentioned",
      "Minimise",
      "Send",
      "Summarise this file",
      "View",
      "What are the key points?"
    ],
    "columns": [],
    "fields": [
      "Agent",
      "Message",
      "Message about customers.csv"
    ],
    "links": []
  },
  "a file's row menu": {
    "headings": [],
    "buttons": [
      "Chat with this file",
      "Copy checksum (ETag)",
      "Copy path",
      "Delete",
      "Details",
      "Download",
      "Email this file",
      "View"
    ],
    "columns": [],
    "fields": [],
    "links": [],
    "items": [
      "View",
      "Details",
      "Chat with this file",
      "Download",
      "Email this file",
      "Copy path",
      "Copy checksum (ETag)",
      "Delete"
    ]
  },
  "previewing a CSV (media-service's table preview)": {
    "requests": [
      "GET /storage.json/previewTable?bucket=ui-review-s3&key=customers.csv&limit=100&offset=0"
    ],
    "headings": [],
    "buttons": [
      "#",
      "Close",
      "Download",
      "Next",
      "Open",
      "Prev",
      "amount",
      "city",
      "id",
      "name"
    ],
    "columns": [
      [
        "#",
        "id",
        "name",
        "city",
        "amount"
      ]
    ],
    "fields": [
      "Find on this page"
    ],
    "links": [],
    "items": []
  },
  "the converter, as a tenant user without the page": {
    "url": "/unauthorized?page=tools-converter&title=Document%20Converter",
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
  "the converter, as a workspace administrator": {
    "url": "/tools/converter",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentConverter.json/fetchAllTasks",
      "GET /storage.json/buckets",
      "GET /documentConverter.json/supportedFormats",
      "GET /documentConverter.json/limits"
    ],
    "headings": [
      "Document Converter",
      "Convert",
      "Recent conversions (1 of 1)"
    ],
    "buttons": [
      "30 days",
      "7 days",
      "90 days",
      "All time",
      "Columns",
      "Conversion",
      "Created",
      "Custom",
      "Delete this conversion",
      "From a bucket",
      "Location",
      "Name",
      "PDF from a dataset",
      "PDF from a run",
      "Read the limits and queue again",
      "Refresh",
      "Size",
      "Supported formats 2",
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
      "Choose a file",
      "Search name, file or format",
      "Search recent conversions"
    ],
    "links": [
      "/data/files?bucket=ui-review-s3&prefix=UI-REVIEW%20converted%2F1034%2Foutput%2F",
      "/data/reports",
      "/tools",
      "/tools/converter",
      "/tools/transcript"
    ]
  },
  "the object browser, as a tenant user": {
    "url": "/data/files?bucket=ui-review-s3",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/buckets",
      "GET /storage.json/listObjects?bucket=ui-review-s3&maxKeys=100&prefix="
    ],
    "headings": [
      "Browse files"
    ],
    "buttons": [
      "Actions for UI-REVIEW converted",
      "Actions for UI-REVIEW uploads",
      "Clear",
      "Insights",
      "Modified",
      "Modified from: none picked",
      "Modified to: none picked",
      "Name",
      "New folder",
      "Refresh",
      "Size",
      "UI-REVIEW converted",
      "UI-REVIEW uploads",
      "ui-review-s3"
    ],
    "columns": [
      [
        "",
        "Name",
        "Modified",
        "Size",
        "Type",
        "Actions"
      ]
    ],
    "fields": [
      "Connection",
      "Filter by name",
      "Find a file…",
      "Search connections…",
      "Select all files",
      "Upload",
      "Upload folder"
    ],
    "links": [
      "/data"
    ]
  },
  "the object browser, in a bucket": {
    "url": "/data/files?bucket=ui-review-s3",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/buckets",
      "GET /storage.json/listObjects?bucket=ui-review-s3&maxKeys=100&prefix="
    ],
    "headings": [
      "Browse files"
    ],
    "buttons": [
      "Actions for UI-REVIEW converted",
      "Actions for UI-REVIEW uploads",
      "Clear",
      "Insights",
      "Modified",
      "Modified from: none picked",
      "Modified to: none picked",
      "Name",
      "New folder",
      "Refresh",
      "Size",
      "UI-REVIEW converted",
      "UI-REVIEW uploads",
      "ui-review-s3"
    ],
    "columns": [
      [
        "",
        "Name",
        "Modified",
        "Size",
        "Type",
        "Actions"
      ]
    ],
    "fields": [
      "Connection",
      "Filter by name",
      "Find a file…",
      "Search connections…",
      "Select all files",
      "Upload",
      "Upload folder"
    ],
    "links": [
      "/data",
      "/data/analytics",
      "/data/ask",
      "/data/catalog",
      "/data/files"
    ]
  },
  "the object browser, no bucket chosen": {
    "url": "/data/files",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/buckets"
    ],
    "headings": [
      "Browse files",
      "Connections (1 of 1)"
    ],
    "buttons": [
      "Browse UI-REVIEW LocalStack S3 (fake keys)"
    ],
    "columns": [],
    "fields": [
      "Search connections"
    ],
    "links": [
      "/data",
      "/data/analytics",
      "/data/ask",
      "/data/catalog",
      "/data/files"
    ]
  }
};
