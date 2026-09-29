// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "no inbox yet, as a tenant user": {
    "url": "/documents/inbox",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/inbox",
      "GET /storage.json/inbox/files?limit=50"
    ],
    "headings": [
      "Inbox",
      "No inbox yet"
    ],
    "buttons": [
      "Refresh"
    ],
    "columns": [],
    "fields": [],
    "links": []
  },
  "no inbox yet, as a workspace administrator": {
    "url": "/documents/inbox",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/inbox",
      "GET /storage.json/inbox/files?limit=50",
      "GET /appUser.json/listUsers"
    ],
    "headings": [
      "Inbox",
      "No inbox yet"
    ],
    "buttons": [
      "Refresh",
      "Set up the inbox"
    ],
    "columns": [],
    "fields": [],
    "links": []
  },
  "the inbox, as a tenant user with the page": {
    "url": "/documents/inbox",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/inbox",
      "GET /storage.json/inbox/files?limit=50"
    ],
    "headings": [
      "Inbox",
      "Upload",
      "Settings",
      "Arrivals"
    ],
    "buttons": [
      "Columns",
      "Refresh",
      "What the inbox accepts"
    ],
    "columns": [
      [
        "File",
        "Size",
        "Uploaded by",
        "Uploaded",
        "SHA-256"
      ]
    ],
    "fields": [
      "Choose files"
    ],
    "links": [
      "/pipelines/schedules"
    ]
  },
  "the inbox, as a tenant user without the page": {
    "url": "/unauthorized?page=objects",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Browse files isn't part of your access"
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
  "the inbox, as a workspace administrator": {
    "url": "/documents/inbox",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/inbox",
      "GET /storage.json/inbox/files?limit=50",
      "GET /appUser.json/listUsers"
    ],
    "headings": [
      "Inbox",
      "Upload",
      "Settings",
      "Arrivals"
    ],
    "buttons": [
      "Columns",
      "Inbox settings",
      "Refresh",
      "What the inbox accepts"
    ],
    "columns": [
      [
        "File",
        "Size",
        "Uploaded by",
        "Uploaded",
        "SHA-256"
      ]
    ],
    "fields": [
      "Choose files"
    ],
    "links": [
      "/pipelines/schedules"
    ]
  },
  "the settings dialog": {
    "headings": [
      "Inbox settings"
    ],
    "buttons": [
      "Cancel",
      "Save changes",
      "Turn off"
    ],
    "columns": [],
    "fields": [
      "No lower limit",
      "Size limit (MB)",
      "Storage connection *(required)"
    ],
    "links": [],
    "items": []
  }
};
