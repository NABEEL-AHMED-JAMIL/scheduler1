import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { Avatar } from '../../../shared/ui/avatar';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { API_SUCCESS } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ActionsPage, ActivityKind, ManagedAction, ManagedServiceApi, StaffCandidate, personName, staffOf } from './managed-service.api';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { InlineStatus, createLoadState, loadErrorText } from '../../../shared/ui/loading';
import { SortDirection, createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';

/** Words that read as initials, not as words, when a resource or action name is split. */
const INITIALS: Record<string, string> = { ai: 'AI', api: 'API', apis: 'APIs', sql: 'SQL', url: 'URL', id: 'ID', ids: 'IDs', kafka: 'Kafka',
  pdf: 'PDF', ocr: 'OCR', csv: 'CSV', json: 'JSON', sso: 'SSO', mfa: 'MFA', s3: 'S3', qr: 'QR', ip: 'IP' };

/** "setEnabled" -> "set enabled"; "aiPrompt" -> "AI prompt". */
function words(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').trim().split(/\s+/)
    .map(w => INITIALS[w.toLowerCase()] ?? w.toLowerCase()).join(' ');
}

function sentence(text: string): string {
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
}

/**
 * A change as a person reads it (UI review U6): "/aiPrompt.json/tools/setEnabled" is "AI prompt › Tools › Set enabled".
 * Read from the path itself, so every service's endpoint gets a name with no list to keep; the raw method and path
 * stay on the row's tooltip for whoever needs them.
 */
export function changeText(path: string | null | undefined): string {
  const parts = (path ?? '').split('?')[0].split('/').filter(Boolean).map(p => p.replace(/\.json$/i, ''));
  if (!parts.length) return 'A change';
  return parts.map(p => sentence(words(p))).join(' › ');
}

/**
 * What the change was made to, from its query ("sourceTaskId=1854&version=3" -> "Source task 1854 · version 3"). The
 * workspace is left out: the row already names it, and a bare tenantId means nothing to a customer.
 */
export function targetText(target: string | null | undefined): string {
  return (target ?? '').split('&').map(pair => pair.split('='))
    .filter(([key, value]) => key && value !== undefined && value !== '' && !/^tenant(Id)?$/i.test(key))
    .map(([key, value]) => `${sentence(words(key.replace(/Id$/, '')))} ${decodeURIComponent(value)}`)
    .join(' · ');
}

/**
 * How a data read reads (ZT-A12 follow-up, owner 2026-10-21): Identity's `readKind` -> the verb and the thing, so a row says
 * "Opened board 41" or "Downloaded run output 8913:csv". Keyed by the kind in lower case with spaces; a kind not listed
 * here reads "Read <kind> <id>".
 */
const READS: Record<string, [verb: string, thing: string]> = {
  'board': ['Opened', 'board'],
  'tile': ['Opened', 'tile'],
  'query result': ['Read', 'query result'],
  'export': ['Downloaded', 'export'],
  'file preview': ['Previewed', 'file'],
  'file download': ['Downloaded', 'file'],
  'page images': ['Opened', 'page images of document'],
  'document': ['Opened', 'document'],
  'document fields': ['Opened', 'the fields of document'],
  'approved data': ['Opened', 'approved data'],
  'approved data csv': ['Downloaded', 'approved data CSV'],
  'run outputs': ['Opened', 'the outputs of run'],
  'run output': ['Downloaded', 'run output'],
  'step logs': ['Opened', 'the step logs of run'],
  'run log': ['Opened', 'the log of run'],
  'run ai answers': ['Opened', 'the AI answers of run'],
  'prompt runs': ['Opened', 'the runs of prompt'],
  'report pdf': ['Downloaded', 'report PDF'],
  'report page image': ['Opened', 'report page image'],
  'form submission': ['Opened', 'form submission'],
  'form submissions csv': ['Downloaded', 'form submissions CSV'],
  'ask your data answer': ['Read', 'Ask your data answer'],
  'ask your data chart': ['Opened', 'Ask your data chart'],
  'assistant tool results': ['Read', 'assistant tool results'],
  'assistant result rows': ['Read', 'assistant result rows'],
  'schedules export': ['Downloaded', 'schedules export'],
  'pipelines export': ['Downloaded', 'pipelines export'],
  // workflow-service's audited reads (a task, a request) in a managed session.
  'approval task': ['Opened', 'approval task'],
  'approval request': ['Opened', 'approval request'],
};

/** A row that is a data read, not a change: Identity names what was read. */
export function isRead(a: Pick<ManagedAction, 'readKind'>): boolean {
  return !!a.readKind?.trim();
}

/** A data read in words: "Opened board 41", "Downloaded run output 8913:csv"; an unknown kind "Read <kind> <id>". */
export function readText(a: Pick<ManagedAction, 'readKind' | 'readId'>): string {
  const kind = (a.readKind ?? '').trim();
  if (!kind) return '';
  const key = kind.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').toLowerCase();
  const id = a.readId === null || a.readId === undefined || a.readId === '' ? '' : ` ${a.readId}`;
  const known = READS[key];
  return known ? `${known[0]} ${known[1]}${id}` : `Read ${words(kind)}${id}`;
}

/** How many rows a page asks for: the service's default is 100 and its most 500. */
export const ACTIONS_PAGE = 50;

/**
 * MIG-254: the managed-service audit, newest first, one page at a time (paging.nextBeforeId). Since the ZT-A12 follow-up
 * (owner 2026-10-21, "Managed session only") it holds every data read of a managed session too -- a board, a run's
 * outputs, a report PDF, a file opened, exported or downloaded -- marked Read and said in words (readText); lists and
 * counts are not recorded. The kind filter asks Identity for the changes, the reads, or both.
 *
 * Two pages from one component, told apart by the route's `scope`: Administration › Staff activity for a platform
 * administrator (every workspace, filtered by workspace and staff member), and Our team's activity for a workspace
 * administrator (the service answers their own workspace whatever is asked, so there is no workspace to pick).
 */
@Component({
  selector: 'app-staff-activity',
  imports: [WorkspaceSelect, RefreshButton, PageHeader, TableShell, Icon, ServerTimePipe, Avatar, InlineStatus, SortHeader],
  templateUrl: './staff-activity.html',
})
export class StaffActivity implements OnInit {
  private readonly api = inject(ManagedServiceApi);

  /** From the route's data: which of the two pages this is. */
  readonly scope = input<'platform' | 'workspace'>('platform');
  readonly showWorkspace = computed(() => this.scope() === 'platform');

  readonly rows = signal<ManagedAction[]>([]);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  /** Owner 2026-10-27: an older page that failed is said by its button; the rows already shown stay. */
  readonly olderError = signal('');
  /** The platform's staff list for the filter (platform scope): loading, failed (with Try again), or read. */
  readonly staffState = createLoadState(false);
  /** Each newest-page read's number: a filter changed meanwhile, the newer read answers. */
  private seq = 0;
  readonly nextBeforeId = signal<number | null>(null);
  /** A sorted audit's next page (owner 2026-10-27): Identity pages it by offset, the id cursor only walks the id order. */
  readonly nextOffset = signal<number | null>(null);
  readonly hasMore = computed(() => this.nextBeforeId() !== null || this.nextOffset() !== null);

  /**
   * Owner 2026-10-27 ("add a sort on each table"): Identity sorts the whole audit (sort/dir on its allow-list: createdAt,
   * staff, workspace, service), so the order covers every page, not only the rows loaded; a new order reads from the
   * first page again and the next pages go on by offset. Newest first is the audit's own order (rows are written with the
   * time they ran, in id order), so When descending is the initial one and keeps the id cursor, sending no sort. Staff
   * member sorts by the name shown (full name, else username); "Change or read" is not on the allow-list.
   */
  readonly sort = createTableSort<ManagedAction>({
    id: 'staff-activity',
    server: true,
    initial: { key: 'createdAt', direction: 'desc' },
    columns: {
      createdAt: { value: a => a.createdAt, kind: 'date', param: 'createdAt' },
      staff: { value: a => personName(a), kind: 'text', param: 'staff' },
      workspace: { value: a => a.tenantName, kind: 'text', param: 'workspace' },
      service: { value: a => a.service, kind: 'text', param: 'service' },
    },
    onChange: () => this.load(),
  });

  /** What a read sends for the order: nothing for newest first (the id cursor's order), else the column and dir. */
  sortParams(): { sort: string; dir: SortDirection } | null {
    const p = this.sort.param();
    return p && !(p.sort === 'createdAt' && p.dir === 'desc') ? p : null;
  }
  private readonly platformStaff = signal<StaffCandidate[]>([]);
  /** Everyone the log has shown so far: a workspace administrator cannot list our staff, only see who acted. */
  private readonly seen = signal<Map<number, StaffCandidate>>(new Map());
  readonly staff = computed(() => this.showWorkspace()
    ? this.platformStaff()
    : [...this.seen().values()].sort((a, b) => personName(a).localeCompare(personName(b))));
  readonly tenantFilter = signal<number | null>(inject(WorkspaceDirectory).remembered());
  readonly staffFilter = signal<number | null>(null);
  /** Changes and reads (''), only the changes, or only the data reads (ZT-A12 follow-up): Identity's `kind`. */
  readonly kindFilter = signal<'' | ActivityKind>('');
  readonly kinds: { value: '' | ActivityKind; label: string }[] = [
    { value: '', label: 'Changes and reads' }, { value: 'changes', label: 'Changes' }, { value: 'reads', label: 'Data reads' }];
  readonly hasFilters = computed(() => !!this.tenantFilter() || !!this.staffFilter() || !!this.kindFilter());
  readonly name = personName;
  readonly change = changeText;
  readonly targetOf = targetText;
  readonly isRead = isRead;
  readonly read = readText;

  readonly emptyMessage = computed(() => {
    if (this.hasFilters()) return this.kindFilter() === 'reads' ? 'No data read matches those filters.'
      : this.kindFilter() === 'changes' ? 'No change matches those filters.' : 'Nothing matches those filters.';
    return this.showWorkspace() ? 'Our staff have not changed or read anything in a customer\'s workspace yet.'
      : 'Our team has not changed or opened anything in this workspace yet.';
  });

  ngOnInit(): void {
    this.load();
    // The workspace filter is the shared app-workspace-select, which reads its own list: no workspace read here.
    if (!this.showWorkspace()) return;
    this.loadStaff();
  }

  loadStaff(): void {
    this.staffState.start();
    this.api.users().subscribe({
      next: r => {
        if (r.status !== API_SUCCESS) { this.staffState.fail(r, 'The staff could not be read.'); return; }
        this.platformStaff.set(staffOf(r.data ?? []));
        this.staffState.done();
      },
      error: err => this.staffState.fail(err, 'The staff could not be read.'),
    });
  }

  /** The newest page, for the filters as they are now. */
  load(): void {
    const seq = ++this.seq;
    this.loading.set(true);
    this.error.set('');
    this.olderError.set('');
    this.fetch(null, null, page => this.rows.set(page), () => this.loading.set(false),
      words => this.error.set(words), () => seq === this.seq);
  }

  loadOlder(): void {
    const before = this.nextBeforeId();
    const offset = this.nextOffset();
    if ((before === null && offset === null) || this.loadingMore()) return;
    const seq = this.seq;
    this.loadingMore.set(true);
    this.olderError.set('');
    // A failed older page must not swap the rows already shown for the table's error block.
    this.fetch(before, offset, page => this.rows.update(rows => [...rows, ...page]), () => this.loadingMore.set(false),
      words => this.olderError.set(words), () => seq === this.seq);
  }

  private fetch(beforeId: number | null, offset: number | null, take: (rows: ManagedAction[]) => void, done: () => void,
                failed: (words: string) => void, current: () => boolean): void {
    const kind = this.kindFilter();
    const sort = this.sortParams();
    this.api.actions({ tenantId: this.showWorkspace() ? this.tenantFilter() : null, appUserId: this.staffFilter(),
      beforeId: sort ? null : beforeId, limit: ACTIONS_PAGE, ...(kind ? { kind } : {}),
      ...(sort ? { ...sort, offset: offset ?? 0 } : {}) }).subscribe({
      next: (r: ActionsPage) => {
        if (!current()) return;
        done();
        if (r.status !== API_SUCCESS) { failed(loadErrorText(r, 'The activity could not be read.')); return; }
        const page = r.data ?? [];
        take(page);
        this.nextBeforeId.set(sort ? null : r.paging?.nextBeforeId ?? null);
        this.nextOffset.set(sort ? r.paging?.nextOffset ?? null : null);
        this.remember(page);
      },
      error: err => {
        if (!current()) return;
        done();
        failed(loadErrorText(err, 'The activity could not be read.'));
      },
    });
  }

  private remember(page: ManagedAction[]): void {
    const known = this.seen();
    const fresh = page.filter(a => !known.has(a.appUserId));
    if (!fresh.length) return;
    const next = new Map(known);
    for (const a of fresh) {
      next.set(a.appUserId, { appUserId: a.appUserId, username: a.username ?? '', fullName: a.fullName, userRole: 'PLATFORM_ADMIN', status: 'Active' });
    }
    this.seen.set(next);
  }

  setTenant(value: string): void { this.tenantFilter.set(value ? Number(value) : null); this.load(); }
  setStaff(value: string): void { this.staffFilter.set(value ? Number(value) : null); this.load(); }
  setKind(value: string): void { this.kindFilter.set(value === 'reads' || value === 'changes' ? value : ''); this.load(); }
  clearFilters(): void { this.tenantFilter.set(null); this.staffFilter.set(null); this.kindFilter.set(''); this.load(); }

  workspaceName(a: ManagedAction): string {
    return a.tenantName?.trim() || `Workspace ${a.tenantId}`;
  }
}
