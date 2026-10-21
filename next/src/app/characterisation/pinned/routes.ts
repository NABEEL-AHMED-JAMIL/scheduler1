// Recorded by scripts/characterisation/record.mjs -- see ../harness.ts. Review the diff: it is the baseline.
export const PINNED: Record<string, unknown> = {
  "every route": [
    {
      "path": "/login",
      "title": "Sign in",
      "guards": [
        "anonymousOnly"
      ],
      "lazy": true
    },
    {
      "path": "/login",
      "redirectTo": "/dashboard",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/",
      "guards": [
        "anonymousOnly"
      ],
      "lazy": true
    },
    {
      "path": "/sso/callback",
      "title": "Signing in",
      "guards": [],
      "lazy": true
    },
    {
      "path": "/request-workspace",
      "title": "Request a workspace",
      "guards": [],
      "lazy": true
    },
    {
      "path": "/docs",
      "title": "Setup guide",
      "guards": [],
      "lazy": true
    },
    {
      "path": "/f/:token",
      "title": "Form",
      "guards": [],
      "lazy": true
    },
    {
      "path": "/embed/runs/:token",
      "title": "Run",
      "guards": [],
      "lazy": true
    },
    {
      "path": "/",
      "guards": [
        "authGuard",
        "passwordChangeGuard"
      ],
      "lazy": true
    },
    {
      "path": "/",
      "redirectTo": "dashboard",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/dashboard",
      "title": "Home",
      "guards": [],
      "lazy": true
    },
    {
      "path": "/connections/storage",
      "title": "Storage connections",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/developers/api-clients",
      "title": "API Clients",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/developers/portal",
      "title": "Developer portal",
      "pageKey": "developer-portal",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/connections/api-collections",
      "title": "API Collections",
      "pageKey": "api-collections",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/connections/api-collections/:collectionId",
      "title": "API collection",
      "pageKey": "api-collections",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/connections/sources",
      "title": "Sources",
      "pageKey": "sources",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/connections/databases",
      "title": "Database connections",
      "pageKey": "sources",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/connections/contracts",
      "title": "Data contracts",
      "pageKey": "sources",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/connections/connectors",
      "title": "Connections",
      "pageKey": "connector-hub",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/integration/connectors/oauth/callback",
      "title": "Connecting",
      "pageKey": "connector-hub",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/list",
      "title": "Pipelines",
      "pageKey": "tasks",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/new",
      "title": "New pipeline",
      "pageKey": "tasks",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/new/form",
      "title": "New pipeline",
      "pageKey": "tasks",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/bulk",
      "title": "Bulk pipelines",
      "pageKey": "tasks",
      "minRole": "TENANT_ADMIN",
      "kind": "task",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/:taskDetailId/edit",
      "title": "Pipeline",
      "pageKey": "tasks",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/schedules",
      "title": "Schedules & triggers",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/schedules/new",
      "title": "New schedule",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/schedules/bulk",
      "title": "Bulk schedules",
      "pageKey": "jobs",
      "kind": "job",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/schedules/:jobId/edit",
      "title": "Schedule",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/schedules/:jobId/assistant",
      "title": "Schedule assistant",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/schedules/:jobId/executions",
      "title": "Schedule runs",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/schedules/:jobId/runs/:jobQueueId",
      "title": "Run",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/schedules/:jobId/runs/:jobQueueId/",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/pipelines/schedules/:jobId/runs/:jobQueueId/logs",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/runs/latest",
      "title": "Runs",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/runs/by-date",
      "title": "Runs by date",
      "pageKey": "queue",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/runs/failed",
      "title": "Failed runs",
      "pageKey": "queue",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/runs/backfills",
      "title": "Backfills",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/runs/analytics",
      "title": "Run analytics",
      "pageKey": "reports",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/documents/in",
      "title": "Documents in",
      "pageKey": "document-intelligence",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/documents/types",
      "title": "Document types",
      "pageKey": "document-intelligence",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/documents/datasets",
      "title": "Datasets",
      "pageKey": "document-intelligence",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/documents/email-in",
      "title": "Email-in",
      "pageKey": "document-intelligence",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/tools/converter",
      "title": "Document Converter",
      "pageKey": "tools-converter",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/reports/from-pipelines",
      "title": "Reports from pipelines",
      "pageKey": "tools-converter",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/reports/overview",
      "title": "Reports overview",
      "pageKey": "report-studio",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/reports/templates",
      "title": "Report templates",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/reports/templates/:templateId/design",
      "title": "Template designer",
      "pageKey": "report-templates",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/reports/new",
      "title": "Create report",
      "pageKey": "report-generate",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/reports/templates/:templateId",
      "title": "Report template",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/reports/library",
      "title": "Report library",
      "pageKey": "report-library",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/reports/library/:reportId",
      "title": "Report",
      "pageKey": "report-library",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/reports/assets",
      "title": "Assets & branding",
      "pageKey": "report-assets",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/reports/assets/branding/:profileId",
      "title": "Brand profile",
      "pageKey": "report-assets",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/reports/assets/:assetId",
      "title": "Asset",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/reports/settings",
      "title": "Report settings",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/reports/data",
      "title": "Report data",
      "pageKey": "report-data",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/data/files",
      "title": "Browse files",
      "pageKey": "objects",
      "minRole": "TENANT_USER",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/documents/file-drop",
      "title": "File drop",
      "pageKey": "objects",
      "minRole": "TENANT_USER",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/tools/transcript",
      "title": "Audio Transcript",
      "pageKey": "tools-transcript",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/data/catalog",
      "title": "Data Catalog",
      "pageKey": "data-catalog",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/data/ask",
      "title": "Ask your data",
      "pageKey": "ask-data",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/data/analytics",
      "title": "Analytics Studio",
      "pageKey": "analytics",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/data/analytics/dashboards",
      "title": "Dashboards",
      "pageKey": "analytics-dashboards",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/forms/builder",
      "title": "Forms",
      "pageKey": "forms",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/forms/:formId/fill",
      "title": "Fill in a form",
      "pageKey": "forms",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/forms/submissions",
      "title": "Form submissions",
      "pageKey": "form-submissions",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/review/all",
      "title": "Review",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/review/approvals",
      "title": "Approvals",
      "pageKey": "task-inbox",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/review/requests",
      "title": "My requests",
      "pageKey": "task-inbox",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/review/runs",
      "title": "Runs to review",
      "pageKey": "task-inbox",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/review/documents",
      "title": "Document review",
      "pageKey": "document-review",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/review/documents/:extractionId",
      "title": "Review a document",
      "pageKey": "document-review",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/workflows/designer",
      "title": "Approval workflows",
      "pageKey": "workflow-designer",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/prompts",
      "title": "Prompts",
      "pageKey": "ai-prompts",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/prompts/new",
      "title": "New prompt",
      "pageKey": "ai-prompts",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/prompts/:promptId/edit",
      "title": "Prompt",
      "pageKey": "ai-prompts",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/ai/assistant",
      "title": "AI Assistant",
      "pageKey": "ai-prompts",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/settings/tools",
      "title": "Tool Registry",
      "pageKey": "ai-prompts",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/settings/alerts",
      "title": "Alerts",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/settings/model-connections",
      "title": "Model connections",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/settings/task-registry",
      "title": "Task Registry",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/settings/task-registry/new",
      "title": "New registry task",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/settings/task-registry/:pipelineKey",
      "title": "Edit registry task",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/settings/kafka",
      "title": "Kafka & Topics",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/settings/values",
      "title": "Configuration values",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/platform/engine",
      "title": "Engine settings",
      "minRole": "PLATFORM_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/settings/home-pages",
      "title": "Home pages",
      "minRole": "TENANT_ADMIN",
      "kind": "HOME_PAGE",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/settings/task-groups",
      "title": "Task groups",
      "minRole": "TENANT_ADMIN",
      "kind": "TASK_GROUP",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/billing/usage",
      "title": "Cost & usage",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/billing/invoices",
      "title": "Invoices",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/billing/invoices/:number",
      "title": "Invoice",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/billing/documents",
      "title": "Billing documents",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/billing/analytics",
      "title": "Billing analytics",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/billing/settings",
      "title": "Billing settings",
      "minRole": "PLATFORM_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/administration/users",
      "title": "Users",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/administration/users/:appUserId",
      "title": "Edit user",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/administration/access-profiles",
      "title": "Page access",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/administration/access-profiles/new",
      "title": "New access profile",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/administration/access-profiles/:pageAccessProfileId",
      "title": "Access profile",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/administration/data-policies",
      "title": "Data policies",
      "pageKey": "ai-prompts",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/administration/security",
      "title": "Sign-in security",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/administration/appearance",
      "title": "Appearance",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/platform/workspaces",
      "title": "Workspaces",
      "minRole": "PLATFORM_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/platform/requests",
      "title": "Workspace requests",
      "minRole": "PLATFORM_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/platform/managed-service",
      "title": "Managed service",
      "minRole": "PLATFORM_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/platform/staff-activity",
      "title": "Staff activity",
      "minRole": "PLATFORM_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/platform/service-health",
      "title": "Service health",
      "minRole": "PLATFORM_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/administration/team-activity",
      "title": "Our team's activity",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/profile",
      "title": "Your profile",
      "guards": [],
      "lazy": true
    },
    {
      "path": "/account/security",
      "title": "My security",
      "guards": [],
      "lazy": true
    },
    {
      "path": "/notifications",
      "title": "Notifications",
      "guards": [],
      "lazy": true
    },
    {
      "path": "/unauthorized",
      "title": "Not available",
      "guards": [],
      "lazy": true
    },
    {
      "path": "/connections",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/documents",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/forms",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/pipelines",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/runs",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/review",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/data",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/reports",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/tools",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/administration",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/billing",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/developers",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/platform",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/workflows/inbox",
      "redirectTo": "review/approvals",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/workflows/requests",
      "redirectTo": "review/requests",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/documents/review",
      "redirectTo": "review/documents",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/documents/review/:extractionId",
      "redirectTo": "review/documents/:extractionId",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/integration/connectors",
      "redirectTo": "connections/connectors",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/integration/connectors/storage",
      "redirectTo": "connections/storage",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/integration/api-collections",
      "redirectTo": "connections/api-collections",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/integration/api-collections/:collectionId",
      "redirectTo": "connections/api-collections/:collectionId",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/integration/sources",
      "redirectTo": "connections/sources",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/integration/api-clients",
      "redirectTo": "developers/api-clients",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/integration/developer",
      "redirectTo": "developers/portal",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/integration/developer/reference",
      "redirectTo": "developers/portal/reference",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/integration/developer/changelog",
      "redirectTo": "developers/portal/changelog",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/integration/developer/guides/:slug",
      "redirectTo": "developers/portal/guides/:slug",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/documents/intelligence",
      "redirectTo": "documents/in",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/documents/inbox",
      "redirectTo": "documents/file-drop",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/documents/reports",
      "redirectTo": "reports/library",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/data/reports",
      "redirectTo": "reports/library",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/documents/files",
      "redirectTo": "data/files",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/documents/converter",
      "redirectTo": "tools/converter",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/documents/transcript",
      "redirectTo": "tools/transcript",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/pipelines/executions",
      "redirectTo": "runs/latest",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/pipelines/queue",
      "redirectTo": "runs/by-date",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/pipelines/run-analytics",
      "redirectTo": "runs/analytics",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/ai/prompts",
      "redirectTo": "pipelines/prompts",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/ai/prompts/new",
      "redirectTo": "pipelines/prompts/new",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/ai/prompts/:promptId/edit",
      "redirectTo": "pipelines/prompts/:promptId/edit",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/ai/tools",
      "redirectTo": "settings/tools",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/ai/connections",
      "redirectTo": "settings/model-connections",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/configuration/task-registry",
      "redirectTo": "settings/task-registry",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/configuration/kafka",
      "redirectTo": "settings/kafka",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/configuration/values",
      "redirectTo": "settings/values",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/configuration/home-pages",
      "redirectTo": "settings/home-pages",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/configuration/task-groups",
      "redirectTo": "settings/task-groups",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/configuration/engine",
      "redirectTo": "platform/engine",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/billing/rates",
      "redirectTo": "billing/settings",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/administration/tenants",
      "redirectTo": "platform/workspaces",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/administration/tenant-requests",
      "redirectTo": "platform/requests",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/administration/managed-service",
      "redirectTo": "platform/managed-service",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/administration/staff-activity",
      "redirectTo": "platform/staff-activity",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/administration/work-in-workspace",
      "redirectTo": "platform/workspaces",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/administration/reliability",
      "redirectTo": "platform/service-health",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/platform/work-in-workspace",
      "redirectTo": "platform/workspaces",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/platform/reliability",
      "redirectTo": "platform/service-health",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/platform/billing-analytics",
      "redirectTo": "billing/analytics",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/platform/rate-cards",
      "redirectTo": "billing/settings",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/jobs",
      "redirectTo": "pipelines/schedules",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/jobs/new",
      "redirectTo": "pipelines/schedules/new",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/jobs/bulk",
      "redirectTo": "pipelines/schedules/bulk",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/jobs/history",
      "redirectTo": "runs/latest",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/jobs/:jobId/edit",
      "redirectTo": "pipelines/schedules/:jobId/edit",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/jobs/:jobId/assistant",
      "redirectTo": "pipelines/schedules/:jobId/assistant",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/jobs/:jobId/history",
      "redirectTo": "pipelines/schedules/:jobId/executions",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/jobs/:jobId/runs/:jobQueueId/logs",
      "redirectTo": "pipelines/schedules/:jobId/runs/:jobQueueId/logs",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/queue",
      "redirectTo": "runs/by-date",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/tasks",
      "redirectTo": "pipelines/list",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/tasks/new",
      "redirectTo": "pipelines/new",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/tasks/bulk",
      "redirectTo": "pipelines/bulk",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/tasks/:taskDetailId/edit",
      "redirectTo": "pipelines/:taskDetailId/edit",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/reports",
      "redirectTo": "runs/analytics",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/configuration/pipelines",
      "redirectTo": "settings/task-registry",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/configuration/storage-connections",
      "redirectTo": "connections/storage",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/integration/storage-connections",
      "redirectTo": "connections/storage",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/objects/files",
      "redirectTo": "data/files",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/objects/analytics",
      "redirectTo": "data/analytics",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/objects/analytics/dashboards",
      "redirectTo": "data/analytics/dashboards",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/assistants/prompts",
      "redirectTo": "pipelines/prompts",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/assistants/prompts/new",
      "redirectTo": "pipelines/prompts/new",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/assistants/prompts/:promptId/edit",
      "redirectTo": "pipelines/prompts/:promptId/edit",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/assistants/connections",
      "redirectTo": "settings/model-connections",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/jobs",
      "redirectTo": "pipelines/schedules",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/jobs/new",
      "redirectTo": "pipelines/schedules/new",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/jobs/bulk",
      "redirectTo": "pipelines/schedules/bulk",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/jobs/history",
      "redirectTo": "runs/latest",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/jobs/:jobId/edit",
      "redirectTo": "pipelines/schedules/:jobId/edit",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/jobs/:jobId/assistant",
      "redirectTo": "pipelines/schedules/:jobId/assistant",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/jobs/:jobId/history",
      "redirectTo": "pipelines/schedules/:jobId/executions",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/jobs/:jobId/runs/:jobQueueId/logs",
      "redirectTo": "pipelines/schedules/:jobId/runs/:jobQueueId/logs",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/queue",
      "redirectTo": "runs/by-date",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/tasks",
      "redirectTo": "pipelines/list",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/tasks/new",
      "redirectTo": "pipelines/new",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/tasks/bulk",
      "redirectTo": "pipelines/bulk",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/tasks/:taskDetailId/edit",
      "redirectTo": "pipelines/:taskDetailId/edit",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/objects",
      "redirectTo": "data/files",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/analytics",
      "redirectTo": "data/analytics",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/analytics/dashboards",
      "redirectTo": "data/analytics/dashboards",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/admin/storage",
      "redirectTo": "connections/storage",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/storage-connections",
      "redirectTo": "connections/storage",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/ai/agents",
      "redirectTo": "pipelines/prompts",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/ai/models",
      "redirectTo": "settings/model-connections",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/admin/users",
      "redirectTo": "administration/users",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/admin/access-profiles",
      "redirectTo": "administration/access-profiles",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/admin/tenants",
      "redirectTo": "platform/workspaces",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/admin/tenant-requests",
      "redirectTo": "platform/requests",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/pipelines",
      "redirectTo": "settings/task-registry",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/forms",
      "redirectTo": "settings/task-registry",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/pipeline-forms",
      "redirectTo": "settings/task-registry",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/task-types",
      "redirectTo": "settings/kafka",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/lookup",
      "redirectTo": "settings/values",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/configuration/lookup",
      "redirectTo": "settings/values",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/administration/billing",
      "redirectTo": "billing/usage",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/administration/billing/invoices",
      "redirectTo": "billing/invoices",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/administration/billing/invoices/:number",
      "redirectTo": "billing/invoices/:number",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/administration/billing/documents",
      "redirectTo": "billing/documents",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/administration/billing/analytics",
      "redirectTo": "billing/analytics",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/administration/billing/rates",
      "redirectTo": "billing/settings",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/**",
      "title": "Page not found",
      "guards": [],
      "lazy": true
    },
    {
      "path": "/**",
      "redirectTo": "",
      "guards": [],
      "lazy": false
    }
  ],
  "old address /admin/access-profiles": {
    "lands": "/administration/access-profiles",
    "heading": "Page access"
  },
  "old address /admin/storage": {
    "lands": "/connections/storage",
    "heading": "Connections"
  },
  "old address /admin/tenant-requests": {
    "lands": "/platform/requests",
    "heading": "Workspace requests"
  },
  "old address /admin/tenants": {
    "lands": "/platform/workspaces",
    "heading": "Workspaces"
  },
  "old address /admin/users": {
    "lands": "/administration/users",
    "heading": "Users"
  },
  "old address /administration/billing": {
    "lands": "/billing/usage",
    "heading": "Cost & usage"
  },
  "old address /administration/billing/analytics": {
    "lands": "/billing/analytics",
    "heading": "Analytics"
  },
  "old address /administration/billing/documents": {
    "lands": "/billing/documents",
    "heading": "Billing documents"
  },
  "old address /administration/billing/invoices": {
    "lands": "/billing/invoices",
    "heading": "Invoices"
  },
  "old address /administration/billing/invoices/:number": {
    "lands": "/billing/invoices/INV-2026-0001",
    "heading": "Invoices"
  },
  "old address /administration/billing/rates": {
    "lands": "/billing/settings",
    "heading": "Billing settings"
  },
  "old address /administration/managed-service": {
    "lands": "/platform/managed-service",
    "heading": "Managed service"
  },
  "old address /administration/reliability": {
    "lands": "/platform/service-health",
    "heading": "Service health"
  },
  "old address /administration/staff-activity": {
    "lands": "/platform/staff-activity",
    "heading": "Staff activity"
  },
  "old address /administration/tenant-requests": {
    "lands": "/platform/requests",
    "heading": "Workspace requests"
  },
  "old address /administration/tenants": {
    "lands": "/platform/workspaces",
    "heading": "Workspaces"
  },
  "old address /administration/work-in-workspace": {
    "lands": "/platform/workspaces",
    "heading": "Workspaces"
  },
  "old address /ai/agents": {
    "lands": "/pipelines/prompts",
    "heading": "Prompts"
  },
  "old address /ai/connections": {
    "lands": "/settings/model-connections",
    "heading": "Model connections"
  },
  "old address /ai/models": {
    "lands": "/settings/model-connections",
    "heading": "Model connections"
  },
  "old address /ai/prompts": {
    "lands": "/pipelines/prompts",
    "heading": "Prompts"
  },
  "old address /ai/prompts/:promptId/edit": {
    "lands": "/pipelines/prompts/1049/edit",
    "heading": "UI-REVIEW Zürich – 東京 ✓ draft prompt (never activated) with a deliberately long name for truncation checks in the prompt list Claude Demo 75a611b4v1Inactive"
  },
  "old address /ai/prompts/new": {
    "lands": "/pipelines/prompts/new",
    "heading": "New prompt"
  },
  "old address /ai/tools": {
    "lands": "/settings/tools",
    "heading": "Tool Registry"
  },
  "old address /analytics": {
    "lands": "/data/analytics",
    "heading": "Analytics Studio"
  },
  "old address /analytics/dashboards": {
    "lands": "/data/analytics/dashboards",
    "heading": "Dashboards"
  },
  "old address /assistants/connections": {
    "lands": "/settings/model-connections",
    "heading": "Model connections"
  },
  "old address /assistants/prompts": {
    "lands": "/pipelines/prompts",
    "heading": "Prompts"
  },
  "old address /assistants/prompts/:promptId/edit": {
    "lands": "/pipelines/prompts/1049/edit",
    "heading": "UI-REVIEW Zürich – 東京 ✓ draft prompt (never activated) with a deliberately long name for truncation checks in the prompt list Claude Demo 75a611b4v1Inactive"
  },
  "old address /assistants/prompts/new": {
    "lands": "/pipelines/prompts/new",
    "heading": "New prompt"
  },
  "old address /billing/rates": {
    "lands": "/billing/settings",
    "heading": "Billing settings"
  },
  "old address /configuration/engine": {
    "lands": "/platform/engine",
    "heading": "Engine settings"
  },
  "old address /configuration/home-pages": {
    "lands": "/settings/home-pages",
    "heading": "Home pages"
  },
  "old address /configuration/kafka": {
    "lands": "/settings/kafka",
    "heading": "Kafka & Topics"
  },
  "old address /configuration/lookup": {
    "lands": "/settings/values",
    "heading": "Configuration values"
  },
  "old address /configuration/pipelines": {
    "lands": "/settings/task-registry",
    "heading": "Task Registry"
  },
  "old address /configuration/storage-connections": {
    "lands": "/connections/storage",
    "heading": "Connections"
  },
  "old address /configuration/task-groups": {
    "lands": "/settings/task-groups",
    "heading": "Task groups"
  },
  "old address /configuration/task-registry": {
    "lands": "/settings/task-registry",
    "heading": "Task Registry"
  },
  "old address /configuration/values": {
    "lands": "/settings/values",
    "heading": "Configuration values"
  },
  "old address /data/reports": {
    "lands": "/reports/library",
    "heading": "Reports"
  },
  "old address /documents/converter": {
    "lands": "/tools/converter",
    "heading": "Document Converter"
  },
  "old address /documents/files": {
    "lands": "/data/files",
    "heading": "Browse files"
  },
  "old address /documents/inbox": {
    "lands": "/documents/file-drop",
    "heading": "File drop"
  },
  "old address /documents/intelligence": {
    "lands": "/documents/in",
    "heading": "Documents in"
  },
  "old address /documents/reports": {
    "lands": "/reports/library",
    "heading": "Reports"
  },
  "old address /documents/review": {
    "lands": "/review/documents",
    "heading": "Document review"
  },
  "old address /documents/review/:extractionId": {
    "lands": "/review/documents/:extractionId",
    "heading": "Document"
  },
  "old address /documents/transcript": {
    "lands": "/tools/transcript",
    "heading": "Audio Transcript"
  },
  "old address /integration/api-clients": {
    "lands": "/developers/api-clients",
    "heading": "API Clients"
  },
  "old address /integration/api-collections": {
    "lands": "/connections/api-collections",
    "heading": "API Collections"
  },
  "old address /integration/api-collections/:collectionId": {
    "lands": "/connections/api-collections/:collectionId",
    "heading": "API collection"
  },
  "old address /integration/connectors": {
    "lands": "/connections/connectors",
    "heading": "Connections"
  },
  "old address /integration/connectors/storage": {
    "lands": "/connections/storage",
    "heading": "Connections"
  },
  "old address /integration/developer": {
    "lands": "/developers/portal",
    "heading": "Developer portal"
  },
  "old address /integration/developer/changelog": {
    "lands": "/developers/portal/changelog",
    "heading": "Changelog"
  },
  "old address /integration/developer/guides/:slug": {
    "lands": "/developers/portal/guides/:slug",
    "heading": null
  },
  "old address /integration/developer/reference": {
    "lands": "/developers/portal/reference",
    "heading": "API reference"
  },
  "old address /integration/sources": {
    "lands": "/connections/sources",
    "heading": "Sources"
  },
  "old address /integration/storage-connections": {
    "lands": "/connections/storage",
    "heading": "Connections"
  },
  "old address /jobs": {
    "lands": "/pipelines/schedules",
    "heading": "Schedules & triggers"
  },
  "old address /jobs/:jobId/assistant": {
    "lands": "/pipelines/schedules/2833/assistant",
    "heading": "Schedule assistant — Reference CSV check (e2e)"
  },
  "old address /jobs/:jobId/edit": {
    "lands": "/pipelines/schedules/2833/edit",
    "heading": "Reference CSV check (e2e)"
  },
  "old address /jobs/:jobId/history": {
    "lands": "/pipelines/schedules/2833/executions",
    "heading": "Reference CSV check (e2e) · runs"
  },
  "old address /jobs/:jobId/runs/:jobQueueId/logs": {
    "lands": "/pipelines/schedules/2833/runs/7331/logs",
    "heading": "Run #7331 · Reference CSV check (e2e)"
  },
  "old address /jobs/bulk": {
    "lands": "/pipelines/schedules/bulk",
    "heading": "Bulk schedules"
  },
  "old address /jobs/history": {
    "lands": "/runs/latest",
    "heading": "Runs"
  },
  "old address /jobs/new": {
    "lands": "/pipelines/schedules/new",
    "heading": "New schedule"
  },
  "old address /objects": {
    "lands": "/data/files",
    "heading": "Browse files"
  },
  "old address /objects/analytics": {
    "lands": "/data/analytics",
    "heading": "Analytics Studio"
  },
  "old address /objects/analytics/dashboards": {
    "lands": "/data/analytics/dashboards",
    "heading": "Dashboards"
  },
  "old address /objects/files": {
    "lands": "/data/files",
    "heading": "Browse files"
  },
  "old address /operations/jobs": {
    "lands": "/pipelines/schedules",
    "heading": "Schedules & triggers"
  },
  "old address /operations/jobs/:jobId/assistant": {
    "lands": "/pipelines/schedules/2833/assistant",
    "heading": "Schedule assistant — Reference CSV check (e2e)"
  },
  "old address /operations/jobs/:jobId/edit": {
    "lands": "/pipelines/schedules/2833/edit",
    "heading": "Reference CSV check (e2e)"
  },
  "old address /operations/jobs/:jobId/history": {
    "lands": "/pipelines/schedules/2833/executions",
    "heading": "Reference CSV check (e2e) · runs"
  },
  "old address /operations/jobs/:jobId/runs/:jobQueueId/logs": {
    "lands": "/pipelines/schedules/2833/runs/7331/logs",
    "heading": "Run #7331 · Reference CSV check (e2e)"
  },
  "old address /operations/jobs/bulk": {
    "lands": "/pipelines/schedules/bulk",
    "heading": "Bulk schedules"
  },
  "old address /operations/jobs/history": {
    "lands": "/runs/latest",
    "heading": "Runs"
  },
  "old address /operations/jobs/new": {
    "lands": "/pipelines/schedules/new",
    "heading": "New schedule"
  },
  "old address /operations/queue": {
    "lands": "/runs/by-date",
    "heading": "Runs"
  },
  "old address /operations/reports": {
    "lands": "/runs/analytics",
    "heading": "Run analytics"
  },
  "old address /operations/tasks": {
    "lands": "/pipelines/list",
    "heading": "Pipelines"
  },
  "old address /operations/tasks/:taskDetailId/edit": {
    "lands": "/pipelines/1854/edit",
    "heading": "Reference: CSV check and summarise"
  },
  "old address /operations/tasks/bulk": {
    "lands": "/pipelines/bulk",
    "heading": "Bulk pipelines"
  },
  "old address /operations/tasks/new": {
    "lands": "/pipelines/new",
    "heading": "New pipeline"
  },
  "old address /pipelines/executions": {
    "lands": "/runs/latest",
    "heading": "Runs"
  },
  "old address /pipelines/queue": {
    "lands": "/runs/by-date",
    "heading": "Runs"
  },
  "old address /pipelines/run-analytics": {
    "lands": "/runs/analytics",
    "heading": "Run analytics"
  },
  "old address /platform/billing-analytics": {
    "lands": "/billing/analytics",
    "heading": "Analytics"
  },
  "old address /platform/rate-cards": {
    "lands": "/billing/settings",
    "heading": "Billing settings"
  },
  "old address /platform/reliability": {
    "lands": "/platform/service-health",
    "heading": "Service health"
  },
  "old address /platform/work-in-workspace": {
    "lands": "/platform/workspaces",
    "heading": "Workspaces"
  },
  "old address /queue": {
    "lands": "/runs/by-date",
    "heading": "Runs"
  },
  "old address /settings/forms": {
    "lands": "/settings/task-registry",
    "heading": "Task Registry"
  },
  "old address /settings/lookup": {
    "lands": "/settings/values",
    "heading": "Configuration values"
  },
  "old address /settings/pipeline-forms": {
    "lands": "/settings/task-registry",
    "heading": "Task Registry"
  },
  "old address /settings/pipelines": {
    "lands": "/settings/task-registry",
    "heading": "Task Registry"
  },
  "old address /settings/storage-connections": {
    "lands": "/connections/storage",
    "heading": "Connections"
  },
  "old address /settings/task-types": {
    "lands": "/settings/kafka",
    "heading": "Kafka & Topics"
  },
  "old address /tasks": {
    "lands": "/pipelines/list",
    "heading": "Pipelines"
  },
  "old address /tasks/:taskDetailId/edit": {
    "lands": "/pipelines/1854/edit",
    "heading": "Reference: CSV check and summarise"
  },
  "old address /tasks/bulk": {
    "lands": "/pipelines/bulk",
    "heading": "Bulk pipelines"
  },
  "old address /tasks/new": {
    "lands": "/pipelines/new",
    "heading": "New pipeline"
  },
  "old address /workflows/inbox": {
    "lands": "/review/approvals",
    "heading": "Approvals"
  },
  "old address /workflows/requests": {
    "lands": "/review/requests",
    "heading": "Approvals"
  }
};
