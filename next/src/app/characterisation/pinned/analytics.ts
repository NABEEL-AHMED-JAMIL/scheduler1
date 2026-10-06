// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "Analytics Studio, a CSV chosen: what it reads and shows": {
    "requests": [
      "GET /analytics.json/schema?connection=ui-review-s3&path=customers.csv",
      "GET /analytics.json/overview?connection=ui-review-s3&path=customers.csv",
      "GET /analytics.json/preview?connection=ui-review-s3&page=0&path=customers.csv"
    ],
    "headings": [
      "Analytics Studio",
      "Files",
      "Saved analyses",
      "customers.csv"
    ],
    "buttons": [
      "Activity",
      "Canvas",
      "Charts",
      "Close files",
      "Close saved analyses",
      "Compact",
      "Data",
      "Files",
      "More for this file",
      "Overview",
      "Profile",
      "Quality",
      "Quality issues: 0, nothing to look at",
      "Refresh the saved analysis list",
      "SQL",
      "all *.csv",
      "customers.csv 1.4 KB",
      "root"
    ],
    "columns": [],
    "fields": [
      "Connection",
      "Filter the files and folders listed here",
      "Filter this folder"
    ],
    "links": []
  },
  "Analytics Studio, as a tenant user with every page": {
    "url": "/data/analytics",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/buckets",
      "GET /storage.json/listObjects?bucket=ui-review-s3&maxKeys=100&prefix="
    ],
    "headings": [
      "Analytics Studio",
      "Files",
      "Saved analyses"
    ],
    "buttons": [
      "Choose a file",
      "Close files",
      "Close saved analyses",
      "Refresh the saved analysis list",
      "UI-REVIEW converted",
      "UI-REVIEW uploads",
      "root"
    ],
    "columns": [],
    "fields": [
      "Connection",
      "Filter the files and folders listed here",
      "Filter this folder"
    ],
    "links": []
  },
  "Analytics Studio, as a workspace administrator": {
    "url": "/data/analytics",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /storage.json/buckets",
      "GET /storage.json/listObjects?bucket=ui-review-s3&maxKeys=100&prefix="
    ],
    "headings": [
      "Analytics Studio",
      "Files",
      "Saved analyses"
    ],
    "buttons": [
      "Choose a file",
      "Close files",
      "Close saved analyses",
      "Refresh the saved analysis list",
      "UI-REVIEW converted",
      "UI-REVIEW uploads",
      "root"
    ],
    "columns": [],
    "fields": [
      "Connection",
      "Filter the files and folders listed here",
      "Filter this folder"
    ],
    "links": []
  },
  "a dashboard, opened": {
    "url": "/data/analytics/dashboards?board=1378",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /analyticsWorkspace.json/fetchAllDashboards",
      "GET /analyticsWorkspace.json/fetchAllAnalyses",
      "GET /analyticsLibrary.json/fetchAllQueries",
      "GET /analyticsWorkspace.json/fetchDashboardById?analyticsDashboardId=1378",
      "GET /analyticsWorkspace.json/fetchDashboardById?analyticsDashboardId=1379"
    ],
    "headings": [],
    "buttons": [
      "Add a widget",
      "Chart theme: Console",
      "More actions"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/data/analytics/dashboards"
    ]
  },
  "saved analyses and dashboards": {
    "url": "/data/analytics/dashboards",
    "requests": [
      "GET /taskInbox.json/count",
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1",
      "GET /analyticsWorkspace.json/fetchAllDashboards",
      "GET /analyticsWorkspace.json/fetchAllAnalyses",
      "GET /analyticsLibrary.json/fetchAllQueries",
      "GET /analyticsWorkspace.json/fetchDashboardById?analyticsDashboardId=1379",
      "GET /analyticsWorkspace.json/fetchDashboardById?analyticsDashboardId=1378"
    ],
    "headings": [
      "Saved Analyses"
    ],
    "buttons": [
      "New dashboard"
    ],
    "columns": [],
    "fields": [],
    "links": [
      "/data/analytics",
      "/data/analytics/dashboards?board=1378",
      "/data/analytics/dashboards?board=1379"
    ]
  },
  "saved analyses, as a tenant user without the page": {
    "url": "/unauthorized?page=analytics-dashboards&title=Saved%20Analyses",
    "requests": [
      "GET /notification.json/unreadCount",
      "GET /notification.json/list?limit=20&page=1"
    ],
    "headings": [
      "Saved Analyses isn't part of your access"
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
