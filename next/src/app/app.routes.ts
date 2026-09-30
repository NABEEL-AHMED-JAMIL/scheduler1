import { Routes, Route } from '@angular/router';
import { anonymousOnly, authGuard, pageGuard, passwordChangeGuard, roleGuard } from './core/auth/auth.guard';
import { Shell } from './features/shell/shell';

/**
 * MIG-246 / MIG-267: the entry point of a Wave 4 or Wave 5 page that is on the menu before it is built.
 * Gated by the page's own access-profile key from the start, so the real screen only swaps the component.
 */
/** Old address -> today's, as whole-address redirects (params and the query string carry over). */
function moved(pairs: [from: string, to: string][]): Route[] {
  return pairs.map(([path, redirectTo]) => ({ path, redirectTo, pathMatch: 'full' as const }));
}

export const routes: Routes = [
  {
    // Signed out only. A stale bookmark or a restored tab otherwise put someone who is already
    // signed in in front of a bare sign-in form outside the shell, which reads as having been
    // logged out -- and signing in again from there wrote a second session over the first with
    // no logout in between. The redirect below catches them instead.
    path: 'login',
    title: 'Sign in',
    canMatch: [anonymousOnly],
    loadComponent: () => import('./features/login/login').then(m => m.Login),
  },
  {
    // Only reached when the guard above says no, i.e. there is already a session.
    path: 'login',
    redirectTo: '/dashboard',
  },
  {
    // The public front door. pathMatch 'full' matters: an empty path would otherwise match
    // every deep link as a prefix and swallow the whole console.
    path: '',
    pathMatch: 'full',
    canMatch: [anonymousOnly],
    loadComponent: () => import('./features/landing/landing').then(m => m.Landing),
  },
  {
    // Public: whoever is asking for a workspace has no account yet, which is the ask.
    path: 'request-workspace',
    title: 'Request a workspace',
    loadComponent: () =>
      import('./features/tenant-request/request-workspace').then(m => m.RequestWorkspace),
  },
  {
    // Public like the landing page: the setup guide describes the console's own screens and
    // carries nothing tenant-specific, so it can be linked to and read before signing in.
    path: 'docs',
    title: 'Setup guide',
    loadComponent: () => import('./features/docs/docs').then(m => m.Docs),
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    // On the shell rather than on each child: the password gate has to see every move
    // between the children, and only the profile screen is exempt.
    canActivateChild: [passwordChangeGuard],
    children: [
      {
        // The dashboard has its own address rather than living at the root, so it can be linked
        // to and returned to by name. Run history already tried to send people to /dashboard
        // and landed on a route that did not exist.
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'dashboard',
        title: 'Dashboard',
        loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard),
      },
      // ---------------------------------------------------------------------------------------------
      // MIG-246 (2026-09-28): every address is <section>/<page>, the section the menu shows it under.
      // The MIG-218 renames are labels and addresses only: each page keeps its access-profile key and
      // its least role, and every earlier address redirects further down (params and query carry over).
      //
      // Integration
      // ---------------------------------------------------------------------------------------------
      {
        // Infrastructure a pipeline reads from and writes to. Role-gated, not page-keyed: every call
        // behind it is TENANT_ADMIN.
        path: 'integration/storage-connections',
        title: 'Storage Connections',
        loadComponent: () =>
          import('./features/admin/storage/storage-connections').then(m => m.StorageConnections),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        // MIG-247: which APIs exist, tested and versioned. Every member holding the page reads; the pages
        // hide what integration-service answers only for a workspace administrator (writes and Test).
        path: 'integration/api-collections',
        title: 'API Collections',
        loadComponent: () =>
          import('./features/integration/api-collections/api-collections').then(m => m.ApiCollections),
        data: { pageKey: 'api-collections' },
        canActivate: [pageGuard],
      },
      {
        path: 'integration/api-collections/:collectionId',
        title: 'API collection',
        loadComponent: () =>
          import('./features/integration/api-collections/collection').then(m => m.Collection),
        data: { pageKey: 'api-collections' },
        canActivate: [pageGuard],
      },
      {
        // MIG-248: where a pipeline's data comes from -- an API, a file or folder in the workspace's storage, a
        // database -- with its test, preview and schema, the database connections, and the data contracts
        // (MIG-233) that sit on the same page key. Every member holding the page reads; writes and anything that
        // reads the source itself are a workspace administrator's, and the page hides them from anyone else.
        path: 'integration/sources',
        title: 'Sources',
        loadComponent: () =>
          import('./features/integration/sources/sources').then(m => m.Sources),
        data: { pageKey: 'sources' },
        canActivate: [pageGuard],
      },
      // ---------------------------------------------------------------------------------------------
      // Pipelines (was Operations). Pipelines was Source Tasks, Schedules was Source Jobs, Executions
      // was Run history, Run analytics was Reports. Keys unchanged: tasks, jobs, jobs, reports.
      // ---------------------------------------------------------------------------------------------
      {
        // The list itself stays open: listSourceTask is TENANT_USER on purpose, and a schedule points
        // at a pipeline, so seeing them is part of reading the console.
        path: 'pipelines',
        pathMatch: 'full',
        title: 'Pipelines',
        loadComponent: () => import('./features/tasks/tasks').then(m => m.Tasks),
        data: { pageKey: 'tasks' },
        canActivate: [pageGuard],
      },
      {
        // The editor is nothing but writes, and addSourceTask/updateSourceTask are TENANT_ADMIN.
        // Ungated, a tenant user could fill in a name, type and the whole XML payload and only be
        // told no when they pressed Save, with the work lost.
        path: 'pipelines/new',
        title: 'New pipeline',
        loadComponent: () => import('./features/tasks/edit/task-edit').then(m => m.TaskEdit),
        data: { pageKey: 'tasks', minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        // Unlike its schedules twin, every call this page makes -- template, export and upload --
        // sits under SourceTaskRestApi's class-level TENANT_ADMIN, so there is no state in which it
        // does anything for a tenant user.
        path: 'pipelines/bulk',
        title: 'Bulk pipelines',
        loadComponent: () => import('./features/bulk/bulk-transfer').then(m => m.BulkTransfer),
        data: { pageKey: 'tasks', kind: 'task', minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'pipelines/:taskDetailId/edit',
        title: 'Edit pipeline',
        loadComponent: () => import('./features/tasks/edit/task-edit').then(m => m.TaskEdit),
        data: { pageKey: 'tasks', minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'pipelines/schedules',
        title: 'Schedules',
        loadComponent: () => import('./features/jobs/jobs').then(m => m.Jobs),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        path: 'pipelines/schedules/new',
        title: 'New schedule',
        loadComponent: () => import('./features/jobs/edit/job-edit').then(m => m.JobEdit),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        path: 'pipelines/schedules/bulk',
        title: 'Bulk schedules',
        loadComponent: () => import('./features/bulk/bulk-transfer').then(m => m.BulkTransfer),
        data: { pageKey: 'jobs', kind: 'job' },
        canActivate: [pageGuard],
      },
      {
        path: 'pipelines/schedules/:jobId/edit',
        title: 'Edit schedule',
        loadComponent: () => import('./features/jobs/edit/job-edit').then(m => m.JobEdit),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        path: 'pipelines/schedules/:jobId/assistant',
        title: 'Schedule assistant',
        loadComponent: () =>
          import('./features/jobs/assistant/job-assistant').then(m => m.JobAssistant),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        // One schedule's executions (was its Run history).
        path: 'pipelines/schedules/:jobId/executions',
        title: 'Executions',
        loadComponent: () =>
          import('./features/jobs/history/job-history').then(m => m.JobHistory),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        path: 'pipelines/schedules/:jobId/runs/:jobQueueId/logs',
        title: 'Run logs',
        loadComponent: () => import('./features/jobs/logs/job-logs').then(m => m.JobLogs),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        // Same screen without a schedule: the dashboard's TOTAL row drills into an hour across
        // every schedule, which has no single id to put in the path.
        path: 'pipelines/executions',
        title: 'Executions',
        loadComponent: () =>
          import('./features/jobs/history/job-history').then(m => m.JobHistory),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        path: 'pipelines/queue',
        title: 'Queue',
        loadComponent: () => import('./features/queue/queue').then(m => m.Queue),
        data: { pageKey: 'queue' },
        canActivate: [pageGuard],
      },
      {
        path: 'pipelines/run-analytics',
        title: 'Run analytics',
        loadComponent: () =>
          import('./features/reports/reports').then(m => m.Reports),
        data: { pageKey: 'reports' },
        canActivate: [pageGuard],
      },
      // ---------------------------------------------------------------------------------------------
      // Documents (was Tools and Object Browser's Browse files)
      // ---------------------------------------------------------------------------------------------
      {
        // MIG-272: documents read into structured data -- the overview, the document types with their editor, and each
        // type's dataset. Every member holding the page reads, reads documents and extracts; a type is an administrator's.
        path: 'documents/intelligence',
        title: 'Document Intelligence',
        loadComponent: () => import('./features/documents/intelligence').then(m => m.DocumentIntelligence),
        data: { pageKey: 'document-intelligence' },
        canActivate: [pageGuard],
      },
      {
        // MIG-272: the review queue, and one document under review beside its page image.
        path: 'documents/review',
        title: 'Review queue',
        loadComponent: () => import('./features/documents/review-queue').then(m => m.ReviewQueue),
        data: { pageKey: 'document-review' },
        canActivate: [pageGuard],
      },
      {
        path: 'documents/review/:extractionId',
        title: 'Review a document',
        loadComponent: () => import('./features/documents/review').then(m => m.DocumentReview),
        data: { pageKey: 'document-review' },
        canActivate: [pageGuard],
      },
      {
        path: 'documents/converter',
        title: 'Document Converter',
        loadComponent: () => import('./features/tools/converter/converter').then(m => m.Converter),
        data: { pageKey: 'tools-converter' },
        canActivate: [pageGuard],
      },
      {
        // MIG-253: generated outputs -- renders saved to a bucket and what recent runs put out. Behind the
        // converter's key: it lists what the converter makes, and there is no page key of its own yet.
        path: 'documents/reports',
        title: 'Reports',
        loadComponent: () => import('./features/documents/generated/generated-reports').then(m => m.GeneratedReports),
        data: { pageKey: 'tools-converter' },
        canActivate: [pageGuard],
      },
      {
        // TENANT_USER rather than nothing at all: StorageBrowserRestApi's floor is a signed-in
        // user, and which bucket and key that user may actually reach is decided per request,
        // so no role the route could name would say more than the server already does. What it
        // does add is the case authGuard cannot see -- a session whose token carries no
        // readable role lands on /unauthorized rather than on a page that is nothing but
        // storage calls, every one of which comes back refused.
        path: 'documents/files',
        title: 'Browse files',
        loadComponent: () => import('./features/objects/objects').then(m => m.Objects),
        data: { pageKey: 'objects', minRole: 'TENANT_USER' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        // MIG-239: the workspace inbox -- upload files that start jobs with an inbox trigger. Browse files' page key and
        // floor: the gateway leaves /storage.json open, storage-service lets every member read and upload, and only
        // configuring it is an administrator's (gated inside the page).
        path: 'documents/inbox',
        title: 'Inbox',
        loadComponent: () => import('./features/documents/inbox/inbox').then(m => m.Inbox),
        data: { pageKey: 'objects', minRole: 'TENANT_USER' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'documents/transcript',
        title: 'Audio Transcript',
        loadComponent: () => import('./features/tools/transcript/transcript').then(m => m.Transcript),
        data: { pageKey: 'tools-transcript' },
        canActivate: [pageGuard],
      },
      // ---------------------------------------------------------------------------------------------
      // Data (Wave 5; Analytics Studio and Saved Analyses moved here from Object Browser)
      // ---------------------------------------------------------------------------------------------
      {
        // Wave 5: plain-language questions answered only from the workspace's documents and pipeline results, with
        // numbered sources (ai-service /askData.json, gated by ask-data at the gateway). Every member holding the page asks.
        path: 'data/ask',
        title: 'Ask your data',
        loadComponent: () => import('./features/ask-data/ask-data').then(m => m.AskData),
        data: { pageKey: 'ask-data' },
        canActivate: [pageGuard],
      },
      {
        // Open to TENANT_USER, like the file browser it reads from and for the same reason:
        // which connections a caller may reach is settled per request against each connection's
        // own tenant, not by a role on the route.
        path: 'data/analytics',
        title: 'Analytics Studio',
        loadComponent: () => import('./features/analytics/analytics').then(m => m.Analytics),
        data: { pageKey: 'analytics' },
        canActivate: [pageGuard],
      },
      {
        // Under analytics/ so it has an address of its own: a dashboard is a page somebody
        // assembles and comes back to, and until now it was reachable from nowhere at all --
        // built, tested, and with no route and no link, which is the same "API-live, UI-dead"
        // shape the run history and cancellation each hit before it.
        //
        // Ungated for the same reason as its parent, and the reasoning is worth repeating
        // rather than inheriting silently: every board, widget and saved analysis is fetched
        // through the analytics library endpoints, which scope every read to the calling
        // tenant and user themselves. A minRole here would be a second, weaker statement of a
        // rule the server already enforces per request -- and it would be the wrong one, since
        // dashboards are read and built by the same TENANT_USER who may open a dataset.
        path: 'data/analytics/dashboards',
        title: 'Saved Analyses',
        loadComponent: () => import('./features/analytics/dashboard').then(m => m.Dashboards),
        data: { pageKey: 'analytics-dashboards' },
        canActivate: [pageGuard],
      },
      // ---------------------------------------------------------------------------------------------
      // Forms and Workflows (Wave 5)
      // ---------------------------------------------------------------------------------------------
      {
        // Wave 5 Forms (lite): Core's /form.json, page 'forms'. Every member holding the page fills in the workspace's
        // Active forms; building them is a workspace administrator's (the page hides it from anyone else, and it is
        // read-only in a MANAGED workspace). Shared inside the workspace only: no public or expiring links yet.
        path: 'forms/builder',
        title: 'Form builder',
        loadComponent: () => import('./features/forms/form-builder').then(m => m.FormBuilder),
        data: { pageKey: 'forms' },
        canActivate: [pageGuard],
      },
      {
        path: 'forms/:formId/fill',
        title: 'Fill in a form',
        loadComponent: () => import('./features/forms/form-fill').then(m => m.FormFill),
        data: { pageKey: 'forms' },
        canActivate: [pageGuard],
      },
      {
        // What the forms collected (/formSubmission.json), page 'form-submissions': who, when, and the run each started.
        path: 'forms/submissions',
        title: 'Submissions',
        loadComponent: () => import('./features/forms/form-submissions').then(m => m.FormSubmissions),
        data: { pageKey: 'form-submissions' },
        canActivate: [pageGuard],
      },
      // ---------------------------------------------------------------------------------------------
      // AI (was Assistants)
      // ---------------------------------------------------------------------------------------------
      // Prompts replaced AI Agents on 2026-09-18: reading is TENANT_USER (a person must see
      // what the step on their pipeline says; the file chat lists prompts), writing and Try it are
      // gated inside the pages on auth.canManageAgents.
      {
        path: 'ai/prompts',
        title: 'Prompts',
        loadComponent: () => import('./features/ai/prompts/prompts').then(m => m.Prompts),
        data: { pageKey: 'ai-prompts' },
        canActivate: [pageGuard],
      },
      {
        path: 'ai/prompts/new',
        title: 'New prompt',
        loadComponent: () => import('./features/ai/prompts/prompt-edit').then(m => m.PromptEdit),
        data: { pageKey: 'ai-prompts', minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'ai/prompts/:promptId/edit',
        title: 'Edit prompt',
        loadComponent: () => import('./features/ai/prompts/prompt-edit').then(m => m.PromptEdit),
        data: { pageKey: 'ai-prompts', minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        // MIG-252: the AI Assistant (ai-service's assistant, MIG-241) and the tools it may call. Every
        // call they make is TENANT_USER under aiPrompt.json, so they ride the Prompts page key; a
        // tool's switch is gated inside the page on auth.canManageAgents (setEnabled is TENANT_ADMIN).
        path: 'ai/assistant',
        title: 'AI Assistant',
        loadComponent: () => import('./features/ai/assistant/assistant').then(m => m.Assistant),
        data: { pageKey: 'ai-prompts' },
        canActivate: [pageGuard],
      },
      {
        path: 'ai/tools',
        title: 'Tool Registry',
        loadComponent: () => import('./features/ai/tools/tool-registry').then(m => m.ToolRegistry),
        data: { pageKey: 'ai-prompts' },
        canActivate: [pageGuard],
      },
      {
        path: 'ai/connections',
        title: 'Model connections',
        loadComponent: () => import('./features/ai/connections/connections').then(m => m.Connections),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      // ---------------------------------------------------------------------------------------------
      // Configuration
      // ---------------------------------------------------------------------------------------------
      {
        // Task Registry was Configuration › Pipelines (MIG-218): every task a pipeline's steps can
        // run (MIG-250), and every existing pipeline as a Legacy task, still edited in its dialog.
        path: 'configuration/task-registry',
        title: 'Task Registry',
        loadComponent: () =>
          import('./features/settings/task-registry/task-registry').then(m => m.TaskRegistry),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'configuration/kafka',
        title: 'Kafka & Topics',
        loadComponent: () =>
          import('./features/settings/kafka/kafka-connections').then(m => m.KafkaConnections),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      // MIG-167: the generic Lookups screen is gone. What it held now has a typed screen each --
      // a workspace's configuration values and secrets, the engine's own settings, and the home
      // pages and groups a task points at. The old address lands on the nearest of them.
      {
        path: 'configuration/values',
        title: 'Configuration values',
        loadComponent: () =>
          import('./features/settings/configuration/config-values').then(m => m.ConfigValues),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        // Platform-wide: the fetch limit and the crons' watermarks are the engine's, not a
        // workspace's, and every call behind this screen is PLATFORM_ADMIN on the server.
        path: 'configuration/engine',
        title: 'Engine settings',
        loadComponent: () =>
          import('./features/settings/configuration/engine-settings').then(m => m.EngineSettings),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'configuration/home-pages',
        title: 'Home pages',
        loadComponent: () =>
          import('./features/settings/configuration/task-references').then(m => m.TaskReferences),
        data: { minRole: 'TENANT_ADMIN', kind: 'HOME_PAGE' },
        canActivate: [roleGuard],
      },
      {
        path: 'configuration/task-groups',
        title: 'Task groups',
        loadComponent: () =>
          import('./features/settings/configuration/task-references').then(m => m.TaskReferences),
        data: { minRole: 'TENANT_ADMIN', kind: 'TASK_GROUP' },
        canActivate: [roleGuard],
      },
      // ---------------------------------------------------------------------------------------------
      // Billing
      // ---------------------------------------------------------------------------------------------
      {
        // Cost & usage: a tenant administrator's own workspace, a platform administrator's any. Role-gated
        // only, TENANT_ADMIN at the floor: Identity retired the 'billing' page key (MIG-34).
        path: 'billing/usage',
        title: 'Cost & usage',
        loadComponent: () => import('./features/billing/billing').then(m => m.Billing),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'billing/invoices',
        title: 'Invoices',
        loadComponent: () => import('./features/billing/invoices').then(m => m.Invoices),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'billing/invoices/:number',
        title: 'Invoice',
        loadComponent: () => import('./features/billing/invoices').then(m => m.Invoices),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'billing/documents',
        title: 'Billing documents',
        loadComponent: () => import('./features/billing/documents').then(m => m.BillingDocuments),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'billing/analytics',
        title: 'Billing analytics',
        loadComponent: () => import('./features/billing/billing-analytics').then(m => m.BillingAnalyticsPage),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'billing/rates',
        title: 'Rate cards',
        loadComponent: () => import('./features/billing/rate-cards').then(m => m.RateCards),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      // ---------------------------------------------------------------------------------------------
      // Administration
      // ---------------------------------------------------------------------------------------------
      {
        path: 'administration/users',
        title: 'Users',
        loadComponent: () => import('./features/admin/users/users').then(m => m.Users),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'administration/access-profiles',
        title: 'Access profiles',
        loadComponent: () =>
          import('./features/admin/access-profiles/access-profiles').then(m => m.AccessProfiles),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        // MIG-254: the workspace's data policy (ai-service, MIG-243). Read by any member -- the service answers
        // TENANT_USER under /aiPrompt.json, which the gateway gates on the Prompts page -- and saved by a workspace
        // administrator (the page hides every control from anyone else). The menu lists it for administrators; a
        // member reaches it from the AI Assistant's Context panel.
        path: 'administration/data-policies',
        title: 'Data policies',
        loadComponent: () => import('./features/admin/data-policies/data-policies').then(m => m.DataPolicies),
        data: { pageKey: 'ai-prompts' },
        canActivate: [pageGuard],
      },
      {
        path: 'administration/tenants',
        title: 'Tenants',
        loadComponent: () => import('./features/admin/tenants/tenants').then(m => m.Tenants),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'administration/tenant-requests',
        title: 'Workspace Requests',
        loadComponent: () =>
          import('./features/tenant-request/tenant-requests').then(m => m.TenantRequests),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      // MIG-254: the managed service. Role-gated, no page keys: every call behind the first three is PLATFORM_ADMIN
      // (identity-service ManagedServiceRestApi), and the fourth is a workspace administrator's read of the same audit.
      {
        path: 'administration/managed-service',
        title: 'Managed service',
        loadComponent: () =>
          import('./features/admin/managed-service/managed-service').then(m => m.ManagedService),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'administration/staff-activity',
        title: 'Staff activity',
        loadComponent: () =>
          import('./features/admin/managed-service/staff-activity').then(m => m.StaffActivity),
        data: { minRole: 'PLATFORM_ADMIN', scope: 'platform' },
        canActivate: [roleGuard],
      },
      {
        path: 'administration/work-in-workspace',
        title: 'Work in a workspace',
        loadComponent: () =>
          import('./features/admin/managed-service/work-in-workspace').then(m => m.WorkInWorkspace),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        // MIG-196: the 99.99% objectives for pipeline execution and billing, their error budgets and burn rates.
        // Platform-wide: every call behind it is PLATFORM_ADMIN (process /reliability.json, billing /billing.json/reliability).
        path: 'administration/reliability',
        title: 'Reliability',
        loadComponent: () => import('./features/admin/reliability/reliability').then(m => m.Reliability),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'administration/team-activity',
        title: "Our team's activity",
        loadComponent: () =>
          import('./features/admin/managed-service/staff-activity').then(m => m.StaffActivity),
        data: { minRole: 'TENANT_ADMIN', scope: 'workspace' },
        canActivate: [roleGuard],
      },
      // ---------------------------------------------------------------------------------------------
      // Pages outside the menu
      // ---------------------------------------------------------------------------------------------
      {
        path: 'profile',
        title: 'Your profile',
        loadComponent: () => import('./features/profile/profile').then(m => m.Profile),
      },
      {
        path: 'notifications',
        title: 'Notifications',
        loadComponent: () =>
          import('./features/notifications/notifications').then(m => m.Notifications),
      },
      {
        path: 'unauthorized',
        title: 'Not available',
        loadComponent: () =>
          import('./features/unauthorized/unauthorized').then(m => m.Unauthorized),
      },
      // ---------------------------------------------------------------------------------------------
      // Old addresses. Every one a full match: a prefix redirect also catches every longer address
      // under it and rewrites only its own part (administration/billing sent .../invoices to
      // billing/usage/invoices -- Page not found). Each points straight at today's page, no chains.
      // ---------------------------------------------------------------------------------------------
      // The addresses of MIG-246's renames and regrouping (2026-09-28).
      ...moved([
        ['operations/jobs', 'pipelines/schedules'],
        ['operations/jobs/new', 'pipelines/schedules/new'],
        ['operations/jobs/bulk', 'pipelines/schedules/bulk'],
        ['operations/jobs/history', 'pipelines/executions'],
        ['operations/jobs/:jobId/edit', 'pipelines/schedules/:jobId/edit'],
        ['operations/jobs/:jobId/assistant', 'pipelines/schedules/:jobId/assistant'],
        ['operations/jobs/:jobId/history', 'pipelines/schedules/:jobId/executions'],
        ['operations/jobs/:jobId/runs/:jobQueueId/logs', 'pipelines/schedules/:jobId/runs/:jobQueueId/logs'],
        ['operations/queue', 'pipelines/queue'],
        ['operations/tasks', 'pipelines'],
        ['operations/tasks/new', 'pipelines/new'],
        ['operations/tasks/bulk', 'pipelines/bulk'],
        ['operations/tasks/:taskDetailId/edit', 'pipelines/:taskDetailId/edit'],
        ['operations/reports', 'pipelines/run-analytics'],
        ['configuration/pipelines', 'configuration/task-registry'],
        ['configuration/storage-connections', 'integration/storage-connections'],
        ['objects/files', 'documents/files'],
        ['objects/analytics', 'data/analytics'],
        ['objects/analytics/dashboards', 'data/analytics/dashboards'],
        ['tools/converter', 'documents/converter'],
        ['tools/transcript', 'documents/transcript'],
        ['assistants/prompts', 'ai/prompts'],
        ['assistants/prompts/new', 'ai/prompts/new'],
        ['assistants/prompts/:promptId/edit', 'ai/prompts/:promptId/edit'],
        ['assistants/connections', 'ai/connections'],
      ]),
      // 2026-09-18: the flat addresses from before <section>/<page>, and the screens retired or
      // renamed since (params carry over).
      ...moved([
        ['jobs', 'pipelines/schedules'],
        ['jobs/new', 'pipelines/schedules/new'],
        ['jobs/bulk', 'pipelines/schedules/bulk'],
        ['jobs/history', 'pipelines/executions'],
        ['jobs/:jobId/edit', 'pipelines/schedules/:jobId/edit'],
        ['jobs/:jobId/assistant', 'pipelines/schedules/:jobId/assistant'],
        ['jobs/:jobId/history', 'pipelines/schedules/:jobId/executions'],
        ['jobs/:jobId/runs/:jobQueueId/logs', 'pipelines/schedules/:jobId/runs/:jobQueueId/logs'],
        ['queue', 'pipelines/queue'],
        ['tasks', 'pipelines'],
        ['tasks/new', 'pipelines/new'],
        ['tasks/bulk', 'pipelines/bulk'],
        ['tasks/:taskDetailId/edit', 'pipelines/:taskDetailId/edit'],
        ['reports', 'pipelines/run-analytics'],
        ['objects', 'documents/files'],
        ['analytics', 'data/analytics'],
        ['analytics/dashboards', 'data/analytics/dashboards'],
        ['admin/storage', 'integration/storage-connections'],
        ['settings/storage-connections', 'integration/storage-connections'],
        // Prompts replaced AI Agents on 2026-09-18; the Ollama Models page folded into a
        // connection's "Test connection", which lists them.
        ['ai/agents', 'ai/prompts'],
        ['ai/models', 'ai/connections'],
        ['admin/users', 'administration/users'],
        ['admin/access-profiles', 'administration/access-profiles'],
        ['admin/tenants', 'administration/tenants'],
        ['admin/tenant-requests', 'administration/tenant-requests'],
        // Renamed from settings/forms once the feature became the pipeline catalogue rather than a
        // general form builder, then Configuration › Pipelines, now the Task Registry.
        ['settings/pipelines', 'configuration/task-registry'],
        ['settings/forms', 'configuration/task-registry'],
        ['settings/pipeline-forms', 'configuration/task-registry'],
        // Topics (source task types) are managed on the Kafka screen since 2026-09-18; a
        // ?profileId= link keeps its meaning.
        ['settings/task-types', 'configuration/kafka'],
        ['settings/kafka', 'configuration/kafka'],
        ['settings/lookup', 'configuration/values'],
        ['configuration/lookup', 'configuration/values'],
        // Billing is a section of its own since it left Administration.
        ['billing', 'billing/usage'],
        ['administration/billing', 'billing/usage'],
        ['administration/billing/invoices', 'billing/invoices'],
        ['administration/billing/invoices/:number', 'billing/invoices/:number'],
        ['administration/billing/documents', 'billing/documents'],
        ['administration/billing/analytics', 'billing/analytics'],
        ['administration/billing/rates', 'billing/rates'],
      ]),
      // Last: an address that matches no page shows "Page not found" inside the layout.
      {
        path: '**',
        title: 'Page not found',
        loadComponent: () => import('./features/not-found/not-found').then(m => m.NotFound),
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
