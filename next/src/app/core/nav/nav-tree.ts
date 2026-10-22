import { PageKey, TabKey } from '../auth/page-keys';

/**
 * Who may see a menu entry or a hub's tab. Every rule must hold: a role floor (`adminOnly`, `platformOnly`), the
 * access-profile page it is (`pageKey`, or any of `pageKeys`), and our team's activity (`teamOnly`).
 *
 * These are the MENU's rules. The route behind an entry or a tab has its own guard (pageGuard / roleGuard in
 * app.routes.ts), at least as strict -- app.routes.spec.ts holds every tab to that -- and the server refuses the data
 * behind it on its own. Hiding is a courtesy; grouping pages into hubs never grants one.
 */
export interface NavGate {
  adminOnly?: boolean;
  platformOnly?: boolean;
  /** The access-profile page this entry is; absent for pages a profile cannot take away. */
  pageKey?: PageKey;
  /** Shown to whoever holds ANY of these pages (Runs' Latest view lists the runs of either). */
  pageKeys?: PageKey[];
  /** F3 (MIG-400): the tab of `pageKey` this entry is, when the page's tabs can be granted apart (AuthService.canOpenTab). */
  tabKey?: TabKey;
  /** F3: an administrator's tab a member with an access delegation opens too (Page access, for the people they reach). */
  delegateOk?: boolean;
  /**
   * MIG-254: a workspace administrator's view of what our team did there -- offered when the workspace is
   * MANAGED, or once it is known our team has acted in it (a workspace that went back to SELF keeps its history).
   */
  teamOnly?: boolean;
}

/**
 * One tab of a hub: a page with its own address, its own page key and its own guard, lazy-loaded like any other route.
 * The hub shows the tabs the reader may open; one tab alone is shown as that page, with no tab strip.
 */
export interface NavTab extends NavGate {
  label: string;
  path: string;
  icon: string;
  /** Other addresses that are this tab (an OAuth callback that lands on Connectors). */
  alsoAt?: string[];
}

export interface NavChild extends NavGate {
  label: string;
  /** The entry's address; for a hub, the address that opens its first tab the reader may open. */
  path: string;
  /** Query parameters the entry opens with. */
  query?: Record<string, string>;
  icon: string;
  /** One line saying what the screen is for, shown beside the label in the menu. */
  hint?: string;
  /** A sub-heading inside the group. */
  section?: string;
  /** Other addresses that are this entry's views: it is the active entry and the breadcrumb's step there too. */
  alsoAt?: string[];
  /** A page that is not built yet: the entry opens its "coming soon" page. */
  soon?: boolean;
  /**
   * Whether routerLinkActive must match the whole URL for this entry.
   *
   * Derived in `visibleNav()`, never written by hand: an entry needs it exactly when some OTHER entry
   * sits underneath it, because the default prefix match would then light both.
   */
  exact?: boolean;
  /** UX review DR2: the entry shows how much waits for the reader's review beside its label (TaskCountService.waiting). */
  badge?: 'review';
  /** Never on the menu: a page that belongs to this group for the breadcrumb only. */
  crumbOnly?: boolean;
  /** A hub: one menu entry, its pages as tabs (shared/ui/tab-hub.ts). */
  tabs?: NavTab[];
}

export interface NavItem {
  label: string;
  path?: string;
  icon?: string;
  children?: NavChild[];
  /** A top-level hub (Platform): one entry, its pages as tabs. */
  tabs?: NavTab[];
}

/** A hub: a menu entry, or a top-level item, whose pages are tabs. */
export type NavHub = (NavChild | NavItem) & { path: string; tabs: NavTab[] };

/**
 * UX review 2026-10-12 (A10, N1, N2, G12): the menu grouped by the job someone is doing, in the order of the main
 * flow -- get data in, build, run and review, see the results -- then the workspace's administration and billing,
 * then the platform's own pages. One word per thing.
 *
 * Tab hubs (owner 2026-10-12, "group a lot of stuff so we can make a nice, understandable flow, but also think about
 * security and roles for tabs"): related pages are one menu entry with tabs -- Connections, Documents, Forms, Pipelines,
 * Runs, Review, Analysis, Tools, Administration, Billing, Settings, Developers and Platform. Each tab is still its own page:
 * its own address, its own access-profile key and least role, its own lazy chunk. The hub shows the tabs the reader
 * may open, the page itself when that is one, and is off the menu when it is none. What a role uses every day stays an
 * entry of its own where a tab would add a click: Home, the AI Assistant, Approval workflows and Dashboards; Review opens
 * on All waiting, the reviewer's list, in one click.
 *
 * This one tree is the menu, the hubs, their tabs and the breadcrumbs (page-header.ts): "Get data in › Connections ›
 * Storage".
 */
