// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a connection, as a workspace administrator": {
    "url": "/integration/connectors",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /connectorHub.json/connectors",
      "GET /connectorHub.json/connection/list"
    ],
    "headings": [
      "Connector Hub",
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
      "Databases (2)",
      "Files (1)",
      "New connection",
      "Refresh",
      "SaaS apps (1)",
      "Shop DB (demo)"
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
    "links": [],
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
        "Make a source",
        "Stop syncing public.customers",
        "Sync now",
        "Sync public.customers now",
        "Test"
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
    "url": "/integration/connectors",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /connectorHub.json/connectors",
      "GET /connectorHub.json/connection/list"
    ],
    "headings": [
      "Connector Hub",
      "Connections (1 of 1)"
    ],
    "buttons": [
      "APIs (1)",
      "All (5)",
      "Columns",
      "Connected (1)",
      "Databases (2)",
      "Files (1)",
      "Refresh",
      "SaaS apps (1)",
      "Shop DB (demo)"
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
    "links": []
  },
  "the gallery and connections, as a workspace administrator": {
    "url": "/integration/connectors",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /connectorHub.json/connectors",
      "GET /connectorHub.json/connection/list"
    ],
    "headings": [
      "Connector Hub",
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
      "Databases (2)",
      "Files (1)",
      "New connection",
      "Refresh",
      "SaaS apps (1)",
      "Shop DB (demo)"
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
    "links": []
  },
  "the page, as a tenant user without it": {
    "url": "/unauthorized?page=connector-hub",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Connector Hub isn't part of your access"
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
