import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { ROLE_META, UserRole, isUserRole, roleLabel } from '../../../core/auth/auth.models';
import { PageCatalogueEntry, PageKey } from '../../../core/auth/page-keys';
import { Avatar, AvatarCache } from '../../../shared/ui/avatar';
import { CROP_SESSION } from '../../../shared/ui/avatar-crop-session';
import { Combobox, ComboboxOption } from '../../../shared/ui/combobox';
import { confirmWith } from '../../../shared/ui/confirm';
import { Field } from '../../../shared/ui/field';
import { FormRow } from '../../../shared/ui/form-row';
import { Icon } from '../../../shared/ui/icon';
import { PageHeader } from '../../../shared/ui/page-header';
import { PhoneInput } from '../../../shared/ui/phone-input';
import { Section } from '../../../shared/ui/section';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { StatusPill } from '../../../shared/ui/status-pill';
import { ToastService } from '../../../shared/ui/toast.service';
import { AccountSecurityApi, METHOD_LABEL, OUTCOME_LABEL, PersonSession, PersonStanding, SignInEvent } from '../../account/account-security.api';
import { pictureProblem } from '../../profile/picture-check';
import { AccessPerson, AccessProfile, AccessProfilesService } from '../access-profiles/access-profiles.service';
import { Team, TeamsApi, refusal } from '../../../core/teams/teams.api';
import { isOwnPlatformSignIn } from '../../../core/auth/workspace-data';
import { PreviewGroup, menuPreview, previewSize } from '../access-profiles/page-groups';
import { announceReset } from './reset-password-announce';
import { ResetPasswordData, ResetPasswordDialog, ResetPasswordResult } from './reset-password-dialog';
import { grantableRoles } from './user-dialog';
import { AppUser } from './users';

/** The page's parts, in order: the side list jumps to them. */
export const USER_EDIT_SECTIONS = [
  { id: 'profile', label: 'Profile', icon: 'user' },
  { id: 'access', label: 'Role and access', icon: 'shield' },
  { id: 'security', label: 'Sign-in security', icon: 'key' },
  { id: 'activity', label: 'Activity', icon: 'history' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'danger', label: 'Danger zone', icon: 'alert' },
] as const;

/**
 * Administration › Users › a person (owner 2026-10-19 #31): Edit user as a page, not a small dialog. Their profile and
 * picture; their role and Page access profile, with the menu they will see; sign-in security -- two-factor, password,
 * lock, live sessions with End; activity -- recent sign-ins and the account's history; how notifications reach them; and
 * the danger zone, saying what deactivating and deleting do.
 *
 * The role rules are the server's (AppUserServiceImpl.scopedFind, SecurityAdminService.manageable): a platform
 * administrator changes anyone, an administrator their workspace's members and themself -- never a fellow administrator,
 * whose page opens read-only, saying why. Nobody deactivates, deletes or changes the role of their own account. The page
 * stays inside the Users page key (TENANT_ADMIN); it adds no page.
 */
