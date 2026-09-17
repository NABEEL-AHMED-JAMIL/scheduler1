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
  | 'ai-agents';

/** A catalogue row as /pageAccess.json/pages serves it. */
export interface PageCatalogueEntry {
  key: PageKey;
  label: string;
  section: string;
  route: string;
}

/** The label a key is shown under when the catalogue has not been fetched (the 403 page). */
export const PAGE_LABELS: Record<PageKey, string> = {
  'jobs': 'Source Jobs',
  'tasks': 'Source Tasks',
  'queue': 'Queue',
  'reports': 'Reports',
  'objects': 'Browse files',
  'analytics': 'Analytics Studio',
  'analytics-dashboards': 'Saved Analyses',
  'tools-converter': 'Document Converter',
  'tools-transcript': 'Audio Transcript',
  'ai-agents': 'AI Agents',
};

export function isPageKey(value: string | null | undefined): value is PageKey {
  return !!value && value in PAGE_LABELS;
}
