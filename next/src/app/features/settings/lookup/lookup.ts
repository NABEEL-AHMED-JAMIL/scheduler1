import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { Icon } from '../../../shared/ui/icon';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { LookupData, LookupDialog } from './lookup-dialog';

@Component({
  selector: 'app-lookup',
  imports: [Icon, TableShell, CdkMenu, CdkMenuItem, CdkMenuTrigger],
  templateUrl: './lookup.html',
})
export class Lookup implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly lookups = signal<LookupData[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly expanded = signal<Set<number>>(new Set<number>());
  readonly loadingChildren = signal<Set<number>>(new Set<number>());

  readonly filtered = computed(() => {
    const term = this.search().trim().toLowerCase();
    if (!term) return this.lookups();
    return this.lookups().filter(l =>
      (l.lookupType ?? '').toLowerCase().includes(term)
      || (l.lookupValue ?? '').toLowerCase().includes(term));
  });

  ngOnInit(): void { this.load(); }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<any>>(`${API_BASE}/setting.json/appSetting`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message); return; }
        // Children are not part of this payload, so anything already open is refetched
        // rather than silently emptied.
        const open = new Set<number>(this.expanded());
        this.lookups.set(response.data?.lookupDatas ?? []);
        this.expanded.set(new Set<number>());
        open.forEach((id: number) => {
          const row = this.lookups().find(l => l.lookupId === id);
          if (row) this.toggle(row);
        });
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load lookups.');
      },
    });
  }

  /**
   * appSetting returns parents only. The screen expected a children array that is never
   * there, so expanding a row did nothing and every entry count read zero. Children are
   * fetched on first open and kept.
   */
  toggle(lookup: LookupData): void {
    const id = lookup.lookupId!;
    const isOpen = this.expanded().has(id);
    this.expanded.update(set => {
      const next = new Set(set);
      isOpen ? next.delete(id) : next.add(id);
      return next;
    });
    if (isOpen || lookup.children) return;

    this.loadingChildren.update(set => new Set(set).add(id));
    this.http.get<ApiResponse<any>>(`${API_BASE}/setting.json/fetchSubLookupByParentId`,
      { params: { parentLookUpId: id } }).subscribe({
      next: response => {
        this.loadingChildren.update(set => { const n = new Set(set); n.delete(id); return n; });
        if (response.status !== API_SUCCESS) return;
        const children = response.data?.lookupDatas ?? [];
        this.lookups.update(list => list.map(l =>
          l.lookupId === id ? { ...l, children, childCount: children.length } : l));
      },
      error: () => {
        this.loadingChildren.update(set => { const n = new Set(set); n.delete(id); return n; });
        this.toast.error('Could not load the entries under that lookup.');
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

  private refreshChildren(parent: LookupData): void {
    this.lookups.update(list => list.map(l =>
      l.lookupId === parent.lookupId ? { ...l, children: undefined } : l));
    this.expanded.update(set => { const n = new Set(set); n.delete(parent.lookupId!); return n; });
    const row = this.lookups().find(l => l.lookupId === parent.lookupId);
    if (row) this.toggle(row);
  }

  entryCount(lookup: LookupData): string {
    if (lookup.children) return String(lookup.children.length);
    // Unknown until the row is opened; claiming zero was the old bug.
    return '—';
  }
}
