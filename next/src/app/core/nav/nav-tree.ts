import { PageKey } from '../auth/page-keys';

export interface NavChild {
  label: string;
  path: string;
  /** Query parameters the entry opens with (Document types is a tab of Documents in). */
  query?: Record<string, string>;
  icon: string;
  /** One line saying what the screen is for, shown beside the label in the menu. */
  hint?: string;
  /** A sub-heading inside the group ("Tools", "Workspace", "Billing", "Settings", "Developers"). */
  section?: string;
  adminOnly?: boolean;
  platformOnly?: boolean;
  /** The access-profile page this entry is; absent for pages a profile cannot take away. */
  pageKey?: PageKey;
  /** A page that is not built yet: the entry opens its "coming soon" page. */
  soon?: boolean;
  /**
   * Whether routerLinkActive must match the whole URL for this entry.
   *
   * Derived in `visibleNav()`, never written by hand: an entry needs it exactly when some OTHER entry
   * sits underneath it, because the default prefix match would then light both.
   */
  exact?: boolean;
  /**
   * MIG-254: a workspace administrator's view of what our team did there -- offered when the workspace is
   * MANAGED, or once it is known our team has acted in it (a workspace that went back to SELF keeps its history).
   */
  teamOnly?: boolean;
  /** MIG-276: the entry shows the reader's open task count beside its label. */
  badge?: 'tasks';
  /** Never on the menu: a page that belongs to this group for the breadcrumb only. */
  crumbOnly?: boolean;
}

export interface NavItem {
  label: string;
  path?: string;
  icon?: string;
  children?: NavChild[];
}

/**
 * UX review 2026-10-12 (A10, N1, N2, G12): the menu grouped by the job someone is doing, in the order of the main
 * flow -- get data in, build, run and review, see the results -- then the workspace's administration and billing,
 * then the platform's own pages. One word per thing: Home (was Dashboard), Connections (was Connector Hub), File drop
 * (was Documents › Inbox), Review inbox (was Task inbox), Dashboards (was Saved Analyses), Generated reports (was
 * Documents › Reports), Page access (was Access profiles), Sign-in security (was Administration › Security),
 * Workspaces (was Tenants).
 *
 * The renames are labels only: every entry keeps its address, its access-profile page key and its least role, so a
 * profile that granted "Task inbox" grants "Review inbox" -- the same screen, under its new name -- and an entry a
 * person cannot open stays hidden. The breadcrumbs read the same tree (page-header.ts).
 *
 * Not merged yet (separate tasks): Runs and Runs by date are still Executions and Queue (E1), and Storage connections
 * is still its own page rather than a tab of Connections (I1).
 */
