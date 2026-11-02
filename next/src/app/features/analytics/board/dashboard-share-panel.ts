import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Team, TeamsApi } from '../../../core/teams/teams.api';
import { AdvancedOption, AdvancedSelect } from '../../../shared/ui/advanced-select';
import { Icon } from '../../../shared/ui/icon';
import { InlineStatus, createLoadState, loadErrorText } from '../../../shared/ui/loading';
import { Segmented, SegmentOption } from '../../../shared/ui/segmented';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { SidePanel } from '../../../shared/ui/side-panel';
import {
  AnalyticsService, Dashboard, DashboardAccessView, DashboardAudience, DashboardShare, DashboardShareAccess, SharePerson,
} from '../analytics.service';

/**
 * The board, and whether the reader may ask the server who it is for (fetchDashboardAccess is an Edit dashboards call at the
 * gateway): a reader with Saved Analyses alone reads the audience from the board itself.
 */
export interface DashboardSharePanelData { board: Dashboard; canAsk: boolean; }

/** "Shared with the Reviewer team and 2 people" -- a board's audience in a few words, for its card and its header. */
export function audienceWords(board: Pick<Dashboard, 'audience' | 'shares' | 'workspaceAccess'> | null | undefined): string {
  if (!board || board.audience !== 'SHARED') return 'Everyone in the workspace';
  const shares = board.shares ?? [];
  const teams = shares.filter(s => s.kind === 'TEAM');
  const people = shares.filter(s => s.kind === 'PERSON');
  if (!shares.length) return 'Only its owner and admins';
  const parts: string[] = [];
  if (teams.length === 1) parts.push(`the ${teams[0].name || 'team #' + teams[0].id} team`);
  else if (teams.length) parts.push(`${teams.length} teams`);
  if (people.length === 1 && !teams.length) parts.push(people[0].name || 'one person');
  else if (people.length) parts.push(`${people.length} ${people.length === 1 ? 'person' : 'people'}`);
  return 'Shared with ' + parts.join(' and ');
}

/**
 * Owner 2026-11-02 ("Dashboards showing to all users"): who a dashboard is for. Everyone in the workspace (view, or edit as
 * every board was), or chosen teams and people, each view or edit -- picked with the console's advanced select (teams and
 * people in one list). Its owner and the workspace administrators always see it and are the only ones who change this; the
 * server enforces it on every path (the list, opening a board, its tiles, exports, Pin to dashboard, the AI Assistant), so
 * this panel only says and sets it. Every change is kept in the board's history, shown below for whoever may change it.
 */
