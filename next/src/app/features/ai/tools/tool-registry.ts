import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { roleLabel } from '../../../core/auth/auth.models';
import { Combobox } from '../../../shared/ui/combobox';
import { Icon } from '../../../shared/ui/icon';
import { TableShell } from '../../../shared/ui/data-table';
import { StatTile } from '../../../shared/ui/stat-tile';
import { ToastService } from '../../../shared/ui/toast.service';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { capTitle } from '../../../shared/ui/long-text';
import { AssistantApi } from '../assistant/assistant.api';
import { ToolCall, ToolDef, allowedTools, ioOf, lastUsedByTool, serviceOf, toolState } from '../assistant/assistant.model';

/** How many of the newest runs are read for "Last used": tools/list does not say, so their traces do. */
const RUNS_READ = 25;

/**
 * AI › Tool Registry (MIG-252): the only operations the AI Assistant may request (ai-service's
 * tools/list). Each row says which service it calls, what goes in and comes out, who may use it,
 * whether it asks first, whether it is on here -- Blocked with the reason when the platform or the
 * person's role rules it out -- and when it was last called. A workspace administrator switches a
 * tool on or off for the workspace (tools/setEnabled); a blocked tool's switch cannot move.
 *
 * Tools are switched per workspace, and a platform administrator has none of its own: it picks the workspace first
 * (as on Access profiles), and every call names it. Without that, tools/list refused it and the page looked empty.
 */
@Component({
  selector: 'app-tool-registry',
  imports: [Icon, TableShell, StatTile, ServerTimePipe, RouterLink, Combobox],
  templateUrl: './tool-registry.html',
})
export class ToolRegistry implements OnInit {
  private readonly api = inject(AssistantApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);

  readonly tools = signal<ToolDef[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly lastUsed = signal<Record<string, string>>({});
  readonly busy = signal<string | null>(null);

  readonly search = signal('');
  readonly kindFilter = signal('');
  readonly stateFilter = signal('');
  readonly canSwitch = computed(() => this.auth.canManageAgents());

  readonly canPickTenant = computed(() => this.auth.isPlatformAdmin());
  readonly tenants = signal<{ tenantId: number; tenantName: string }[]>([]);
  readonly tenantId = signal<number | null>(null);
  readonly needsWorkspace = computed(() => this.canPickTenant() && !this.tenantId());
  readonly tenantOptions = computed(() => this.tenants().map(t => ({ value: String(t.tenantId), label: t.tenantName })));

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.tools().filter(t =>
      (!this.kindFilter() || t.kind === this.kindFilter())
      && (!this.stateFilter() || toolState(t).label === this.stateFilter())
      && (!q || `${t.name} ${t.title} ${t.description ?? ''}`.toLowerCase().includes(q)));
  });
  readonly hasFilters = computed(() => !!this.search().trim() || !!this.kindFilter() || !!this.stateFilter());

  readonly summary = computed(() => {
    const list = this.tools();
    return {
      total: list.length,
      allowed: allowedTools(list).length,
      askFirst: list.filter(t => t.requiresConfirmation).length,
      blocked: list.filter(t => toolState(t).label === 'Blocked').length,
    };
  });

  ngOnInit(): void {
    if (this.canPickTenant()) {
      this.loading.set(false);
      this.api.workspaces().subscribe({
        next: r => this.tenants.set(r.status === API_SUCCESS ? r.data ?? [] : []),
        error: () => this.tenants.set([]),
      });
      return;
    }
    this.load();
  }

  pickTenant(value: string): void {
    const id = Number(value);
    this.tenantId.set(Number.isFinite(id) && id > 0 ? id : null);
    this.tools.set([]);
    this.lastUsed.set({});
    if (this.tenantId()) this.load();
  }

  load(): void {
    if (this.needsWorkspace()) return;
    this.loading.set(true);
    this.error.set('');
    this.api.tools(this.tenantId() ?? undefined).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) { this.error.set(r.message); return; }
        this.tools.set(r.data ?? []);
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'Could not load the tools.'); },
    });
    this.loadLastUsed();
  }

  /** The newest runs' traces, read side by side; a trace that fails to load just says nothing. */
  private loadLastUsed(): void {
    const tenant = this.tenantId() ?? undefined;
    this.api.runs(RUNS_READ, tenant).pipe(
      map(r => (r.status === API_SUCCESS ? r.data ?? [] : [])),
      catchError(() => of([])),
    ).subscribe(runs => {
      if (!runs.length) return;
      forkJoin(runs.map(run => this.api.trace(run.toolRunId, tenant).pipe(
        map(r => (r.status === API_SUCCESS ? r.data?.calls ?? [] : []) as ToolCall[]),
        catchError(() => of([] as ToolCall[])),
      ))).subscribe(traces => this.lastUsed.set(lastUsedByTool(traces)));
    });
  }

  clearFilters(): void { this.search.set(''); this.kindFilter.set(''); this.stateFilter.set(''); }

  /** Switches a tool here; a refusal puts the box back where it was. */
  toggle(t: ToolDef, box: HTMLInputElement): void {
    const enabled = box.checked;
    this.busy.set(t.name);
    const tenant = this.tenantId();
    (tenant ? this.api.setEnabled(t.name, enabled, tenant) : this.api.setEnabled(t.name, enabled)).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status !== API_SUCCESS) { box.checked = !enabled; this.toast.error(r.message); return; }
        this.tools.update(list => list.map(x => (x.name === t.name ? { ...x, enabledInWorkspace: enabled, switchedInWorkspace: true } : x)));
        this.toast.success(r.message);
      },
      error: err => { this.busy.set(null); box.checked = !enabled; this.toast.error(err?.error?.message || 'The tool could not be switched.'); },
    });
  }

  state(t: ToolDef) { return toolState(t); }
  service(t: ToolDef): string { return serviceOf(t); }
  io(t: ToolDef) { return ioOf(t); }
  role(t: ToolDef): string { return roleLabel(t.requiredRole); }
  tip(text: string | null | undefined): string { return capTitle(text); }
}
