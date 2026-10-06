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
      "Close",
      "Download",
      "Next",
      "Open",
      "Prev"
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
    "url": "/documents/converter",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentConverter.json/fetchAllTasks",
      "GET /storage.json/buckets",
      "GET /documentConverter.json/supportedFormats"
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
      "Choose a file"
    ],
    "links": [
      "/documents/files?bucket=ui-review-s3&prefix=UI-REVIEW%20converted%2F1034%2Foutput%2F"
    ]
  },
  "the object browser, as a tenant user": {
    "url": "/documents/files?bucket=ui-review-s3",
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
      "Modified from: none picked",
      "Modified to: none picked",
      "New folder",
      "Refresh",
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
    "links": []
  },
  "the object browser, in a bucket": {
    "url": "/documents/files?bucket=ui-review-s3",
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
      "Modified from: none picked",
      "Modified to: none picked",
      "New folder",
      "Refresh",
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
    "links": []
  },
  "the object browser, no bucket chosen": {
    "url": "/documents/files",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/buckets"
    ],
    "headings": [
      "Browse files",
      "Connections"
    ],
    "buttons": [
      "Browse UI-REVIEW LocalStack S3 (fake keys)"
    ],
    "columns": [],
    "fields": [
      "Connection",
      "Search connections…"
    ],
    "links": []
  }
};