export const NAV: NavItem[] = [
  { label: 'Home', path: '/dashboard', icon: 'chart' },
  {
    label: 'Get data in',
    icon: 'download',
    children: [
      {
        label: 'Connections', path: '/connections', icon: 'plug',
        hint: 'Connectors, storage, databases, APIs and the sources pipelines read',
        tabs: [
          // UX review B7 (I1): Connections and Storage were one page with two tabs; the hub carries both, and more.
          { label: 'Connectors', path: '/connections/connectors', pageKey: 'connector-hub', icon: 'plug',
            alsoAt: ['/integration/connectors/oauth/callback'] },
          // Role-gated, not page-keyed: every call behind it is TENANT_ADMIN.
          { label: 'Storage', path: '/connections/storage', adminOnly: true, icon: 'cloud' },
          { label: 'Databases', path: '/connections/databases', pageKey: 'sources', tabKey: 'sources:databases', icon: 'database' },
          { label: 'API collections', path: '/connections/api-collections', pageKey: 'api-collections', icon: 'code' },
          { label: 'Sources', path: '/connections/sources', pageKey: 'sources', tabKey: 'sources:sources', icon: 'download' },
          { label: 'Data contracts', path: '/connections/contracts', pageKey: 'sources', tabKey: 'sources:contracts', icon: 'shield' },
        ],
      },
      {
        label: 'Documents', path: '/documents', icon: 'file',
        hint: 'Documents read into fields, their types, the approved data, and every way files come in',
        tabs: [
          { label: 'Documents in', path: '/documents/in', pageKey: 'document-intelligence', tabKey: 'document-intelligence:in', icon: 'search' },
          { label: 'Document types', path: '/documents/types', pageKey: 'document-intelligence', tabKey: 'document-intelligence:types', icon: 'file' },
          { label: 'Approved data', path: '/documents/approved-data', pageKey: 'document-intelligence', tabKey: 'document-intelligence:approved-data', icon: 'table' },
          // Owner 2026-10-20 (§0.1): Upload, Email-in and File drop as one tab; each section keeps its own page and guard
          // (features/documents/intake/intake-sections.ts), so the tab shows to whoever holds either page.
          { label: 'Intake', path: '/documents/intake', pageKeys: ['document-intelligence', 'objects'], icon: 'upload',
            alsoAt: ['/documents/intake/upload', '/documents/intake/email-in', '/documents/intake/file-drop'] },
        ],
      },
      {
        label: 'Forms', path: '/forms', icon: 'edit',
        hint: 'Your workspace\'s forms, and everything they collected',
        tabs: [
          { label: 'Forms', path: '/forms/builder', pageKey: 'forms', icon: 'edit' },
          { label: 'Submissions', path: '/forms/submissions', pageKey: 'form-submissions', icon: 'table' },
        ],
      },
    ],
  },
  {
    label: 'Build',
    icon: 'layers',
    children: [
      {
        label: 'Pipelines', path: '/pipelines', icon: 'list',
        hint: 'What a run does, when it runs, and what its AI steps say',
        tabs: [
          // Deliberately not adminOnly: listSourceTask is TENANT_USER, and a schedule points at a pipeline, so reading
          // the list is part of reading the console. Only writing one is TENANT_ADMIN, gated inside the page.
          { label: 'Pipelines', path: '/pipelines/list', pageKey: 'tasks', icon: 'list' },
          { label: 'Schedules & triggers', path: '/pipelines/schedules', pageKey: 'jobs', tabKey: 'jobs:schedules', icon: 'calendar' },
          { label: 'Prompts', path: '/pipelines/prompts', pageKey: 'ai-prompts', tabKey: 'ai-prompts:prompts', icon: 'sparkle' },
        ],
      },
      // MIG-252: the assistant and its tools ride the Prompts key; every call they make is TENANT_USER.
      { label: 'AI Assistant', path: '/ai/assistant', pageKey: 'ai-prompts', tabKey: 'ai-prompts:assistant', icon: 'chat',
        hint: 'Describe a pipeline in plain language and run it' },
      { label: 'Approval workflows', path: '/workflows/designer', pageKey: 'workflow-designer', icon: 'checkCircle',
        hint: 'Who approves what, and what runs after' },
    ],
  },
  {
    label: 'Run & review',
    icon: 'play',
    children: [
      {
        label: 'Runs', path: '/runs', icon: 'history',
        hint: 'Recent runs, runs by date, how they measure up, and the ones that failed',
        tabs: [
          // UX review B3 (E1): Latest lists every schedule's newest runs and what waits for review -- for whoever holds
          // Schedules or Runs by date.
          { label: 'Latest', path: '/runs/latest', pageKeys: ['jobs', 'queue'], icon: 'history' },
          { label: 'By date', path: '/runs/by-date', pageKey: 'queue', tabKey: 'queue:by-date', icon: 'calendar' },
          { label: 'Analytics', path: '/runs/analytics', pageKey: 'reports', icon: 'chart' },
          // MIG-355: every failed or timed-out run, grouped by error pattern, retried from the failed step -- the Queue's reads.
          { label: 'Failed', path: '/runs/failed', pageKey: 'queue', tabKey: 'queue:failed', icon: 'alert' },
          // MIG-347: a schedule run for each period of a past range, with its progress -- Schedules' (who may run the schedule).
          { label: 'Backfills', path: '/runs/backfills', pageKey: 'jobs', tabKey: 'jobs:backfills', icon: 'layers' },
        ],
      },
      {
        // UX review DR2 (owner 2026-10-13): one Review home. What waits for a person lived in three places -- Approval
        // tasks (workflow-service), runs waiting for review (Core) and documents in review (ai-service). All waiting
        // lists the three together with one count (the badge, and Home's "N waiting for your review"); each kind keeps
        // its own tab, page key and guard, so a reviewer sees only what their profile lets them decide. Runs are
        // decided through the reader's own task about them (a reviewer) or Core's run review (an administrator), so
        // their tab is the Task inbox's.
        label: 'Review', path: '/review', icon: 'inbox', badge: 'review',
        hint: 'Approvals, run results and documents waiting for your decision',
        tabs: [
          { label: 'All waiting', path: '/review/all', pageKeys: ['task-inbox', 'document-review'], icon: 'inbox' },
          { label: 'Approvals', path: '/review/approvals', pageKey: 'task-inbox', tabKey: 'task-inbox:approvals', icon: 'checkCircle' },
          { label: 'Runs', path: '/review/runs', pageKey: 'task-inbox', tabKey: 'task-inbox:runs', icon: 'history' },
          { label: 'Documents', path: '/review/documents', pageKey: 'document-review', icon: 'file' },
        ],
      },
      { label: 'My requests', path: '/review/requests', pageKey: 'task-inbox', tabKey: 'task-inbox:requests', icon: 'send', crumbOnly: true },
    ],
  },
  {
    label: 'See results',
    icon: 'chart',
    children: [
      { label: 'Dashboards', path: '/data/analytics/dashboards', pageKey: 'analytics-dashboards', icon: 'template',
        hint: 'Boards of tiles over your pipelines\' results' },
      {
        label: 'Analysis', path: '/data', icon: 'search',
        hint: 'Ask your data, explore it, and find what was made from it',
        tabs: [
          { label: 'Ask your data', path: '/data/ask', pageKey: 'ask-data', icon: 'chat' },
          { label: 'Analytics Studio', path: '/data/analytics', pageKey: 'analytics', icon: 'chart' },
          { label: 'Data Catalog', path: '/data/catalog', pageKey: 'data-catalog', icon: 'database' },
          { label: 'Files', path: '/data/files', pageKey: 'objects', icon: 'folder' },
        ],
      },
      {
        // MIG-403 (Report Studio): templates designed once, filled from pipeline runs and files, every version kept. A hub
        // under See results (owner-approved 2026-10-19): Overview, Templates, Library, Data, and Assets & branding (MIG-406). The old Analysis › Generated reports moved here (its pipeline files: /reports/from-pipelines).
        label: 'Reports', path: '/reports', icon: 'file',
        hint: 'Report templates, the reports made from them, and their data',
        tabs: [
          { label: 'Overview', path: '/reports/overview', pageKey: 'report-studio', icon: 'chart' },
          { label: 'Templates', path: '/reports/templates', pageKeys: ['report-templates', 'report-generate'], icon: 'template' },
          // Owner 2026-10-19: 'Library', not a second 'Reports' -- the trail read See results › Reports › Reports.
          { label: 'Library', path: '/reports/library', pageKey: 'report-library', icon: 'file' },
          { label: 'Data', path: '/reports/data', pageKey: 'report-data', icon: 'database' },
          // MIG-406: logos, images, signatures and stamps, and brand profiles. The trail reads See results › Reports ›
          // Assets & branding, then the asset or brand profile's own name: no word twice.
          { label: 'Assets & branding', path: '/reports/assets', pageKey: 'report-assets', icon: 'image' },
          // Phase 7: who approves reports and publishes templates, and what retention would remove; administrators only.
          { label: 'Settings', path: '/reports/settings', adminOnly: true, icon: 'settings' },
        ],
      },
      {
        label: 'Tools', path: '/tools', icon: 'settings',
        hint: 'Convert documents, and turn speech into text',
        tabs: [
          { label: 'Document Converter', path: '/tools/converter', pageKey: 'tools-converter', icon: 'file' },
          { label: 'Audio Transcript', path: '/tools/transcript', pageKey: 'tools-transcript', icon: 'volume' },
        ],
      },
    ],
  },
  {
    label: 'Administration & billing',
    icon: 'shield',
    children: [
      {
        label: 'Administration', path: '/administration', icon: 'users',
        hint: 'Users, teams, page access, sign-in security, data policies and appearance',
        tabs: [
          { label: 'Users', path: '/administration/users', icon: 'users', adminOnly: true },
          // F4: an administrator makes teams here. The page opens to every member (a team's lead changes its members), who
          // reaches it from Review › Approvals' My teams.
          { label: 'Teams', path: '/administration/teams', icon: 'users', adminOnly: true },
          // F3: an access delegate opens it too, for the people their delegation reaches.
          { label: 'Page access', path: '/administration/access-profiles', icon: 'shield', adminOnly: true, delegateOk: true },
          // MIG-353: password rules, lockout, idle sign-out, two-factor, single sign-on and the sign-in history.
          { label: 'Sign-in security', path: '/administration/security', icon: 'key', adminOnly: true },
          // The route opens to whoever holds Prompts (a member reads the policy from the AI Assistant); the tab is an
          // administrator's, as the menu entry was.
          { label: 'Data policies', path: '/administration/data-policies', icon: 'lock', adminOnly: true },
          // Owner 2026-10-13: the workspace's default theme.
          { label: 'Appearance', path: '/administration/appearance', icon: 'eye', adminOnly: true },
          { label: 'Activity', path: '/administration/team-activity', icon: 'history', adminOnly: true, teamOnly: true },
        ],
      },
      {
        label: 'Billing', path: '/billing', icon: 'chart',
        hint: 'What the workspace used, what it costs, and its bills',
        tabs: [
          { label: 'Cost & usage', path: '/billing/usage', icon: 'chart', adminOnly: true },
          // Owner #22 (2026-10-19): a workspace administrator's own trends; a platform administrator's every workspace's, with a
          // workspace filter and the cross-customer revenue (platform only, inside the page).
          { label: 'Analytics', path: '/billing/analytics', icon: 'trendingUp', adminOnly: true },
          { label: 'Invoices', path: '/billing/invoices', icon: 'file', adminOnly: true },
          { label: 'Billing documents', path: '/billing/documents', icon: 'folder', adminOnly: true },
          // Owner #23: the rate cards and their pricing rules -- the platform's alone.
          { label: 'Settings', path: '/billing/settings', icon: 'settings', platformOnly: true },
        ],
      },
      {
        label: 'Settings', path: '/settings', icon: 'settings',
        hint: 'Models, tools, registry tasks, Kafka, the values a pipeline reads, and alerts',
        tabs: [
          { label: 'Model connections', path: '/settings/model-connections', icon: 'server', adminOnly: true },
          // Open to a member holding the Prompts page, as before: the list is TENANT_USER.
          { label: 'Tool Registry', path: '/settings/tools', pageKey: 'ai-prompts', tabKey: 'ai-prompts:tools', icon: 'plug' },
          // Task Registry: every task a step can run, and the existing pipelines as Legacy tasks (MIG-250).
          { label: 'Task Registry', path: '/settings/task-registry', icon: 'template', adminOnly: true },
          { label: 'Kafka & Topics', path: '/settings/kafka', icon: 'server', adminOnly: true },
          { label: 'Configuration values', path: '/settings/values', icon: 'key', adminOnly: true },
          { label: 'Home pages', path: '/settings/home-pages', icon: 'globe', adminOnly: true },
          { label: 'Task groups', path: '/settings/task-groups', icon: 'layers', adminOnly: true },
          // MIG-355: the workspace's alert rules and alerts; every call behind it is TENANT_ADMIN.
          { label: 'Alerts', path: '/settings/alerts', icon: 'bell', adminOnly: true },
        ],
      },
      {
        label: 'Developers', path: '/developers', icon: 'terminal',
        hint: 'Your systems on the API, and its reference',
        tabs: [
          // MIG-332: how the organisation's own systems reach the API (/v1), and the event types they send.
          { label: 'API Clients', path: '/developers/api-clients', icon: 'key', adminOnly: true },
          // MIG-336: administrators, and a member whose profile names the page (never by default).
          { label: 'Developer portal', path: '/developers/portal', pageKey: 'developer-portal', icon: 'terminal' },
        ],
      },
    ],
  },
  {
    // Platform administrators only: every tab is platformOnly, so the entry is off everyone else's menu.
    label: 'Platform', path: '/platform', icon: 'globe',
    tabs: [
      { label: 'Workspaces', path: '/platform/workspaces', icon: 'building', platformOnly: true },
      // listRequests, approve and reject all carry hasRole('PLATFORM_ADMIN').
      { label: 'Requests', path: '/platform/requests', icon: 'inbox', platformOnly: true },
      { label: 'Managed service', path: '/platform/managed-service', icon: 'briefcase', platformOnly: true },
      // Owner #20 (2026-10-19): no Work in a workspace page -- "Work in this workspace" is on Workspaces' row menu and beside the
      // workspace selector. Staff activity stays.
      { label: 'Staff activity', path: '/platform/staff-activity', icon: 'history', platformOnly: true },
      // Owner #21: Reliability slimmed into Service health. #22 and #23: Billing analytics and Rate cards moved into Billing.
      { label: 'Service health', path: '/platform/service-health', icon: 'activity', platformOnly: true },
      { label: 'Engine settings', path: '/platform/engine', icon: 'settings', platformOnly: true },
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

/** What the menu needs to know about the reader (core/nav/nav-access.ts fills it in from the session). */
export interface NavViewer {
  canOpen(page: PageKey): boolean;
  /** F3: a tab of a page; absent, every tab of a page held opens. */
  canOpenTab?(page: PageKey, tab: TabKey): boolean;
  /** F3: the member holds an access delegation in force. */
  isDelegate?: boolean;
  isAdmin: boolean;
  isPlatform: boolean;
  /** Our team's activity is worth offering (a MANAGED workspace, or one our team has acted in). */
  showTeam: boolean;
}

/** Whether the reader passes an entry's or a tab's own rules (a hub also needs a tab: see `visibleTabs`). */
export function passes(gate: NavGate, viewer: NavViewer): boolean {
  return (!gate.adminOnly || viewer.isAdmin || (!!gate.delegateOk && !!viewer.isDelegate)) && (!gate.platformOnly || viewer.isPlatform)
    && (!gate.teamOnly || (!viewer.isPlatform && viewer.showTeam))
    && (!gate.pageKey || viewer.canOpen(gate.pageKey))
    && (!gate.pageKey || !gate.tabKey || !viewer.canOpenTab || viewer.canOpenTab(gate.pageKey, gate.tabKey))
    && (!gate.pageKeys || gate.pageKeys.some(key => viewer.canOpen(key)));
}

/** A hub's tabs the reader may open, in order. */
export function visibleTabs(hub: { tabs?: NavTab[] }, viewer: NavViewer): NavTab[] {
  return (hub.tabs ?? []).filter(tab => passes(tab, viewer));
}

/** Whether a menu entry shows: its own rules, and for a hub at least one tab. */
export function entryVisible(entry: NavGate & { tabs?: NavTab[]; crumbOnly?: boolean }, viewer: NavViewer): boolean {
  return !entry.crumbOnly && passes(entry, viewer) && (!entry.tabs || visibleTabs(entry, viewer).length > 0);
}

/** Every hub, the top-level ones (Platform) included. */
export const HUBS: NavHub[] = NAV.flatMap(item => [
  ...(item.tabs && item.path ? [item as NavHub] : []),
  ...(item.children ?? []).filter((child): child is NavChild & NavHub => !!child.tabs),
]);

/** The hub at a hub's own address ("/connections"), the one its menu entry and its breadcrumb link to. */
export function hubByPath(path: string): NavHub | undefined {
  return HUBS.find(hub => hub.path === pathOf(path));
}

/**
 * The hub tab an address IS -- the tab's own address or one of its `alsoAt`, never a page beneath it (a collection,
 * an editor): those are detail pages, and a detail page shows no tab strip.
 */
export function tabAt(url: string): { hub: NavHub; tab: NavTab } | undefined {
  const path = pathOf(url);
  for (const hub of HUBS) {
    const tab = hub.tabs.find(t => t.path === path || !!t.alsoAt?.includes(path));
    if (tab) return { hub, tab };
  }
  return undefined;
}

/**
 * Where an address sits in the menu: its group, the entry whose address (or one of its tabs' addresses) is the longest
 * prefix of it, and that tab. An entry with query parameters is chosen only when the address carries them.
 */
export function placeOf(url: string): { group?: NavItem; entry?: NavChild | NavItem; tab?: NavTab } {
  const path = pathOf(url);
  const query = new URLSearchParams(url.split('?')[1]?.split('#')[0] ?? '');
  const under = (p: string) => path === p || path.startsWith(p + '/');
  let best: { group?: NavItem; entry?: NavChild | NavItem; tab?: NavTab; length: number; exactQuery: boolean } =
    { length: -1, exactQuery: false };
  const consider = (group: NavItem | undefined, entry: NavChild | NavItem, at: string, tab: NavTab | undefined, withQuery: boolean) => {
    const better = at.length > best.length || (at.length === best.length && withQuery && !best.exactQuery);
    if (better) best = { group, entry, tab, length: at.length, exactQuery: withQuery };
  };
  const visit = (group: NavItem | undefined, entry: NavChild | NavItem) => {
    const own = [entry.path, ...('alsoAt' in entry ? entry.alsoAt ?? [] : [])].filter((p): p is string => !!p);
    const at = own.filter(under).sort((a, b) => b.length - a.length)[0];
    const childQuery = 'query' in entry ? entry.query : undefined;
    const queryMatch = !childQuery || Object.entries(childQuery).every(([k, v]) => query.get(k) === v);
    if (at && queryMatch) consider(group, entry, at, undefined, !!childQuery);
    for (const tab of entry.tabs ?? []) {
      const tabAtPath = [tab.path, ...(tab.alsoAt ?? [])].filter(under).sort((a, b) => b.length - a.length)[0];
      if (tabAtPath) consider(group, entry, tabAtPath, tab, false);
    }
  };
  for (const item of NAV) {
    if (item.path) visit(undefined, item);
    for (const child of item.children ?? []) visit(item, child);
  }
  return { group: best.group, entry: best.entry, tab: best.tab };
}

/**
 * The breadcrumb trail for an address: group › entry, then the page's own title on a page beneath the entry (a detail
 * or an editor). In a hub the tab is a step of its own -- group › hub › tab -- and the hub's step opens the hub (its
 * first tab the reader may open). On the entry's or the tab's own address its menu name is the last step, so a list
 * page's breadcrumb reads as the menu does; `detail` adds the title there too (a dashboard's board, opened on the
 * list's own address). "Home" leads when the address is in no group.
 */
export function crumbsFor(url: string, title: string, detail = false): Crumb[] {
  const path = pathOf(url);
  const account = ACCOUNT_CRUMBS.find(a => a.path === path);
  if (account) return [{ label: 'Account' }, { label: account.label }];
  const { group, entry, tab } = placeOf(url);
  if (!entry) return [{ label: 'Home', link: '/dashboard' }, ...(title ? [{ label: title }] : [])];
  const crumbs: Crumb[] = group ? [{ label: group.label }] : [];
  if (tab) {
    crumbs.push({ label: entry.label, link: entry.path });
    const atTab = (path === tab.path || !!tab.alsoAt?.includes(path)) && !detail;
    if (atTab || !title) return [...crumbs, { label: tab.label }];
    return [...crumbs, { label: tab.label, link: tab.path }, { label: title }];
  }
  const query = 'query' in entry ? entry.query : undefined;
  const atEntry = path === entry.path && !detail;
  if (atEntry || !title) return [...crumbs, { label: entry.label }];
  return [...crumbs, { label: entry.label, link: entry.path, query }, { label: title }];
}
