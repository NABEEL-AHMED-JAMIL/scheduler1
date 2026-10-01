// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a collection's row menu": {
    "headings": [],
    "buttons": [
      "Deactivate",
      "Delete",
      "Edit details",
      "Open"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/integration/api-collections/1000"
    ],
    "items": [
      "Open",
      "Edit details",
      "Deactivate",
      "Delete"
    ]
  },
  "an API opened in the side panel": {
    "headings": [
      "Edit API · Get status",
      "Test"
    ],
    "buttons": [
      "Add parameter",
      "Add value",
      "Auth",
      "Body",
      "Close",
      "Headers",
      "Params",
      "Save",
      "Schemas",
      "Settings",
      "Test"
    ],
    "columns": [],
    "fields": [
      "Description",
      "Enabled",
      "Environment",
      "Folder",
      "Method",
      "Name *(required)",
      "Patients API",
      "URL *(required)",
      "What it returns, and for what",
      "{{baseUrl}}/v1/patients"
    ],
    "links": [],
    "items": []
  },
  "one collection, as a tenant user with the page": {
    "url": "/integration/api-collections/1000",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /apiCollection.json/get?collectionId=1000",
      "GET /apiCollection.json/usage?collectionId=1000"
    ],
    "headings": [
      "LIVE-CHECK 0928 httpbin",
      "APIs (2 of 2)",
      "Environments",
      "Versions",
      "Used by"
    ],
    "buttons": [
      "Cards",
      "Columns",
      "Get status",
      "Metadata probe",
      "Refresh",
      "Table"
    ],
    "columns": [
      [
        "API",
        "Method · endpoint",
        "Auth",
        "Folder",
        "Timeout",
        "Last test",
        "State"
      ],
      [
        "Environment",
        "Variables"
      ],
      [
        "Version",
        "Saved"
      ]
    ],
    "fields": [
      "Search APIs",
      "State"
    ],
    "links": [
      "/integration/api-collections"
    ]
  },
  "one collection, as a workspace administrator": {
    "url": "/integration/api-collections/1000",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /apiCollection.json/get?collectionId=1000",
      "GET /apiCollection.json/usage?collectionId=1000"
    ],
    "headings": [
      "LIVE-CHECK 0928 httpbin",
      "APIs (2 of 2)",
      "Environments",
      "Versions",
      "Used by"
    ],
    "buttons": [
      "Actions for Get status",
      "Actions for Metadata probe",
      "Actions for the Prod environment",
      "Add API",
      "Cards",
      "Columns",
      "Edit details",
      "Get status",
      "Metadata probe",
      "New environment",
      "Refresh",
      "Table"
    ],
    "columns": [
      [
        "API",
        "Method · endpoint",
        "Auth",
        "Folder",
        "Timeout",
        "Last test",
        "State",
        "Actions"
      ],
      [
        "Environment",
        "Variables",
        "Actions"
      ],
      [
        "Version",
        "Saved"
      ]
    ],
    "fields": [
      "Disable Get status",
      "Disable Metadata probe",
      "Enabled",
      "Search APIs",
      "State"
    ],
    "links": [
      "/integration/api-collections"
    ]
  },
  "the list, as a platform administrator": {
    "url": "/integration/api-collections",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /apiCollection.json/list?limit=50&page=1",
      "GET /tenant.json/listTenants"
    ],
    "headings": [
      "API Collections",
      "Collections (1 of 1)"
    ],
    "buttons": [
      "Actions for LIVE-CHECK 0928 httpbin",
      "Cards",
      "Columns",
      "Import",
      "New collection",
      "Refresh",
      "Table"
    ],
    "columns": [
      [
        "Collection",
        "Source",
        "Sensitivity",
        "APIs",
        "Folders",
        "Version",
        "Updated",
        "Workspace",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Search collections",
      "State"
    ],
    "links": [
      "/integration/api-collections/1000"
    ]
  },
  "the list, as a tenant user with the page": {
    "url": "/integration/api-collections",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /apiCollection.json/list?limit=50&page=1"
    ],
    "headings": [
      "API Collections",
      "Collections (1 of 1)"
    ],
    "buttons": [
      "Cards",
      "Columns",
      "Refresh",
      "Table"
    ],
    "columns": [
      [
        "Collection",
        "Source",
        "Sensitivity",
        "APIs",
        "Folders",
        "Version",
        "Updated",
        "State"
      ]
    ],
    "fields": [
      "Search collections",
      "State"
    ],
    "links": [
      "/integration/api-collections/1000"
    ]
  },
  "the list, as a tenant user without the page": {
    "url": "/unauthorized?page=api-collections",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "API Collections isn't part of your access"
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
  "the list, as a workspace administrator": {
    "url": "/integration/api-collections",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /apiCollection.json/list?limit=50&page=1"
    ],
    "headings": [
      "API Collections",
      "Collections (1 of 1)"
    ],
    "buttons": [
      "Actions for LIVE-CHECK 0928 httpbin",
      "Cards",
      "Columns",
      "Import",
      "New collection",
      "Refresh",
      "Table"
    ],
    "columns": [
      [
        "Collection",
        "Source",
        "Sensitivity",
        "APIs",
        "Folders",
        "Version",
        "Updated",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Search collections",
      "State"
    ],
    "links": [
      "/integration/api-collections/1000"
    ]
  }
};