@Component({
  selector: 'app-dashboard-share-panel',
  imports: [SidePanel, Icon, AdvancedSelect, InlineStatus, Segmented, ServerTimePipe],
  styles: `
    .share-row { display: flex; align-items: center; gap: 0.625rem; padding: 0.5rem 0.25rem; border-bottom: 1px solid var(--border-subtle); min-width: 0; }
    .share-row:last-child { border-bottom: 0; }
    .share-glyph { display: inline-flex; align-items: center; justify-content: center; width: 1.9rem; height: 1.9rem; border-radius: 999px;
                   background: var(--surface-sunken); color: var(--text-secondary); flex-shrink: 0; }
    .share-access { width: 8.5rem; flex-shrink: 0; }
    .share-history li { display: flex; flex-direction: column; gap: 0.125rem; padding: 0.375rem 0; border-bottom: 1px solid var(--border-subtle); }
    .share-history li:last-child { border-bottom: 0; }
    .share-choice { display: flex; gap: 0.625rem; align-items: flex-start; padding: 0.625rem 0.75rem; border: 1px solid var(--border-subtle);
                    border-radius: var(--radius-md); cursor: pointer; }
    .share-choice.is-on { border-color: var(--accent-mark-strong); background: var(--accent-soft); }
    .share-choice input { margin-top: 0.2rem; }
  `,
  template: `
    <app-side-panel heading="Who can see this dashboard" [subtitle]="data.board.dashboardName" data-test="share-panel">
      <div class="flex flex-col gap-4 min-w-0">
        @if (state.error()) {
          <app-inline-status [error]="state.error()" (retry)="load()" />
        } @else if (state.loading()) {
          <app-inline-status [loading]="true" label="Reading who can see this dashboard…" />
        } @else {
          @if (!canManage()) {
            <p class="note-bar" role="note" data-test="share-read-only"><app-icon name="lock" size="0.95em" />
              Only its owner{{ ownerName() ? ' (' + ownerName() + ')' : '' }} or a workspace administrator changes who can see it.</p>
          }
          <!-- Not a fieldset: a size container inside one can lay out nothing in Chromium (the console's .form-lock rule). -->
          <div class="flex flex-col gap-2" role="radiogroup" aria-labelledby="share-audience-label">
            <span class="label" id="share-audience-label">Who can see it</span>
            @if (canManage() || audience() === 'WORKSPACE') {
            <label class="share-choice" [class.is-on]="audience() === 'WORKSPACE'" data-test="share-everyone">
              <input type="radio" name="share-audience" [checked]="audience() === 'WORKSPACE'" [disabled]="!canManage()" (change)="audience.set('WORKSPACE')" />
              <span class="min-w-0">
                <span class="font-medium flex items-center gap-1.5"><app-icon name="globe" size="0.95em" />Everyone in the workspace</span>
                <span class="block text-xs text-[color:var(--text-secondary)]">Every member who can open Dashboards finds it in the list.</span>
              </span>
            </label>
            }
            @if (canManage() || audience() === 'SHARED') {
            <label class="share-choice" [class.is-on]="audience() === 'SHARED'" data-test="share-chosen">
              <input type="radio" name="share-audience" [checked]="audience() === 'SHARED'" [disabled]="!canManage()" (change)="audience.set('SHARED')" />
              <span class="min-w-0">
                <span class="font-medium flex items-center gap-1.5"><app-icon name="lock" size="0.95em" />Only chosen teams and people</span>
                <span class="block text-xs text-[color:var(--text-secondary)]">Nobody else sees it: not in the list, not by its link, not through the AI Assistant.</span>
              </span>
            </label>
            }
          </div>

          @if (audience() === 'WORKSPACE') {
            <div class="flex flex-col gap-1">
              <span class="label">Everyone in the workspace can</span>
              @if (canManage()) {
                <app-segmented ariaLabel="What everyone in the workspace can do" [options]="accessOptions" [value]="workspaceAccess()"
                               (valueChange)="workspaceAccess.set($event)" data-test="share-workspace-access" />
              } @else {
                <span class="text-sm">{{ workspaceAccess() === 'EDIT' ? 'View and edit it' : 'View it' }}</span>
              }
              <p class="field-note text-[color:var(--text-muted)]">Changing a dashboard also needs the Edit dashboards page.</p>
            </div>
          } @else {
            @if (canManage()) {
            <div class="flex flex-col gap-1 min-w-0">
              <label class="label" for="share-add">Add a team or a person</label>
              <app-advanced-select id="share-add" class="w-full" [options]="addOptions()" [resetOnPick]="true" [disabled]="!canManage()"
                                   (picked)="add($event?.value ?? null)" placeholder="Search teams and people…" searchLabel="Search teams and people"
                                   searchPlaceholder="A team's or a person's name" [loading]="pickerState.loading()" loadingText="Loading teams and people…"
                                   emptyText="Everyone in the workspace is already here." ariaLabel="Add a team or a person" data-test="share-add" />
              <app-inline-status [error]="pickerState.error()" (retry)="loadPicker()" />
            </div>
            }
            <div class="flex flex-col min-w-0" role="list" aria-label="Shared with" data-test="share-list">
              <div class="share-row" role="listitem">
                <span class="share-glyph"><app-icon name="shield" size="0.95em" /></span>
                <span class="min-w-0 flex-1">
                  <span class="block text-sm font-medium truncate">{{ ownerName() || 'Its owner' }} and the workspace administrators</span>
                  <span class="block text-xs text-[color:var(--text-muted)]">Always see and change it</span>
                </span>
              </div>
              @for (s of shares(); track s.kind + s.id) {
                <div class="share-row" role="listitem" [attr.data-share]="s.kind + ':' + s.id">
                  <span class="share-glyph"><app-icon [name]="s.kind === 'TEAM' ? 'users' : 'user'" size="0.95em" /></span>
                  <span class="min-w-0 flex-1">
                    <span class="block text-sm font-medium truncate" [title]="nameOf(s)">{{ nameOf(s) }}</span>
                    <span class="block text-xs text-[color:var(--text-muted)] truncate">{{ s.kind === 'TEAM' ? teamFacts(s.id) : 'Person' }}</span>
                  </span>
                  @if (canManage()) {
                    <select class="input share-access" [value]="s.access" (change)="setAccess(s, $any($event.target).value)"
                            [attr.aria-label]="'What ' + nameOf(s) + ' can do'">
                      <option value="VIEW" [selected]="s.access === 'VIEW'">Can view</option>
                      <option value="EDIT" [selected]="s.access === 'EDIT'">Can edit</option>
                    </select>
                  } @else {
                    <span class="text-sm text-[color:var(--text-secondary)] shrink-0">{{ s.access === 'EDIT' ? 'Can edit' : 'Can view' }}</span>
                  }
                  @if (canManage()) {
                    <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-label]="'Remove ' + nameOf(s)" title="Remove" (click)="remove(s)">
                      <app-icon name="close" size="0.95em" /></button>
                  }
                </div>
              } @empty {
                <p class="text-sm text-[color:var(--text-muted)] py-2 m-0" data-test="share-empty">Not shared with anyone yet: only its owner and the workspace administrators see it.</p>
              }
            </div>
            @if (canManage()) {
            <p class="field-note text-[color:var(--text-muted)] m-0">"Can edit" changes its tiles, filters and theme (with the Edit dashboards page); only its owner or an administrator changes who can see it.</p>
            }
          }

          @if (history().length) {
            <details class="text-sm" data-test="share-history">
              <summary class="cursor-pointer select-none text-[color:var(--text-secondary)] w-fit">Changes to who can see it ({{ history().length }})</summary>
              <ul class="share-history list-none p-0 m-0 mt-1">
                @for (h of history(); track h.eventId) {
                  <li>
                    <span>{{ h.detail }}</span>
                    <span class="text-xs text-[color:var(--text-muted)]">{{ h.actorName || 'Someone' }} · {{ h.occurredAt | serverTime:'recent' }}</span>
                  </li>
                }
              </ul>
            </details>
          }
          @if (error()) { <p class="text-sm text-crit-500 m-0" role="alert" data-test="share-error">{{ error() }}</p> }
        }
      </div>
      <div foot class="flex items-center gap-2 w-full">
        <button type="button" class="btn btn-ghost btn-sm" (click)="ref.close()">{{ canManage() ? 'Cancel' : 'Close' }}</button>
        @if (canManage()) {
          <button type="button" class="btn btn-primary btn-sm ml-auto" [disabled]="saving() || !state.loaded() || !changed()" (click)="save()" data-test="share-save">
            <app-icon name="save" [busy]="saving()" />Save</button>
        }
      </div>
    </app-side-panel>
  `,
})
export class DashboardSharePanel implements OnInit {
  readonly ref = inject<DialogRef<DashboardAccessView | undefined, DashboardSharePanel>>(DialogRef);
  readonly data = inject<DashboardSharePanelData>(DIALOG_DATA);
  private readonly analytics = inject(AnalyticsService);
  private readonly teamsApi = inject(TeamsApi);

