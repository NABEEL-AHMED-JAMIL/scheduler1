import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute } from '@angular/router';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { Team, TeamMember, TeamRole, TeamsApi, refusal } from '../../../core/teams/teams.api';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { Colleague, WorkflowsApi } from '../../workflows/workflows.api';
import { confirmWith } from '../../../shared/ui/confirm';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { StatTile } from '../../../shared/ui/stat-tile';
import { ToastService } from '../../../shared/ui/toast.service';
import { WorkspaceSelect } from '../../../shared/ui/workspace-select';

/**
 * Administration > Teams (F4, MIG-401): the people of a workspace who work together. A team is what a workflow task, an
 * Approval step, a run's review, an alert rule or a Report Studio approval goes to; a person is in many teams. Every member
 * reads them here; an administrator makes, renames and archives a team and names its leads; a team's lead adds and removes
 * its members (owner T-Q3). Teams open no pages (T-Q2): Page access does that. Groups (access profiles named as reviewers)
 * became teams of the same people on 2026-10-21 (T-Q1).
 */
@Component({
  selector: 'app-teams',
  imports: [PageHeader, RefreshButton, StatTile, Icon, WorkspaceSelect],
  templateUrl: './teams.html',
})
export class Teams implements OnInit {
  private readonly api = inject(TeamsApi);
  private readonly workflows = inject(WorkflowsApi);
  private readonly toast = inject(ToastService);
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);
  private readonly directory = inject(WorkspaceDirectory);
  readonly auth = inject(AuthService);

  readonly admin = computed(() => this.auth.isTenantAdmin());
  readonly canPickTenant = computed(() => this.auth.isPlatformAdmin());
  readonly tenantId = signal<number | null>(null);
  readonly needsWorkspace = computed(() => this.canPickTenant() && !this.tenantId());

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
    if (this.canPickTenant()) {
      const linked = Number(this.route.snapshot.queryParamMap.get('tenantId'));
      const remembered = this.directory.remembered();
      if (Number.isFinite(linked) && linked > 0) this.pickTenant(String(linked));
      else if (remembered !== null) this.pickTenant(String(remembered));
      return;
    }
    this.load();
  }

  pickTenant(value: string): void {
    const id = Number(value);
    this.tenantId.set(Number.isFinite(id) && id > 0 ? id : null);
    this.teams.set([]);
    this.people.set([]);
    this.selectedId.set(null);
    if (this.tenantId()) this.load();
  }

  load(): void {
    if (this.needsWorkspace()) return;
    this.loading.set(true);
    this.api.list(this.tenantId(), this.admin() && this.withArchived()).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS) {
          this.toast.error(r.message || 'The teams could not be read.');
          return;
        }
        const teams = r.data ?? [];
        this.teams.set(teams);
        const linked = Number(this.route.snapshot.queryParamMap.get('team'));
        if (!teams.some(t => t.teamId === this.selectedId())) {
          this.selectedId.set(teams.some(t => t.teamId === linked) ? linked : teams[0]?.teamId ?? null);
        }
      },
      error: e => {
        this.loading.set(false);
        this.toast.error(refusal(e, 'The teams could not be read.'));
      },
    });
    this.workflows.colleagues(this.tenantId()).subscribe({
      next: r => this.people.set(r.status === API_SUCCESS ? r.data ?? [] : []),
      error: () => this.people.set([]),
    });
  }

  toggleArchived(): void {
    this.withArchived.set(!this.withArchived());
    this.load();
  }

  select(team: Team): void {
    this.selectedId.set(team.teamId);
    this.editing.set(false);
    this.addPerson.set(null);
    this.addRole.set('MEMBER');
  }

  startCreate(): void {
    this.creating.set(true);
    this.draftName.set('');
    this.draftDescription.set('');
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
    this.api.create(name, this.draftDescription().trim(), this.tenantId()).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status !== API_SUCCESS) {
          this.toast.error(r.message || 'The team could not be made.');
          return;
        }
        this.toast.success(r.message || 'Team made.');
        this.creating.set(false);
        this.selectedId.set(r.data?.teamId ?? null);
        this.load();
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
        if (r.data?.status === 'ARCHIVED' && !this.withArchived()) this.load();
      },
      error: e => {
        this.busy.set(false);
        this.toast.error(refusal(e, fallback));
      },
    });
  }
}
