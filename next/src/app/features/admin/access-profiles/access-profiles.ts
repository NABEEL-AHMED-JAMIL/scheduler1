import { WorkspaceSelect } from '../../../shared/ui/workspace-select';
import { WorkspaceDirectory } from '../../../core/workspaces/workspace-directory';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { ActivatedRoute, Router } from '@angular/router';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { forkJoin } from 'rxjs';
import { API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { PageCatalogueEntry } from '../../../core/auth/page-keys';
import { Icon } from '../../../shared/ui/icon';
import { StatTile } from '../../../shared/ui/stat-tile';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { AccessPerson, AccessProfile, AccessProfilesService } from './access-profiles.service';
import { AccessPeopleGrid } from './access-people-grid';
import { AccessGrants } from './access-grants';
import { AccessDelegation } from '../../../core/auth/access-delegation';
import { PageHeader } from '../../../shared/ui/page-header';
import { RefreshButton } from '../../../shared/ui/refresh-button';
import { NeedsWorkspace } from '../../../shared/ui/needs-workspace';
import { isOwnPlatformSignIn } from '../../../core/auth/workspace-data';

/** A profile's pages arranged the way the menu arranges them, for the card. */
interface CardSection { section: string; opens: string[]; withholds: string[]; }

/**
 * Administration > Access profiles: the named page bundles a workspace hands its tenant users.
 *
 * Two readings of the same facts. The cards answer "what does an Analyst get" -- a profile's
 * pages laid out by menu section, with who holds it. The grid (AccessPeopleGrid) answers "what
 * does Olivia get". The profile is the single source of truth for both, so they cannot disagree.
 */
@Component({
  selector: 'app-access-profiles',
  imports: [WorkspaceSelect, RefreshButton, PageHeader, Icon, StatTile, CdkMenu, CdkMenuItem, CdkMenuTrigger, AccessPeopleGrid, AccessGrants, NeedsWorkspace],
  templateUrl: './access-profiles.html',
})
export class AccessProfiles implements OnInit {
  private readonly api = inject(AccessProfilesService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly delegation = inject(AccessDelegation);
  /** F3: a member with an access delegation: the people they reach and what they may grant, nothing else of this page. */
  readonly delegateMode = computed(() => !this.auth.isTenantAdmin() && this.delegation.isDelegate());

  /**
   * A platform administrator has no workspace of its own, so it picks one; the screen is empty until it
   * does. A tenant administrator never sees the picker -- its workspace is the only one it can reach.
   */
  readonly canPickTenant = computed(() => this.auth.isPlatformAdmin());
  /** ZT-M16: the platform administrator's own sign-in reads no person's effective access, delegation or change log. */
  readonly ownSignIn = computed(() => isOwnPlatformSignIn(this.auth));
  readonly tenantId = signal<number | null>(null);

  readonly profiles = signal<AccessProfile[]>([]);
  readonly pages = signal<PageCatalogueEntry[]>([]);
  readonly people = signal<AccessPerson[]>([]);
  readonly view = signal<'profiles' | 'people'>('profiles');
  readonly search = signal('');
  /** The search as the grid reads it, 250 ms after the last keystroke (P2 #34): every key re-drew the whole matrix. */
  readonly gridSearch = signal('');
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  typed(text: string): void {
    this.search.set(text);
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.gridSearch.set(text), 250);
  }
  readonly loading = signal(false);
  readonly peopleLoading = signal(false);
  readonly error = signal('');
  /** The profile, or the person, whose action is in flight. */
  readonly busy = signal<number | null>(null);
  readonly assigning = signal<number | null>(null);
  /** Why the people grid could not be read; shown with a retry rather than as an empty workspace. */
  readonly peopleError = signal('');

  readonly stats = computed(() => {
    const list = this.profiles();
    return {
      profiles: list.length,
      assigned: list.reduce((n, p) => n + (p.userCount ?? 0), 0),
      onDefault: list.find(p => p.defaultProfile)?.defaultUserCount ?? 0,
      defaultName: list.find(p => p.defaultProfile)?.profileName ?? '',
      pages: this.pages().length,
    };
  });

  /**
   * Who a card should say it covers. Assigned people always; on the default, the people who land
   * on it with no profile of their own as well -- "1 person" on a default four more land on
   * understated it by four, and made the grid and the cards disagree.
   */
  coverage(profile: AccessProfile): { total: number; assigned: number; byDefault: number; names: string[] } {
    const assigned = profile.userCount ?? 0;
    const byDefault = profile.defaultProfile ? (profile.defaultUserCount ?? 0) : 0;
    const names = [...(profile.userNames ?? []), ...(profile.defaultProfile ? (profile.defaultUserNames ?? []) : [])];
    return { total: assigned + byDefault, assigned, byDefault, names };
  }

  /** Each card's pages by section, worked out once per profile list rather than per render. */
  readonly cards = computed(() => this.profiles().map(profile => ({
    profile,
    sections: this.sectionsFor(profile),
    opened: profile.pageKeys.length,
    coverage: this.coverage(profile),
  })));

  readonly needsWorkspace = computed(() => this.canPickTenant() && !this.tenantId());

  private readonly directory = inject(WorkspaceDirectory);

  ngOnInit(): void {
    if (!this.auth.isTenantAdmin()) {
      this.delegation.load().subscribe(() => this.loadPeople());
      return;
    }
    // A link from the Users screen lands on one person's row: the grid view, their name in the
    // filter, and -- for a platform administrator -- their workspace already picked.
    const params = this.route.snapshot.queryParamMap;
    if (params.get('view') === 'people') this.view.set('people');
    this.search.set(params.get('q') ?? '');
    this.gridSearch.set(this.search());
    const linkedTenant = Number(params.get('tenantId'));
    if (this.canPickTenant()) {
      this.api.pages().subscribe({
        next: r => {
          if (r.status === API_SUCCESS) this.pages.set(r.data ?? []);
          else this.toast.error(r.message || 'The page catalogue could not be loaded.');
        },
        error: err => this.toast.error(err?.error?.message || 'The page catalogue could not be loaded.'),
      });
      // A deep link's workspace, else the one picked on the last screen (owner #5: the choice is kept for the session).
      const remembered = this.directory.remembered();
      if (Number.isFinite(linkedTenant) && linkedTenant > 0) this.pickTenant(String(linkedTenant));
      else if (remembered !== null) this.pickTenant(String(remembered));
      return;
    }
    this.load();
  }

  pickTenant(value: string): void {
    const id = Number(value);
    this.tenantId.set(Number.isFinite(id) && id > 0 ? id : null);
    this.profiles.set([]);
    this.people.set([]);
    if (this.tenantId()) this.load();
  }

  /** "21 Jan 2027": when a delegation ends. */
  until(value: string): string {
    const at = new Date(value);
    return Number.isNaN(at.getTime()) ? value : new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(at);
  }

  showProfiles(): void {
    this.view.set('profiles');
  }

  // ---- who can open what (UX review B8, AP1) -------------------------------------------------------------------
  readonly previewOpen = signal(false);
  readonly previewId = signal<number | null>(null);
  /** One member's pages, as the server works them out (profile, default and their own exceptions), by menu section. */
  readonly preview = computed(() => {
    const person = this.people().find(p => p.appUserId === this.previewId());
    if (!person) return null;
    const catalogue = new Map(this.pages().map(p => [p.key, p]));
    const extra = new Set(person.allowedExceptions ?? []);
    const pages = (person.pageKeys ?? []).map(key => ({ key, label: catalogue.get(key)?.label ?? key, section: catalogue.get(key)?.section ?? 'Other',
      extra: extra.has(key) }));
    const sections: { section: string; pages: typeof pages }[] = [];
    for (const page of pages) {
      const group = sections.find(g => g.section === page.section);
      if (group) group.pages.push(page); else sections.push({ section: page.section, pages: [page] });
    }
    const fallback = this.stats().defaultName ? `the default, ${this.stats().defaultName}` : 'no profile';
    return { name: person.fullName || person.username, profile: person.pageAccessProfileName || fallback, pages, sections,
      withheld: (person.withheldExceptions ?? []).map(key => catalogue.get(key)?.label ?? key) };
  });

  openPreview(): void {
    this.previewOpen.set(true);
    if (this.people().length === 0) this.loadPeople();
  }

  showPeople(): void {
    this.view.set('people');
    if (this.people().length === 0) this.loadPeople();
  }

  load(): void {
    if (this.needsWorkspace()) return;
    this.loading.set(true);
    this.error.set('');
    forkJoin({ pages: this.api.pages(), profiles: this.api.list(this.tenantId()) }).subscribe({
      next: ({ pages, profiles }) => {
        this.loading.set(false);
        if (pages.status === API_SUCCESS) this.pages.set(pages.data ?? []);
        if (profiles.status === API_SUCCESS) this.profiles.set(profiles.data ?? []);
        else this.error.set(profiles.message || 'Access profiles could not be loaded.');
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Access profiles could not be loaded.');
      },
    });
    if (this.view() === 'people') this.loadPeople();
  }

  /** F3: Grant pages and tabs reads the people the first time a person is to be chosen. */
  needPeople(): void {
    if (this.people().length === 0 && !this.peopleLoading()) this.loadPeople();
  }

  loadPeople(): void {
    if (this.needsWorkspace()) return;
    this.peopleLoading.set(true);
    this.peopleError.set('');
    this.api.people(this.tenantId()).subscribe({
      next: response => {
        this.peopleLoading.set(false);
        if (response.status === API_SUCCESS) this.people.set(response.data ?? []);
        else this.peopleError.set(response.message || 'People could not be loaded.');
      },
      error: err => {
        this.peopleLoading.set(false);
        this.peopleError.set(err?.error?.message || 'People could not be loaded.');
      },
    });
  }

  private sectionsFor(profile: AccessProfile): CardSection[] {
    const sections: CardSection[] = [];
    for (const page of this.pages()) {
      let section = sections.find(s => s.section === page.section);
      if (!section) {
        section = { section: page.section, opens: [], withholds: [] };
        sections.push(section);
      }
      (profile.pageKeys.includes(page.key) ? section.opens : section.withholds).push(page.label);
    }
    return sections;
  }

  /**
   * Owner 2026-10-19 #3: a profile is made and changed on a page of its own (AccessProfileEditor), where fifty-odd pages
   * are grouped by the menu, searchable and previewed -- not in a dialog. A platform administrator's workspace travels.
   */
  add(): void {
    void this.router.navigate(['/administration/access-profiles/new'], { queryParams: this.workspaceQuery() });
  }

  edit(profile: AccessProfile): void {
    void this.router.navigate(['/administration/access-profiles', profile.pageAccessProfileId], { queryParams: this.workspaceQuery() });
  }

  private workspaceQuery(): Record<string, number> {
    return this.canPickTenant() && this.tenantId() ? { tenantId: this.tenantId()! } : {};
  }

  setDefault(profile: AccessProfile): void {
    this.busy.set(profile.pageAccessProfileId);
    this.api.setDefault(profile.pageAccessProfileId).subscribe({
      next: response => {
        this.busy.set(null);
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message || `"${profile.profileName}" is now the default.`);
          this.load();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.busy.set(null);
        this.toast.error(err?.error?.message || 'The default could not be changed.');
      },
    });
  }

  async remove(profile: AccessProfile): Promise<void> {
    const held = profile.userCount > 0;
    const ok = await confirmWith(this.dialog, {
      title: `Delete "${profile.profileName}"?`,
      body: held
        ? `${profile.userCount} ${profile.userCount === 1 ? 'person holds' : 'people hold'} this profile. Move them to another one first; the server will refuse otherwise.`
        : 'Nobody holds this profile. It can be recreated later, but its name will be free in the meantime.',
      confirmLabel: 'Delete profile',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(profile.pageAccessProfileId);
    this.api.delete(profile.pageAccessProfileId).subscribe({
      next: response => {
        this.busy.set(null);
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message || 'Access profile deleted.');
          this.load();
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.busy.set(null);
        this.toast.error(err?.error?.message || 'The access profile could not be deleted.');
      },
    });
  }

  /**
   * One person onto one profile. The row is redrawn from the server's answer, and the two
   * holder counts move locally -- the cards do not need refetching for a number this screen
   * already knows how to change.
   */
  assign({ person, profile }: { person: AccessPerson; profile: AccessProfile | null }): void {
    const target = profile?.pageAccessProfileId ?? null;
    if (target === person.pageAccessProfileId) return;
    this.assigning.set(person.appUserId);
    this.api.assign(person.appUserId, target).subscribe({
      next: response => {
        this.assigning.set(null);
        if (response.status !== API_SUCCESS || !response.data) {
          this.toast.error(response.message);
          return;
        }
        this.toast.success(response.message || 'Profile changed.');
        const updated = response.data;
        this.people.update(rows => rows.map(row => row.appUserId === person.appUserId
          ? { ...row, pageAccessProfileId: updated.pageAccessProfileId, pageAccessProfileName: updated.pageAccessProfileName, pageKeys: updated.pageKeys }
          : row));
        // A person with no profile of their own is counted on the default's defaultUserCount, not
        // on any userCount, so moving off or onto the default moves that number instead.
        const from = person.pageAccessProfileId ?? null;
        this.profiles.update(list => list.map(p => {
          let next = p;
          if (from !== null && p.pageAccessProfileId === from) next = { ...next, userCount: Math.max(0, next.userCount - 1) };
          if (target !== null && p.pageAccessProfileId === target) next = { ...next, userCount: next.userCount + 1 };
          if (p.defaultProfile) {
            if (from === null) next = { ...next, defaultUserCount: Math.max(0, (next.defaultUserCount ?? 0) - 1) };
            if (target === null) next = { ...next, defaultUserCount: (next.defaultUserCount ?? 0) + 1 };
          }
          return next;
        }));
      },
      error: err => {
        this.assigning.set(null);
        this.toast.error(err?.error?.message || 'The profile could not be changed.');
      },
    });
  }

  /** One checkbox: open or withhold a page for a person. The row is redrawn from the answer. */
  toggle({ person, page, allowed }: { person: AccessPerson; page: PageCatalogueEntry; allowed: boolean }): void {
    this.assigning.set(person.appUserId);
    this.api.setPageAccess(person.appUserId, page.key, allowed).subscribe({
      next: response => this.applyPersonAnswer(person, response, 'The page could not be changed.'),
      error: err => {
        this.assigning.set(null);
        this.toast.error(err?.error?.message || 'The page could not be changed.');
      },
    });
  }

  resetExceptions(person: AccessPerson): void {
    this.assigning.set(person.appUserId);
    this.api.clearPageAccess(person.appUserId).subscribe({
      next: response => this.applyPersonAnswer(person, response, 'The exceptions could not be cleared.'),
      error: err => {
        this.assigning.set(null);
        this.toast.error(err?.error?.message || 'The exceptions could not be cleared.');
      },
    });
  }

  private applyPersonAnswer(person: AccessPerson, response: ApiResponse<AccessPerson>, fallback: string): void {
    this.assigning.set(null);
    if (response.status !== API_SUCCESS || !response.data) {
      this.toast.error(response.message || fallback);
      // Nothing changed server-side, so the checkbox must not stay where the click left it.
      this.people.update(rows => rows.map(row => row.appUserId === person.appUserId ? { ...row } : row));
      return;
    }
    this.toast.success(response.message);
    const updated = response.data;
    this.people.update(rows => rows.map(row => row.appUserId === person.appUserId
      ? { ...row, pageKeys: updated.pageKeys, allowedExceptions: updated.allowedExceptions, withheldExceptions: updated.withheldExceptions,
          pageAccessProfileId: updated.pageAccessProfileId, pageAccessProfileName: updated.pageAccessProfileName }
      : row));
  }
}
