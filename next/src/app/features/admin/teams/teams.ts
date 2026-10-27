import { Component, OnInit, TemplateRef, computed, inject, signal, viewChild } from '@angular/core';
import { Dialog, DialogRef } from '@angular/cdk/dialog';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { Team, TeamMember, TeamRole, TeamsApi, refusal } from '../../../core/teams/teams.api';
import { Colleague, WorkflowsApi } from '../../workflows/workflows.api';
import { Avatar } from '../../../shared/ui/avatar';
import { confirmWith } from '../../../shared/ui/confirm';
import { TableShell } from '../../../shared/ui/data-table';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { createPager } from '../../../shared/ui/pager';
import { Pagination } from '../../../shared/ui/pagination';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { SidePanel, sidePanelConfig } from '../../../shared/ui/side-panel';
import { StatStrip, StatStripItem } from '../../../shared/ui/stat-strip';
import { ToastService } from '../../../shared/ui/toast.service';
import { MAX_WORKFLOWS, TeamUsage, TeamUsageReader, TeamUse, USE_LABELS, usageSummary } from './teams-usage';

/** The members drawn in a row's avatar stack; the rest are "+N". */
const STACK = 4;

/**
 * Administration > Teams (F4, MIG-401): the people of a workspace who work together. A team is what a workflow task, an
 * Approval step, a run's review, an alert rule or a Report Studio approval goes to; a person is in many teams. Every member
 * reads them here; an administrator makes, renames and archives a team and names its leads; a team's lead adds and removes
 * its members (owner T-Q3). Teams open no pages (T-Q2): Page access does that. Groups (access profiles named as reviewers)
 * became teams of the same people on 2026-10-21 (T-Q1).
 *
 * UX2 (owner 2026-10-26, "doesn't match the rest of the UI"): laid out as Users and Page access are -- the page header, a
 * stat strip, a table shell with search and filters (lead, member, status), a row per team (its lead, its members as an
 * avatar stack, where it is used, when it was made), pagination; a row opens the team in a side panel over the right, where
 * it is read and changed. Every rule is as before: an administrator makes, renames and archives teams and names leads; a
 * lead adds and removes members only; the server decides each change.
 */
