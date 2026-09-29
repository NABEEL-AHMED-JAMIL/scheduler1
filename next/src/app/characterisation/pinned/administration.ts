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
      "Access profiles",
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
    "links": []
  },
  "access profiles, as a workspace administrator": {
    "url": "/administration/access-profiles",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /pageAccess.json/pages",
      "GET /pageAccess.json/listProfiles"
    ],
    "headings": [
      "Access profiles",
      "UI-REVIEW Analysts — Zürich – 東京 ✓ finance analytics and AI prompt authors (long name)",
      "UI-REVIEW No pages"
    ],
    "buttons": [
      "Actions for UI-REVIEW Analysts — Zürich – 東京 ✓ finance analytics and AI prompt authors (long name)",
      "Actions for UI-REVIEW No pages",
      "New profile",
      "People × pages",
      "Profiles",
      "Refresh",
      "See in grid ›"
    ],
    "columns": [],
    "fields": [],
    "links": []
  },
  "access profiles: the people x pages grid": {
    "requests": [
      "GET /pageAccess.json/listPeople"
    ],
    "headings": [
      "Access profiles"
    ],
    "buttons": [
      "New profile",
      "People × pages",
      "Profiles",
      "Refresh"
    ],
    "columns": [
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
    "links": []
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
    "url": "/administration/tenants",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /tenant.json/listTenants"
    ],
    "headings": [
      "Tenants",
      "Tenants (2 of 2)",
      "Claude Demo 75a611b4",
      "Default"
    ],
    "buttons": [
      "Access",
      "Cards",
      "Copy claude-demo-75a611b4",
      "Copy default",
      "Delete Claude Demo 75a611b4",
      "Delete Default",
      "Edit",
      "Make managed",
      "New tenant",
      "Only mine",
      "Refresh",
      "Sorted ascending; sort descending",
      "Suspend",
      "Table",
      "Users"
    ],
    "columns": [],
    "fields": [
      "Filter by state",
      "Search name or code",
      "Search tenants",
      "Sort by"
    ],
    "links": []
  },
  "tenants, as a workspace administrator": {
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
  "the gate, as a tenant user asking for Analytics Studio": {
    "url": "/unauthorized?page=analytics",
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
