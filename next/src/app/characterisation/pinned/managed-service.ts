// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "managed service, as a platform administrator": {
    "url": "/administration/managed-service",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /managedService.json/listGrants",
      "GET /tenant.json/listTenants",
      "GET /appUser.json/listUsers"
    ],
    "headings": [
      "Managed service",
      "Grants"
    ],
    "buttons": [
      "Columns",
      "Grant",
      "Refresh",
      "Revoke Sam Staff in Claude Demo"
    ],
    "columns": [
      [
        "Staff member",
        "Workspace",
        "Granted",
        "Revoked",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Filter by staff member",
      "Filter by workspace",
      "Include revoked"
    ],
    "links": [
      "/administration/staff-activity"
    ]
  },
  "our team's activity, as a MANAGED workspace's administrator": {
    "url": "/administration/team-activity",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /managedService.json/actions?limit=50"
    ],
    "headings": [
      "Our team's activity",
      "Changes"
    ],
    "buttons": [
      "Load older",
      "Refresh"
    ],
    "columns": [
      [
        "When",
        "Staff member",
        "Change",
        "Service"
      ]
    ],
    "fields": [
      "Filter by staff member"
    ],
    "links": []
  },
  "pipelines, in a MANAGED workspace": {
    "url": "/pipelines",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "POST /sourceTask.json/listSourceTask?limit=1000 {}"
    ],
    "headings": [
      "Pipelines",
      "Tasks (2 of 2)"
    ],
    "buttons": [
      "Cards",
      "Columns",
      "Only mine",
      "Refresh",
      "Show payload",
      "Table"
    ],
    "columns": [
      [
        "",
        "Task",
        "Type",
        "Topic",
        "Pipeline",
        "Storage",
        "Created by",
        "Updated by",
        "Status",
        "Actions"
      ]
    ],
    "fields": [
      "All pipelines",
      "All topics",
      "Filter by pipeline",
      "Filter by topic",
      "Search id, name, topic or pipeline",
      "Search tasks"
    ],
    "links": []
  },
  "staff activity, as a platform administrator": {
    "url": "/administration/staff-activity",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /managedService.json/actions?limit=50",
      "GET /tenant.json/listTenants",
      "GET /appUser.json/listUsers"
    ],
    "headings": [
      "Staff activity",
      "Changes"
    ],
    "buttons": [
      "Columns",
      "Load older",
      "Refresh"
    ],
    "columns": [
      [
        "When",
        "Staff member",
        "Workspace",
        "Change",
        "Service"
      ]
    ],
    "fields": [
      "Filter by staff member",
      "Filter by workspace"
    ],
    "links": []
  },
  "the pages refuse a workspace administrator": "/unauthorized",
  "work in a workspace, as a platform administrator": {
    "url": "/administration/work-in-workspace",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /managedService.json/myWorkspaces"
    ],
    "headings": [
      "Work in a workspace",
      "Claude Demo"
    ],
    "buttons": [
      "Refresh",
      "Work in Claude Demo"
    ],
    "columns": [],
    "fields": [],
    "links": []
  }
};
