// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "a tenant's edit form": {
    "requests": [],
    "headings": [
      "Edit tenant"
    ],
    "buttons": [
      "Cancel",
      "Save changes"
    ],
    "columns": [],
    "fields": [
      "Ministry of Justice",
      "Status",
      "Tenant code *(required)",
      "Tenant name *(required)",
      "ministry-of-justice"
    ],
    "links": [],
    "items": []
  },
  "access profiles, as a platform administrator": {
    "url": "/administration/access-profiles",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /tenant.json/listTenants",
      "GET /pageAccess.json/pages"
    ],
    "headings": [
      "Page access",
      "Choose a workspace"
    ],
    "buttons": [
      "New profile",
      "Refresh"
    ],
    "columns": [],
    "fields": [
      "Choose a workspace…",
      "Workspace"
    ],
    "links": [
      "/administration",
      "/administration/access-profiles",
      "/administration/appearance",
      "/administration/data-policies",
      "/administration/security",
      "/administration/users"
    ]
  },
  "access profiles, as a workspace administrator": {
    "url": "/administration/access-profiles",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /pageAccess.json/pages",
      "GET /pageAccess.json/listProfiles",
      "GET /managedService.json/actions?limit=1"
    ],
    "headings": [
      "Page access",
      "Who can open what",
      "UI-REVIEW Analysts — Zürich – 東京 ✓ finance analytics and AI prompt authors (long name)",
      "UI-REVIEW No pages"
    ],
    "buttons": [
      "Actions for UI-REVIEW Analysts — Zürich – 東京 ✓ finance analytics and AI prompt authors (long name)",
      "Actions for UI-REVIEW No pages",
      "Check a person",
      "New profile",
      "People × pages",
      "Profiles",
      "Refresh",
      "See in grid ›"
    ],
    "columns": [
      [
        "Role",
        "Opens",
        "Can change"
      ]
    ],
    "fields": [],
    "links": [
      "/administration",
      "/administration/access-profiles",
      "/administration/appearance",
      "/administration/data-policies",
      "/administration/security",
      "/administration/users"
    ]
  },
  "access profiles: the people x pages grid": {
    "requests": [
      "GET /pageAccess.json/listPeople"
    ],
    "headings": [
      "Page access",
      "Who can open what"
    ],
    "buttons": [
      "Check a person",
      "New profile",
      "People × pages",
      "Profiles",
      "Refresh"
    ],
    "columns": [
      [
        "Role",
        "Opens",
        "Can change"
      ],
      [
        "",
        "",
        "Operations",
        "Person",
        "Profile",
        "Source Jobs",
        "Source Tasks"
      ]
    ],
    "fields": [
      "Find a person",
      "Find a person…",
      "Profile for Casey Baseline",
      "Source Jobs for Casey Baseline",
      "Source Tasks for Casey Baseline"
    ],
    "links": [
      "/administration",
      "/administration/access-profiles",
      "/administration/appearance",
      "/administration/data-policies",
      "/administration/security",
      "/administration/users"
    ]
  },
  "an access profile's row menu": {
    "headings": [],
    "buttons": [
      "Delete",
      "Edit pages",
      "Make default"
    ],
    "columns": [],
    "fields": [],
    "links": [],
    "items": [
      "Edit pages",
      "Make default",
      "Delete"
    ]
  },
  "tenants, as a platform administrator": {
    "url": "/platform/workspaces",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /tenant.json/listTenants",
      "GET /managedService.json/myWorkspaces"
    ],
    "headings": [
      "Workspaces",
      "Workspaces (2 of 2)"
    ],
    "buttons": [
      "Actions for Claude Demo 75a611b4",
      "Actions for Default",
      "Buckets",
      "Cards",
      "Columns",
      "Copy claude-demo-75a611b4",
      "Copy default",
      "Created",
      "Kafka",
      "New workspace",
      "Only mine",
      "Pipelines",
      "Refresh",
      "Schedules",
      "Table",
      "Topics",
      "Users",
      "Workspace"
    ],
    "columns": [
      [
        "Workspace",
        "Admin",
        "Users",
        "Schedules",
        "Pipelines",
        "Topics",
        "Buckets",
        "Kafka",
        "Created",
        "Created by",
        "Updated by",
        "Mode",
        "State",
        "Actions"
      ]
    ],
    "fields": [
      "Filter by state",
      "Search name or code",
      "Search workspaces"
    ],
    "links": [
      "/platform",
      "/platform/billing-analytics",
      "/platform/engine",
      "/platform/managed-service",
      "/platform/rate-cards",
      "/platform/reliability",
      "/platform/requests",
      "/platform/staff-activity",
      "/platform/work-in-workspace",
      "/platform/workspaces"
    ]
  },
  "tenants, as a workspace administrator": {
    "url": "/unauthorized",
    "requests": [
      "GET /taskInbox.json/count",
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
  "the gate, as a tenant user asking for Analytics Studio": {
    "url": "/unauthorized?page=analytics&title=Analytics%20Studio",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Analytics Studio isn't part of your access"
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
