import { Routes } from '@angular/router';
import { anonymousOnly, authGuard, passwordChangeGuard, roleGuard } from './core/auth/auth.guard';
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
        path: 'jobs',
        loadComponent: () => import('./features/jobs/jobs').then(m => m.Jobs),
      },
      {
        path: 'jobs/new',
        loadComponent: () => import('./features/jobs/edit/job-edit').then(m => m.JobEdit),
      },
      {
        path: 'jobs/:jobId/edit',
        loadComponent: () => import('./features/jobs/edit/job-edit').then(m => m.JobEdit),
      },
      {
        path: 'jobs/:jobId/assistant',
        loadComponent: () =>
          import('./features/jobs/assistant/job-assistant').then(m => m.JobAssistant),
      },
      {
        path: 'jobs/:jobId/runs/:jobQueueId/logs',
        loadComponent: () => import('./features/jobs/logs/job-logs').then(m => m.JobLogs),
      },
      {
        path: 'queue',
        loadComponent: () => import('./features/queue/queue').then(m => m.Queue),
      },
      {
        // Same screen without a job: the dashboard's TOTAL row drills into an hour across
        // every job, which has no single id to put in the path.
        path: 'jobs/history',
        loadComponent: () =>
          import('./features/jobs/history/job-history').then(m => m.JobHistory),
      },
      {
        path: 'jobs/:jobId/history',
        loadComponent: () =>
          import('./features/jobs/history/job-history').then(m => m.JobHistory),
      },
      {
        // The editor is nothing but writes, and addSourceTask/updateSourceTask are TENANT_ADMIN.
        // Ungated, a tenant user could fill in a task name, type, pipeline and the whole XML
        // payload and only be told no when they pressed Save, with the work lost.
        path: 'tasks/new',
        loadComponent: () => import('./features/tasks/edit/task-edit').then(m => m.TaskEdit),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'tasks/:taskDetailId/edit',
        loadComponent: () => import('./features/tasks/edit/task-edit').then(m => m.TaskEdit),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        // The list itself stays open: listSourceTask is TENANT_USER on purpose, and a job
        // points at a task, so seeing them is part of reading the console.
        path: 'tasks',
        loadComponent: () => import('./features/tasks/tasks').then(m => m.Tasks),
      },
      {
        // Lives under settings/ rather than admin/ because it groups with the rest of the
        // Configuration menu (Kafka Connections, Lookups, Pipeline Forms) -- infrastructure
        // setup, not the Administration menu's people/tenant management. The old admin/storage
        // path is kept as a redirect below so an old bookmark or link still lands.
        path: 'settings/storage-connections',
        loadComponent: () =>
          import('./features/admin/storage/storage-connections').then(m => m.StorageConnections),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        // Open to TENANT_USER, like the Object Browser it reads from and for the same reason:
        // which connections a caller may reach is settled per request against each connection's
        // own tenant, not by a role on the route.
        path: 'analytics',
        loadComponent: () => import('./features/analytics/analytics').then(m => m.Analytics),
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
        path: 'analytics/dashboards',
        loadComponent: () => import('./features/analytics/dashboard').then(m => m.Dashboards),
      },
      { path: 'admin/storage', redirectTo: 'settings/storage-connections' },
      {
        // Deliberately open, unlike its Models sibling: fetchAllAgents is TENANT_USER and the
        // objects screen depends on it. Only add/update/delete need TENANT_ADMIN, so the gate
        // belongs on those controls (auth.canManageAgents) rather than on the page.
        path: 'ai/agents',
        loadComponent: () => import('./features/ai/agents/agents').then(m => m.Agents),
      },
      {
        path: 'admin/users',
        loadComponent: () => import('./features/admin/users/users').then(m => m.Users),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'admin/tenants',
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
        path: 'ai/models',
        loadComponent: () => import('./features/ai/models/models').then(m => m.Models),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'tools/converter',
        loadComponent: () => import('./features/tools/converter/converter').then(m => m.Converter),
      },
      {
        path: 'tools/transcript',
        loadComponent: () => import('./features/tools/transcript/transcript').then(m => m.Transcript),
      },
      {
        path: 'settings/task-types',
        loadComponent: () =>
          import('./features/settings/task-types/task-types').then(m => m.TaskTypes),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'settings/pipeline-forms',
        loadComponent: () =>
          import('./features/settings/forms/task-forms').then(m => m.TaskForms),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      // Renamed from settings/forms once the feature became the pipeline catalogue rather than
      // a general form builder -- kept as a redirect so an old bookmark or link still lands.
      { path: 'settings/forms', redirectTo: 'settings/pipeline-forms' },
      {
        path: 'admin/tenant-requests',
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
        path: 'jobs/bulk',
        loadComponent: () => import('./features/bulk/bulk-transfer').then(m => m.BulkTransfer),
        data: { kind: 'job' },
      },
      {
        // Unlike its jobs twin, every call this page makes -- template, export and upload --
        // sits under SourceTaskRestApi's class-level TENANT_ADMIN, so there is no state in
        // which it does anything for a tenant user.
        path: 'tasks/bulk',
        loadComponent: () => import('./features/bulk/bulk-transfer').then(m => m.BulkTransfer),
        data: { kind: 'task', minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports').then(m => m.Reports),
      },
      {
        path: 'settings/kafka',
        loadComponent: () =>
          import('./features/settings/kafka/kafka-connections').then(m => m.KafkaConnections),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'settings/lookup',
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
        path: 'objects',
        loadComponent: () => import('./features/objects/objects').then(m => m.Objects),
        data: { minRole: 'TENANT_USER' },
        canActivate: [roleGuard],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
