import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { roleLabel } from '../../../core/auth/auth.models';
import { Icon } from '../../../shared/ui/icon';
import { TableShell } from '../../../shared/ui/data-table';
import { StatTile } from '../../../shared/ui/stat-tile';
import { ToastService } from '../../../shared/ui/toast.service';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { capTitle } from '../../../shared/ui/long-text';
import { AssistantApi } from '../assistant/assistant.api';
import { ToolChange, ToolDef, allowedTools, ioOf, serviceOf, setByWords, toolState } from '../assistant/assistant.model';
import { askReason } from '../../../shared/ui/reason';
import { PageHeader } from '../../../shared/ui/page-header';
import { ManagedBanner } from '../../../shared/ui/managed-banner';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { createTableSort } from '../../../shared/ui/sort';
import { SortHeader } from '../../../shared/ui/sort-header';
import { InlineStatus, createLoadState } from '../../../shared/ui/loading';

/**
 * AI › Tool Registry (MIG-252): the only operations the AI Assistant may request (ai-service's
 * tools/list). Each row says which service it calls, what goes in and comes out, who may use it,
 * whether it asks first, whether it is on here -- Blocked with the reason when the platform or the
 * person's role rules it out -- and when it was last called (tools/list says, MIG-317). A workspace
 * administrator switches a tool on or off for the workspace (tools/setEnabled), or puts a switched
 * tool back to its default; a blocked tool's switch cannot move.
 *
 * Tools are switched per workspace, and a platform administrator has none of its own: it picks the workspace first
 * (as on Access profiles), and every call names it. Without that, tools/list refused it and the page looked empty.
 *
 * Owner item #15: a platform administrator controls each tool for the chosen workspace -- Default, Enabled, Disabled or
 * Blocked (tools/platformState). Enabled and disabled are the workspace's switch, set by the platform; Blocked is the
 * platform's alone: the workspace's administrator sees it locked with who blocked it and why, and cannot switch it on.
 * Every row says its effective state and who set it; Recent changes lists the audit (tools/history).
 */
