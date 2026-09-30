// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a storage connection's row menu": {
    "headings": [],
    "buttons": [
      "Clone…",
      "Delete",
      "Edit",
      "Test connection"
    ],
    "columns": [],
    "fields": [],
    "links": [],
    "items": [
      "Edit",
      "Test connection",
      "Clone…",
      "Delete"
    ]
  },
  "storage connections, as a platform administrator": {
    "url": "/integration/storage-connections",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storageConnection.json/fetchAllConnections",
      "GET /tenant.json/listTenants"
    ],
    "headings": [
      "Storage connections",
      "Connections (1 of 1)"
    ],
    "buttons": [
      "Actions for UI-REVIEW LocalStack S3 (fake keys)",
      "Cards",
      "Columns",
      "Copy ui-review-2924",
      "Copy ui-review-s3",
      "New connection",
      "Only mine",
      "Refresh",
      "Table"
    ],
    "columns": [
      [
        "",
        "Name",
        "Alias",
        "Provider",
        "Target",
        "Workspace",
        "Credentials",
        "Last test",
        "Created by",
        "Updated by",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Filter by provider",
      "Search connections",
      "Search name, alias or host",
      "Select UI-REVIEW LocalStack S3 (fake keys)",
      "Select all shown",
      "Workspace"
    ],
    "links": []
  },
  "storage connections, as a tenant user (admin-only)": {
    "url": "/unauthorized",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "This page isn't available to you"
    ],
    "buttons": [
      "Go back"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/"
    ]
  },
  "storage connections, as a workspace administrator": {
    "url": "/integration/storage-connections",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storageConnection.json/fetchAllConnections"
    ],
    "headings": [
      "Storage connections",
      "Connections (1 of 1)"
    ],
    "buttons": [
      "Actions for UI-REVIEW LocalStack S3 (fake keys)",
      "Cards",
      "Columns",
      "Copy ui-review-2924",
      "Copy ui-review-s3",
      "New connection",
      "Only mine",
      "Refresh",
      "Table"
    ],
    "columns": [
      [
        "",
        "Name",
        "Alias",
        "Provider",
        "Target",
        "Credentials",
        "Last test",
        "Created by",
        "Updated by",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Filter by provider",
      "Search connections",
      "Search name, alias or host",
      "Select UI-REVIEW LocalStack S3 (fake keys)",
      "Select all shown"
    ],
    "links": []
  },
  "the bell, opened": {
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [],
    "buttons": [
      "4 unread notifications",
      "Job completedUI-REVIEW Ledger nightly (daily 02:00, 3 attempts) finished successfully. <n> ago",
      "Mark all read"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/notifications"
    ]
  },
  "the new storage connection form": {
    "requests": [],
    "headings": [
      "New storage connection"
    ],
    "buttons": [
      "Cancel",
      "Create",
      "Discover"
    ],
    "columns": [],
    "fields": [
      "AKIA…",
      "Access key",
      "Alias *(required)",
      "Bucket *(required)",
      "Description",
      "Endpoint *(required)",
      "Name *(required)",
      "Provider *(required)",
      "Reports archive",
      "Secret key",
      "Status",
      "What this connection is for",
      "http://localhost:9000",
      "my-company-data",
      "reports-archive",
      "secret access key"
    ],
    "links": [],
    "items": []
  },
  "the notifications page": {
    "url": "/notifications",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /notification.json/list?limit=1000&page=1"
    ],
    "headings": [
      "Notifications",
      "Recent (2 of 44)"
    ],
    "buttons": [
      "Mark all read (2)",
      "Mark as read",
      "Open",
      "Refresh"
    ],
    "columns": [],
    "fields": [
      "Unread only"
    ],
    "links": []
  },
  "the notifications page, as a tenant user": {
    "url": "/notifications",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /notification.json/list?limit=1000&page=1"
    ],
    "headings": [
      "Notifications",
      "Recent (2 of 44)"
    ],
    "buttons": [
      "Mark all read (2)",
      "Mark as read",
      "Open",
      "Refresh"
    ],
    "columns": [],
    "fields": [
      "Unread only"
    ],
    "links": []
  }
};