@Component({
  selector: 'app-user-edit',
  imports: [PageHeader, Section, FormRow, Field, PhoneInput, Combobox, Icon, Avatar, StatusPill, ServerTimePipe, ReactiveFormsModule, RouterLink],
  templateUrl: './user-edit.html',
  styles: `
    .ue-layout { display: grid; gap: 1.25rem; }
    @media (min-width: 80rem) {
      .ue-layout { grid-template-columns: 13rem minmax(0, 1fr); align-items: start; }
      .ue-nav { position: sticky; top: 4.5rem; }
    }
    .ue-nav-list { display: flex; flex-wrap: wrap; gap: 0.25rem; }
    @media (min-width: 80rem) { .ue-nav-list { flex-direction: column; } .ue-nav-btn { width: 100%; } }
    /* Below 80rem the parts are a row of chips over the page; beside it from 80rem, a column. */
    .ue-nav-btn { display: flex; align-items: center; gap: 0.5rem; width: auto; text-align: left; padding: 0.4rem 0.6rem;
      border-radius: var(--radius-md); font-size: 0.875rem; color: var(--text-secondary); }
    .ue-nav-btn:hover { background: var(--surface-sunken); color: var(--text-primary); }
    .ue-nav-btn:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
    .ue-main { display: grid; gap: 1.25rem; min-width: 0; }
    .ue-two { display: grid; gap: 1.25rem; }
    @media (min-width: 100rem) { .ue-two { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; } }
    .ue-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 0.4rem 1rem; font-size: 0.875rem; }
    .ue-facts dt { color: var(--text-muted); }
    .ue-facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
    .ue-danger { border-color: color-mix(in oklab, var(--color-crit-500) 45%, var(--border-subtle)); }
  `,
})
export class UserEdit implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly toast = inject(ToastService);
  private readonly security = inject(AccountSecurityApi);
  private readonly profilesApi = inject(AccessProfilesService);
  private readonly teamsApi = inject(TeamsApi);
  private readonly pictures = inject(AvatarCache);
  readonly auth = inject(AuthService);

  readonly sections = USER_EDIT_SECTIONS;
  readonly methodLabel = METHOD_LABEL;
  readonly outcomeLabel = OUTCOME_LABEL;

  readonly id = signal<number | null>(null);
  readonly person = signal<AppUser | null>(null);
  readonly people = signal<AppUser[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly saving = signal(false);
  readonly submitted = signal(false);
  /** Which action is in flight ('picture', 'unlock', 'session:<id>', ...). */
  readonly busy = signal<string | null>(null);

  readonly profiles = signal<AccessProfile[]>([]);
  readonly catalogue = signal<PageCatalogueEntry[]>([]);
  /** Their effective pages, as the server works them out (a member only). */
  readonly access = signal<AccessPerson | null>(null);
  /** F4: the workspace's teams; theirs are the ones they are in, with their role. */
  readonly teams = signal<Team[]>([]);
  readonly theirTeams = computed(() => {
    const id = this.person()?.appUserId;
    return this.teams().flatMap(t => {
      const m = t.members.find(x => x.appUserId === id);
      return m ? [{ team: t, role: m.teamRole }] : [];
    });
  });
  readonly joinable = computed(() => {
    const id = this.person()?.appUserId;
    return this.teams().filter(t => !t.members.some(m => m.appUserId === id));
  });
  readonly joinTeamId = signal<number | null>(null);
  /** ZT-M16: a workspace's teams are a managed session's to read, never the platform administrator's own sign-in. */
  readonly ownSignIn = computed(() => isOwnPlatformSignIn(this.auth));
  readonly teamBusy = signal(false);
  readonly standing = signal<PersonStanding | null>(null);
  readonly sessions = signal<PersonSession[] | null>(null);
  readonly sessionsError = signal('');
  readonly history = signal<SignInEvent[]>([]);
  readonly historyTotal = signal(0);

  readonly phone = signal('');
  readonly role = signal<UserRole>('TENANT_USER');
  readonly pickedProfile = signal<number | null>(null);

  readonly form: FormGroup = this.fb.group({
    appUserId: [null as number | null],
    fullName: ['', Validators.required],
    position: [''],
    username: ['', [Validators.required, Validators.email]],
    userRole: ['TENANT_USER' as UserRole, Validators.required],
    tenantId: [{ value: null as number | null, disabled: true }],
    pageAccessProfileId: [null as number | null],
    managerId: [null as number | null],
  });

  readonly isSelf = computed(() => {
    const mine = this.auth.user()?.appUserId;
    return mine != null && this.person()?.appUserId === mine;
  });

  /** The server's scopedFind, asked of this person: a fellow administrator is the platform's to change. */
  readonly canManage = computed(() => {
    const p = this.person();
    return !!p && (this.auth.isPlatformAdmin() || this.isSelf() || p.userRole === 'TENANT_USER');
  });
  readonly readOnly = computed(() => !this.canManage());
  readonly managedByPlatformOnly = 'Only a platform administrator can change another workspace administrator.';

  readonly roles = computed(() => grantableRoles(this.person()?.userRole as UserRole | undefined, this.isSelf(), this.auth.isPlatformAdmin()));
  readonly roleHint = computed(() => (isUserRole(this.role()) ? ROLE_META[this.role()].hint : ''));
  readonly isMember = computed(() => this.role() === 'TENANT_USER');
  readonly defaultProfile = computed(() => this.profiles().find(p => p.defaultProfile) ?? null);
  readonly name = computed(() => this.person()?.fullName || this.person()?.username || 'User');

  readonly managerOptions = computed<ComboboxOption[]>(() => {
    const me = this.person();
    return this.people()
      .filter(p => p.status === 'Active' && p.userRole !== 'PLATFORM_ADMIN' && p.appUserId !== me?.appUserId
        && (me?.tenantId == null || p.tenantId === me.tenantId))
      .map(p => ({ value: String(p.appUserId), label: p.fullName || p.username, hint: p.position || p.username }))
      .sort((a, b) => a.label.localeCompare(b.label));
  });

  /** Whom they manage: their approvals' escalations come to them (MIG-274). */
  readonly reports = computed(() => this.people().filter(p => p.managerId === this.person()?.appUserId && p.status !== 'Delete'));
  readonly reportNames = computed(() => {
    const names = this.reports().map(r => r.fullName || r.username);
    return names.slice(0, 5).join(', ') + (names.length > 5 ? ', …' : '');
  });
  readonly managerName = computed(() => {
    const id = this.person()?.managerId;
    return id ? (this.people().find(p => p.appUserId === id)?.fullName || this.person()?.managerName || '') : '';
  });

  /**
   * The pages they open, for "what they can see": an administrator every workspace page; a member the server's answer
   * while the form still says what is saved, else the picked profile (or the default) with their own exceptions.
   */
  readonly openKeys = computed<Set<PageKey> | 'all'>(() => {
    if (!this.isMember()) return 'all';
    const p = this.person();
    const access = this.access();
    const picked = this.pickedProfile();
    if (access && p?.userRole === 'TENANT_USER' && (p.pageAccessProfileId ?? null) === picked) return new Set(access.pageKeys ?? []);
    const profile = picked ? this.profiles().find(x => x.pageAccessProfileId === picked) : this.defaultProfile();
    if (!profile) return 'all';
    const keys = new Set<PageKey>(profile.pageKeys ?? []);
    for (const k of access?.allowedExceptions ?? []) keys.add(k);
    for (const k of access?.withheldExceptions ?? []) keys.delete(k);
    return keys;
  });
  readonly preview = computed<PreviewGroup[]>(() => {
    const keys = this.openKeys();
    return menuPreview(key => keys === 'all' || keys.has(key), !this.isMember());
  });
  readonly previewPlaces = computed(() => previewSize(this.preview()));
  readonly pagesOpen = computed(() => {
    const keys = this.openKeys();
    return keys === 'all' ? this.catalogue().length : this.catalogue().filter(p => keys.has(p.key)).length;
  });
  /** True when the preview follows unsaved changes to the role or profile. */
  readonly previewUnsaved = computed(() => {
    const p = this.person();
    return !!p && (this.role() !== p.userRole || (this.isMember() && (p.pageAccessProfileId ?? null) !== this.pickedProfile()));
  });

  constructor() {
    this.form.get('userRole')!.valueChanges.subscribe((v: UserRole) => this.role.set(v));
    this.form.get('pageAccessProfileId')!.valueChanges.subscribe((v: number | null) => this.pickedProfile.set(v ?? null));
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('appUserId'));
    if (!Number.isFinite(id) || id <= 0) {
      this.loading.set(false);
      this.error.set('That is not a person\'s address.');
      return;
    }
    this.id.set(id);
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<AppUser[]>>(`${API_BASE}/appUser.json/listUsers`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status !== API_SUCCESS) { this.error.set(response.message || 'Could not load the user.'); return; }
        const list = response.data ?? [];
        this.people.set(list);
        const person = list.find(u => u.appUserId === this.id());
        if (!person || person.status === 'Delete') {
          this.error.set('This person is not on your Users list: they may have been deleted, or belong to another workspace.');
          return;
        }
        this.startFrom(person);
        this.loadAround(person);
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load the user.');
      },
    });
  }

  /** The form, as the person is now. */
  startFrom(person: AppUser): void {
    this.person.set(person);
    this.phone.set(person.phoneNumber ?? '');
    this.form.reset({
      appUserId: person.appUserId, fullName: person.fullName ?? '', position: person.position ?? '', username: person.username,
      userRole: person.userRole as UserRole, tenantId: person.tenantId ?? null, pageAccessProfileId: person.pageAccessProfileId ?? null,
      managerId: person.managerId ?? null,
    });
    this.role.set(person.userRole as UserRole);
    this.pickedProfile.set(person.pageAccessProfileId ?? null);
    if (this.readOnly()) this.form.disable(); else { this.form.enable(); this.form.get('tenantId')!.disable(); }
    if (this.isSelf() && !this.auth.isPlatformAdmin()) this.form.get('userRole')!.disable();
  }

  private loadTeams(tenant: number | null): void {
    this.teamsApi.list(tenant).subscribe({ next: r => { if (r.status === API_SUCCESS) this.teams.set(r.data ?? []); }, error: () => {} });
  }

  /** F4: puts them in a team (as a member; leads are named on Teams), or takes them out of one. */
  joinTeam(): void {
    const p = this.person();
    const team = this.joinTeamId();
    if (!p || !team) return;
    this.teamCall(this.teamsApi.addMember(team, p.appUserId), 'They could not be added to the team.', () => this.joinTeamId.set(null));
  }

  async leaveTeam(team: Team): Promise<void> {
    const p = this.person();
    if (!p) return;
    const ok = await confirmWith(this.dialog, {
      title: `Take ${this.name()} out of "${team.name}"?`,
      body: 'Tasks and reviews for the team stop reaching them within a minute. What they decided stays in its history.',
      confirmLabel: 'Remove from team',
      danger: true,
    });
    if (ok) this.teamCall(this.teamsApi.removeMember(team.teamId, p.appUserId), 'They could not be removed from the team.');
  }

  private teamCall(call: ReturnType<TeamsApi['addMember']>, fallback: string, done?: () => void): void {
    this.teamBusy.set(true);
    call.subscribe({
      next: r => {
        this.teamBusy.set(false);
        if (r.status !== API_SUCCESS) { this.toast.error(r.message || fallback); return; }
        this.toast.success(r.message || 'Saved.');
        if (r.data) this.teams.update(list => list.map(t => (t.teamId === r.data!.teamId ? r.data! : t)));
        done?.();
      },
      error: e => { this.teamBusy.set(false); this.toast.error(refusal(e, fallback)); },
    });
  }

  /** Everything around the person: profiles and pages, their standing, sessions and history. */
  private loadAround(person: AppUser): void {
    const tenant = this.auth.isPlatformAdmin() ? person.tenantId ?? null : null;
    this.profilesApi.pages().subscribe({ next: r => { if (r.status === API_SUCCESS) this.catalogue.set(r.data ?? []); }, error: () => {} });
    if (person.tenantId != null) {
      if (!this.ownSignIn()) this.loadTeams(tenant);
      this.profilesApi.list(tenant).subscribe({ next: r => { if (r.status === API_SUCCESS) this.profiles.set(r.data ?? []); }, error: () => {} });
      if (person.userRole === 'TENANT_USER') {
        this.profilesApi.people(tenant).subscribe({
          next: r => { if (r.status === API_SUCCESS) this.access.set((r.data ?? []).find(a => a.appUserId === person.appUserId) ?? null); },
          error: () => {},
        });
      }
    }
    this.security.people(tenant).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.standing.set((r.data ?? {})[String(person.appUserId)] ?? null); },
      error: () => {},
    });
    this.loadSessions();
    this.security.workspaceHistory({ tenantId: tenant, appUserId: person.appUserId, limit: 8 }).subscribe({
      next: r => {
        if (r.status !== API_SUCCESS || !r.data) return;
        this.history.set(r.data.items ?? []);
        this.historyTotal.set(r.data.total ?? 0);
      },
      error: () => {},
    });
  }

  loadSessions(): void {
    const id = this.id();
    if (!id || !this.canManage()) { this.sessions.set(null); return; }
    this.sessionsError.set('');
    this.security.sessionsOf(id).subscribe({
      next: r => {
        if (r.status === API_SUCCESS) this.sessions.set(r.data ?? []);
        else { this.sessions.set(null); this.sessionsError.set(r.message || 'Their sessions could not be read.'); }
      },
      error: err => { this.sessions.set(null); this.sessionsError.set(err?.error?.message || 'Their sessions could not be read.'); },
    });
  }

  jump(section: string): void {
    document.getElementById('ue-' + section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  roleLabel(role?: string | null): string {
    return roleLabel(role);
  }

  // ---- profile, role and access ----------------------------------------------------------------------------------

  save(): void {
    if (this.readOnly()) return;
    this.submitted.set(true);
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.toast.error('Check the highlighted fields.');
      return;
    }
    const payload: Record<string, unknown> = { ...this.form.getRawValue() };
    payload['phoneNumber'] = this.phone() || null;
    if (this.role() === 'PLATFORM_ADMIN') payload['tenantId'] = null;
    if (!this.isMember() || this.profiles().length === 0) payload['pageAccessProfileId'] = null;
    this.saving.set(true);
    this.http.put<ApiResponse>(`${API_BASE}/appUser.json/updateUser`, payload).subscribe({
      next: response => {
        this.saving.set(false);
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message || 'User updated.');
          this.submitted.set(false);
          this.load();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.saving.set(false);
        this.toast.error(err?.error?.message || 'The user could not be saved.');
      },
    });
  }

  /** Whether anything on the form differs from what is saved (the phone is its own control). */
  changed(): boolean {
    return this.form.dirty || (this.phone() || '') !== (this.person()?.phoneNumber || '');
  }

  discard(): void {
    const p = this.person();
    if (p) this.startFrom(p);
    this.submitted.set(false);
  }

  /** A picture for them: checked by its bytes, cropped in the shared dialog, then sent for this person. */
  async pick(file: File | undefined | null): Promise<void> {
    if (!file || this.readOnly()) return;
    const problem = await pictureProblem(file);
    if (problem) { this.toast.error(problem); return; }
    const { AvatarCropDialog } = await import('../../../shared/ui/avatar-crop-dialog');
    this.dialog.open<Blob>(AvatarCropDialog, {
      hasBackdrop: true,
      ariaLabel: 'Position the picture',
      providers: ref => [{ provide: CROP_SESSION, useValue: { file, close: (square?: Blob) => ref.close(square) } }],
    }).closed.subscribe(cropped => { if (cropped) this.upload(cropped); });
  }

  upload(picture: Blob): void {
    const id = this.id();
    if (!id) return;
    const form = new FormData();
    form.append('file', picture, 'avatar.png');
    this.busy.set('picture');
    const params: Record<string, number> = this.isSelf() ? {} : { appUserId: id };
    this.http.post<ApiResponse<{ avatarVersion: string | null }>>(`${API_BASE}/appUser.json/avatar`, form, { params }).subscribe({
      next: r => this.pictureChanged(r, 'Picture updated.'),
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'The picture could not be saved.'); },
    });
  }

  async removePicture(): Promise<void> {
    const id = this.id();
    if (!id) return;
    const ok = await confirmWith(this.dialog, {
      title: `Remove ${this.name()}'s profile picture?`,
      body: 'Their initials are shown instead, everywhere their name appears, and the picture is deleted from storage. '
        + 'They can upload a new one. The removal is recorded in their sign-in history with your name.',
      confirmLabel: 'Remove picture',
      danger: true,
    });
    if (!ok) return;
    this.busy.set('picture');
    const params: Record<string, number> = this.isSelf() ? {} : { appUserId: id };
    this.http.delete<ApiResponse<{ avatarVersion: string | null }>>(`${API_BASE}/appUser.json/avatar`, { params }).subscribe({
      next: r => this.pictureChanged(r, 'Picture removed.'),
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'Could not remove the picture.'); },
    });
  }

  private pictureChanged(response: ApiResponse<{ avatarVersion: string | null }>, done: string): void {
    this.busy.set(null);
    if (response.status !== API_SUCCESS) { this.toast.error(response.message); return; }
    const avatarVersion = response.data?.avatarVersion ?? null;
    const p = this.person();
    if (p) {
      this.pictures.forget(p.appUserId);
      this.person.set({ ...p, avatarVersion });
    }
    if (this.isSelf()) this.auth.patchUser({ avatarVersion });
    this.toast.success(response.message || done);
  }

  // ---- sign-in security ------------------------------------------------------------------------------------------

  /** The toast of the last reset that happened: the next reset takes it, and its password, away. */
  private resetToast: number | null = null;

  resetPassword(): void {
    const p = this.person();
    if (!p) return;
    if (this.resetToast !== null) this.toast.dismiss(this.resetToast);
    this.resetToast = null;
    const data: ResetPasswordData = { appUserId: p.appUserId, name: this.name(), tenantId: p.tenantId ?? null, own: this.isSelf() };
    this.dialog.open<ResetPasswordResult>(ResetPasswordDialog, { hasBackdrop: true, data }).closed.subscribe(done => {
      if (!done) return;
      this.resetToast = announceReset(this.toast, done);
      this.load();
    });
  }

  unlock(): void {
    const id = this.id();
    if (!id) return;
    this.busy.set('unlock');
    this.security.unlock(id).subscribe({
      next: r => { this.busy.set(null); this.answer(r, 'Could not unlock the account.'); },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'Could not unlock the account.'); },
    });
  }

  async resetMfa(): Promise<void> {
    const id = this.id();
    if (!id) return;
    const ok = await confirmWith(this.dialog, {
      title: `Reset two-factor login for ${this.name()}?`,
      body: 'Their authenticator app and recovery codes stop working and they are signed out everywhere. If the workspace requires '
        + 'two-factor login they set it up again at their next sign-in. Do this only when you are sure it is them asking.',
      confirmLabel: 'Reset two-factor login',
      danger: true,
    });
    if (!ok) return;
    this.busy.set('mfa');
    this.security.resetMfa(id).subscribe({
      next: r => { this.busy.set(null); this.answer(r, 'Could not reset two-factor login.'); },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'Could not reset two-factor login.'); },
    });
  }

  endSession(session: PersonSession): void {
    const id = this.id();
    if (!id) return;
    this.busy.set('session:' + session.sessionId);
    this.security.endSessionOf(id, session.sessionId).subscribe({
      next: r => { this.busy.set(null); this.answer(r, 'Could not end the session.'); },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'Could not end the session.'); },
    });
  }

  async endAllSessions(): Promise<void> {
    const id = this.id();
    if (!id) return;
    const ok = await confirmWith(this.dialog, {
      title: `Sign ${this.name()} out everywhere?`,
      body: 'Every session of theirs ends now, on every device. They can sign in again straight away unless their account is '
        + 'deactivated or locked.',
      confirmLabel: 'Sign out everywhere',
      danger: true,
    });
    if (!ok) return;
    this.busy.set('sessions');
    this.security.endAllSessionsOf(id).subscribe({
      next: r => { this.busy.set(null); this.answer(r, 'Could not end their sessions.'); },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'Could not end their sessions.'); },
    });
  }

  private answer(response: ApiResponse<unknown>, fallback: string): void {
    if (response.status === API_SUCCESS) {
      this.toast.success(response.message);
      this.load();
    } else {
      this.toast.error(response.message || fallback);
    }
  }

  /** "Chrome on macOS" from a user agent, or the start of it. */
  browserOf(agent: string | null | undefined): string {
    if (!agent) return 'Unknown device';
    const browser = /Edg\//.test(agent) ? 'Edge' : /Firefox\//.test(agent) ? 'Firefox' : /Chrome\//.test(agent) ? 'Chrome'
      : /Safari\//.test(agent) ? 'Safari' : /curl|python|java|okhttp|axios/i.test(agent) ? 'A script' : 'A browser';
    const system = /Windows/.test(agent) ? 'Windows' : /Mac OS X|Macintosh/.test(agent) ? 'macOS' : /Android/.test(agent) ? 'Android'
      : /iPhone|iPad/.test(agent) ? 'iOS' : /Linux/.test(agent) ? 'Linux' : '';
    return system ? `${browser} on ${system}` : browser;
  }

  // ---- danger zone -----------------------------------------------------------------------------------------------

  async toggleStatus(): Promise<void> {
    const p = this.person();
    if (!p || this.isSelf()) return;
    const activating = p.status !== 'Active';
    const ok = await confirmWith(this.dialog, {
      title: activating ? `Activate ${this.name()}?` : `Deactivate ${this.name()}?`,
      body: activating ? `${this.name()} will be able to sign in again.`
        : `${this.name()} is signed out everywhere now and cannot sign in until activated again. Their work, schedules and history are kept.`,
      confirmLabel: activating ? 'Activate' : 'Deactivate',
      danger: !activating,
    });
    if (ok) this.changeStatus(activating ? 'Active' : 'Inactive');
  }

  async deleteUser(): Promise<void> {
    if (this.isSelf()) return;
    const ok = await confirmWith(this.dialog, {
      title: `Delete ${this.name()}?`,
      body: 'The account is removed from the list and can never sign in again: they are signed out everywhere, their profile '
        + 'picture is deleted from storage, and their page exceptions go. What they made (pipelines, schedules, runs) and the '
        + 'account history stay. This cannot be undone; deactivate instead if you only want to block access for now.',
      confirmLabel: 'Delete user',
      danger: true,
    });
    if (ok) this.changeStatus('Delete');
  }

  private changeStatus(status: string): void {
    const p = this.person();
    if (!p) return;
    this.busy.set('status');
    this.http.put<ApiResponse>(`${API_BASE}/appUser.json/changeUserStatus`, { appUserId: p.appUserId, status }).subscribe({
      next: response => {
        this.busy.set(null);
        if (response.status !== API_SUCCESS) { this.toast.error(response.message); return; }
        this.toast.success(response.message);
        if (status === 'Delete') void this.router.navigate(['/administration/users']);
        else this.load();
      },
      error: err => { this.busy.set(null); this.toast.error(err?.error?.message || 'Could not change the status.'); },
    });
  }
}
