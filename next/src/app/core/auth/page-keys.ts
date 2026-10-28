/**
 * The console pages an access profile can grant -- the same fixed catalogue as the server's
 * PageKey enum, keyed the same way.
 *
 * Kept as a code constant on this side too, so the menu and the route guards can ask "may this
 * person open `reports`?" without a request, and so a key mistyped in a route's data is a
 * compile error rather than a page that quietly opens for everyone. The profile editor reads
 * the catalogue from /pageAccess.json/pages rather than from here, so it shows exactly what
 * the server will accept.
 */
export type PageKey =
  | 'jobs' | 'tasks' | 'queue' | 'reports'
  | 'objects' | 'analytics' | 'analytics-dashboards'
  | 'tools-converter' | 'tools-transcript'
  | 'ai-prompts'
  // Wave 4 (MIG-223): Integration > API Collections. Identity already serves and enforces this one.
  | 'api-collections'
  // Wave 4 (MIG-248): Integration > Sources, and the data contracts beside them (MIG-233). Identity serves it.
  | 'sources'
  // Wave 5 (MIG-267): one key per module page. Identity's catalogue carries document-intelligence on the
  // wave5-ocr branch and none of the others yet, so until it does a tenant user on a profile cannot be
  // granted them (the menu hides them); admins and profile-less users see the entry points.
  | 'connector-hub' | 'document-intelligence' | 'document-review'
  | 'ask-data' | 'data-catalog'
  | 'forms' | 'form-submissions'
  | 'task-inbox' | 'workflow-designer'
  // MIG-336: Integration > Developer portal. Unlike every other key, a tenant user without an access profile does not
  // hold it: the owner keeps the API docs to administrators and developers (EXPLICIT_PAGES in auth.service.ts).
  | 'developer-portal'
  // UX review 2026-10-12: Saved Analyses reads the boards; saving, pinning and deleting are Edit dashboards' (or the
  // Studio's). Identity's PageKey has the same split, and the gateway refuses the writes with a 403.
  | 'dashboards-edit'
  // MIG-403: See results › Reports (Report Studio), one key per tab and per action, each on its own media-service prefix:
  // the hub's Overview, templates, publishing (an action), data, generating (an action) and the library. Identity's
  // PageKey has the same six; the gateway refuses another key's calls.
  | 'report-studio' | 'report-templates' | 'report-publish' | 'report-data' | 'report-generate' | 'report-library'
  // MIG-406: Assets & branding (the tab), the custodian of signatures and stamps (an action), and the approver who approves
  // a report version -- certifying its PDF -- and a signature or stamp picture (an action). Identity's PageKey has the same three.
  | 'report-assets' | 'report-asset-custodian' | 'report-approve'
  // ZT-M21 (owner 2026-10-26): a capability, not a page -- downloading, viewing or previewing the files a pipeline marked
  // sensitive keeps (and its reports). Admins and people with no profile hold it; a profile once an admin ticks it.
  | 'sensitive-files'
  // ZT-I34 (owner 2026-10-27): a capability, not a page -- showing a request's personal data (each showing is in the request's
  // history). Deny by default: admins hold it, a profile once an admin ticks it, a person given it on their own -- never a person
  // with no profile. A submitter sees their own requests without it.
  | 'see-personal-data';

/**
 * F3 (MIG-400): a tab of a page several menu tabs share, grantable alone -- identity's TabKey, `<page>:<tab>`. A page held with
 * none of its tab keys opens every tab; with some, only those (AuthService.canOpenTab).
 */
export type TabKey =
  | 'sources:databases' | 'sources:sources' | 'sources:contracts'
  | 'document-intelligence:in' | 'document-intelligence:types' | 'document-intelligence:approved-data'
  | 'queue:by-date' | 'queue:failed' | 'jobs:schedules' | 'jobs:backfills'
  | 'task-inbox:approvals' | 'task-inbox:runs' | 'task-inbox:requests'
  | 'ai-prompts:prompts' | 'ai-prompts:assistant' | 'ai-prompts:tools';

/** A page's tab in the catalogue: apiGated false means granting it only hides the tab (its data is the page's shared calls). */
export interface TabCatalogueEntry { key: TabKey; label: string; route: string; apiGated: boolean; }

/** A catalogue row as /pageAccess.json/pages serves it. */
export interface PageCatalogueEntry {
  key: PageKey;
  label: string;
  section: string;
  route: string;
  /** F3: the page's own tabs, each grantable alone (absent or empty: the page is one place). */
  tabs?: TabCatalogueEntry[];
  /** The page this one is the editing half of (a read/edit split), when the catalogue says so; else EDIT_OF does. */
  editOf?: PageKey;
}

/**
 * Read/edit splits: a page key that holds the writes of another page (UX review 2026-10-12: Saved Analyses reads the
 * boards, Edit dashboards saves, pins and deletes them). The access-profile editor shows the pair as one row with a View
 * and an Edit box, and Edit always brings View with it. Identity's PageKey has the same split.
 */
export const EDIT_OF: Partial<Record<PageKey, PageKey>> = {
  'dashboards-edit': 'analytics-dashboards',
};

/**
 * The label a key is shown under when the catalogue has not been fetched (the 403 page).
 *
 * MIG-218 renamed the screens, not the keys: 'jobs' is Schedules, 'tasks' is Pipelines and 'reports' is
 * Run analytics, and an existing grant keeps opening the same screen under its new name. The UX review of 2026-10-12
 * renamed more (one name per thing, nav-tree.ts): 'task-inbox' is the Review inbox, 'connector-hub' Connections; DR2 (2026-10-13)
 * made the Review inbox the Review hub's Approvals tab.
 */
export const PAGE_LABELS: Record<PageKey, string> = {
  'jobs': 'Schedules',
  'tasks': 'Pipelines',
  'queue': 'Runs by date',
  'reports': 'Run analytics',
  'objects': 'Browse files',
  'analytics': 'Analytics Studio',
  'analytics-dashboards': 'Dashboards',
  'tools-converter': 'Document Converter',
  'tools-transcript': 'Audio Transcript',
  'ai-prompts': 'Prompts',
  'api-collections': 'API Collections',
  'sources': 'Sources',
  'connector-hub': 'Connections',
  'document-intelligence': 'Documents in',
  'document-review': 'Document review',
  'ask-data': 'Ask your data',
  'data-catalog': 'Data Catalog',
  'forms': 'Forms',
  'form-submissions': 'Form submissions',
  'task-inbox': 'Approvals',
  'workflow-designer': 'Approval workflows',
  'developer-portal': 'Developer portal',
  'dashboards-edit': 'Edit dashboards',
  'report-studio': 'Reports overview',
  'report-templates': 'Report templates',
  'report-publish': 'Publish report templates',
  'report-data': 'Report data',
  'report-generate': 'Generate reports',
  'report-library': 'Reports',
  'report-assets': 'Report assets and branding',
  'report-asset-custodian': 'Upload signatures and stamps',
  'report-approve': 'Approve and sign reports',
  'sensitive-files': 'Download sensitive files',
  'see-personal-data': 'See personal data',
};

export function isPageKey(value: string | null | undefined): value is PageKey {
  return !!value && value in PAGE_LABELS;
}
