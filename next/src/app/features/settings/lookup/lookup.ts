import { Component, OnInit, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { MineFilter, isMine } from '../../../shared/ui/mine-filter';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/ui/icon';
import { StatTile } from '../../../shared/ui/stat-tile';
import { ToastService } from '../../../shared/ui/toast.service';
import { CopyButton } from '../../../shared/ui/copy-button';
import { BlurLoader } from '../../../shared/ui/blur-loader';
import { copyText } from '../../../shared/ui/clipboard.util';
import { confirmWith } from '../../../shared/ui/confirm';
import { LookupData, LookupDialog } from './lookup-dialog';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Component({
  selector: 'app-lookup',
  imports: [MineFilter, Icon, StatTile, CdkMenu, CdkMenuItem, CdkMenuTrigger, CopyButton, BlurLoader],
  templateUrl: './lookup.html',
})
export class Lookup implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  /** `<lookupId>:<type|value>` of the thing just copied, so exactly one icon ticks. */
  readonly copiedKey = signal<string | null>(null);

  readonly lookups = signal<LookupData[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  /** Which lookup the detail pane shows; mirrored to ?lookup= so a row can be linked to. */
  readonly selectedId = signal<number | null>(null);
  readonly selected = computed(() => this.lookups().find(l => l.lookupId === this.selectedId()) ?? null);
  readonly loadingChildren = signal<Set<number>>(new Set<number>());

  /** Narrows the list to rows this person created. Not persisted -- see MineFilter. */

  private readonly auth = inject(AuthService);

  readonly onlyMine = signal(false);


  /**
   * The rail: a lookup stays listed when it matches itself OR one of its entries matches, so
   * searching "openai" lands on AI_PROVIDER with "1 match" beside it rather than on nothing.
   */
  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const rows = this.mine(this.lookups());
    if (!term) return rows;
    return rows.filter(l =>
      (l.lookupType ?? '').toLowerCase().includes(term)
      || (l.lookupValue ?? '').toLowerCase().includes(term)
      || this.matchingEntries(l) > 0);
  });

  /** How many of a lookup's entries match the search; 0 when there is no search. */
  matchingEntries(lookup: LookupData): number {
    const term = this.search().trim().toLowerCase();
    if (!term) return 0;
    return (lookup.children ?? []).filter(c => this.entryMatches(c, term)).length;
  }

  private entryMatches(c: LookupData, term: string): boolean {
    return (c.lookupType ?? '').toLowerCase().includes(term)
      || (c.lookupValue ?? '').toLowerCase().includes(term)
      || (c.description ?? '').toLowerCase().includes(term);
  }

  /** The pane's own search over the selected lookup's entries -- nineteen providers need one. */
  readonly entrySearch = signal('');

  /**
   * The selected lookup's entries, narrowed by the pane's own box first, else by the rail's
   * search when that names one of them (so "openai" typed in the rail still lands on the row).
   */
  readonly visibleEntries = computed(() => {
    const lookup = this.selected();
    if (!lookup) return [];
    const all = lookup.children ?? [];
    const own = this.entrySearch().trim().toLowerCase();
    if (own) return all.filter(c => this.entryMatches(c, own));
    const term = this.search().trim().toLowerCase();
    if (!term || this.matchingEntries(lookup) === 0) return all;
    return all.filter(c => this.entryMatches(c, term));
  });

  /**
   * What a lookup IS, because the table treated three different things alike.
   *
   * A list has entries -- AI_PROVIDER, PIPELINE_HOME_PAGES -- and its own value is only a label.
   * A setting is one value the engine reads -- QUEUE_FETCH_LIMIT. A managed lookup is a
   * watermark the scheduler writes on every pass; editing one by hand is a recovery action,
   * not configuration, so the screen says so and does not lead with "Add entry".
   */
  kindOf(lookup: LookupData): { key: 'list' | 'setting' | 'managed'; label: string; icon: string; pill: string; cls: string; hint: string } {
    if ((lookup.children?.length ?? 0) > 0) {
      return { key: 'list', label: 'List', icon: 'layers', pill: 'pill-brand', cls: 'is-list',
        hint: 'A named set of entries a form or pipeline offers as choices' };
    }
    if (/_LAST_RUN_TIME$/.test(lookup.lookupType ?? '')) {
      return { key: 'managed', label: 'Managed', icon: 'clock', pill: 'pill-warn', cls: 'is-managed',
        hint: 'A watermark the scheduler writes; not something to configure' };
    }
    return { key: 'setting', label: 'Setting', icon: 'settings', pill: 'pill-ok', cls: 'is-setting',
      hint: 'One value the engine or a pipeline reads' };
  }

  readonly stats = computed(() => {
    const all = this.lookups();
    const kinds = all.map(l => this.kindOf(l).key);
    return {
      lists: kinds.filter(k => k === 'list').length,
      settings: kinds.filter(k => k === 'setting').length,
      managed: kinds.filter(k => k === 'managed').length,
      entries: all.reduce((sum, l) => sum + (l.children?.length ?? 0), 0),
    };
  });

  select(lookup: LookupData): void {
    this.selectedId.set(lookup.lookupId ?? null);
    this.entrySearch.set('');
    this.router.navigate([], { relativeTo: this.route, queryParams: { lookup: lookup.lookupId }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  /** Whose entry each row is; only a platform administrator sees more than one workspace here. */
  private readonly tenants = signal<{ tenantId: number; tenantName: string }[]>([]);
  readonly canSeeWorkspace = computed(() => this.auth.isPlatformAdmin());
  workspaceName(entry: LookupData): string {
    if (entry.tenantId == null) return 'Platform';
    return this.tenants().find(t => t.tenantId === entry.tenantId)?.tenantName ?? `Tenant ${entry.tenantId}`;
  }

  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  constructor() {
    // Keep something selected: the linked one when the list arrives, else the first, and move
    // off a lookup the moment it stops existing (deleted, or filtered out by "Only mine").
    effect(() => {
      const rows = this.filtered();
      const current = untracked(this.selectedId);
      if (!rows.length) { if (current !== null) this.selectedId.set(null); return; }
      if (rows.some(l => l.lookupId === current)) return;
      const linked = Number(untracked(() => this.route.snapshot.queryParamMap.get('lookup')));
      const pick = rows.find(l => l.lookupId === linked) ?? rows[0];
      this.selectedId.set(pick.lookupId ?? null);
    });
  }

  ngOnInit(): void {
    this.load();
    if (this.canSeeWorkspace()) {
      this.http.get<ApiResponse<{ tenantId: number; tenantName: string }[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
        next: r => { if (r.status === API_SUCCESS) this.tenants.set(r.data ?? []); },
        error: () => {},
      });
    }
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    // Lookups alone: appSetting also carried every topic, megabytes this screen threw away.
    this.http.get<ApiResponse<LookupData[]>>(`${API_BASE}/setting.json/lookups`).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.loading.set(false);
          this.error.set(response.message);
          return;
        }
        const parents: LookupData[] = response.data ?? [];
        if (!parents.length) {
          this.loading.set(false);
          this.lookups.set([]);
          return;
        }

        // The server returns parents with no children, so the entry count is unknown until
        // each one is asked for. Fetching them all up front is a handful of small requests
        // and means the Entries column says something before anything is expanded, and that
        // a row with nothing under it does not offer an expander.
        forkJoin(parents.map(parent =>
          this.http.get<ApiResponse<any>>(`${API_BASE}/setting.json/fetchSubLookupByParentId`,
            { params: { parentLookUpId: parent.lookupId! } }).pipe(
            map(sub => ({ ...parent, children: (sub?.data?.lookupDatas ?? []) as LookupData[] })),
            catchError(() => of({ ...parent, children: [] as LookupData[] })),
          )),
        ).subscribe(rows => {
          this.loading.set(false);
          this.lookups.set(rows);
        });
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load lookups.');
      },
    });
  }

  create(): void {
    this.dialog.open<boolean>(LookupDialog, { data: {} }).closed
      .subscribe(saved => { if (saved) this.load(); });
  }

  addChild(parent: LookupData): void {
    this.dialog.open<boolean>(LookupDialog, { data: { parent } }).closed
      .subscribe(saved => { if (saved) this.refreshChildren(parent); });
  }

  edit(lookup: LookupData, parent?: LookupData): void {
    this.dialog.open<boolean>(LookupDialog, { data: { lookup, parent } }).closed
      .subscribe(saved => { if (saved) parent ? this.refreshChildren(parent) : this.load(); });
  }

  async remove(lookup: LookupData, parent?: LookupData): Promise<void> {
    const children = lookup.children?.length ?? lookup.childCount ?? 0;
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${lookup.lookupType}?`,
      body: children
        ? `${children} ${children === 1 ? 'entry' : 'entries'} sit under this. Anything reading this lookup stops finding it.`
        : 'Anything reading this lookup stops finding it.',
      // Named for what the row button said: an entry is not a lookup.
      confirmLabel: parent ? 'Delete entry' : 'Delete lookup',
      danger: true,
    });
    if (!ok) return;
    // The endpoint is a PUT taking the DTO in the body, not a DELETE with a query param.
    this.http.put<ApiResponse>(`${API_BASE}/setting.json/deleteLookupData`,
      { lookupId: lookup.lookupId }).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) { this.toast.error(response.message); return; }
        this.toast.success(response.message);
        parent ? this.refreshChildren(parent) : this.load();
      },
      error: err => this.toast.error(err?.error?.message || 'The lookup could not be deleted.'),
    });
  }

  /** Refetches one parent's children in place, leaving the row open. */
  private refreshChildren(parent: LookupData): void {
    const id = parent.lookupId!;
    this.loadingChildren.update(set => new Set<number>(set).add(id));
    this.http.get<ApiResponse<any>>(`${API_BASE}/setting.json/fetchSubLookupByParentId`,
      { params: { parentLookUpId: id } }).subscribe({
      next: response => {
        this.loadingChildren.update(set => { const n = new Set<number>(set); n.delete(id); return n; });
        if (response.status !== API_SUCCESS) return;
        const children = response.data?.lookupDatas ?? [];
        this.lookups.update(list => list.map(l => (l.lookupId === id ? { ...l, children } : l)));
      },
      error: () => {
        this.loadingChildren.update(set => { const n = new Set<number>(set); n.delete(id); return n; });
        this.toast.error('Could not reload the entries under that lookup.');
      },
    });
  }

  entryCount(lookup: LookupData): number { return lookup.children?.length ?? 0; }

  /**
   * Applies the "Only mine" toggle.
   *
   * Kept pure -- it runs inside a computed, and writing a signal from there is not allowed. The
   * count of what survives is already on the table header, so nothing needs to be recorded.
   */
  private mine<T extends { createdBy?: number | null }>(rows: T[]): T[] {
    if (!this.onlyMine()) {
      return rows;
    }
    const myId = this.auth.user()?.appUserId ?? null;
    return rows.filter(row => isMine(row, myId));
  }

  /**
   * Whether this entry is the caller's to change.
   *
   * A platform administrator may change anything. Everyone else may change only rows their own
   * workspace owns -- a row with no tenant belongs to the platform and is shared with every
   * workspace, so removing one would take it away from all of them. The server refuses either
   * way; this stops the console offering a button that can only end in a refusal.
   */
  canModify(entry: { tenantId?: number | null }): boolean {
    if (this.auth.isPlatformAdmin()) {
      return true;
    }
    const mine = this.auth.user()?.tenantId ?? null;
    return entry.tenantId != null && entry.tenantId === mine;
  }

  /**
   * A lookup's key and value are what people paste into pipelines, forms and config, and both
   * truncate in a column -- selecting a truncated cell by hand copies the ellipsis. The tick
   * only shows when the clipboard really changed (copyText reports that).
   */
  copyValue(lookupId: number | undefined, field: 'type' | 'value', value: string): void {
    copyText(value ?? '').then(ok => {
      if (!ok) { this.toast.error('Could not copy that. Select it and copy by hand.'); return; }
      const key = `${lookupId}:${field}`;
      this.copiedKey.set(key);
      setTimeout(() => { if (this.copiedKey() === key) this.copiedKey.set(null); }, 1500);
    });
  }

  /** A value that is a web address gets an "open" link beside its copy icon. */
  isUrl(value: string | null | undefined): boolean {
    return /^https?:\/\/\S+$/i.test((value ?? '').trim());
  }
}
