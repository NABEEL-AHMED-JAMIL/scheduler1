import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { Avatar } from '../../../shared/ui/avatar';
import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ActionsPage, ActivityKind, ManagedAction, ManagedServiceApi, StaffCandidate, personName, staffOf } from './managed-service.api';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';

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
  return known ? `${known[0]} ${known[1]}${id}` : `Read ${kind}${id}`;
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
  imports: [WorkspaceSelect, RefreshButton, PageHeader, TableShell, Icon, ServerTimePipe, Avatar],
  templateUrl: './staff-activity.html',
})
export class StaffActivity implements OnInit {
  private readonly api = inject(ManagedServiceApi);
  private readonly http = inject(HttpClient);

  /** From the route's data: which of the two pages this is. */
  readonly scope = input<'platform' | 'workspace'>('platform');
  readonly showWorkspace = computed(() => this.scope() === 'platform');

  readonly rows = signal<ManagedAction[]>([]);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal('');
  readonly nextBeforeId = signal<number | null>(null);
  readonly hasMore = computed(() => this.nextBeforeId() !== null);
  readonly tenants = signal<{ tenantId: number; tenantName: string }[]>([]);
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
    if (!this.showWorkspace()) return;
    this.http.get<ApiResponse<{ tenantId: number; tenantName: string; status?: string }[]>>(`${API_BASE}/tenant.json/listTenants`)
      .subscribe({
        next: r => this.tenants.set((r.status === API_SUCCESS ? r.data ?? [] : []).filter(t => t.status !== 'Delete')
          .map(t => ({ tenantId: t.tenantId, tenantName: t.tenantName })).sort((a, b) => a.tenantName.localeCompare(b.tenantName))),
        error: () => this.tenants.set([]),
      });
    this.api.users().subscribe({
      next: r => this.platformStaff.set(r.status === API_SUCCESS ? staffOf(r.data ?? []) : []),
      error: () => this.platformStaff.set([]),
    });
  }

  /** The newest page, for the filters as they are now. */
  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.fetch(null, page => this.rows.set(page), () => this.loading.set(false));
  }

  loadOlder(): void {
    const before = this.nextBeforeId();
    if (before === null || this.loadingMore()) return;
    this.loadingMore.set(true);
    this.fetch(before, page => this.rows.update(rows => [...rows, ...page]), () => this.loadingMore.set(false));
  }

  private fetch(beforeId: number | null, take: (rows: ManagedAction[]) => void, done: () => void): void {
    const kind = this.kindFilter();
    this.api.actions({ tenantId: this.showWorkspace() ? this.tenantFilter() : null, appUserId: this.staffFilter(), beforeId,
      limit: ACTIONS_PAGE, ...(kind ? { kind } : {}) }).subscribe({
      next: (r: ActionsPage) => {
        done();
        if (r.status !== API_SUCCESS) { this.error.set(r.message || 'The activity could not be read.'); return; }
        const page = r.data ?? [];
        take(page);
        this.nextBeforeId.set(r.paging?.nextBeforeId ?? null);
        this.remember(page);
      },
      error: err => {
        done();
        this.error.set(err?.error?.message || 'The activity could not be read.');
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
