// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a contract opened in the side panel": {
    "headings": [
      "Data contract · wound_intake",
      "Versions",
      "Schema v1",
      "Validate a payload"
    ],
    "buttons": [
      "Close",
      "New version from sample",
      "Raw JSON",
      "Validate",
      "v1"
    ],
    "columns": [
      [
        "Version",
        "State",
        "Saved",
        "Actions"
      ],
      [
        "Field",
        "Type",
        "Required"
      ]
    ],
    "fields": [
      "Against",
      "Payload",
      "{\"case_id\": \"WC-1001\", \"patient\": {\"mrn\": \"M-77\"}}"
    ],
    "links": [],
    "items": []
  },
  "a file source opened in the side panel": {
    "headings": [
      "Edit source · LIVE-CHECK 0928 customers CSV",
      "Try it"
    ],
    "buttons": [
      "API",
      "Bucket folder",
      "Close",
      "Database",
      "File",
      "Infer schema",
      "Preview",
      "Save",
      "Test connection"
    ],
    "columns": [],
    "fields": [
      ",",
      "Active",
      "Daily customers",
      "Delimiter",
      "Description",
      "Format",
      "Name *(required)",
      "Path *(required)",
      "Storage connection *(required)",
      "The first line is a header",
      "What it holds, and for what",
      "exports/customers.csv"
    ],
    "links": [],
    "items": []
  },
  "a source's row menu": {
    "headings": [],
    "buttons": [
      "Delete",
      "Edit, test & preview"
    ],
    "columns": [],
    "fields": [],
    "links": [],
    "items": [
      "Edit, test & preview",
      "Delete"
    ]
  },
  "the data contracts, as a tenant user with the page": {
    "url": "/integration/sources?tab=contracts",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /dataContract.json/list"
    ],
    "headings": [
      "Sources",
      "Data contracts"
    ],
    "buttons": [
      "Columns",
      "Data contracts",
      "Database connections",
      "Refresh",
      "Sources",
      "result_manifest",
      "wound_intake"
    ],
    "columns": [
      [
        "Contract",
        "Direction",
        "Active",
        "Latest",
        "Sensitivity",
        "Created"
      ]
    ],
    "fields": [],
    "links": []
  },
  "the data contracts, as a workspace administrator": {
    "url": "/integration/sources?tab=contracts",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /dataContract.json/list"
    ],
    "headings": [
      "Sources",
      "Data contracts"
    ],
    "buttons": [
      "Columns",
      "Data contracts",
      "Database connections",
      "Install template",
      "New from sample",
      "Refresh",
      "Sources",
      "result_manifest",
      "wound_intake"
    ],
    "columns": [
      [
        "Contract",
        "Direction",
        "Active",
        "Latest",
        "Sensitivity",
        "Created"
      ]
    ],
    "fields": [],
    "links": []
  },
  "the database connections, as a workspace administrator": {
    "url": "/integration/sources?tab=connections",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /dataSource.json/connection/list"
    ],
    "headings": [
      "Sources",
      "Database connections"
    ],
    "buttons": [
      "Actions for UI-CHECK warehouse",
      "Columns",
      "Data contracts",
      "Database connections",
      "New connection",
      "Refresh",
      "Sources",
      "UI-CHECK warehouse"
    ],
    "columns": [
      [
        "Connection",
        "Host · database",
        "User",
        "Password",
        "TLS",
        "State",
        "Actions"
      ]
    ],
    "fields": [],
    "links": []
  },
  "the sources, as a platform administrator": {
    "url": "/integration/sources",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /dataSource.json/list?limit=50&page=1",
      "GET /tenant.json/listTenants"
    ],
    "headings": [
      "Sources",
      "Sources (2 of 2)"
    ],
    "buttons": [
      "Actions for LIVE-CHECK 0928 customers CSV",
      "Actions for LIVE-CHECK platform bucket probe",
      "Cards",
      "Columns",
      "Data contracts",
      "Database connections",
      "LIVE-CHECK 0928 customers CSV",
      "LIVE-CHECK platform bucket probe",
      "New source",
      "Refresh",
      "Sources",
      "Table"
    ],
    "columns": [
      [
        "Source",
        "Kind",
        "Format",
        "Last test",
        "Created",
        "Workspace",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Kind",
      "Search sources"
    ],
    "links": []
  },
  "the sources, as a tenant user with the page": {
    "url": "/integration/sources",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /dataSource.json/list?limit=50&page=1"
    ],
    "headings": [
      "Sources",
      "Sources (2 of 2)"
    ],
    "buttons": [
      "Cards",
      "Columns",
      "Data contracts",
      "Database connections",
      "LIVE-CHECK 0928 customers CSV",
      "LIVE-CHECK platform bucket probe",
      "Refresh",
      "Sources",
      "Table"
    ],
    "columns": [
      [
        "Source",
        "Kind",
        "Format",
        "Last test",
        "Created",
        "State"
      ]
    ],
    "fields": [
      "Kind",
      "Search sources"
    ],
    "links": []
  },
  "the sources, as a tenant user without the page": {
    "url": "/unauthorized?page=sources",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Sources isn't part of your access"
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
  "the sources, as a workspace administrator": {
    "url": "/integration/sources",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /dataSource.json/list?limit=50&page=1"
    ],
    "headings": [
      "Sources",
      "Sources (2 of 2)"
    ],
    "buttons": [
      "Actions for LIVE-CHECK 0928 customers CSV",
      "Actions for LIVE-CHECK platform bucket probe",
      "Cards",
      "Columns",
      "Data contracts",
      "Database connections",
      "LIVE-CHECK 0928 customers CSV",
      "LIVE-CHECK platform bucket probe",
      "New source",
      "Refresh",
      "Sources",
      "Table"
    ],
    "columns": [
      [
        "Source",
        "Kind",
        "Format",
        "Last test",
        "Created",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Kind",
      "Search sources"
    ],
    "links": []
  }
};