  readonly state = createLoadState();
  readonly pickerState = createLoadState(false);
  readonly view = signal<DashboardAccessView | null>(null);
  readonly audience = signal<DashboardAudience>(this.data.board.audience ?? 'WORKSPACE');
  readonly workspaceAccess = signal<DashboardShareAccess>(this.data.board.workspaceAccess ?? 'EDIT');
  readonly shares = signal<DashboardShare[]>([...(this.data.board.shares ?? [])]);
  readonly teams = signal<Team[]>([]);
  readonly people = signal<SharePerson[]>([]);
  readonly saving = signal(false);
  readonly error = signal('');

  readonly accessOptions: SegmentOption<DashboardShareAccess>[] = [
    { id: 'VIEW', label: 'View it', icon: 'eye' },
    { id: 'EDIT', label: 'View and edit it', icon: 'edit' },
  ];

  readonly canManage = computed(() => this.view()?.yourAccess === 'MANAGE');
  readonly ownerName = computed(() => this.view()?.owner?.name ?? this.data.board.createdByName ?? null);
  readonly history = computed(() => this.view()?.history ?? []);

  /** Teams first, then people, leaving out whoever is already chosen and the owner (who always sees it). */
  readonly addOptions = computed<AdvancedOption[]>(() => {
    const chosen = new Set(this.shares().map(s => s.kind + ':' + s.id));
    const owner = this.view()?.owner?.appUserId ?? null;
    const teams: AdvancedOption[] = this.teams().filter(t => t.status !== 'ARCHIVED' && !chosen.has('TEAM:' + t.teamId)).map(t => ({
      value: 'TEAM:' + t.teamId, label: t.name, group: 'Teams', keywords: t.description ?? '',
      description: `${t.memberCount} member${t.memberCount === 1 ? '' : 's'}${t.description ? ' · ' + t.description : ''}`,
    }));
    const people: AdvancedOption[] = this.people().filter(p => p.appUserId !== owner && !chosen.has('PERSON:' + p.appUserId)).map(p => ({
      value: 'PERSON:' + p.appUserId, label: p.fullName?.trim() || p.username || 'Person ' + p.appUserId, group: 'People',
      description: p.fullName?.trim() && p.username ? p.username : undefined, keywords: p.username ?? '',
    }));
    return [...teams, ...people];
  });

