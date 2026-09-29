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
      "title": "Dashboard",
      "guards": [],
      "lazy": true
    },
    {
      "path": "/integration/storage-connections",
      "title": "Storage Connections",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/integration/api-collections",
      "title": "API Collections",
      "pageKey": "api-collections",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/integration/api-collections/:collectionId",
      "title": "API collection",
      "pageKey": "api-collections",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/integration/sources",
      "title": "Sources",
      "pageKey": "sources",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/integration/connectors",
      "title": "Connector Hub",
      "pageKey": "connector-hub",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines",
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
      "title": "Edit pipeline",
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
      "title": "Schedules",
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
      "title": "Edit schedule",
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
      "title": "Executions",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/schedules/:jobId/runs/:jobQueueId/logs",
      "title": "Run logs",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/executions",
      "title": "Executions",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/queue",
      "title": "Queue",
      "pageKey": "queue",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/pipelines/run-analytics",
      "title": "Run analytics",
      "pageKey": "reports",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/documents/intelligence",
      "title": "Document Intelligence",
      "pageKey": "document-intelligence",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/documents/review",
      "title": "Review queue",
      "pageKey": "document-review",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/documents/converter",
      "title": "Document Converter",
      "pageKey": "tools-converter",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/documents/files",
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
      "path": "/documents/transcript",
      "title": "Audio Transcript",
      "pageKey": "tools-transcript",
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
      "path": "/data/catalog",
      "title": "Data Catalog",
      "pageKey": "data-catalog",
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
      "title": "Saved Analyses",
      "pageKey": "analytics-dashboards",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/forms/builder",
      "title": "Form builder",
      "pageKey": "forms",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/forms/submissions",
      "title": "Submissions",
      "pageKey": "form-submissions",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/workflows/inbox",
      "title": "Task inbox",
      "pageKey": "task-inbox",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/workflows/designer",
      "title": "Workflow designer",
      "pageKey": "workflow-designer",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/ai/prompts",
      "title": "Prompts",
      "pageKey": "ai-prompts",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/ai/prompts/new",
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
      "path": "/ai/prompts/:promptId/edit",
      "title": "Edit prompt",
      "pageKey": "ai-prompts",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/ai/connections",
      "title": "Model connections",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/configuration/task-registry",
      "title": "Task Registry",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/configuration/kafka",
      "title": "Kafka & Topics",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/configuration/values",
      "title": "Configuration values",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/configuration/engine",
      "title": "Engine settings",
      "minRole": "PLATFORM_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/configuration/home-pages",
      "title": "Home pages",
      "minRole": "TENANT_ADMIN",
      "kind": "HOME_PAGE",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/configuration/task-groups",
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
      "minRole": "PLATFORM_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/billing/rates",
      "title": "Rate cards",
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
      "path": "/administration/access-profiles",
      "title": "Access profiles",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/administration/tenants",
      "title": "Tenants",
      "minRole": "PLATFORM_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/administration/tenant-requests",
      "title": "Workspace Requests",
      "minRole": "PLATFORM_ADMIN",
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
      "redirectTo": "pipelines/executions",
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
      "redirectTo": "pipelines/queue",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/operations/tasks",
      "redirectTo": "pipelines",
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
      "redirectTo": "pipelines/run-analytics",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/configuration/pipelines",
      "redirectTo": "configuration/task-registry",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/configuration/storage-connections",
      "redirectTo": "integration/storage-connections",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/objects/files",
      "redirectTo": "documents/files",
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
      "path": "/tools/converter",
      "redirectTo": "documents/converter",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/tools/transcript",
      "redirectTo": "documents/transcript",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/assistants/prompts",
      "redirectTo": "ai/prompts",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/assistants/prompts/new",
      "redirectTo": "ai/prompts/new",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/assistants/prompts/:promptId/edit",
      "redirectTo": "ai/prompts/:promptId/edit",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/assistants/connections",
      "redirectTo": "ai/connections",
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
      "redirectTo": "pipelines/executions",
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
      "redirectTo": "pipelines/queue",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/tasks",
      "redirectTo": "pipelines",
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
      "path": "/reports",
      "redirectTo": "pipelines/run-analytics",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/objects",
      "redirectTo": "documents/files",
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
      "redirectTo": "integration/storage-connections",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/storage-connections",
      "redirectTo": "integration/storage-connections",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/ai/agents",
      "redirectTo": "ai/prompts",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/ai/models",
      "redirectTo": "ai/connections",
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
      "redirectTo": "administration/tenants",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/admin/tenant-requests",
      "redirectTo": "administration/tenant-requests",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/pipelines",
      "redirectTo": "configuration/task-registry",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/forms",
      "redirectTo": "configuration/task-registry",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/pipeline-forms",
      "redirectTo": "configuration/task-registry",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/task-types",
      "redirectTo": "configuration/kafka",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/kafka",
      "redirectTo": "configuration/kafka",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/lookup",
      "redirectTo": "configuration/values",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/configuration/lookup",
      "redirectTo": "configuration/values",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/billing",
      "redirectTo": "billing/usage",
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
      "redirectTo": "billing/rates",
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
    "heading": "Access profiles"
  },
  "old address /admin/storage": {
    "lands": "/integration/storage-connections",
    "heading": "Storage connections"
  },
  "old address /admin/tenant-requests": {
    "lands": "/administration/tenant-requests",
    "heading": "Workspace requests"
  },
  "old address /admin/tenants": {
    "lands": "/administration/tenants",
    "heading": "Tenants"
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
    "heading": "Billing analytics"
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
    "lands": "/billing/rates",
    "heading": "Rate cards"
  },
  "old address /ai/agents": {
    "lands": "/ai/prompts",
    "heading": "Prompts"
  },
  "old address /ai/models": {
    "lands": "/ai/connections",
    "heading": "Model connections"
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
    "lands": "/ai/connections",
    "heading": "Model connections"
  },
  "old address /assistants/prompts": {
    "lands": "/ai/prompts",
    "heading": "Prompts"
  },
  "old address /assistants/prompts/:promptId/edit": {
    "lands": "/ai/prompts/1049/edit",
    "heading": "UI-REVIEW Zürich – 東京 ✓ draft prompt (never activated) with a deliberately long name for truncation checks in the prompt list Claude Demo 75a611b4v1Inactive"
  },
  "old address /assistants/prompts/new": {
    "lands": "/ai/prompts/new",
    "heading": "New prompt"
  },
  "old address /billing": {
    "lands": "/billing/usage",
    "heading": "Cost & usage"
  },
  "old address /configuration/lookup": {
    "lands": "/configuration/values",
    "heading": "Configuration values"
  },
  "old address /configuration/pipelines": {
    "lands": "/configuration/task-registry",
    "heading": "Task Registry"
  },
  "old address /configuration/storage-connections": {
    "lands": "/integration/storage-connections",
    "heading": "Storage connections"
  },
  "old address /jobs": {
    "lands": "/pipelines/schedules",
    "heading": "Schedules"
  },
  "old address /jobs/:jobId/assistant": {
    "lands": "/pipelines/schedules/2833/assistant",
    "heading": "Schedule assistant — Reference CSV check (e2e)"
  },
  "old address /jobs/:jobId/edit": {
    "lands": "/pipelines/schedules/2833/edit",
    "heading": "Edit schedule"
  },
  "old address /jobs/:jobId/history": {
    "lands": "/pipelines/schedules/2833/executions",
    "heading": "Executions — Reference CSV check (e2e)"
  },
  "old address /jobs/:jobId/runs/:jobQueueId/logs": {
    "lands": "/pipelines/schedules/2833/runs/7331/logs",
    "heading": "Run logs"
  },
  "old address /jobs/bulk": {
    "lands": "/pipelines/schedules/bulk",
    "heading": "Bulk schedules"
  },
  "old address /jobs/history": {
    "lands": "/pipelines/executions",
    "heading": "Executions"
  },
  "old address /jobs/new": {
    "lands": "/pipelines/schedules/new",
    "heading": "New schedule"
  },
  "old address /objects": {
    "lands": "/documents/files",
    "heading": "Object Browser"
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
    "lands": "/documents/files",
    "heading": "Object Browser"
  },
  "old address /operations/jobs": {
    "lands": "/pipelines/schedules",
    "heading": "Schedules"
  },
  "old address /operations/jobs/:jobId/assistant": {
    "lands": "/pipelines/schedules/2833/assistant",
    "heading": "Schedule assistant — Reference CSV check (e2e)"
  },
  "old address /operations/jobs/:jobId/edit": {
    "lands": "/pipelines/schedules/2833/edit",
    "heading": "Edit schedule"
  },
  "old address /operations/jobs/:jobId/history": {
    "lands": "/pipelines/schedules/2833/executions",
    "heading": "Executions — Reference CSV check (e2e)"
  },
  "old address /operations/jobs/:jobId/runs/:jobQueueId/logs": {
    "lands": "/pipelines/schedules/2833/runs/7331/logs",
    "heading": "Run logs"
  },
  "old address /operations/jobs/bulk": {
    "lands": "/pipelines/schedules/bulk",
    "heading": "Bulk schedules"
  },
  "old address /operations/jobs/history": {
    "lands": "/pipelines/executions",
    "heading": "Executions"
  },
  "old address /operations/jobs/new": {
    "lands": "/pipelines/schedules/new",
    "heading": "New schedule"
  },
  "old address /operations/queue": {
    "lands": "/pipelines/queue",
    "heading": "Queue"
  },
  "old address /operations/reports": {
    "lands": "/pipelines/run-analytics",
    "heading": "Run analytics"
  },
  "old address /operations/tasks": {
    "lands": "/pipelines",
    "heading": "Pipelines"
  },
  "old address /operations/tasks/:taskDetailId/edit": {
    "lands": "/pipelines/1854/edit",
    "heading": "Edit pipeline"
  },
  "old address /operations/tasks/bulk": {
    "lands": "/pipelines/bulk",
    "heading": "Bulk pipelines"
  },
  "old address /operations/tasks/new": {
    "lands": "/pipelines/new",
    "heading": "New pipeline"
  },
  "old address /queue": {
    "lands": "/pipelines/queue",
    "heading": "Queue"
  },
  "old address /reports": {
    "lands": "/pipelines/run-analytics",
    "heading": "Run analytics"
  },
  "old address /settings/forms": {
    "lands": "/configuration/task-registry",
    "heading": "Task Registry"
  },
  "old address /settings/kafka": {
    "lands": "/configuration/kafka",
    "heading": "Kafka Connections"
  },
  "old address /settings/lookup": {
    "lands": "/configuration/values",
    "heading": "Configuration values"
  },
  "old address /settings/pipeline-forms": {
    "lands": "/configuration/task-registry",
    "heading": "Task Registry"
  },
  "old address /settings/pipelines": {
    "lands": "/configuration/task-registry",
    "heading": "Task Registry"
  },
  "old address /settings/storage-connections": {
    "lands": "/integration/storage-connections",
    "heading": "Storage connections"
  },
  "old address /settings/task-types": {
    "lands": "/configuration/kafka",
    "heading": "Kafka Connections"
  },
  "old address /tasks": {
    "lands": "/pipelines",
    "heading": "Pipelines"
  },
  "old address /tasks/:taskDetailId/edit": {
    "lands": "/pipelines/1854/edit",
    "heading": "Edit pipeline"
  },
  "old address /tasks/bulk": {
    "lands": "/pipelines/bulk",
    "heading": "Bulk pipelines"
  },
  "old address /tasks/new": {
    "lands": "/pipelines/new",
    "heading": "New pipeline"
  },
  "old address /tools/converter": {
    "lands": "/documents/converter",
    "heading": "Document Converter"
  },
  "old address /tools/transcript": {
    "lands": "/documents/transcript",
    "heading": "Audio Transcript Extractor"
  }
};