export const NAV: NavItem[] = [
  { label: 'Home', path: '/dashboard', icon: 'chart' },
  {
    label: 'Get data in',
    icon: 'download',
    children: [
      { label: 'Connections', path: '/integration/connectors', pageKey: 'connector-hub', icon: 'plug',
        hint: 'Databases, SaaS apps and files, ready to connect' },
      { label: 'Storage connections', path: '/integration/storage-connections', icon: 'cloud', adminOnly: true,
        hint: 'S3, Azure, MinIO and FTP that pipelines read and write' },
      { label: 'API Collections', path: '/integration/api-collections', pageKey: 'api-collections', icon: 'code',
        hint: 'Which APIs exist, tested and versioned' },
      { label: 'Sources', path: '/integration/sources', pageKey: 'sources', icon: 'database',
        hint: 'APIs, files and databases a pipeline reads' },
      { label: 'Documents in', path: '/documents/intelligence', pageKey: 'document-intelligence', icon: 'search',
        hint: 'Upload documents and read them into structured data' },
      { label: 'File drop', path: '/documents/inbox', pageKey: 'objects', icon: 'upload',
        hint: 'Drop files that start schedules' },
      { label: 'Forms', path: '/forms/builder', pageKey: 'forms', icon: 'edit',
        hint: 'Fill in your workspace\'s forms; administrators build them' },
      { label: 'Form submissions', path: '/forms/submissions', pageKey: 'form-submissions', icon: 'table',
        hint: 'Everything collected, and the runs it started' },
    ],
  },
  {
    label: 'Build',
    icon: 'layers',
    children: [
      // Deliberately not adminOnly: listSourceTask is TENANT_USER, and a schedule points at a pipeline, so reading the
      // list is part of reading the console. Only writing one is TENANT_ADMIN, gated inside the page.
      { label: 'Pipelines', path: '/pipelines', pageKey: 'tasks', icon: 'list',
        hint: 'What a run does, step by step, and where' },
      // MIG-252: the assistant and its tools ride the Prompts key; every call they make is TENANT_USER.
      { label: 'AI Assistant', path: '/ai/assistant', pageKey: 'ai-prompts', icon: 'chat',
        hint: 'Describe a pipeline in plain language and run it' },
      { label: 'Prompts', path: '/ai/prompts', pageKey: 'ai-prompts', icon: 'sparkle',
        hint: 'What an AI step says to a model' },
      { label: 'Document types', path: '/documents/intelligence', query: { tab: 'types' },
        pageKey: 'document-intelligence', icon: 'file', hint: 'The fields read from each kind of document' },
      { label: 'Approval workflows', path: '/workflows/designer', pageKey: 'workflow-designer', icon: 'checkCircle',
        hint: 'Who approves what, and what runs after' },
    ],
  },
  {
    label: 'Run & review',
    icon: 'play',
    children: [
      // Every schedule's newest runs, and the runs waiting for a review (MIG-325).
      { label: 'Runs', path: '/pipelines/executions', pageKey: 'jobs', icon: 'history',
        hint: 'Recent runs, and what waits for review' },
      { label: 'Runs by date', path: '/pipelines/queue', pageKey: 'queue', icon: 'clock',
        hint: 'Every run in a date range, in flight or done' },
      { label: 'Schedules & triggers', path: '/pipelines/schedules', pageKey: 'jobs', icon: 'calendar',
        hint: 'When each pipeline runs, and what starts it' },
      { label: 'Review inbox', path: '/workflows/inbox', pageKey: 'task-inbox', icon: 'inbox', badge: 'tasks',
        hint: 'Approvals and reviews waiting for you or your groups' },
      { label: 'My requests', path: '/workflows/requests', pageKey: 'task-inbox', icon: 'inbox', crumbOnly: true },
      { label: 'Document review', path: '/documents/review', pageKey: 'document-review', icon: 'checkCircle',
        hint: 'Check the fields a document was least sure of' },
      { label: 'Run analytics', path: '/pipelines/run-analytics', pageKey: 'reports', icon: 'chart',
        hint: 'Group and measure your runs' },
    ],
  },
  {
    label: 'See results',
    icon: 'chart',
    children: [
      { label: 'Dashboards', path: '/data/analytics/dashboards', pageKey: 'analytics-dashboards', icon: 'template',
        hint: 'Boards of tiles over your pipelines\' results' },
      { label: 'Ask your data', path: '/data/ask', pageKey: 'ask-data', icon: 'chat',
        hint: 'Questions in plain language, with sources' },
      { label: 'Analytics Studio', path: '/data/analytics', pageKey: 'analytics', icon: 'chart',
        hint: 'Read a file as data, where it lives' },
      { label: 'Data Catalog', path: '/data/catalog', pageKey: 'data-catalog', icon: 'database',
        hint: 'Every dataset, owner, schema and sensitive field' },
      { label: 'Generated reports', path: '/documents/reports', pageKey: 'tools-converter', icon: 'layers',
        hint: 'Documents made from your data' },
      { label: 'Browse files', path: '/documents/files', pageKey: 'objects', icon: 'folder',
        hint: 'Upload, preview and share stored files' },
      { label: 'Document Converter', path: '/documents/converter', pageKey: 'tools-converter', icon: 'file',
        section: 'Tools', hint: 'Convert between formats' },
      { label: 'Audio Transcript', path: '/documents/transcript', pageKey: 'tools-transcript', icon: 'volume',
        section: 'Tools', hint: 'Speech to text' },
    ],
  },
  {
    label: 'Administration & billing',
    icon: 'shield',
    children: [
      { label: 'Users', path: '/administration/users', icon: 'users', adminOnly: true, section: 'Workspace',
        hint: 'Who can sign in, and as what' },
      { label: 'Page access', path: '/administration/access-profiles', icon: 'shield', adminOnly: true,
        section: 'Workspace', hint: 'Which pages your workspace members can open' },
      // MIG-353: password rules, lockout, idle sign-out, two-factor, single sign-on and the sign-in history.
      { label: 'Sign-in security', path: '/administration/security', icon: 'key', adminOnly: true,
        section: 'Workspace', hint: 'Sign-in rules, single sign-on and sign-in history' },
      { label: 'Data policies', path: '/administration/data-policies', icon: 'lock', adminOnly: true,
        section: 'Workspace', hint: 'Which models see each level of data, and for how long' },
      { label: 'Our team\'s activity', path: '/administration/team-activity', icon: 'history', adminOnly: true,
        teamOnly: true, section: 'Workspace', hint: 'Every change our team made in this workspace' },
      { label: 'Cost & usage', path: '/billing/usage', icon: 'chart', adminOnly: true, section: 'Billing',
        hint: 'What the workspace used this month and what it costs' },
      { label: 'Invoices', path: '/billing/invoices', icon: 'file', adminOnly: true, section: 'Billing',
        hint: 'Every month closed into a bill' },
      { label: 'Billing documents', path: '/billing/documents', icon: 'folder', adminOnly: true, section: 'Billing',
        hint: 'Invoices, receipts, credit notes and statements' },
      { label: 'Model connections', path: '/ai/connections', icon: 'server', adminOnly: true, section: 'Settings',
        hint: 'AI providers, keys and caps' },
      // Open to a member holding the Prompts page, as before: the list is TENANT_USER.
      { label: 'Tool Registry', path: '/ai/tools', pageKey: 'ai-prompts', icon: 'plug', section: 'Settings',
        hint: 'What the assistant is allowed to call' },
      // Task Registry: every task a step can run, and the existing pipelines as Legacy tasks (MIG-250).
      { label: 'Task Registry', path: '/configuration/task-registry', icon: 'template', adminOnly: true,
        section: 'Settings', hint: 'Every task a step can run' },
      { label: 'Kafka & Topics', path: '/configuration/kafka', icon: 'server', adminOnly: true, section: 'Settings',
        hint: 'Brokers, credentials and topics' },
      { label: 'Configuration values', path: '/configuration/values', icon: 'key', adminOnly: true,
        section: 'Settings', hint: 'Values and secrets a task reads' },
      { label: 'Home pages', path: '/configuration/home-pages', icon: 'globe', adminOnly: true, section: 'Settings',
        hint: 'The addresses a task can name as its home page' },
      { label: 'Task groups', path: '/configuration/task-groups', icon: 'layers', adminOnly: true,
        section: 'Settings', hint: 'Labels that group tasks together' },
      // MIG-332: how the organisation's own systems reach the API (/v1), and the event types they send.
      { label: 'API Clients', path: '/integration/api-clients', icon: 'key', adminOnly: true, section: 'Developers',
        hint: 'Your systems on the API, and their events' },
      // MIG-336: administrators, and a member whose profile names the page (never by default).
      { label: 'Developer portal', path: '/integration/developer', pageKey: 'developer-portal', icon: 'terminal',
        section: 'Developers', hint: 'API reference, guides and sandbox keys' },
    ],
  },
  {
    label: 'Platform',
    icon: 'globe',
    children: [
      { label: 'Workspaces', path: '/administration/tenants', icon: 'building', platformOnly: true,
        hint: 'Every customer workspace' },
      // listRequests, approve and reject all carry hasRole('PLATFORM_ADMIN').
      { label: 'Workspace requests', path: '/administration/tenant-requests', icon: 'inbox', platformOnly: true,
        hint: 'Asks from outside for a workspace' },
      { label: 'Managed service', path: '/administration/managed-service', icon: 'briefcase', platformOnly: true,
        hint: 'Which of our staff may work in which workspace' },
      { label: 'Work in a workspace', path: '/administration/work-in-workspace', icon: 'external', platformOnly: true,
        hint: 'Open a managed session where you hold a grant' },
      { label: 'Staff activity', path: '/administration/staff-activity', icon: 'history', platformOnly: true,
        hint: 'Every change our staff made in a customer\'s workspace' },
      { label: 'Reliability', path: '/administration/reliability', icon: 'chart', platformOnly: true,
        hint: 'Pipeline execution and billing against their targets' },
      { label: 'Billing analytics', path: '/billing/analytics', icon: 'chart', platformOnly: true,
        hint: 'Invoiced, collected, overdue and churn across workspaces' },
      { label: 'Rate cards', path: '/billing/rates', icon: 'layers', platformOnly: true,
        hint: 'The calculation behind every bill, versioned' },
      { label: 'Engine settings', path: '/configuration/engine', icon: 'settings', platformOnly: true,
        hint: 'The scheduler fetch limit and the crons\' watermarks' },
    ],
  },
];

