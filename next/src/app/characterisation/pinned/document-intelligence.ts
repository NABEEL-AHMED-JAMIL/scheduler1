// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a built-in type opened in the side panel": {
    "headings": [
      "Document type · Purchase order",
      "Fields (4)",
      "Line-item tables (1)",
      "Rules (1)",
      "Versions"
    ],
    "buttons": [
      "Close",
      "Customise",
      "v1",
      "v2"
    ],
    "columns": [
      [
        "Version",
        "Name",
        "Saved"
      ]
    ],
    "fields": [
      "Also written as (comma-separated): Invoice No., Invoice #",
      "At least one row",
      "Auto-approve at",
      "Column 1 also written as",
      "Column 1 key",
      "Column 1 label",
      "Column 1 type",
      "Column 2 also written as",
      "Column 2 key",
      "Column 2 label",
      "Column 2 type",
      "Field 1 also written as",
      "Field 1 key",
      "Field 1 label",
      "Field 1 type",
      "Field 2 also written as",
      "Field 2 key",
      "Field 2 label",
      "Field 2 type",
      "Field 3 also written as",
      "Field 3 key",
      "Field 3 label",
      "Field 3 type",
      "Field 4 also written as",
      "Field 4 key",
      "Field 4 label",
      "Field 4 type",
      "Instructions",
      "Key",
      "Label",
      "Line items",
      "Name",
      "Required",
      "Rule 1 column",
      "Rule 1 field",
      "Rule 1 kind",
      "Rule 1 message",
      "Rule 1 table",
      "Rule 1 tolerance",
      "Table 1 key",
      "Table 1 label",
      "Tolerance (0.01)",
      "What a reviewer is told when it fails (optional)",
      "What it is",
      "Words on the page",
      "key_in_snake_case",
      "line_items"
    ],
    "links": [],
    "items": []
  },
  "a document in review": {
    "url": "/review/documents/1005",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentReview.json/fetchById?extractionId=1005",
      "GET /documentOcr.json/fetchById?ocrDocumentId=1001",
      "GET /documentReview.json/queue?page=0&size=200&status=Review",
      "GET /documentOcr.json/pageImage?ocrDocumentId=1001&page=1"
    ],
    "headings": [
      "ocr-live-check.png",
      "Extracted fields",
      "Rule check"
    ],
    "buttons": [
      "Approve & next",
      "Claim",
      "Invoice number *",
      "Issue date *",
      "Reject",
      "Total *",
      "Vendor *",
      "Zoom in",
      "Zoom out"
    ],
    "columns": [],
    "fields": [
      "Invoice number",
      "Issue date",
      "Total",
      "Vendor"
    ],
    "links": [
      "/review",
      "/review/documents"
    ]
  },
  "a document in review, as a tenant user with the page": {
    "url": "/review/documents/1005",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentReview.json/fetchById?extractionId=1005",
      "GET /documentOcr.json/fetchById?ocrDocumentId=1001",
      "GET /documentReview.json/queue?page=0&size=200&status=Review",
      "GET /documentOcr.json/pageImage?ocrDocumentId=1001&page=1"
    ],
    "headings": [
      "ocr-live-check.png",
      "Extracted fields",
      "Rule check"
    ],
    "buttons": [
      "Approve & next",
      "Claim",
      "Invoice number *",
      "Issue date *",
      "Reject",
      "Total *",
      "Vendor *",
      "Zoom in",
      "Zoom out"
    ],
    "columns": [],
    "fields": [
      "Invoice number",
      "Issue date",
      "Total",
      "Vendor"
    ],
    "links": [
      "/review",
      "/review/documents"
    ]
  },
  "add from starters": {
    "headings": [
      "Add from starters",
      "Healthcare"
    ],
    "buttons": [
      "Add",
      "Cancel",
      "Choose all 1"
    ],
    "columns": [],
    "fields": [
      "ReferralA letter asking another provider to see a patient."
    ],
    "links": [],
    "items": []
  },
  "an approved document, read-only": {
    "url": "/review/documents/1000",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentReview.json/fetchById?extractionId=1000",
      "GET /documentOcr.json/fetchById?ocrDocumentId=1001",
      "GET /documentOcr.json/pageImage?ocrDocumentId=1001&page=1"
    ],
    "headings": [
      "ocr-live-check.png",
      "Extracted fields",
      "Rule check",
      "Ordered items (1)"
    ],
    "buttons": [
      "Corrections (1)",
      "PO number *",
      "Supplier *",
      "Zoom in",
      "Zoom out"
    ],
    "columns": [
      [
        "#",
        "Description",
        "Amount"
      ]
    ],
    "fields": [
      "Ordered items row 1 · Description",
      "PO number",
      "Supplier"
    ],
    "links": [
      "/review",
      "/review/documents"
    ]
  },
  "read a document": {
    "headings": [
      "Read a document"
    ],
    "buttons": [
      "A stored file",
      "Cancel",
      "Read and extract",
      "Upload a file"
    ],
    "columns": [],
    "fields": [
      "Choose a file",
      "Document type",
      "Folder",
      "Read it again even if this file was read before",
      "Storage connection *(required)"
    ],
    "links": [],
    "items": []
  },
  "the dataset, as a workspace administrator": {
    "url": "/documents/approved-data",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentExtraction.json/stats?days=30",
      "GET /documentType.json/fetchAll",
      "GET /documentExtraction.json/dataset?documentTypeId=1001&page=0&size=50"
    ],
    "headings": [
      "Approved data",
      "Approved data (1 of 1)"
    ],
    "buttons": [
      "CSV",
      "Columns",
      "JSON Lines",
      "More actions",
      "Refresh",
      "Upload documents"
    ],
    "columns": [
      [
        "Document",
        "Approved",
        "PO number",
        "Order date",
        "Supplier",
        "Order total",
        "Ordered items"
      ]
    ],
    "fields": [
      "Document type"
    ],
    "links": [
      "/documents",
      "/documents/approved-data",
      "/documents/in",
      "/documents/intake",
      "/documents/types",
      "/review/documents/1000"
    ]
  },
  "the document types, as a workspace administrator": {
    "url": "/documents/types",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentExtraction.json/stats?days=30",
      "GET /documentType.json/fetchAll",
      "GET /sourceJob.json/documentTrigger"
    ],
    "headings": [
      "Document types",
      "Document types"
    ],
    "buttons": [
      "Add from starters",
      "Columns",
      "Invoice",
      "More actions",
      "New document type",
      "Purchase order",
      "Refresh",
      "Upload documents"
    ],
    "columns": [
      [
        "Type",
        "Fields",
        "Tables",
        "Rules",
        "Auto-approve at",
        "Version",
        "Kind",
        "When approved, starts…",
        "State"
      ]
    ],
    "fields": [],
    "links": [
      "/documents",
      "/documents/approved-data",
      "/documents/in",
      "/documents/intake",
      "/documents/types",
      "/pipelines/schedules/new?whenApproved=1000",
      "/pipelines/schedules/new?whenApproved=1001"
    ]
  },
  "the email-in section of Intake, as a tenant user with the page": {
    "url": "/documents/intake/email-in",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentType.json/fetchAll",
      "GET /documentOcr.json/intakes?channel=email&limit=100",
      "GET /documentOcr.json/mailbox"
    ],
    "headings": [
      "Intake",
      "Email-in",
      "What arrived"
    ],
    "buttons": [
      "Columns",
      "Copy the address",
      "Refresh"
    ],
    "columns": [
      [
        "File",
        "Channel",
        "From",
        "Outcome",
        "Document",
        "Arrived"
      ]
    ],
    "fields": [
      "Channel"
    ],
    "links": [
      "/documents",
      "/documents/approved-data",
      "/documents/in",
      "/documents/intake",
      "/documents/intake/email-in",
      "/documents/intake/file-drop",
      "/documents/intake/upload",
      "/documents/types",
      "/review/documents/1005"
    ]
  },
  "the overview, as a tenant user with the page": {
    "url": "/documents/in",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentExtraction.json/stats?days=30",
      "GET /documentType.json/fetchAll",
      "GET /documentOcr.json/fetchAll",
      "GET /documentExtraction.json/fetchAll"
    ],
    "headings": [
      "Documents in",
      "Recent documents (2 of 2)"
    ],
    "buttons": [
      "Actions for ocr-live-check.png",
      "Columns",
      "More actions",
      "Refresh",
      "Upload documents"
    ],
    "columns": [
      [
        "Document",
        "Type",
        "Fields",
        "Confidence",
        "State",
        "Received",
        "Actions"
      ]
    ],
    "fields": [
      "Document type",
      "Search documents",
      "State"
    ],
    "links": [
      "/documents",
      "/documents/approved-data",
      "/documents/in",
      "/documents/intake",
      "/documents/types",
      "/review/documents",
      "/review/documents/1000",
      "/review/documents/1005"
    ]
  },
  "the overview, as a tenant user without the page": {
    "url": "/unauthorized?page=document-intelligence&title=Documents%20in",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Documents in isn't part of your access"
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
  "the overview, as a workspace administrator": {
    "url": "/documents/in",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentExtraction.json/stats?days=30",
      "GET /documentType.json/fetchAll",
      "GET /documentOcr.json/fetchAll",
      "GET /documentExtraction.json/fetchAll"
    ],
    "headings": [
      "Documents in",
      "Recent documents (2 of 2)"
    ],
    "buttons": [
      "Actions for ocr-live-check.png",
      "Columns",
      "More actions",
      "Refresh",
      "Upload documents"
    ],
    "columns": [
      [
        "Document",
        "Type",
        "Fields",
        "Confidence",
        "State",
        "Received",
        "Actions"
      ]
    ],
    "fields": [
      "Document type",
      "Search documents",
      "State"
    ],
    "links": [
      "/documents",
      "/documents/approved-data",
      "/documents/in",
      "/documents/intake",
      "/documents/types",
      "/review/documents",
      "/review/documents/1000",
      "/review/documents/1005"
    ]
  },
  "the review queue, as a tenant user without the page": {
    "url": "/unauthorized?page=document-review&title=Document%20review",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Document review isn't part of your access"
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
  "the review queue, as a workspace administrator": {
    "url": "/review/documents",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentReview.json/queue?page=0&size=50&status=Review",
      "GET /documentType.json/fetchAll",
      "GET /documentOcr.json/fetchAll"
    ],
    "headings": [
      "Document review",
      "Documents (1 of 1)"
    ],
    "buttons": [
      "Columns",
      "Refresh",
      "Start reviewing"
    ],
    "columns": [
      [
        "",
        "Document",
        "Type",
        "To check",
        "Least sure",
        "Waiting since",
        "Claimed",
        "State"
      ]
    ],
    "fields": [
      "Claimed",
      "Confidence",
      "Document type",
      "Select all documents on this page that can be decided",
      "Select ocr-live-check.png",
      "State",
      "Waiting"
    ],
    "links": [
      "/review",
      "/review/all",
      "/review/approvals",
      "/review/documents",
      "/review/documents/1005",
      "/review/runs"
    ]
  },
  "the upload section of Intake, as a workspace administrator": {
    "url": "/documents/intake/upload",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentType.json/fetchAll",
      "GET /documentOcr.json/intakes?channel=upload&limit=100",
      "GET /documentOcr.json/mailbox"
    ],
    "headings": [
      "Intake",
      "Upload documents",
      "What arrived"
    ],
    "buttons": [
      "Columns",
      "Read a stored file",
      "Refresh",
      "Upload documents"
    ],
    "columns": [
      [
        "File",
        "Channel",
        "From",
        "Outcome",
        "Document",
        "Arrived"
      ]
    ],
    "fields": [
      "Channel"
    ],
    "links": [
      "/documents",
      "/documents/approved-data",
      "/documents/in",
      "/documents/intake",
      "/documents/intake/email-in",
      "/documents/intake/file-drop",
      "/documents/intake/upload",
      "/documents/types",
      "/review/documents/1005"
    ]
  }
};