@Component({
  selector: 'app-teams',
  imports: [PageHeader, RefreshButton, StatStrip, Icon, TableShell, Pagination, Avatar, SidePanel, RouterLink, ServerTimePipe],
  templateUrl: './teams.html',
  styles: `
    /* A row opens its team: the whole row is the target, the name is its keyboard button. */
    tr.row-click { cursor: pointer; }
    tr.row-click.is-selected > td { background: var(--pill-brand-bg); }
    .link-row { color: inherit; background: none; border: 0; padding: 0; cursor: pointer; max-width: 100%; }
    .link-row:hover { text-decoration: underline; text-underline-offset: 2px; }
    .link-row:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; border-radius: var(--radius-sm); }
    /* Members as overlapping faces, each ringed in the card's colour so they read apart in both themes. */
    .avatar-stack { display: inline-flex; align-items: center; }
    .avatar-stack > app-avatar { display: inline-flex; border-radius: 9999px; box-shadow: 0 0 0 2px var(--surface-raised); }
    .avatar-stack > app-avatar + app-avatar { margin-left: -0.375rem; }
  `,
})
export class Teams implements OnInit {
  private readonly api = inject(TeamsApi);
  private readonly workflows = inject(WorkflowsApi);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);
  private readonly usageReader = inject(TeamUsageReader);
  readonly auth = inject(AuthService);
  private readonly panelTpl = viewChild.required<TemplateRef<unknown>>('teamPanel');
  private panelRef: DialogRef<unknown> | null = null;
  readonly panelOpen = signal(false);

  /**
   * The workspace's administrator (a managed session is one too). The platform administrator's own sign-in never opens this
   * page: a workspace's teams are its data (ZT-M16; the route's workspaceData card).
   */
  readonly admin = computed(() => this.auth.isTenantAdmin());

  readonly teams = signal<Team[]>([]);
  readonly people = signal<Colleague[]>([]);
  readonly loading = signal(false);
  readonly busy = signal(false);
  readonly withArchived = signal(false);
  readonly selectedId = signal<number | null>(null);
  readonly creating = signal(false);
  readonly draftName = signal('');
  readonly draftDescription = signal('');
  readonly editing = signal(false);
  readonly addPerson = signal<number | null>(null);
  readonly addRole = signal<TeamRole>('MEMBER');
  readonly error = signal('');

  // ---- search and filters (UX2) ------------------------------------------------------------------------------
  readonly search = signal('');
  /** A lead's appUserId, or '' for any; 'none' for teams without a lead. */
  readonly leadFilter = signal('');
  readonly memberFilter = signal('');
  /** ACTIVE (the default), ARCHIVED or '' for both; archived teams are an administrator's to list. */
  readonly statusFilter = signal<'ACTIVE' | 'ARCHIVED' | ''>('ACTIVE');
  readonly pager = createPager<Team>();
  readonly usage = signal<TeamUsage | null>(null);
  readonly useLabels = USE_LABELS;
  readonly maxWorkflows = MAX_WORKFLOWS;
  readonly stack = STACK;

  /** Everyone who leads or is in a team now, for the filters: by name. */
  private peopleIn(role: TeamRole | null): { id: number; name: string }[] {
    const seen = new Map<number, string>();
    for (const t of this.teams()) for (const m of t.members) if (!role || m.teamRole === role) seen.set(m.appUserId, this.nameOf(m));
    return [...seen].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }
  readonly leadOptions = computed(() => this.peopleIn('LEAD'));
  readonly memberOptions = computed(() => this.peopleIn(null));

  readonly filtered = computed(() => {
    const q = this.search().trim().toLowerCase();
    const lead = this.leadFilter();
    const member = this.memberFilter();
    const status = this.statusFilter();
    return this.teams().filter(t => {
      if (status && t.status !== status) return false;
      if (lead === 'none' && t.leadCount > 0) return false;
      if (lead && lead !== 'none' && !t.members.some(m => m.teamRole === 'LEAD' && String(m.appUserId) === lead)) return false;
      if (member && !t.members.some(m => String(m.appUserId) === member)) return false;
      if (!q) return true;
      return t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q)
        || t.members.some(m => this.nameOf(m).toLowerCase().includes(q) || (m.username ?? '').toLowerCase().includes(q));
    }).sort((a, b) => (a.status === b.status ? a.name.localeCompare(b.name) : a.status === 'ACTIVE' ? -1 : 1));
  });
  readonly paged = computed(() => this.pager.slice(this.filtered()));
  readonly hasFilters = computed(() => !!(this.search().trim() || this.leadFilter() || this.memberFilter() || this.statusFilter() !== 'ACTIVE'));

  readonly selected = computed(() => this.teams().find(t => t.teamId === this.selectedId()) ?? null);
  /** Whether the caller leads the team: they add and remove its members, never its leads. */
  readonly leads = computed(() => {
    const me = this.auth.user()?.appUserId;
    return !!this.selected()?.members.some(m => m.appUserId === me && m.teamRole === 'LEAD');
  });
  readonly mayChangeMembers = computed(() => this.selected()?.status === 'ACTIVE' && (this.admin() || this.leads()));
  /** The workspace's people not yet in the selected team. */
  readonly addable = computed(() => {
    const team = this.selected();
    const inIt = new Set((team?.members ?? []).map(m => m.appUserId));
    return this.people().filter(p => !inIt.has(p.userId));
  });

  readonly cards = computed<StatStripItem[]>(() => {
    const s = this.stats();
    return [
      { label: 'Teams', value: s.teams, icon: 'users', tone: 'info', foot: 'in this workspace', quiet: !s.teams },
      { label: 'People in teams', value: s.people, icon: 'user', tone: 'info', foot: 'each counted once', quiet: !s.people },
      { label: 'Leads', value: s.leads, icon: 'shield', tone: 'info', foot: 'add and remove members', quiet: !s.leads },
      { label: 'Without a lead', value: s.unled, icon: 'alert', tone: s.unled ? 'warn' : 'muted',
        foot: s.unled ? 'only an administrator changes them' : 'every team has one', quiet: !s.unled,
        clickable: true, pressed: this.leadFilter() === 'none',
        hint: 'Show only the teams without a lead' },
    ];
  });

  readonly stats = computed(() => {
    const active = this.teams().filter(t => t.status === 'ACTIVE');
    const people = new Set<number>();
    active.forEach(t => t.members.forEach(m => people.add(m.appUserId)));
    return {
      teams: active.length,
      people: people.size,
      leads: active.reduce((n, t) => n + t.leadCount, 0),
      unled: active.filter(t => t.leadCount === 0).length,
    };
  });

  ngOnInit(): void {
    this.load('cached');
  }

  /**
   * The teams, and where they are used: on opening a reading from the last minute is reused, Refresh reads again, and
   * listing archived teams leaves it alone (it does not depend on them).
   */
  load(usage: 'cached' | 'fresh' | 'skip' = 'fresh'): void {
    this.loading.set(true);
    this.error.set('');
    this.api.list(null, this.admin() && this.withArchived()).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) {
          this.error.set(r.message || 'The teams could not be read.');
          this.toast.error(r.message || 'The teams could not be read.');
          return;
        }
        const teams = r.data ?? [];
        this.teams.set(teams);
        // A link names a team (?team=, from a person's page): it opens in the panel, once.
        const linked = Number(this.route.snapshot.queryParamMap.get('team'));
        if (!this.deepLinked && teams.some(t => t.teamId === linked)) {
          this.deepLinked = true;
          this.open(teams.find(t => t.teamId === linked)!);
        } else if (this.panelOpen() && !this.creating() && !teams.some(t => t.teamId === this.selectedId())) {
          this.closePanel();
        }
      },
      error: e => {
        this.loading.set(false);
        this.error.set(refusal(e, 'The teams could not be read.'));
        this.toast.error(refusal(e, 'The teams could not be read.'));
      },
    });
    if (usage !== 'skip') this.usageReader.read(usage === 'fresh').subscribe({ next: u => this.usage.set(u), error: () => this.usage.set(null) });
    this.workflows.colleagues().subscribe({
      next: r => this.people.set(r.status === API_SUCCESS ? r.data ?? [] : []),
      error: () => this.people.set([]),
    });
  }

  private deepLinked = false;

  toggleArchived(): void {
    this.withArchived.set(!this.withArchived());
    this.load('skip');
  }

  /** Archived teams are listed only when asked for (an administrator's). */
  setStatus(value: string): void {
    const status = value === 'ARCHIVED' || value === '' ? value : 'ACTIVE';
    this.statusFilter.set(status);
    this.pager.reset();
    const want = this.admin() && status !== 'ACTIVE';
    if (want !== this.withArchived()) this.toggleArchived();
  }

  clearFilters(): void {
    this.search.set('');
    this.leadFilter.set('');
    this.memberFilter.set('');
    this.setStatus('ACTIVE');
  }

  pickCard(item: StatStripItem): void {
    if (item.label !== 'Without a lead') return;
    this.leadFilter.set(this.leadFilter() === 'none' ? '' : 'none');
    this.pager.reset();
  }

  goToPage(next: number): void { this.pager.goTo(next, this.filtered().length); }
  setPageSize(size: number): void { this.pager.setSize(size); }

  // ---- the side panel ----------------------------------------------------------------------------------------

  /** A row opens its team in the panel over the right. */
  open(team: Team): void {
    this.select(team);
    this.creating.set(false);
    this.showPanel();
  }

  private showPanel(): void {
    if (this.panelRef) return;
    this.panelOpen.set(true);
    this.panelRef = this.dialog.open(this.panelTpl(), sidePanelConfig(null, 'narrow', 'right'));
    this.panelRef.closed.subscribe(() => {
      this.panelRef = null;
      this.panelOpen.set(false);
      this.creating.set(false);
      this.editing.set(false);
    });
  }

  closePanel(): void {
    this.panelRef?.close();
  }

  // ---- a row ---------------------------------------------------------------------------------------------------

  leadsOf(team: Team): TeamMember[] {
    return team.members.filter(m => m.teamRole === 'LEAD');
  }

  stackOf(team: Team): TeamMember[] {
    return [...team.members].sort((a, b) => (a.teamRole === b.teamRole ? 0 : a.teamRole === 'LEAD' ? -1 : 1)).slice(0, STACK);
  }

  usesOf(team: Team): TeamUse[] {
    return this.usage()?.byTeam.get(team.teamId) ?? [];
  }

  usageOf(team: Team): ReturnType<typeof usageSummary> {
    return usageSummary(this.usesOf(team));
  }

  /** Whether "used nowhere" can be said: only when every source answered. */
  readonly usageComplete = computed(() => (this.usage()?.known.length ?? 0) === 4);
  readonly usageKnown = computed(() => (this.usage()?.known.length ?? 0) > 0);

  isMe(member: TeamMember): boolean {
    return member.appUserId === this.auth.user()?.appUserId;
  }

  select(team: Team): void {
    this.selectedId.set(team.teamId);
    this.editing.set(false);
    this.addPerson.set(null);
    this.addRole.set('MEMBER');
  }

  startCreate(): void {
    this.creating.set(true);
    this.editing.set(false);
    this.draftName.set('');
    this.draftDescription.set('');
    this.showPanel();
  }

  startEdit(): void {
    const team = this.selected();
    if (!team) return;
    this.editing.set(true);
    this.draftName.set(team.name);
    this.draftDescription.set(team.description ?? '');
  }

  create(): void {
    const name = this.draftName().trim();
    if (!name) return;
    this.busy.set(true);
    this.api.create(name, this.draftDescription().trim()).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status !== API_SUCCESS) {
          this.toast.error(r.message || 'The team could not be made.');
          return;
        }
        this.toast.success(r.message || 'Team made.');
        this.creating.set(false);
        this.selectedId.set(r.data?.teamId ?? null);
        this.load('skip');
      },
      error: e => {
        this.busy.set(false);
        this.toast.error(refusal(e, 'The team could not be made.'));
      },
    });
  }

  save(): void {
    const team = this.selected();
    const name = this.draftName().trim();
    if (!team || !name) return;
    this.change(this.api.update(team.teamId, name, this.draftDescription().trim()), 'The team could not be saved.', () => this.editing.set(false));
  }

  async archive(): Promise<void> {
    const team = this.selected();
    if (!team) return;
    const ok = await confirmWith(this.dialog, {
      title: `Archive "${team.name}"?`,
      body: 'Its people stay; the team is in no one\'s teams from now on, so nothing new goes to it. A task still open for it waits for '
        + 'nobody: pass such tasks to someone else first. Its history keeps its name.',
      confirmLabel: 'Archive team',
      danger: true,
    });
    if (ok) this.change(this.api.archive(team.teamId), 'The team could not be archived.');
  }

  add(): void {
    const team = this.selected();
    const person = this.addPerson();
    if (!team || !person) return;
    this.change(this.api.addMember(team.teamId, person, this.admin() ? this.addRole() : 'MEMBER'), 'The person could not be added.', () => {
      this.addPerson.set(null);
      this.addRole.set('MEMBER');
    });
  }

  setRole(member: TeamMember, role: string): void {
    const team = this.selected();
    if (!team || (role !== 'LEAD' && role !== 'MEMBER') || role === member.teamRole) return;
    this.change(this.api.addMember(team.teamId, member.appUserId, role), 'The role could not be changed.');
  }

  /** An administrator removes anyone; a lead, a member who is not a lead. */
  mayRemove(member: TeamMember): boolean {
    return this.mayChangeMembers() && (this.admin() || member.teamRole === 'MEMBER');
  }

  async remove(member: TeamMember): Promise<void> {
    const team = this.selected();
    if (!team) return;
    const ok = await confirmWith(this.dialog, {
      title: `Remove ${this.nameOf(member)} from "${team.name}"?`,
      body: 'Tasks and reviews for the team stop reaching them within a minute. What they decided stays in its history.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (ok) this.change(this.api.removeMember(team.teamId, member.appUserId), 'The person could not be removed.');
  }

  nameOf(member: TeamMember): string {
    return member.fullName || member.username || `user #${member.appUserId}`;
  }

  leadNames(team: Team): string {
    const names = team.members.filter(m => m.teamRole === 'LEAD').map(m => this.nameOf(m));
    return names.length ? names.join(', ') : 'No lead';
  }

  private change(call: ReturnType<TeamsApi['update']>, fallback: string, done?: () => void): void {
    this.busy.set(true);
    call.subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status !== API_SUCCESS) {
          this.toast.error(r.message || fallback);
          return;
        }
        this.toast.success(r.message || 'Saved.');
        if (r.data) this.teams.update(list => list.map(t => (t.teamId === r.data!.teamId ? r.data! : t)));
        done?.();
        if (r.data?.status === 'ARCHIVED' && !this.withArchived()) this.load('skip');
      },
      error: e => {
        this.busy.set(false);
        this.toast.error(refusal(e, fallback));
      },
    });
  }
}
