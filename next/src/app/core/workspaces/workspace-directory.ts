import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { catchError, map, shareReplay, tap } from 'rxjs/operators';
import { API_BASE, API_SUCCESS, ApiResponse } from '../api/api.config';
import { AuthService } from '../auth/auth.service';

/** A workspace as the selector needs it (Identity's tenant.json/listTenants row, which carries more). */
export interface WorkspaceOption {
  tenantId: number;
  tenantName: string;
  tenantCode?: string | null;
  status?: string | null;
  managementMode?: string | null;
  /** MIG-336: the workspace a sandbox belongs to; null for a workspace that is not a sandbox (never billed when set). */
  sandboxOf?: number | null;
}

const CHOSEN_KEY = 'etl_workspace_choice';
const RECENT_KEY = 'etl_workspace_recent';
const RECENT_MAX = 5;

function read(key: string): string | null {
  try { return sessionStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null): void {
  try { if (value === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, value); } catch { /* private window */ }
}

/** How each workspace is named in a list: two that share a name carry their ids, or they read as one. */
export function workspaceNames(tenants: { tenantId: number; tenantName: string }[]): Map<number, string> {
  const key = (n: string) => (n ?? '').trim().toLowerCase();
  const seen = new Map<string, number>();
  for (const t of tenants) seen.set(key(t.tenantName), (seen.get(key(t.tenantName)) ?? 0) + 1);
  return new Map(tenants.map(t => {
    const name = (t.tenantName ?? '').trim() || `Workspace ${t.tenantId}`;
    return [t.tenantId, (seen.get(key(t.tenantName)) ?? 0) > 1 ? `${name} (#${t.tenantId})` : name];
  }));
}

/**
 * Owner #5 (2026-10-19): the platform administrator's workspaces, for the one workspace selector every screen uses
 * (shared/ui/workspace-select.ts). Read once per session from Identity's tenant.json/listTenants and shared by every
 * screen; the choice and the recently picked workspaces are kept for the session (sessionStorage), so the selector shows
 * the same workspace on the next screen. A workspace administrator never sees the selector and this reads nothing for them.
 */
@Injectable({ providedIn: 'root' })
export class WorkspaceDirectory {
  /** Optional: a screen's unit test that renders the selector without an HttpClient reads no list. */
  private readonly http = inject(HttpClient, { optional: true });
  private readonly auth = inject(AuthService);
  private request$: Observable<WorkspaceOption[]> | null = null;

  readonly workspaces = signal<WorkspaceOption[]>([]);
  readonly loaded = signal(false);
  readonly error = signal('');
  /** The workspace last picked in this session, on any screen; null for none (or "All workspaces"). */
  readonly chosen = signal<number | null>(this.readChosen());
  /** The workspaces picked lately, newest first. */
  readonly recent = signal<number[]>(this.readRecent());
  readonly names = computed(() => workspaceNames(this.workspaces()));
  /** Whether this reader picks workspaces at all: a platform administrator in their own session. */
  readonly picks = computed(() => {
    const auth = this.auth as Partial<AuthService>;
    const platform = typeof auth.isPlatformAdmin === 'function' && auth.isPlatformAdmin();
    const managed = typeof auth.isManagedSession === 'function' && auth.isManagedSession();
    return !!platform && !managed;
  });

  /** The list, read once and shared; empty for anyone who does not pick workspaces. */
  load(): Observable<WorkspaceOption[]> {
    if (!this.picks() || !this.http) return of([]);
    if (this.loaded()) return of(this.workspaces());
    if (!this.request$) {
      this.request$ = this.http.get<ApiResponse<WorkspaceOption[]>>(`${API_BASE}/tenant.json/listTenants`).pipe(
        map(r => (r?.status === API_SUCCESS ? (r.data ?? []) : [])),
        tap(list => {
          this.workspaces.set(list.map(t => ({ tenantId: t.tenantId, tenantName: t.tenantName, tenantCode: t.tenantCode, status: t.status,
            managementMode: t.managementMode, sandboxOf: t.sandboxOf ?? null })));
          this.loaded.set(true);
          this.error.set('');
        }),
        catchError(() => {
          this.error.set('The workspaces could not be read.');
          this.request$ = null;
          return of([] as WorkspaceOption[]);
        }),
        shareReplay(1),
      );
    }
    return this.request$;
  }

  /** Read the list again (a workspace was added or renamed). */
  refresh(): Observable<WorkspaceOption[]> {
    this.loaded.set(false);
    this.request$ = null;
    return this.load();
  }

  /** The name a workspace is shown by. */
  nameOf(tenantId: number | null | undefined): string {
    if (tenantId == null) return '';
    return this.names().get(tenantId) ?? `Workspace ${tenantId}`;
  }

  /** The choice a screen opens with: the session's, or none. */
  remembered(): number | null {
    return this.picks() ? this.chosen() : null;
  }

  /** A pick on any screen: kept for the session and put first among the recent ones. */
  choose(tenantId: number | null): void {
    this.chosen.set(tenantId);
    write(CHOSEN_KEY, tenantId === null ? null : String(tenantId));
    if (tenantId !== null) {
      const next = [tenantId, ...this.recent().filter(id => id !== tenantId)].slice(0, RECENT_MAX);
      this.recent.set(next);
      write(RECENT_KEY, JSON.stringify(next));
    }
  }

  private readChosen(): number | null {
    const raw = Number(read(CHOSEN_KEY));
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  }

  private readRecent(): number[] {
    try {
      const list = JSON.parse(read(RECENT_KEY) ?? '[]');
      return Array.isArray(list) ? list.filter(n => Number.isFinite(n) && n > 0).slice(0, RECENT_MAX) : [];
    } catch {
      return [];
    }
  }
}
