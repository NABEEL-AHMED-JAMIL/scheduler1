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
    "url": "/documents/review/1005",
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
      "/documents/review"
    ]
  },
  "a document in review, as a tenant user with the page": {
    "url": "/documents/review/1005",
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
      "/documents/review"
    ]
  },
  "an approved document, read-only": {
    "url": "/documents/review/1000",
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
      "/documents/review"
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
    "url": "/documents/intelligence?tab=dataset",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentExtraction.json/stats?days=30",
      "GET /documentType.json/fetchAll",
      "GET /documentExtraction.json/dataset?documentTypeId=1001&page=0&size=50"
    ],
    "headings": [
      "Document Intelligence",
      "Dataset (1 of 1)"
    ],
    "buttons": [
      "CSV",
      "Columns",
      "Dataset",
      "Document types",
      "Intake",
      "JSON Lines",
      "New document type",
      "Overview",
      "Read a stored file",
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
      "/documents/review/1000"
    ]
  },
  "the document types, as a workspace administrator": {
    "url": "/documents/intelligence?tab=types",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentExtraction.json/stats?days=30",
      "GET /documentType.json/fetchAll"
    ],
    "headings": [
      "Document Intelligence",
      "Document types"
    ],
    "buttons": [
      "Columns",
      "Dataset",
      "Document types",
      "Intake",
      "Invoice",
      "New document type",
      "Overview",
      "Purchase order",
      "Read a stored file",
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
        "State"
      ]
    ],
    "fields": [],
    "links": []
  },
  "the overview, as a tenant user with the page": {
    "url": "/documents/intelligence",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentExtraction.json/stats?days=30",
      "GET /documentType.json/fetchAll",
      "GET /documentOcr.json/fetchAll",
      "GET /documentExtraction.json/fetchAll"
    ],
    "headings": [
      "Document Intelligence",
      "Recent documents (2 of 2)"
    ],
    "buttons": [
      "Actions for ocr-live-check.png",
      "Columns",
      "Dataset",
      "Document types",
      "Intake",
      "Invoice: 4 fields, 0 documents",
      "Overview",
      "Purchase order: 4 fields, 1 document",
      "Read a stored file",
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
      "/documents/review",
      "/documents/review/1000",
      "/documents/review/1005"
    ]
  },
  "the overview, as a tenant user without the page": {
    "url": "/unauthorized?page=document-intelligence",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Document Intelligence isn't part of your access"
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
    "url": "/documents/intelligence",
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
      "Document Intelligence",
      "Recent documents (2 of 2)"
    ],
    "buttons": [
      "Actions for ocr-live-check.png",
      "Columns",
      "Custom type",
      "Dataset",
      "Document types",
      "Intake",
      "Invoice: 4 fields, 0 documents",
      "New document type",
      "Overview",
      "Purchase order: 4 fields, 1 document",
      "Read a stored file",
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
      "/documents/review",
      "/documents/review/1000",
      "/documents/review/1005"
    ]
  },
  "the review queue, as a tenant user without the page": {
    "url": "/unauthorized?page=document-review",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Review queue isn't part of your access"
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
    "url": "/documents/review",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /documentReview.json/queue?page=0&size=50&status=Review",
      "GET /documentType.json/fetchAll",
      "GET /documentOcr.json/fetchAll"
    ],
    "headings": [
      "Review queue",
      "Documents (1 of 1)"
    ],
    "buttons": [
      "Columns",
      "Refresh",
      "Start reviewing"
    ],
    "columns": [
      [
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
      "State",
      "Waiting"
    ],
    "links": [
      "/documents/review/1005"
    ]
  }
};
