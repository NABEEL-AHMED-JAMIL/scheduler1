import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { MineFilter, isMine } from '../../../shared/ui/mine-filter';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/ui/icon';
import { ViewToggle } from '../../../shared/ui/view-toggle';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { LookupData, LookupDialog } from './lookup-dialog';
import { forkJoin, of } from 'rxjs';
import { catchError, map } from 'rxjs/operators';

@Component({
  selector: 'app-lookup',
  imports: [MineFilter, ViewToggle, Icon, TableShell, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './lookup.html',
})
export class Lookup implements OnInit {
  readonly view = signal<'table' | 'cards'>('table');
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly lookups = signal<LookupData[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly expanded = signal<Set<number>>(new Set<number>());
  readonly loadingChildren = signal<Set<number>>(new Set<number>());

  /** Narrows the list to rows this person created. Not persisted -- see MineFilter. */

  private readonly auth = inject(AuthService);

  readonly onlyMine = signal(false);


  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    const rows = this.mine(this.lookups());
    if (!term) return rows;
    return rows.filter(l =>
      (l.lookupType ?? '').toLowerCase().includes(term)
      || (l.lookupValue ?? '').toLowerCase().includes(term));
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<any>>(`${API_BASE}/setting.json/appSetting`).subscribe({
      next: response => {
        if (response.status !== API_SUCCESS) {
          this.loading.set(false);
          this.error.set(response.message);
          return;
        }
        const parents: LookupData[] = response.data?.lookupDatas ?? [];
        if (!parents.length) {
          this.loading.set(false);
          this.lookups.set([]);
          return;
        }

        // appSetting returns parents with no children, so the entry count is unknown until
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

  /** Children are already loaded, so this is only a disclosure toggle. */
  toggle(lookup: LookupData): void {
    const id = lookup.lookupId!;
    this.expanded.update(set => {
      const next = new Set<number>(set);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
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
      confirmLabel: 'Delete lookup',
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
        this.expanded.update(set => new Set<number>(set).add(id));
      },
      error: () => {
        this.loadingChildren.update(set => { const n = new Set<number>(set); n.delete(id); return n; });
        this.toast.error('Could not reload the entries under that lookup.');
      },
    });
  }

  entryCount(lookup: LookupData): number { return lookup.children?.length ?? 0; }

  readonly totalEntries = computed(() =>
    this.lookups().reduce((sum, l) => sum + (l.children?.length ?? 0), 0));

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
   * A platform admin may change anything. Everyone else may change only rows their own
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
}
