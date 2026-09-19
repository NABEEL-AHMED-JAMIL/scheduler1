import { Routes } from '@angular/router';
import { anonymousOnly, authGuard, pageGuard, passwordChangeGuard, roleGuard } from './core/auth/auth.guard';
import { Shell } from './features/shell/shell';

export const routes: Routes = [
  {
    // Signed out only. A stale bookmark or a restored tab otherwise put someone who is already
    // signed in in front of a bare sign-in form outside the shell, which reads as having been
    // logged out -- and signing in again from there wrote a second session over the first with
    // no logout in between. The redirect below catches them instead.
    path: 'login',
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
    loadComponent: () =>
      import('./features/tenant-request/request-workspace').then(m => m.RequestWorkspace),
  },
  {
    // Public like the landing page: the setup guide describes the console's own screens and
    // carries nothing tenant-specific, so it can be linked to and read before signing in.
    path: 'docs',
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
        loadComponent: () => import('./features/dashboard/dashboard').then(m => m.Dashboard),
      },
      {
        path: 'operations/jobs',
        loadComponent: () => import('./features/jobs/jobs').then(m => m.Jobs),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        path: 'operations/jobs/new',
        loadComponent: () => import('./features/jobs/edit/job-edit').then(m => m.JobEdit),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        path: 'operations/jobs/:jobId/edit',
        loadComponent: () => import('./features/jobs/edit/job-edit').then(m => m.JobEdit),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        path: 'operations/jobs/:jobId/assistant',
        loadComponent: () =>
          import('./features/jobs/assistant/job-assistant').then(m => m.JobAssistant),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        path: 'operations/jobs/:jobId/runs/:jobQueueId/logs',
        loadComponent: () => import('./features/jobs/logs/job-logs').then(m => m.JobLogs),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        path: 'operations/queue',
        loadComponent: () => import('./features/queue/queue').then(m => m.Queue),
        data: { pageKey: 'queue' },
        canActivate: [pageGuard],
      },
      {
        // Same screen without a job: the dashboard's TOTAL row drills into an hour across
        // every job, which has no single id to put in the path.
        path: 'operations/jobs/history',
        loadComponent: () =>
          import('./features/jobs/history/job-history').then(m => m.JobHistory),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        path: 'operations/jobs/:jobId/history',
        loadComponent: () =>
          import('./features/jobs/history/job-history').then(m => m.JobHistory),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        // The editor is nothing but writes, and addSourceTask/updateSourceTask are TENANT_ADMIN.
        // Ungated, a tenant user could fill in a task name, type, pipeline and the whole XML
        // payload and only be told no when they pressed Save, with the work lost.
        path: 'operations/tasks/new',
        loadComponent: () => import('./features/tasks/edit/task-edit').then(m => m.TaskEdit),
        data: { pageKey: 'tasks', minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'operations/tasks/:taskDetailId/edit',
        loadComponent: () => import('./features/tasks/edit/task-edit').then(m => m.TaskEdit),
        data: { pageKey: 'tasks', minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        // The list itself stays open: listSourceTask is TENANT_USER on purpose, and a job
        // points at a task, so seeing them is part of reading the console.
        path: 'operations/tasks',
        loadComponent: () => import('./features/tasks/tasks').then(m => m.Tasks),
        data: { pageKey: 'tasks' },
        canActivate: [pageGuard],
      },
      {
        // Lives under settings/ rather than admin/ because it groups with the rest of the
        // Configuration menu (Kafka & Topics, Lookups, Pipelines) -- infrastructure
        // setup, not the Administration menu's people/tenant management. The old admin/storage
        // path is kept as a redirect below so an old bookmark or link still lands.
        path: 'configuration/storage-connections',
        loadComponent: () =>
          import('./features/admin/storage/storage-connections').then(m => m.StorageConnections),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        // Open to TENANT_USER, like the Object Browser it reads from and for the same reason:
        // which connections a caller may reach is settled per request against each connection's
        // own tenant, not by a role on the route.
        path: 'objects/analytics',
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
        path: 'objects/analytics/dashboards',
        loadComponent: () => import('./features/analytics/dashboard').then(m => m.Dashboards),
        data: { pageKey: 'analytics-dashboards' },
        canActivate: [pageGuard],
      },
      { path: 'admin/storage', redirectTo: 'configuration/storage-connections' },
      // Prompts replaced AI Agents on 2026-09-18: reading is TENANT_USER (a person must see
      // what the step on their task says; the file chat lists prompts), writing and Try it are
      // gated inside the pages on auth.canManageAgents.
      { path: 'ai/agents', redirectTo: 'assistants/prompts' },
      {
        path: 'assistants/prompts',
        loadComponent: () => import('./features/ai/prompts/prompts').then(m => m.Prompts),
        data: { pageKey: 'ai-prompts' },
        canActivate: [pageGuard],
      },
      {
        path: 'assistants/prompts/new',
        loadComponent: () => import('./features/ai/prompts/prompt-edit').then(m => m.PromptEdit),
        data: { pageKey: 'ai-prompts', minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'assistants/prompts/:promptId/edit',
        loadComponent: () => import('./features/ai/prompts/prompt-edit').then(m => m.PromptEdit),
        data: { pageKey: 'ai-prompts', minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'assistants/connections',
        loadComponent: () => import('./features/ai/connections/connections').then(m => m.Connections),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      // The Ollama Models page folded into a connection's "Test connection", which lists them.
      { path: 'ai/models', redirectTo: 'assistants/connections' },
      {
        path: 'administration/users',
        loadComponent: () => import('./features/admin/users/users').then(m => m.Users),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'administration/access-profiles',
        loadComponent: () =>
          import('./features/admin/access-profiles/access-profiles').then(m => m.AccessProfiles),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'administration/tenants',
        loadComponent: () => import('./features/admin/tenants/tenants').then(m => m.Tenants),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'profile',
        loadComponent: () => import('./features/profile/profile').then(m => m.Profile),
      },
      {
        path: 'notifications',
        loadComponent: () =>
          import('./features/notifications/notifications').then(m => m.Notifications),
      },
      {
        path: 'tools/converter',
        loadComponent: () => import('./features/tools/converter/converter').then(m => m.Converter),
        data: { pageKey: 'tools-converter' },
        canActivate: [pageGuard],
      },
      {
        path: 'tools/transcript',
        loadComponent: () => import('./features/tools/transcript/transcript').then(m => m.Transcript),
        data: { pageKey: 'tools-transcript' },
        canActivate: [pageGuard],
      },
      // Topics (source task types) are managed on the Kafka screen since 2026-09-18; the old
      // address still lands somewhere useful, with a ?profileId= link keeping its meaning.
      { path: 'settings/task-types', redirectTo: 'configuration/kafka' },
      {
        path: 'configuration/pipelines',
        loadComponent: () =>
          import('./features/settings/pipelines/pipelines').then(m => m.Pipelines),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      // Renamed from settings/forms once the feature became the pipeline catalogue rather than
      // a general form builder -- kept as a redirect so an old bookmark or link still lands.
      { path: 'settings/forms', redirectTo: 'configuration/pipelines' },
      { path: 'settings/pipeline-forms', redirectTo: 'configuration/pipelines' },
      {
        // Cost & usage: a tenant admin's own workspace, a platform admin's any. A page an
        // access profile can withhold (pageKey billing), and TENANT_ADMIN at the floor.
        path: 'administration/billing',
        loadComponent: () => import('./features/billing/billing').then(m => m.Billing),
        data: { pageKey: 'billing', minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'administration/tenant-requests',
        loadComponent: () =>
          import('./features/tenant-request/tenant-requests').then(m => m.TenantRequests),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'unauthorized',
        loadComponent: () =>
          import('./features/unauthorized/unauthorized').then(m => m.Unauthorized),
      },
      {
        path: 'operations/jobs/bulk',
        loadComponent: () => import('./features/bulk/bulk-transfer').then(m => m.BulkTransfer),
        data: { pageKey: 'jobs', kind: 'job' },
        canActivate: [pageGuard],
      },
      {
        // Unlike its jobs twin, every call this page makes -- template, export and upload --
        // sits under SourceTaskRestApi's class-level TENANT_ADMIN, so there is no state in
        // which it does anything for a tenant user.
        path: 'operations/tasks/bulk',
        loadComponent: () => import('./features/bulk/bulk-transfer').then(m => m.BulkTransfer),
        data: { pageKey: 'tasks', kind: 'task', minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'operations/reports',
        loadComponent: () =>
          import('./features/reports/reports').then(m => m.Reports),
        data: { pageKey: 'reports' },
        canActivate: [pageGuard],
      },
      {
        path: 'configuration/kafka',
        loadComponent: () =>
          import('./features/settings/kafka/kafka-connections').then(m => m.KafkaConnections),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'configuration/lookup',
        loadComponent: () => import('./features/settings/lookup/lookup').then(m => m.Lookup),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        // TENANT_USER rather than nothing at all: StorageBrowserRestApi's floor is a signed-in
        // user, and which bucket and key that user may actually reach is decided per request,
        // so no role the route could name would say more than the server already does. What it
        // does add is the case authGuard cannot see -- a session whose token carries no
        // readable role lands on /unauthorized rather than on a page that is nothing but
        // storage calls, every one of which comes back refused.
        path: 'objects/files',
        loadComponent: () => import('./features/objects/objects').then(m => m.Objects),
        data: { pageKey: 'objects', minRole: 'TENANT_USER' },
        canActivate: [pageGuard, roleGuard],
      },
      // 2026-09-18: every address is now <section>/<page> -- the section the menu shows it
      // under, then the page. The old flat addresses redirect so bookmarks, notification
      // links and anything the docs once said still land (params carry over).
      { path: 'jobs', redirectTo: 'operations/jobs' },
      { path: 'jobs/new', redirectTo: 'operations/jobs/new' },
      { path: 'jobs/:jobId/edit', redirectTo: 'operations/jobs/:jobId/edit' },
      { path: 'jobs/:jobId/assistant', redirectTo: 'operations/jobs/:jobId/assistant' },
      { path: 'jobs/:jobId/runs/:jobQueueId/logs', redirectTo: 'operations/jobs/:jobId/runs/:jobQueueId/logs' },
      { path: 'queue', redirectTo: 'operations/queue' },
      { path: 'jobs/history', redirectTo: 'operations/jobs/history' },
      { path: 'jobs/:jobId/history', redirectTo: 'operations/jobs/:jobId/history' },
      { path: 'tasks/new', redirectTo: 'operations/tasks/new' },
      { path: 'tasks/:taskDetailId/edit', redirectTo: 'operations/tasks/:taskDetailId/edit' },
      { path: 'tasks', redirectTo: 'operations/tasks' },
      { path: 'settings/storage-connections', redirectTo: 'configuration/storage-connections' },
      { path: 'analytics', redirectTo: 'objects/analytics' },
      { path: 'analytics/dashboards', redirectTo: 'objects/analytics/dashboards' },
      { path: 'ai/prompts', redirectTo: 'assistants/prompts' },
      { path: 'ai/prompts/new', redirectTo: 'assistants/prompts/new' },
      { path: 'ai/prompts/:promptId/edit', redirectTo: 'assistants/prompts/:promptId/edit' },
      { path: 'ai/connections', redirectTo: 'assistants/connections' },
      { path: 'admin/users', redirectTo: 'administration/users' },
      { path: 'admin/access-profiles', redirectTo: 'administration/access-profiles' },
      { path: 'admin/tenants', redirectTo: 'administration/tenants' },
      { path: 'settings/pipelines', redirectTo: 'configuration/pipelines' },
      { path: 'admin/tenant-requests', redirectTo: 'administration/tenant-requests' },
      { path: 'jobs/bulk', redirectTo: 'operations/jobs/bulk' },
      { path: 'tasks/bulk', redirectTo: 'operations/tasks/bulk' },
      { path: 'reports', redirectTo: 'operations/reports' },
      { path: 'settings/kafka', redirectTo: 'configuration/kafka' },
      { path: 'settings/lookup', redirectTo: 'configuration/lookup' },
      { path: 'objects', redirectTo: 'objects/files' },
    ],
  },
  { path: '**', redirectTo: '' },
];
