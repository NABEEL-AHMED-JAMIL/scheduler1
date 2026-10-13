import { Routes, Route } from '@angular/router';
import { anonymousOnly, authGuard, pageGuard, passwordChangeGuard, roleGuard } from './core/auth/auth.guard';
import { Shell } from './features/shell/shell';
import { toFirstTab } from './core/nav/nav-access';

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
    // MIG-353 part 5: where a company's identity provider returns a person (the redirect URI its administrator registers).
    // Public on purpose: the code and the state in the address are the proof, and Identity checks both.
    path: 'sso/callback',
    title: 'Signing in',
    loadComponent: () => import('./features/login/sso-callback').then(m => m.SsoCallback),
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
    // MIG-278: a form shared by link. Public on purpose -- the link's token is the only key, and Core decides what it
    // opens; the page shows the form and nothing of the workspace or the console behind it.
    path: 'f/:token',
    title: 'Form',
    loadComponent: () => import('./features/forms/public-form').then(m => m.PublicForm),
  },
  {
    // MIG-335: one run's read-only view, for a customer's portal to frame or open. Public on purpose, like a shared form:
    // the view link's token is the only key and Core decides what it opens; no shell, no sign-in, no session. Where it may
    // be framed is the console server's answer (nginx: frame-ancestors from the API client's allow-list).
    path: 'embed/runs/:token',
    title: 'Run',
    loadComponent: () => import('./features/embed/run-view').then(m => m.EmbedRunViewPage),
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
        title: 'Home',
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
        // behind it is TENANT_ADMIN. UX review B7 (I1): the Storage tab of Connections; the old address redirects here.
        path: 'connections/storage',
        title: 'Storage connections',
        loadComponent: () =>
          import('./features/admin/storage/storage-connections').then(m => m.StorageConnections),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        // MIG-332: the customer API's API clients and event routes. Role-gated like Storage Connections: every call
        // behind it is TENANT_ADMIN (Identity's apiClient.json, Core's eventRoute.json).
        path: 'developers/api-clients',
        title: 'API Clients',
        loadComponent: () =>
          import('./features/integration/api-clients/api-clients').then(m => m.ApiClients),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        // MIG-336: the customer API's developer portal -- overview, guides, reference, changelog -- from the contract
        // bundled into its own lazy chunk (scripts/sync-developer-docs.mjs); its pages are in developer.routes.ts, so the
        // first load carries one route. Owner: API docs are for administrators and developers only, so its page key is
        // one a tenant user holds only when their access profile names it (AuthService.canOpen). The guard here covers
        // every page under it.
        path: 'developers/portal',
        title: 'Developer portal',
        loadChildren: () => import('./features/developer/developer.routes').then(m => m.DEVELOPER_ROUTES),
        data: { pageKey: 'developer-portal' },
        canActivate: [pageGuard],
      },
      {
        // MIG-247: which APIs exist, tested and versioned. Every member holding the page reads; the pages
        // hide what integration-service answers only for a workspace administrator (writes and Test).
        path: 'connections/api-collections',
        title: 'API Collections',
        loadComponent: () =>
          import('./features/integration/api-collections/api-collections').then(m => m.ApiCollections),
        data: { pageKey: 'api-collections' },
        canActivate: [pageGuard],
      },
      {
        path: 'connections/api-collections/:collectionId',
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
        path: 'connections/sources',
        title: 'Sources',
        loadComponent: () =>
          import('./features/integration/sources/sources').then(m => m.Sources),
        data: { pageKey: 'sources', view: 'sources' },
        canActivate: [pageGuard],
      },
      {
        // Tab hubs (2026-10-12): the Sources page's database connections and data contracts are tabs of Connections,
        // each its own address on the same page key and the same screen.
        path: 'connections/databases',
        title: 'Database connections',
        loadComponent: () =>
          import('./features/integration/sources/sources').then(m => m.Sources),
        data: { pageKey: 'sources', view: 'connections' },
        canActivate: [pageGuard],
      },
      {
        path: 'connections/contracts',
        title: 'Data contracts',
        loadComponent: () =>
          import('./features/integration/sources/sources').then(m => m.Sources),
        data: { pageKey: 'sources', view: 'contracts' },
        canActivate: [pageGuard],
      },
      {
        // Wave 5 (MIG-292): Connector Hub -- the gallery, connecting a database, SaaS app or folder, and every connection's
        // sync health, from integration-service's /connectorHub.json, gated by connector-hub at the gateway. Every member
        // holding the page reads; connecting and changing are a workspace administrator's (the page hides them otherwise).
        path: 'connections/connectors',
        title: 'Connections',
        loadComponent: () => import('./features/integration/connectors/connectors').then(m => m.Connectors),
        data: { pageKey: 'connector-hub' },
        canActivate: [pageGuard],
      },
      {
        // Where an OAuth provider sends the browser back with code and state (INTEGRATION_CONNECTORS_OAUTH_REDIRECT_URL).
        path: 'integration/connectors/oauth/callback',
        title: 'Connecting',
        loadComponent: () => import('./features/integration/connectors/oauth-callback').then(m => m.OAuthCallback),
        data: { pageKey: 'connector-hub' },
        canActivate: [pageGuard],
      },
      // ---------------------------------------------------------------------------------------------
      // Pipelines (was Operations). Pipelines was Source Tasks, Schedules was Source Jobs, Executions
      // was Run history, Run analytics was Reports. Keys unchanged: tasks, jobs, jobs, reports.
      // ---------------------------------------------------------------------------------------------
      {
        // The list itself stays open: listSourceTask is TENANT_USER on purpose, and a schedule points
        // at a pipeline, so seeing them is part of reading the console.
        path: 'pipelines/list',
        title: 'Pipelines',
        loadComponent: () => import('./features/tasks/tasks').then(m => m.Tasks),
        data: { pageKey: 'tasks' },
        canActivate: [pageGuard],
      },
      {
        // The editor is nothing but writes, and addSourceTask/updateSourceTask are TENANT_ADMIN.
        // Ungated, a tenant user could fill in a name, type and the whole XML payload and only be
        // told no when they pressed Save, with the work lost.
        // UX review 2026-10-12 (P3): a new pipeline starts from a choice -- the AI Assistant, steps, or a copy.
        path: 'pipelines/new',
        title: 'New pipeline',
        loadComponent: () => import('./features/tasks/new/new-pipeline').then(m => m.NewPipeline),
        data: { pageKey: 'tasks', minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        // The full form (event source topic, registry task, XML payload), for a pipeline a Kafka message starts.
        path: 'pipelines/new/form',
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
        title: 'Pipeline',
        loadComponent: () => import('./features/tasks/edit/task-edit').then(m => m.TaskEdit),
        data: { pageKey: 'tasks', minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'pipelines/schedules',
        title: 'Schedules & triggers',
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
        title: 'Schedule',
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
        title: 'Schedule runs',
        loadComponent: () =>
          import('./features/jobs/history/job-history').then(m => m.JobHistory),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        // UX review 2026-10-12 (R2): the run page opens with Schedules or the Queue -- a reviewer holds the Queue, and Core
        // answers a run's reads only to its owner or one of its reviewers (RunReaders). Run page fix: the bare address opens
        // its Steps and /logs its Log (?tab= any other); both are this one page, which moves between them in place.
        path: 'pipelines/schedules/:jobId/runs/:jobQueueId',
        title: 'Run',
        loadComponent: () => import('./features/jobs/logs/job-logs').then(m => m.JobLogs),
        data: { pageKey: 'jobs', pageKeys: ['jobs', 'queue'] },
        canActivate: [pageGuard],
        children: [{ path: '', children: [] }, { path: 'logs', children: [] }],
      },
      {
        // Same screen without a schedule: the dashboard's TOTAL row drills into an hour across
        // every schedule, which has no single id to put in the path.
        path: 'runs/latest',
        title: 'Runs',
        loadComponent: () =>
          import('./features/jobs/history/job-history').then(m => m.JobHistory),
        // UX review 2026-10-12 (R2): with the Queue too -- a reviewer's runs waiting for review are listed here.
        data: { pageKey: 'jobs', pageKeys: ['jobs', 'queue'] },
        canActivate: [pageGuard],
      },
      {
        path: 'runs/by-date',
        title: 'Runs by date',
        loadComponent: () => import('./features/queue/queue').then(m => m.Queue),
        data: { pageKey: 'queue' },
        canActivate: [pageGuard],
      },
      {
        // MIG-355: Runs › Failed -- the Queue's reads (message.json/failedRuns is its group); retry needs Schedules, as on the run page.
        path: 'runs/failed',
        title: 'Failed runs',
        loadComponent: () => import('./features/runs/failed/failed-runs').then(m => m.FailedRuns),
        data: { pageKey: 'queue' },
        canActivate: [pageGuard],
      },
      {
        // MIG-347: Runs › Backfills -- a schedule run for each period of a past range; Schedules' page (sourceJob.json/backfills).
        path: 'runs/backfills',
        title: 'Backfills',
        loadComponent: () => import('./features/runs/backfills/backfills').then(m => m.Backfills),
        data: { pageKey: 'jobs' },
        canActivate: [pageGuard],
      },
      {
        path: 'runs/analytics',
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
        path: 'documents/in',
        title: 'Documents in',
        loadComponent: () => import('./features/documents/intelligence').then(m => m.DocumentIntelligence),
        data: { pageKey: 'document-intelligence', view: 'overview' },
        canActivate: [pageGuard],
      },
      {
        // Tab hubs (2026-10-12): Document Intelligence's types, datasets and email-in address are tabs of Documents, each
        // its own address on the same page key and the same screen.
        path: 'documents/types',
        title: 'Document types',
        loadComponent: () => import('./features/documents/intelligence').then(m => m.DocumentIntelligence),
        data: { pageKey: 'document-intelligence', view: 'types' },
        canActivate: [pageGuard],
      },
      {
        path: 'documents/datasets',
        title: 'Datasets',
        loadComponent: () => import('./features/documents/intelligence').then(m => m.DocumentIntelligence),
        data: { pageKey: 'document-intelligence', view: 'dataset' },
        canActivate: [pageGuard],
      },
      {
        path: 'documents/email-in',
        title: 'Email-in',
        loadComponent: () => import('./features/documents/intelligence').then(m => m.DocumentIntelligence),
        data: { pageKey: 'document-intelligence', view: 'intake' },
        canActivate: [pageGuard],
      },
      {
        path: 'tools/converter',
        title: 'Document Converter',
        loadComponent: () => import('./features/tools/converter/converter').then(m => m.Converter),
        data: { pageKey: 'tools-converter' },
        canActivate: [pageGuard],
      },
      {
        // MIG-253: generated outputs -- renders saved to a bucket and what recent runs put out. Behind the
        // converter's key: it lists what the converter makes, and there is no page key of its own yet.
        path: 'data/reports',
        title: 'Generated reports',
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
        path: 'data/files',
        title: 'Browse files',
        loadComponent: () => import('./features/objects/objects').then(m => m.Objects),
        data: { pageKey: 'objects', minRole: 'TENANT_USER' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        // MIG-239: the workspace inbox -- upload files that start jobs with an inbox trigger. Browse files' page key and
        // floor: the gateway leaves /storage.json open, storage-service lets every member read and upload, and only
        // configuring it is an administrator's (gated inside the page).
        path: 'documents/file-drop',
        title: 'File drop',
        loadComponent: () => import('./features/documents/inbox/inbox').then(m => m.Inbox),
        data: { pageKey: 'objects', minRole: 'TENANT_USER' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'tools/transcript',
        title: 'Audio Transcript',
        loadComponent: () => import('./features/tools/transcript/transcript').then(m => m.Transcript),
        data: { pageKey: 'tools-transcript' },
        canActivate: [pageGuard],
      },
      // ---------------------------------------------------------------------------------------------
      // Data (Wave 5; Analytics Studio and Saved Analyses moved here from Object Browser)
      // ---------------------------------------------------------------------------------------------
      {
        // Wave 5 (MIG-288): every dataset, file and document type -- owner, freshness, sensitive fields, lineage, access
        // requests -- from analytics-service's /analyticsCatalog.json, gated by data-catalog at the gateway.
        path: 'data/catalog',
        title: 'Data Catalog',
        loadComponent: () => import('./features/catalog/catalog').then(m => m.Catalog),
        data: { pageKey: 'data-catalog' },
        canActivate: [pageGuard],
      },
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
        title: 'Dashboards',
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
        title: 'Forms',
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
        title: 'Form submissions',
        loadComponent: () => import('./features/forms/form-submissions').then(m => m.FormSubmissions),
        data: { pageKey: 'form-submissions' },
        canActivate: [pageGuard],
      },
      // ---------------------------------------------------------------------------------------------
      // UX review DR2 (2026-10-13): the Review hub -- All waiting, Approvals, Runs and Documents. Each tab its own page
      // key: All waiting opens with either the Task inbox or Document review and lists only what each source answers
      // the reader; Runs is the Task inbox's (a reviewer decides a run through their task about it).
      // ---------------------------------------------------------------------------------------------
      {
        path: 'review/all',
        title: 'Review',
        loadComponent: () => import('./features/review/review-home').then(m => m.ReviewHome),
        data: { pageKeys: ['task-inbox', 'document-review'] },
        canActivate: [pageGuard],
      },
      {
        // Wave 5 Workflows (MIG-276): the approvals and tasks waiting for the reader, page 'task-inbox'. My requests is
        // the same screen on its own tab, where a requester follows what they started.
        path: 'review/approvals',
        title: 'Approvals',
        loadComponent: () => import('./features/workflows/task-inbox').then(m => m.TaskInbox),
        data: { pageKey: 'task-inbox' },
        canActivate: [pageGuard],
      },
      {
        path: 'review/requests',
        title: 'My requests',
        loadComponent: () => import('./features/workflows/task-inbox').then(m => m.TaskInbox),
        data: { pageKey: 'task-inbox' },
        canActivate: [pageGuard],
      },
      {
        // MIG-325: the runs whose results wait for review; a reviewer's are decided through their task about each run.
        path: 'review/runs',
        title: 'Runs to review',
        loadComponent: () => import('./features/review/runs-to-review').then(m => m.RunsToReview),
        data: { pageKey: 'task-inbox' },
        canActivate: [pageGuard],
      },
      {
        // MIG-272: the review queue, and one document under review beside its page image.
        path: 'review/documents',
        title: 'Document review',
        loadComponent: () => import('./features/documents/review-queue').then(m => m.ReviewQueue),
        data: { pageKey: 'document-review' },
        canActivate: [pageGuard],
      },
      {
        path: 'review/documents/:extractionId',
        title: 'Review a document',
        loadComponent: () => import('./features/documents/review').then(m => m.DocumentReview),
        data: { pageKey: 'document-review' },
        canActivate: [pageGuard],
      },
      {
        // The workflows' steps, page 'workflow-designer': an administrator edits and publishes, everyone else reads.
        path: 'workflows/designer',
        title: 'Approval workflows',
        loadComponent: () => import('./features/workflows/workflow-designer').then(m => m.WorkflowDesigner),
        data: { pageKey: 'workflow-designer' },
        canActivate: [pageGuard],
      },
      // ---------------------------------------------------------------------------------------------
      // AI (was Assistants)
      // ---------------------------------------------------------------------------------------------
      // Prompts replaced AI Agents on 2026-09-18: reading is TENANT_USER (a person must see
      // what the step on their pipeline says; the file chat lists prompts), writing and Try it are
      // gated inside the pages on auth.canManageAgents.
      {
        path: 'pipelines/prompts',
        title: 'Prompts',
        loadComponent: () => import('./features/ai/prompts/prompts').then(m => m.Prompts),
        data: { pageKey: 'ai-prompts' },
        canActivate: [pageGuard],
      },
      {
        path: 'pipelines/prompts/new',
        title: 'New prompt',
        loadComponent: () => import('./features/ai/prompts/prompt-edit').then(m => m.PromptEdit),
        data: { pageKey: 'ai-prompts', minRole: 'TENANT_ADMIN' },
        canActivate: [pageGuard, roleGuard],
      },
      {
        path: 'pipelines/prompts/:promptId/edit',
        title: 'Prompt',
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
        // Its pages (the assistant, and All conversations) are in its own lazy route table.
        loadChildren: () => import('./features/ai/assistant/assistant.routes').then(m => m.routes),
        data: { pageKey: 'ai-prompts' },
        canActivate: [pageGuard],
      },
      {
        path: 'settings/tools',
        title: 'Tool Registry',
        loadComponent: () => import('./features/ai/tools/tool-registry').then(m => m.ToolRegistry),
        data: { pageKey: 'ai-prompts' },
        canActivate: [pageGuard],
      },
      {
        // MIG-355: the workspace's alert rules and alerts; every call behind it (reliability.json/alerts) is TENANT_ADMIN.
        path: 'settings/alerts',
        title: 'Alerts',
        loadComponent: () => import('./features/settings/alerts/alerts').then(m => m.Alerts),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'settings/model-connections',
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
        path: 'settings/task-registry',
        title: 'Task Registry',
        loadComponent: () =>
          import('./features/settings/task-registry/task-registry').then(m => m.TaskRegistry),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'settings/kafka',
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
        path: 'settings/values',
        title: 'Configuration values',
        loadComponent: () =>
          import('./features/settings/configuration/config-values').then(m => m.ConfigValues),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        // Platform-wide: the fetch limit and the crons' watermarks are the engine's, not a
        // workspace's, and every call behind this screen is PLATFORM_ADMIN on the server.
        path: 'platform/engine',
        title: 'Engine settings',
        loadComponent: () =>
          import('./features/settings/configuration/engine-settings').then(m => m.EngineSettings),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'settings/home-pages',
        title: 'Home pages',
        loadComponent: () =>
          import('./features/settings/configuration/task-references').then(m => m.TaskReferences),
        data: { minRole: 'TENANT_ADMIN', kind: 'HOME_PAGE' },
        canActivate: [roleGuard],
      },
      {
        path: 'settings/task-groups',
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
        path: 'platform/billing-analytics',
        title: 'Billing analytics',
        loadComponent: () => import('./features/billing/billing-analytics').then(m => m.BillingAnalyticsPage),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'platform/rate-cards',
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
        title: 'Page access',
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
        // MIG-353: Administration › Security -- the workspace's sign-in rules (password, lockout, idle sign-out, two-factor),
        // single sign-on and the sign-in history. Role-gated like Users: every call behind it is TENANT_ADMIN, and a platform
        // administrator also sets the platform's defaults here.
        path: 'administration/security',
        title: 'Sign-in security',
        loadComponent: () => import('./features/admin/security/workspace-security').then(m => m.WorkspaceSecurity),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        // Owner 2026-10-13: the workspace's default app theme, for people who have not chosen their own. Role-gated like
        // Sign-in security: both calls behind it (tenant.json/appearance) are TENANT_ADMIN.
        path: 'administration/appearance',
        title: 'Appearance',
        loadComponent: () => import('./features/admin/appearance/workspace-appearance').then(m => m.WorkspaceAppearance),
        data: { minRole: 'TENANT_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'platform/workspaces',
        title: 'Workspaces',
        loadComponent: () => import('./features/admin/tenants/tenants').then(m => m.Tenants),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'platform/requests',
        title: 'Workspace requests',
        loadComponent: () =>
          import('./features/tenant-request/tenant-requests').then(m => m.TenantRequests),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      // MIG-254: the managed service. Role-gated, no page keys: every call behind the first three is PLATFORM_ADMIN
      // (identity-service ManagedServiceRestApi), and the fourth is a workspace administrator's read of the same audit.
      {
        path: 'platform/managed-service',
        title: 'Managed service',
        loadComponent: () =>
          import('./features/admin/managed-service/managed-service').then(m => m.ManagedService),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        path: 'platform/staff-activity',
        title: 'Staff activity',
        loadComponent: () =>
          import('./features/admin/managed-service/staff-activity').then(m => m.StaffActivity),
        data: { minRole: 'PLATFORM_ADMIN', scope: 'platform' },
        canActivate: [roleGuard],
      },
      {
        path: 'platform/work-in-workspace',
        title: 'Work in a workspace',
        loadComponent: () =>
          import('./features/admin/managed-service/work-in-workspace').then(m => m.WorkInWorkspace),
        data: { minRole: 'PLATFORM_ADMIN' },
        canActivate: [roleGuard],
      },
      {
        // MIG-196: the 99.99% objectives for pipeline execution and billing, their error budgets and burn rates.
        // Platform-wide: every call behind it is PLATFORM_ADMIN (process /reliability.json, billing /billing.json/reliability).
        path: 'platform/reliability',
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
        // MIG-353: My account › Security -- the person's own password, two-factor login, sessions and sign-in history.
        path: 'account/security',
        title: 'My security',
        loadComponent: () => import('./features/account/account-security').then(m => m.AccountSecurity),
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
      // Tab hubs (owner 2026-10-12): a hub's own address -- its menu entry's link -- opens the first of its tabs the
      // reader may open (core/nav/nav-access.ts), and the console's 403 page when there is none. The tabs are the
      // routes above, each with its own guard: the redirect only picks one, it never opens one.
      // ---------------------------------------------------------------------------------------------
      ...['connections', 'documents', 'forms', 'pipelines', 'runs', 'review', 'data', 'tools', 'administration', 'billing',
        'settings', 'developers', 'platform'].map(path => ({ path, pathMatch: 'full' as const, redirectTo: toFirstTab })),
      // ---------------------------------------------------------------------------------------------
      // Old addresses. Every one a full match: a prefix redirect also catches every longer address
      // under it and rewrites only its own part (administration/billing sent .../invoices to
      // billing/usage/invoices -- Page not found). Each points straight at today's page, no chains.
      // ---------------------------------------------------------------------------------------------
      // Tab hubs (2026-10-12): each page moved under its hub's address. Old links land on the tab, whose own guard
      // decides -- a reader without the page gets the 403 page there, never more than the page would have shown.
      // UX review DR2 (2026-10-13): the Review hub. The services' stored links (a task's bell, a document's) keep working.
      ...moved([
        ['workflows/inbox', 'review/approvals'],
        ['workflows/requests', 'review/requests'],
        ['documents/review', 'review/documents'],
        ['documents/review/:extractionId', 'review/documents/:extractionId'],
      ]),
      ...moved([
        ['integration/connectors', 'connections/connectors'],
        ['integration/connectors/storage', 'connections/storage'],
        ['integration/api-collections', 'connections/api-collections'],
        ['integration/api-collections/:collectionId', 'connections/api-collections/:collectionId'],
        ['integration/sources', 'connections/sources'],
        ['integration/api-clients', 'developers/api-clients'],
        ['integration/developer', 'developers/portal'],
        ['integration/developer/reference', 'developers/portal/reference'],
        ['integration/developer/changelog', 'developers/portal/changelog'],
        ['integration/developer/guides/:slug', 'developers/portal/guides/:slug'],
        ['documents/intelligence', 'documents/in'],
        ['documents/inbox', 'documents/file-drop'],
        ['documents/reports', 'data/reports'],
        ['documents/files', 'data/files'],
        ['documents/converter', 'tools/converter'],
        ['documents/transcript', 'tools/transcript'],
        ['pipelines/executions', 'runs/latest'],
        ['pipelines/queue', 'runs/by-date'],
        ['pipelines/run-analytics', 'runs/analytics'],
        ['ai/prompts', 'pipelines/prompts'],
        ['ai/prompts/new', 'pipelines/prompts/new'],
        ['ai/prompts/:promptId/edit', 'pipelines/prompts/:promptId/edit'],
        ['ai/tools', 'settings/tools'],
        ['ai/connections', 'settings/model-connections'],
        ['configuration/task-registry', 'settings/task-registry'],
        ['configuration/kafka', 'settings/kafka'],
        ['configuration/values', 'settings/values'],
        ['configuration/home-pages', 'settings/home-pages'],
        ['configuration/task-groups', 'settings/task-groups'],
        ['configuration/engine', 'platform/engine'],
        ['billing/analytics', 'platform/billing-analytics'],
        ['billing/rates', 'platform/rate-cards'],
        ['administration/tenants', 'platform/workspaces'],
        ['administration/tenant-requests', 'platform/requests'],
        ['administration/managed-service', 'platform/managed-service'],
        ['administration/staff-activity', 'platform/staff-activity'],
        ['administration/work-in-workspace', 'platform/work-in-workspace'],
        ['administration/reliability', 'platform/reliability'],
      ]),
      // The addresses of MIG-246's renames and regrouping (2026-09-28).
      ...moved([
        ['operations/jobs', 'pipelines/schedules'],
        ['operations/jobs/new', 'pipelines/schedules/new'],
        ['operations/jobs/bulk', 'pipelines/schedules/bulk'],
        ['operations/jobs/history', 'runs/latest'],
        ['operations/jobs/:jobId/edit', 'pipelines/schedules/:jobId/edit'],
        ['operations/jobs/:jobId/assistant', 'pipelines/schedules/:jobId/assistant'],
        ['operations/jobs/:jobId/history', 'pipelines/schedules/:jobId/executions'],
        ['operations/jobs/:jobId/runs/:jobQueueId/logs', 'pipelines/schedules/:jobId/runs/:jobQueueId/logs'],
        ['operations/queue', 'runs/by-date'],
        ['operations/tasks', 'pipelines/list'],
        ['operations/tasks/new', 'pipelines/new'],
        ['operations/tasks/bulk', 'pipelines/bulk'],
        ['operations/tasks/:taskDetailId/edit', 'pipelines/:taskDetailId/edit'],
        ['operations/reports', 'runs/analytics'],
        ['configuration/pipelines', 'settings/task-registry'],
        ['configuration/storage-connections', 'connections/storage'],
        ['integration/storage-connections', 'connections/storage'],
        ['objects/files', 'data/files'],
        ['objects/analytics', 'data/analytics'],
        ['objects/analytics/dashboards', 'data/analytics/dashboards'],
        ['assistants/prompts', 'pipelines/prompts'],
        ['assistants/prompts/new', 'pipelines/prompts/new'],
        ['assistants/prompts/:promptId/edit', 'pipelines/prompts/:promptId/edit'],
        ['assistants/connections', 'settings/model-connections'],
      ]),
      // 2026-09-18: the flat addresses from before <section>/<page>, and the screens retired or
      // renamed since (params carry over).
      ...moved([
        ['jobs', 'pipelines/schedules'],
        ['jobs/new', 'pipelines/schedules/new'],
        ['jobs/bulk', 'pipelines/schedules/bulk'],
        ['jobs/history', 'runs/latest'],
        ['jobs/:jobId/edit', 'pipelines/schedules/:jobId/edit'],
        ['jobs/:jobId/assistant', 'pipelines/schedules/:jobId/assistant'],
        ['jobs/:jobId/history', 'pipelines/schedules/:jobId/executions'],
        ['jobs/:jobId/runs/:jobQueueId/logs', 'pipelines/schedules/:jobId/runs/:jobQueueId/logs'],
        ['queue', 'runs/by-date'],
        ['tasks', 'pipelines/list'],
        ['tasks/new', 'pipelines/new'],
        ['tasks/bulk', 'pipelines/bulk'],
        ['tasks/:taskDetailId/edit', 'pipelines/:taskDetailId/edit'],
        ['reports', 'runs/analytics'],
        ['objects', 'data/files'],
        ['analytics', 'data/analytics'],
        ['analytics/dashboards', 'data/analytics/dashboards'],
        ['admin/storage', 'connections/storage'],
        ['settings/storage-connections', 'connections/storage'],
        // Prompts replaced AI Agents on 2026-09-18; the Ollama Models page folded into a
        // connection's "Test connection", which lists them.
        ['ai/agents', 'pipelines/prompts'],
        ['ai/models', 'settings/model-connections'],
        ['admin/users', 'administration/users'],
        ['admin/access-profiles', 'administration/access-profiles'],
        ['admin/tenants', 'platform/workspaces'],
        ['admin/tenant-requests', 'platform/requests'],
        // Renamed from settings/forms once the feature became the pipeline catalogue rather than a
        // general form builder, then Configuration › Pipelines, now the Task Registry.
        ['settings/pipelines', 'settings/task-registry'],
        ['settings/forms', 'settings/task-registry'],
        ['settings/pipeline-forms', 'settings/task-registry'],
        // Topics (source task types) are managed on the Kafka screen since 2026-09-18; a
        // ?profileId= link keeps its meaning.
        ['settings/task-types', 'settings/kafka'],
        ['settings/lookup', 'settings/values'],
        ['configuration/lookup', 'settings/values'],
        // Billing is a section of its own since it left Administration.
        ['administration/billing', 'billing/usage'],
        ['administration/billing/invoices', 'billing/invoices'],
        ['administration/billing/invoices/:number', 'billing/invoices/:number'],
        ['administration/billing/documents', 'billing/documents'],
        ['administration/billing/analytics', 'platform/billing-analytics'],
        ['administration/billing/rates', 'platform/rate-cards'],
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
