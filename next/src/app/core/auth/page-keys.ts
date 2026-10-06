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
  | 'developer-portal';

/** A catalogue row as /pageAccess.json/pages serves it. */
export interface PageCatalogueEntry {
  key: PageKey;
  label: string;
  section: string;
  route: string;
}

/**
 * The label a key is shown under when the catalogue has not been fetched (the 403 page).
 *
 * MIG-218 renamed the screens, not the keys: 'jobs' is Schedules, 'tasks' is Pipelines and 'reports' is
 * Run analytics, and an existing grant keeps opening the same screen under its new name.
 */
export const PAGE_LABELS: Record<PageKey, string> = {
  'jobs': 'Schedules',
  'tasks': 'Pipelines',
  'queue': 'Queue',
  'reports': 'Run analytics',
  'objects': 'Browse files',
  'analytics': 'Analytics Studio',
  'analytics-dashboards': 'Saved Analyses',
  'tools-converter': 'Document Converter',
  'tools-transcript': 'Audio Transcript',
  'ai-prompts': 'Prompts',
  'api-collections': 'API Collections',
  'sources': 'Sources',
  'connector-hub': 'Connector Hub',
  'document-intelligence': 'Document Intelligence',
  'document-review': 'Review queue',
  'ask-data': 'Ask your data',
  'data-catalog': 'Data Catalog',
  'forms': 'All forms',
  'form-submissions': 'Submissions',
  'task-inbox': 'Task inbox',
  'workflow-designer': 'Workflow designer',
  'developer-portal': 'Developer portal',
};

export function isPageKey(value: string | null | undefined): value is PageKey {
  return !!value && value in PAGE_LABELS;
}