  /** Whether anything differs from what is stored -- Save says nothing new otherwise. */
  readonly changed = computed(() => {
    const v = this.view();
    if (!v) return false;
    if (v.audience !== this.audience()) return true;
    if (this.audience() === 'WORKSPACE') return v.workspaceAccess !== this.workspaceAccess();
    const key = (list: DashboardShare[]) => list.map(s => `${s.kind}:${s.id}:${s.access}`).sort().join('|');
    return key(v.shares ?? []) !== key(this.shares());
  });

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    const id = this.data.board.analyticsDashboardId;
    if (!id) return;
    if (!this.data.canAsk) {
      // Saved Analyses alone: the board already says who it is for; nobody without Edit dashboards changes it.
      const b = this.data.board;
      this.apply({ analyticsDashboardId: id, dashboardName: b.dashboardName, audience: b.audience ?? 'WORKSPACE',
        workspaceAccess: b.workspaceAccess ?? 'EDIT', shares: b.shares ?? [], owner: { appUserId: b.createdBy ?? null, name: b.createdByName ?? null },
        yourAccess: b.yourAccess === 'MANAGE' ? 'EDIT' : b.yourAccess ?? 'VIEW', history: [] });
      this.state.done();
      return;
    }
    this.state.start();
    this.analytics.fetchDashboardAccess(id).subscribe({
      next: r => {
        if (r?.status !== API_SUCCESS || !r.data) { this.state.fail(r, 'Who can see this dashboard could not be read.'); return; }
        this.apply(r.data);
        this.state.done();
        if (r.data.yourAccess === 'MANAGE') this.loadPicker();
      },
      error: e => this.state.fail(e, 'Who can see this dashboard could not be read.'),
    });
  }

  loadPicker(): void {
    this.pickerState.start();
    let left = 2;
    const settle = () => { if (--left === 0 && !this.pickerState.error()) this.pickerState.done(); };
    this.teamsApi.list().subscribe({
      next: r => { this.teams.set(r?.data ?? []); settle(); },
      error: e => this.pickerState.fail(e, 'The teams could not be read.'),
    });
    this.analytics.fetchSharePeople().subscribe({
      next: r => {
        if (r?.status !== API_SUCCESS) { this.pickerState.fail(r, 'The people could not be read.'); return; }
        this.people.set(r.data ?? []);
        settle();
      },
      error: e => this.pickerState.fail(e, 'The people could not be read.'),
    });
  }

  private apply(v: DashboardAccessView): void {
    this.view.set(v);
    this.audience.set(v.audience);
    this.workspaceAccess.set(v.workspaceAccess);
    this.shares.set([...(v.shares ?? [])]);
  }

  add(value: string | null): void {
    if (!value) return;
    const [kind, raw] = value.split(':');
    const id = Number(raw);
    if ((kind !== 'TEAM' && kind !== 'PERSON') || !id) return;
    const name = kind === 'TEAM' ? this.teams().find(t => t.teamId === id)?.name
      : (() => { const p = this.people().find(x => x.appUserId === id); return p?.fullName?.trim() || p?.username; })();
    this.shares.update(list => list.some(s => s.kind === kind && s.id === id) ? list
      : [...list, { kind, id, name: name ?? null, access: 'VIEW' }]);
  }

  remove(share: DashboardShare): void {
    this.shares.update(list => list.filter(s => !(s.kind === share.kind && s.id === share.id)));
  }

  setAccess(share: DashboardShare, access: DashboardShareAccess): void {
    this.shares.update(list => list.map(s => s.kind === share.kind && s.id === share.id ? { ...s, access } : s));
  }

  nameOf(s: DashboardShare): string {
    if (s.kind === 'TEAM') return 'The ' + (this.teams().find(t => t.teamId === s.id)?.name ?? s.name ?? '#' + s.id) + ' team';
    return s.name || 'Person #' + s.id;
  }

  teamFacts(teamId: number): string {
    const t = this.teams().find(x => x.teamId === teamId);
    return t ? `Team · ${t.memberCount} member${t.memberCount === 1 ? '' : 's'}` : 'Team';
  }

  save(): void {
    const id = this.data.board.analyticsDashboardId;
    if (!id || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.analytics.saveDashboardAccess(id, this.audience(), this.workspaceAccess(), this.shares()).subscribe({
      next: r => {
        this.saving.set(false);
        if (r?.status !== API_SUCCESS || !r.data) { this.error.set(r?.message || 'Who can see it could not be saved.'); return; }
        this.ref.close({ ...r.data, history: r.data.history ?? [] });
      },
      error: e => {
        this.saving.set(false);
        this.error.set(loadErrorText(e, 'Who can see it could not be saved.'));
      },
    });
  }
}
