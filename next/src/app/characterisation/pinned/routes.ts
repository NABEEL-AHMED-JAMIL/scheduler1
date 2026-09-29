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
      "path": "/operations/jobs",
      "title": "Source Jobs",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/operations/jobs/new",
      "title": "New job",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/operations/jobs/:jobId/edit",
      "title": "Edit job",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/operations/jobs/:jobId/assistant",
      "title": "Job assistant",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/operations/jobs/:jobId/runs/:jobQueueId/logs",
      "title": "Run logs",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/operations/queue",
      "title": "Queue",
      "pageKey": "queue",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/operations/jobs/history",
      "title": "Run history",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/operations/jobs/:jobId/history",
      "title": "Job history",
      "pageKey": "jobs",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/operations/tasks/new",
      "title": "New task",
      "pageKey": "tasks",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/operations/tasks/:taskDetailId/edit",
      "title": "Edit task",
      "pageKey": "tasks",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "pageGuard",
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/operations/tasks",
      "title": "Source Tasks",
      "pageKey": "tasks",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/configuration/storage-connections",
      "title": "Storage Connections",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/objects/analytics",
      "title": "Analytics Studio",
      "pageKey": "analytics",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/objects/analytics/dashboards",
      "title": "Saved Analyses",
      "pageKey": "analytics-dashboards",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/admin/storage",
      "redirectTo": "configuration/storage-connections",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/ai/agents",
      "redirectTo": "assistants/prompts",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/assistants/prompts",
      "title": "Prompts",
      "pageKey": "ai-prompts",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/assistants/prompts/new",
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
      "path": "/assistants/prompts/:promptId/edit",
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
      "path": "/assistants/connections",
      "title": "Model connections",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/ai/models",
      "redirectTo": "assistants/connections",
      "guards": [],
      "lazy": false
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
      "path": "/tools/converter",
      "title": "Document Converter",
      "pageKey": "tools-converter",
      "guards": [
        "pageGuard"
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
      "path": "/settings/task-types",
      "redirectTo": "configuration/kafka",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/configuration/pipelines",
      "title": "Pipelines",
      "minRole": "TENANT_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/settings/forms",
      "redirectTo": "configuration/pipelines",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/pipeline-forms",
      "redirectTo": "configuration/pipelines",
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
      "path": "/billing",
      "redirectTo": "billing/usage",
      "guards": [],
      "lazy": false
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
      "path": "/administration/tenant-requests",
      "title": "Workspace Requests",
      "minRole": "PLATFORM_ADMIN",
      "guards": [
        "roleGuard"
      ],
      "lazy": true
    },
    {
      "path": "/unauthorized",
      "title": "Not available",
      "guards": [],
      "lazy": true
    },
    {
      "path": "/operations/jobs/bulk",
      "title": "Bulk jobs",
      "pageKey": "jobs",
      "kind": "job",
      "guards": [
        "pageGuard"
      ],
      "lazy": true
    },
    {
      "path": "/operations/tasks/bulk",
      "title": "Bulk tasks",
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
      "path": "/operations/reports",
      "title": "Reports",
      "pageKey": "reports",
      "guards": [
        "pageGuard"
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
      "path": "/configuration/lookup",
      "redirectTo": "configuration/values",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/objects/files",
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
      "path": "/jobs",
      "redirectTo": "operations/jobs",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/jobs/new",
      "redirectTo": "operations/jobs/new",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/jobs/:jobId/edit",
      "redirectTo": "operations/jobs/:jobId/edit",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/jobs/:jobId/assistant",
      "redirectTo": "operations/jobs/:jobId/assistant",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/jobs/:jobId/runs/:jobQueueId/logs",
      "redirectTo": "operations/jobs/:jobId/runs/:jobQueueId/logs",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/queue",
      "redirectTo": "operations/queue",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/jobs/history",
      "redirectTo": "operations/jobs/history",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/jobs/:jobId/history",
      "redirectTo": "operations/jobs/:jobId/history",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/tasks/new",
      "redirectTo": "operations/tasks/new",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/tasks/:taskDetailId/edit",
      "redirectTo": "operations/tasks/:taskDetailId/edit",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/tasks",
      "redirectTo": "operations/tasks",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/settings/storage-connections",
      "redirectTo": "configuration/storage-connections",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/analytics",
      "redirectTo": "objects/analytics",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/analytics/dashboards",
      "redirectTo": "objects/analytics/dashboards",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/ai/prompts",
      "redirectTo": "assistants/prompts",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/ai/prompts/new",
      "redirectTo": "assistants/prompts/new",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/ai/prompts/:promptId/edit",
      "redirectTo": "assistants/prompts/:promptId/edit",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/ai/connections",
      "redirectTo": "assistants/connections",
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
      "path": "/settings/pipelines",
      "redirectTo": "configuration/pipelines",
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
      "path": "/jobs/bulk",
      "redirectTo": "operations/jobs/bulk",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/tasks/bulk",
      "redirectTo": "operations/tasks/bulk",
      "guards": [],
      "lazy": false
    },
    {
      "path": "/reports",
      "redirectTo": "operations/reports",
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
      "path": "/objects",
      "redirectTo": "objects/files",
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
    "lands": "/configuration/storage-connections",
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
    "lands": "/billing/usage/analytics",
    "heading": "Page not found"
  },
  "old address /administration/billing/documents": {
    "lands": "/billing/usage/documents",
    "heading": "Page not found"
  },
  "old address /administration/billing/invoices": {
    "lands": "/billing/usage/invoices",
    "heading": "Page not found"
  },
  "old address /administration/billing/invoices/:number": {
    "lands": "/billing/usage/invoices/INV-2026-0001",
    "heading": "Page not found"
  },
  "old address /administration/billing/rates": {
    "lands": "/billing/usage/rates",
    "heading": "Page not found"
  },
  "old address /ai/agents": {
    "lands": "/assistants/prompts",
    "heading": "Prompts"
  },
  "old address /ai/connections": {
    "lands": "/assistants/connections",
    "heading": "Model connections"
  },
  "old address /ai/models": {
    "lands": "/assistants/connections",
    "heading": "Model connections"
  },
  "old address /ai/prompts": {
    "lands": "/assistants/prompts",
    "heading": "Prompts"
  },
  "old address /ai/prompts/:promptId/edit": {
    "lands": "/assistants/prompts/1049/edit",
    "heading": "UI-REVIEW Zürich – 東京 ✓ draft prompt (never activated) with a deliberately long name for truncation checks in the prompt list Claude Demo 75a611b4v1Inactive"
  },
  "old address /ai/prompts/new": {
    "lands": "/assistants/prompts/new",
    "heading": "New prompt"
  },
  "old address /analytics": {
    "lands": "/objects/analytics",
    "heading": "Analytics Studio"
  },
  "old address /analytics/dashboards": {
    "lands": "/objects/analytics/dashboards",
    "heading": "Dashboards"
  },
  "old address /billing": {
    "lands": "/billing/usage",
    "heading": "Cost & usage"
  },
  "old address /configuration/lookup": {
    "lands": "/configuration/values",
    "heading": "Configuration values"
  },
  "old address /jobs": {
    "lands": "/operations/jobs",
    "heading": "Source Jobs"
  },
  "old address /jobs/:jobId/assistant": {
    "lands": "/operations/jobs/2833/assistant",
    "heading": "Job assistant — Reference CSV check (e2e)"
  },
  "old address /jobs/:jobId/edit": {
    "lands": "/operations/jobs/2833/edit",
    "heading": "Edit job"
  },
  "old address /jobs/:jobId/history": {
    "lands": "/operations/jobs/2833/history",
    "heading": "Run history — Reference CSV check (e2e)"
  },
  "old address /jobs/:jobId/runs/:jobQueueId/logs": {
    "lands": "/operations/jobs/2833/runs/7331/logs",
    "heading": "Run logs"
  },
  "old address /jobs/bulk": {
    "lands": "/operations/jobs/bulk",
    "heading": "Bulk jobs"
  },
  "old address /jobs/history": {
    "lands": "/operations/jobs/history",
    "heading": "Run history"
  },
  "old address /jobs/new": {
    "lands": "/operations/jobs/new",
    "heading": "New job"
  },
  "old address /objects": {
    "lands": "/objects/files",
    "heading": "Object Browser"
  },
  "old address /queue": {
    "lands": "/operations/queue",
    "heading": "Queue"
  },
  "old address /reports": {
    "lands": "/operations/reports",
    "heading": "Reports"
  },
  "old address /settings/forms": {
    "lands": "/configuration/pipelines",
    "heading": "Pipelines"
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
    "lands": "/configuration/pipelines",
    "heading": "Pipelines"
  },
  "old address /settings/pipelines": {
    "lands": "/configuration/pipelines",
    "heading": "Pipelines"
  },
  "old address /settings/storage-connections": {
    "lands": "/configuration/storage-connections",
    "heading": "Storage connections"
  },
  "old address /settings/task-types": {
    "lands": "/configuration/kafka",
    "heading": "Kafka Connections"
  },
  "old address /tasks": {
    "lands": "/operations/tasks",
    "heading": "Source Tasks"
  },
  "old address /tasks/:taskDetailId/edit": {
    "lands": "/operations/tasks/1854/edit",
    "heading": "Edit task"
  },
  "old address /tasks/bulk": {
    "lands": "/operations/tasks/bulk",
    "heading": "Bulk tasks"
  },
  "old address /tasks/new": {
    "lands": "/operations/tasks/new",
    "heading": "New task"
  }
};
