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
      "{\"record_id\": \"R-1001\", \"customer\": {\"id\": \"C-77\"}}"
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
    "url": "/connections/contracts",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /dataContract.json/list"
    ],
    "headings": [
      "Data contracts",
      "Data contracts"
    ],
    "buttons": [
      "Columns",
      "Refresh",
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
    "links": [
      "/connections",
      "/connections/api-collections",
      "/connections/contracts",
      "/connections/databases",
      "/connections/sources"
    ]
  },
  "the data contracts, as a workspace administrator": {
    "url": "/connections/contracts",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /dataContract.json/list"
    ],
    "headings": [
      "Data contracts",
      "Data contracts"
    ],
    "buttons": [
      "Columns",
      "Install template",
      "New from sample",
      "Refresh",
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
    "links": [
      "/connections",
      "/connections/api-collections",
      "/connections/connectors",
      "/connections/contracts",
      "/connections/databases",
      "/connections/sources",
      "/connections/storage"
    ]
  },
  "the database connections, as a workspace administrator": {
    "url": "/connections/databases",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /dataSource.json/connection/list"
    ],
    "headings": [
      "Database connections",
      "Database connections"
    ],
    "buttons": [
      "Actions for UI-CHECK warehouse",
      "Columns",
      "New connection",
      "Refresh",
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
    "links": [
      "/connections",
      "/connections/api-collections",
      "/connections/connectors",
      "/connections/contracts",
      "/connections/databases",
      "/connections/sources",
      "/connections/storage"
    ]
  },
  "the sources, as a platform administrator": {
    "url": "/connections/sources",
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
      "LIVE-CHECK 0928 customers CSV",
      "LIVE-CHECK platform bucket probe",
      "New source",
      "Refresh",
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
    "links": [
      "/connections",
      "/connections/api-collections",
      "/connections/connectors",
      "/connections/contracts",
      "/connections/databases",
      "/connections/sources",
      "/connections/storage"
    ]
  },
  "the sources, as a tenant user with the page": {
    "url": "/connections/sources",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /dataSource.json/list?limit=50&page=1",
      "GET /pipeline.json/steps/reads"
    ],
    "headings": [
      "Sources",
      "What your pipelines read",
      "Places read",
      "Sources (2 of 2)"
    ],
    "buttons": [
      "Cards",
      "Columns",
      "LIVE-CHECK 0928 customers CSV",
      "LIVE-CHECK platform bucket probe",
      "Refresh",
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
    "links": [
      "/connections",
      "/connections/api-collections",
      "/connections/contracts",
      "/connections/databases",
      "/connections/sources",
      "/pipelines/list"
    ]
  },
  "the sources, as a tenant user without the page": {
    "url": "/unauthorized?page=sources&title=Sources",
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
    "url": "/connections/sources",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /dataSource.json/list?limit=50&page=1",
      "GET /pipeline.json/steps/reads"
    ],
    "headings": [
      "Sources",
      "What your pipelines read",
      "Places read",
      "Sources (2 of 2)"
    ],
    "buttons": [
      "Actions for LIVE-CHECK 0928 customers CSV",
      "Actions for LIVE-CHECK platform bucket probe",
      "Cards",
      "Columns",
      "LIVE-CHECK 0928 customers CSV",
      "LIVE-CHECK platform bucket probe",
      "New source",
      "Refresh",
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
    "links": [
      "/connections",
      "/connections/api-collections",
      "/connections/connectors",
      "/connections/contracts",
      "/connections/databases",
      "/connections/sources",
      "/connections/storage",
      "/pipelines/list"
    ]
  }
};
