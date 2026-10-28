// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a connection, as a workspace administrator": {
    "url": "/connections/connectors",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /connectorHub.json/connectors",
      "GET /connectorHub.json/connection/list"
    ],
    "headings": [
      "Connections",
      "Connections (1 of 1)"
    ],
    "buttons": [
      "APIs (1)",
      "All (5)",
      "Build custom (REST)",
      "Columns",
      "Connect Files in storage",
      "Connect REST API",
      "Connected (1)",
      "Connection",
      "Connector",
      "Databases (2)",
      "Files (1)",
      "Lag",
      "Last sync",
      "Mode",
      "New connection",
      "Refresh",
      "Rows",
      "SaaS apps (1)",
      "Shop DB (demo)",
      "Status"
    ],
    "columns": [
      [
        "Connection",
        "Connector",
        "Mode",
        "Last sync",
        "Rows",
        "Lag",
        "Status"
      ]
    ],
    "fields": [
      "Search connectors",
      "State"
    ],
    "links": [
      "/connections",
      "/connections/api-collections",
      "/connections/connectors",
      "/connections/contracts",
      "/connections/databases",
      "/connections/sources",
      "/connections/storage"
    ],
    "panel": {
      "headings": [
        "Shop DB (demo)",
        "Streams",
        "Sync runs"
      ],
      "buttons": [
        "Accept the change",
        "Add tables",
        "Close",
        "Delete",
        "Lag",
        "Last sync",
        "Make a source",
        "Mode",
        "Rows",
        "Schedule",
        "Started",
        "Status",
        "Stop syncing public.customers",
        "Stream",
        "Sync now",
        "Sync public.customers now",
        "Test",
        "Took",
        "Why"
      ],
      "columns": [
        [
          "Stream",
          "Mode",
          "Schedule",
          "Rows",
          "Last sync",
          "Lag",
          "Sensitive",
          ""
        ],
        [
          "Started",
          "Stream",
          "Status",
          "Rows",
          "Took",
          "Why"
        ]
      ],
      "fields": [],
      "links": [],
      "items": []
    }
  },
  "the gallery and connections, as a tenant user with the page": {
    "url": "/connections/connectors",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /connectorHub.json/connectors",
      "GET /connectorHub.json/connection/list"
    ],
    "headings": [
      "Connections",
      "Connections (1 of 1)"
    ],
    "buttons": [
      "APIs (1)",
      "All (5)",
      "Columns",
      "Connected (1)",
      "Connection",
      "Connector",
      "Databases (2)",
      "Files (1)",
      "Lag",
      "Last sync",
      "Mode",
      "Refresh",
      "Rows",
      "SaaS apps (1)",
      "Shop DB (demo)",
      "Status"
    ],
    "columns": [
      [
        "Connection",
        "Connector",
        "Mode",
        "Last sync",
        "Rows",
        "Lag",
        "Status"
      ]
    ],
    "fields": [
      "Search connectors",
      "State"
    ],
    "links": [
      "/connections",
      "/connections/api-collections",
      "/connections/connectors",
      "/connections/contracts",
      "/connections/databases",
      "/connections/sources"
    ]
  },
  "the gallery and connections, as a workspace administrator": {
    "url": "/connections/connectors",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /connectorHub.json/connectors",
      "GET /connectorHub.json/connection/list"
    ],
    "headings": [
      "Connections",
      "Connections (1 of 1)"
    ],
    "buttons": [
      "APIs (1)",
      "All (5)",
      "Build custom (REST)",
      "Columns",
      "Connect Files in storage",
      "Connect REST API",
      "Connected (1)",
      "Connection",
      "Connector",
      "Databases (2)",
      "Files (1)",
      "Lag",
      "Last sync",
      "Mode",
      "New connection",
      "Refresh",
      "Rows",
      "SaaS apps (1)",
      "Shop DB (demo)",
      "Status"
    ],
    "columns": [
      [
        "Connection",
        "Connector",
        "Mode",
        "Last sync",
        "Rows",
        "Lag",
        "Status"
      ]
    ],
    "fields": [
      "Search connectors",
      "State"
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
  "the page, as a tenant user without it": {
    "url": "/unauthorized?page=connector-hub&title=Connections",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Connections isn't part of your access"
    ],
    "buttons": [
      "Request access"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/"
    ]
  }
};