/** The account menu's pages, for their breadcrumbs ("Account › My security"). */
export const ACCOUNT_CRUMBS: { label: string; path: string }[] = [
  { label: 'Your profile', path: '/profile' },
  { label: 'My security', path: '/account/security' },
  { label: 'Notifications', path: '/notifications' },
];

export interface Crumb { label: string; link?: string; query?: Record<string, string> }

const pathOf = (url: string) => url.split(/[?#]/)[0].replace(/\/+$/, '') || '/';

/**
 * Where an address sits in the menu: its group and the entry whose address is the longest prefix of it. An entry
 * with query parameters (Document types) is chosen only when the address carries them.
 */
export function placeOf(url: string): { group?: NavItem; entry?: NavChild | NavItem } {
  const path = pathOf(url);
  const query = new URLSearchParams(url.split('?')[1]?.split('#')[0] ?? '');
  let best: { group?: NavItem; entry?: NavChild | NavItem; length: number; exactQuery: boolean } = { length: -1, exactQuery: false };
  for (const group of NAV) {
    if (group.path && (path === group.path || path.startsWith(group.path + '/')) && group.path.length > best.length) {
      best = { group: undefined, entry: group, length: group.path.length, exactQuery: false };
    }
    for (const child of group.children ?? []) {
      if (!(path === child.path || path.startsWith(child.path + '/'))) continue;
      const queryMatch = !child.query || Object.entries(child.query).every(([k, v]) => query.get(k) === v);
      if (!queryMatch) continue;
      const better = child.path.length > best.length || (child.path.length === best.length && !!child.query && !best.exactQuery);
      if (better) best = { group, entry: child, length: child.path.length, exactQuery: !!child.query };
    }
  }
  return { group: best.group, entry: best.entry };
}

/**
 * The breadcrumb trail for an address: group › entry, then the page's own title on a page beneath the entry (a detail
 * or an editor). On the entry's own address the entry's menu name is the last step, so a list page's breadcrumb reads
 * as the menu does; `detail` adds the title there too (a dashboard's board, opened on the list's own address). "Home"
 * leads when the address is in no group.
 */
export function crumbsFor(url: string, title: string, detail = false): Crumb[] {
  const path = pathOf(url);
  const account = ACCOUNT_CRUMBS.find(a => a.path === path);
  if (account) return [{ label: 'Account' }, { label: account.label }];
  const { group, entry } = placeOf(url);
  if (!entry) return [{ label: 'Home', link: '/dashboard' }, ...(title ? [{ label: title }] : [])];
  const crumbs: Crumb[] = group ? [{ label: group.label }] : [];
  const query = 'query' in entry ? entry.query : undefined;
  const atEntry = path === entry.path && !detail;
  if (atEntry || !title) return [...crumbs, { label: entry.label }];
  return [...crumbs, { label: entry.label, link: entry.path, query }, { label: title }];
}
