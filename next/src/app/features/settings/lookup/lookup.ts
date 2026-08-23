import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { TableShell } from '../../../shared/ui/data-table';
import { Icon } from '../../../shared/ui/icon';

interface LookupData {
  lookupId: number;
  lookupType: string;
  lookupValue: string;
  description?: string;
  parentLookupId?: number;
  children?: LookupData[];
  encrypted?: boolean;
}

@Component({
  selector: 'app-lookup',
  imports: [Icon, TableShell],
  templateUrl: './lookup.html',
})
export class Lookup implements OnInit {
  private readonly http = inject(HttpClient);

  readonly lookups = signal<LookupData[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly search = signal('');
  readonly expanded = signal<Set<number>>(new Set());

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
        this.lookups.set(response.data?.lookupDatas ?? []);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load lookups.');
      },
    });
  }

  toggle(lookup: LookupData): void {
    if (!lookup.children?.length) return;
    this.expanded.update(set => {
      const next = new Set(set);
      next.has(lookup.lookupId) ? next.delete(lookup.lookupId) : next.add(lookup.lookupId);
      return next;
    });
  }
}
