// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "no inbox yet, as a tenant user": {
    "url": "/documents/intake/file-drop",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/inbox",
      "GET /storage.json/inbox/files?limit=50",
      "GET /taskInbox.json/colleagues"
    ],
    "headings": [
      "Intake",
      "No file drop yet"
    ],
    "buttons": [],
    "columns": [],
    "fields": [],
    "links": [
      "/documents"
    ]
  },
  "no inbox yet, as a workspace administrator": {
    "url": "/documents/intake/file-drop",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/inbox",
      "GET /storage.json/inbox/files?limit=50",
      "GET /appUser.json/listUsers"
    ],
    "headings": [
      "Intake",
      "No file drop yet"
    ],
    "buttons": [
      "Set up the file drop"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/documents",
      "/documents/approved-data",
      "/documents/in",
      "/documents/intake",
      "/documents/intake/email-in",
      "/documents/intake/file-drop",
      "/documents/intake/upload",
      "/documents/types"
    ]
  },
  "the inbox, as a tenant user with the page": {
    "url": "/documents/intake/file-drop",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/inbox",
      "GET /storage.json/inbox/files?limit=50",
      "GET /taskInbox.json/colleagues"
    ],
    "headings": [
      "Intake",
      "Upload",
      "Settings",
      "Arrivals"
    ],
    "buttons": [
      "Columns",
      "Copy the key of live-customers.csv",
      "Refresh",
      "What the file drop accepts"
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
      "/documents",
      "/pipelines/schedules"
    ]
  },
  "the inbox, as a tenant user without the page": {
    "url": "/unauthorized?page=document-intelligence&title=Intake",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Intake isn't part of your access"
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
    "url": "/documents/intake/file-drop",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/inbox",
      "GET /storage.json/inbox/files?limit=50",
      "GET /appUser.json/listUsers"
    ],
    "headings": [
      "Intake",
      "Upload",
      "Settings",
      "Arrivals"
    ],
    "buttons": [
      "Change",
      "Columns",
      "Copy the key of live-customers.csv",
      "Refresh",
      "What the file drop accepts"
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
      "/documents",
      "/documents/approved-data",
      "/documents/in",
      "/documents/intake",
      "/documents/intake/email-in",
      "/documents/intake/file-drop",
      "/documents/intake/upload",
      "/documents/types",
      "/pipelines/schedules"
    ]
  },
  "the settings dialog": {
    "headings": [
      "File drop settings"
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