@Component({
  selector: 'app-tool-registry',
  imports: [WorkspaceSelect, RefreshButton, PageHeader, SortHeader, InlineStatus, Icon, TableShell, StatTile, ServerTimePipe, RouterLink, ManagedBanner],
  templateUrl: './tool-registry.html',
  styles: `
    .tool-group th { background: var(--surface-sunken); text-align: left; padding: 0.4rem 1rem; text-transform: none; letter-spacing: 0;
      border-bottom: 1px solid var(--border-subtle); }
    .tool-group-title { font-size: 0.8125rem; font-weight: 600; color: var(--text-primary); }
    .tool-group-count { margin-left: 0.375rem; font-size: 0.75rem; color: var(--text-muted); font-variant-numeric: tabular-nums; }
    .tool-group-sub { margin-left: 0.75rem; font-size: 0.75rem; font-weight: 400; color: var(--text-muted); }
    .tool-group:hover { background: none; }
  `,
})
export class ToolRegistry implements OnInit {
  private readonly api = inject(AssistantApi);
  private readonly auth = inject(AuthService);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);

  /** Owner item #15: the switches' and blocks' audit, newest first (administrators). */
  readonly changes = signal<ToolChange[]>([]);

  readonly tools = signal<ToolDef[]>([]);
  readonly busy = signal<string | null>(null);

  readonly search = signal('');
  readonly kindFilter = signal('');
  readonly stateFilter = signal('');
  readonly canSwitch = computed(() => this.auth.canManageAgents());

  readonly canPickTenant = computed(() => this.auth.isPlatformAdmin());
  readonly tenantId = signal<number | null>(inject(WorkspaceDirectory).remembered());
  readonly needsWorkspace = computed(() => this.canPickTenant() && !this.tenantId());

  /**
   * The list's read (owner 2026-10-27): loading from the start unless a platform administrator has not picked a
   * workspace yet (then nothing is read and the table asks for one), so the tiles never show 0 before the answer.
   */
  readonly listState = createLoadState(!this.needsWorkspace());
  readonly loading = this.listState.loading;
  readonly error = this.listState.error;
  /** The tiles wait for the first answer for this workspace; picking another workspace empties them until it comes. */
  readonly tilesLoading = computed(() => !this.needsWorkspace() && this.loading() && !this.tools().length);
  readonly tilesFailed = computed(() => !!this.error() && !this.tools().length);
  /** The Recent changes audit's read: its failure used to look the same as "nothing changed". */
  readonly changesState = createLoadState(false);

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    return this.tools().filter(t =>
      (!this.kindFilter() || t.kind === this.kindFilter())
      && (!this.stateFilter() || toolState(t).label === this.stateFilter())
      && (!q || `${t.name} ${t.title} ${t.description ?? ''}`.toLowerCase().includes(q)));
  });
  /** UX final TL1: the shown tools by kind, Reads first, each group only when it has a tool. */
  readonly groups = computed(() => {
    const list = this.filtered();
    return [
      { kind: 'read', label: 'Reads', sub: 'Look things up; never change anything.', tools: list.filter(t => t.kind !== 'write') },
      { kind: 'write', label: 'Writes', sub: 'Run, save or delete something in the workspace.', tools: list.filter(t => t.kind === 'write') },
    ].filter(g => g.tools.length);
  });
  /**
   * Owner 2026-10-27: every column with a value sorts, inside its group (Reads stay above Writes); the rows keep the
   * registry's order until a heading is picked.
   */
  readonly sort = createTableSort<ToolDef>({
    id: 'ai-tools',
    columns: {
      tool: t => t.title,
      service: t => serviceOf(t),
      io: t => ioOf(t).input,
      permission: t => roleLabel(t.requiredRole),
      asksFirst: { value: t => t.requiresConfirmation, kind: 'bool' },
      enabled: { value: t => toolState(t).label, kind: 'status' },
      lastUsed: { value: t => t.lastUsedAt, kind: 'date' },
    },
  });
  readonly sortedGroups = computed(() => this.groups().map(g => ({ ...g, tools: this.sort.apply(g.tools) })));
  readonly hasFilters = computed(() => !!this.search().trim() || !!this.kindFilter() || !!this.stateFilter());

  readonly summary = computed(() => {
    const list = this.tools();
    return {
      total: list.length,
      allowed: allowedTools(list).length,
      askFirst: list.filter(t => t.requiresConfirmation).length,
      blocked: list.filter(t => toolState(t).label === 'Blocked').length,
      platformBlocked: list.filter(t => t.blocked).length,
    };
  });

  ngOnInit(): void {
    if (this.canPickTenant()) {
      if (this.tenantId()) this.load();
      return;
    }
    this.load();
  }

  pickTenant(value: string): void {
    const id = Number(value);
    this.tenantId.set(Number.isFinite(id) && id > 0 ? id : null);
    this.tools.set([]);
    this.changes.set([]);
    if (this.tenantId()) this.load();
  }

  load(): void {
    if (this.needsWorkspace()) return;
    // A reply for a workspace picked away from must not fill the new one's list.
    const asked = this.tenantId();
    this.listState.start();
    this.api.tools(asked ?? undefined).subscribe({
      next: r => {
        if (this.tenantId() !== asked) return;
        if (r.status !== API_SUCCESS) { this.listState.fail(r, 'The tools could not be read.'); return; }
        this.tools.set(r.data ?? []);
        this.listState.done();
        this.loadChanges();
      },
      error: err => { if (this.tenantId() === asked) this.listState.fail(err, 'The tools could not be read.'); },
    });
  }

  /** The audit of the workspace's switches and blocks: administrators only (tools/history answers 403 to anyone else). */
  loadChanges(): void {
    if (!this.canSwitch()) return;
    const asked = this.tenantId();
    this.changesState.start();
    this.api.toolHistory(null, asked ?? undefined).subscribe({
      next: r => {
        if (this.tenantId() !== asked) return;
        if (r.status !== API_SUCCESS) { this.changesState.fail(r, 'The recent changes could not be read.'); return; }
        this.changes.set((r.data ?? []).slice(0, 12));
        this.changesState.done();
      },
      error: err => { if (this.tenantId() === asked) this.changesState.fail(err, 'The recent changes could not be read.'); },
    });
  }

  /** Owner item #15: the platform's control over the tool in the chosen workspace, as the select shows it. */
  platformValue(t: ToolDef): string {
    if (t.blocked) return 'blocked';
    if (t.switchedInWorkspace && t.switchedByRole === 'PLATFORM_ADMIN') return t.enabledInWorkspace ? 'enabled' : 'disabled';
    return 'default';
  }

  /** A platform administrator sets Default, Enabled, Disabled or Blocked; a block asks why (optional, shown to the workspace). */
  async setPlatform(t: ToolDef, select: HTMLSelectElement): Promise<void> {
    const state = select.value as 'enabled' | 'disabled' | 'blocked' | 'default';
    const tenant = this.tenantId();
    if (!tenant) return;
    let reason: string | null = null;
    if (state === 'blocked') {
      reason = await askReason(this.dialog, {
        title: `Block ${t.title} for this workspace?`,
        subtitle: 'The workspace cannot use it, and its administrator cannot switch it on, until a platform administrator unblocks it.',
        label: 'Why (shown to the workspace)', placeholder: 'e.g. Under review for this customer', confirmLabel: 'Block tool', danger: true,
      });
      if (reason === null) { select.value = this.platformValue(t); return; }
    }
    this.busy.set(t.name);
    this.api.setPlatformState(t.name, state, tenant, reason).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status !== API_SUCCESS) { select.value = this.platformValue(t); this.toast.error(r.message); return; }
        this.toast.success(r.message);
        this.refresh();
        this.loadChanges();
      },
      error: err => { this.busy.set(null); select.value = this.platformValue(t); this.toast.error(err?.error?.message || 'The tool could not be changed.'); },
    });
  }

  /** Who set the tool's state here, and when -- the block's, else the switch's; '' for the default. */
  setBy(t: ToolDef): { who: string; at: string | null } | null {
    if (t.blocked) return { who: setByWords(t.blockedByName, t.blockedBy, 'PLATFORM_ADMIN'), at: t.blockedAt ?? null };
    if (t.switchedInWorkspace) return { who: setByWords(t.switchedByName, t.switchedBy, t.switchedByRole), at: t.switchedAt ?? null };
    return null;
  }

  changeWords(c: ToolChange): string {
    const what = c.action === 'block' ? 'blocked' : c.action === 'enable' ? 'switched on' : c.action === 'disable' ? 'switched off'
      : c.action === 'default' ? 'put back to its default' : c.action;
    return `${c.toolName} ${what}`;
  }

  changeBy(c: ToolChange): string { return setByWords(c.byName, c.by, c.byRole); }

  /**
   * The list again, quietly, after a switch moved: whether the person may use a tool (youMayUse) is the server's to say,
   * and a tool switched back on was "Blocked" until the page was reloaded.
   */
  private refresh(): void {
    this.api.tools(this.tenantId() ?? undefined).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.tools.set(r.data ?? []); this.loadChanges(); },
      error: () => undefined,
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
        this.refresh();
      },
      error: err => { this.busy.set(null); box.checked = !enabled; this.toast.error(err?.error?.message || 'The tool could not be switched.'); },
    });
  }

  /** Takes the workspace's switch away: the tool is on by default again. */
  reset(t: ToolDef): void {
    this.busy.set(t.name);
    const tenant = this.tenantId();
    (tenant ? this.api.setEnabled(t.name, null, tenant) : this.api.setEnabled(t.name, null)).subscribe({
      next: r => {
        this.busy.set(null);
        if (r.status !== API_SUCCESS) { this.toast.error(r.message); return; }
        this.tools.update(list => list.map(x => (x.name === t.name ? { ...x, enabledInWorkspace: true, switchedInWorkspace: false } : x)));
        this.toast.success(r.message);
        this.refresh();
      },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'The tool could not be put back to its default.'); },
    });
  }

  state(t: ToolDef) { return toolState(t); }
  service(t: ToolDef): string { return serviceOf(t); }
  io(t: ToolDef) { return ioOf(t); }
  role(t: ToolDef): string { return roleLabel(t.requiredRole); }
  tip(text: string | null | undefined): string { return capTitle(text); }
}
