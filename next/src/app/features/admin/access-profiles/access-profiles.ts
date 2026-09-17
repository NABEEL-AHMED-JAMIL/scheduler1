import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { PageCatalogueEntry } from '../../../core/auth/page-keys';
import { Icon } from '../../../shared/ui/icon';
import { StatTile } from '../../../shared/ui/stat-tile';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { AccessPerson, AccessProfile, AccessProfilesService } from './access-profiles.service';
import { CdkMenu, CdkMenuItem, CdkMenuTrigger } from '@angular/cdk/menu';
import { Avatar } from '../../../shared/ui/avatar';
import { AccessProfileDialog, AccessProfileDialogData } from './access-profile-dialog';

/**
 * Administration > Access profiles: the named page bundles a workspace hands its tenant users.
 *
 * Cards rather than a table, because a profile is read as a whole -- "what does an Analyst
 * get?" -- and a row of ten tick marks does not answer that at a glance the way a list of page
 * chips does. The people on each profile are named on the card, so "who is affected if I
 * change this" is answered before the edit, not after.
 */
@Component({
  selector: 'app-access-profiles',
  imports: [Icon, StatTile, RouterLink, CdkMenu, CdkMenuItem, CdkMenuTrigger, Avatar],
  templateUrl: './access-profiles.html',
})
export class AccessProfiles implements OnInit {
  private readonly api = inject(AccessProfilesService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly http = inject(HttpClient);
  readonly auth = inject(AuthService);

  /**
   * A platform admin has no workspace of its own, so it picks one; the screen is empty until it
   * does. A tenant admin never sees the picker -- its workspace is the only one it can reach.
   */
  readonly canPickTenant = computed(() => this.auth.isPlatformAdmin());
  readonly tenants = signal<{ tenantId: number; tenantName: string }[]>([]);
  readonly tenantId = signal<number | null>(null);

  readonly profiles = signal<AccessProfile[]>([]);
  readonly pages = signal<PageCatalogueEntry[]>([]);

  /**
   * Two ways of reading the same facts. Cards answer "what does Analyst get"; the grid answers
   * "what does Olivia get" -- people down the side, pages across the top, one cell per pair,
   * derived from the profile each person holds. A cell is not a switch of its own: clicking it
   * offers the profiles that would change the answer, because the profile IS the model and a
   * grid that quietly diverged from it would be two truths.
   */
  readonly view = signal<'profiles' | 'people'>('profiles');
  readonly people = signal<AccessPerson[]>([]);
  readonly peopleLoading = signal(false);
  /** The person whose assignment is in flight. */
  readonly assigning = signal<number | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  /** The profile whose menu action is in flight, so its buttons go quiet. */
  readonly busy = signal<number | null>(null);

  readonly stats = computed(() => {
    const list = this.profiles();
    return {
      profiles: list.length,
      assigned: list.reduce((n, p) => n + (p.userCount ?? 0), 0),
      defaultName: list.find(p => p.defaultProfile)?.profileName ?? '',
      pages: this.pages().length,
    };
  });

  ngOnInit(): void {
    if (this.canPickTenant()) {
      this.http.get<ApiResponse<any[]>>(`${API_BASE}/tenant.json/listTenants`).subscribe({
        next: response => {
          if (response.status === API_SUCCESS) this.tenants.set(response.data ?? []);
        },
      });
      // Nothing to list until a workspace is chosen, but the catalogue is worth having ready.
      this.api.pages().subscribe({ next: r => { if (r.status === API_SUCCESS) this.pages.set(r.data ?? []); } });
      return;
    }
    this.load();
  }

  pickTenant(value: string): void {
    const id = Number(value);
    this.tenantId.set(Number.isFinite(id) && id > 0 ? id : null);
    this.profiles.set([]);
    this.people.set([]);
    if (this.tenantId()) {
      this.load();
      if (this.view() === 'people') this.loadPeople();
    }
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({ pages: this.api.pages(), profiles: this.api.list(this.tenantId()) }).subscribe({
      next: ({ pages, profiles }) => {
        this.loading.set(false);
        if (pages.status === API_SUCCESS) this.pages.set(pages.data ?? []);
        if (profiles.status === API_SUCCESS) {
          this.profiles.set(profiles.data ?? []);
        } else {
          this.error.set(profiles.message || 'Access profiles could not be loaded.');
        }
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Access profiles could not be loaded.');
      },
    });
  }

  showPeople(): void {
    this.view.set('people');
    this.loadPeople();
  }

  showProfiles(): void {
    this.view.set('profiles');
  }

  loadPeople(): void {
    if (this.canPickTenant() && !this.tenantId()) return;
    this.peopleLoading.set(true);
    this.api.people(this.tenantId()).subscribe({
      next: response => {
        this.peopleLoading.set(false);
        if (response.status === API_SUCCESS) this.people.set(response.data ?? []);
        else this.toast.error(response.message);
      },
      error: err => {
        this.peopleLoading.set(false);
        this.toast.error(err?.error?.message || 'People could not be loaded.');
      },
    });
  }

  opens(person: AccessPerson, page: PageCatalogueEntry): boolean {
    return person.pageKeys.includes(page.key);
  }

  /** The profiles that would flip this cell: the ones whose answer for the page differs. */
  alternativesFor(person: AccessPerson, page: PageCatalogueEntry): AccessProfile[] {
    const has = this.opens(person, page);
    return this.profiles().filter(p => p.pageKeys.includes(page.key) !== has);
  }

  /** The pages of the default profile, for the grid's first row. */
  readonly defaultProfile = computed(() => this.profiles().find(p => p.defaultProfile) ?? null);

  assign(person: AccessPerson, profile: AccessProfile | null): void {
    const target = profile?.pageAccessProfileId ?? null;
    if (target === person.pageAccessProfileId) return;
    this.assigning.set(person.appUserId);
    this.api.assign(person.appUserId, target).subscribe({
      next: response => {
        this.assigning.set(null);
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message || 'Profile changed.');
          const updated = response.data;
          this.people.update(rows => rows.map(row => row.appUserId === person.appUserId && updated
            ? { ...row, pageAccessProfileId: updated.pageAccessProfileId, pageAccessProfileName: updated.pageAccessProfileName, pageKeys: updated.pageKeys }
            : row));
          // Holder counts on the cards moved too.
          this.api.list(this.tenantId()).subscribe({ next: r => { if (r.status === API_SUCCESS) this.profiles.set(r.data ?? []); } });
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.assigning.set(null);
        this.toast.error(err?.error?.message || 'The profile could not be changed.');
      },
    });
  }

  assignById(person: AccessPerson, value: string): void {
    const id = Number(value);
    this.assign(person, id > 0 ? (this.profiles().find(p => p.pageAccessProfileId === id) ?? null) : null);
  }

  /** The page labels a profile opens, in catalogue order, for the card. */
  labelsFor(profile: AccessProfile): string[] {
    return this.pages().filter(p => profile.pageKeys.includes(p.key)).map(p => p.label);
  }

  /** And the ones it does not, so the card also says what is missing. */
  missingFor(profile: AccessProfile): string[] {
    return this.pages().filter(p => !profile.pageKeys.includes(p.key)).map(p => p.label);
  }

  private dialogData(profile?: AccessProfile): AccessProfileDialogData {
    return { profile, pages: this.pages(), first: this.profiles().length === 0, tenantId: this.tenantId() };
  }

  add(): void {
    this.dialog.open<boolean>(AccessProfileDialog, { data: this.dialogData() }).closed.subscribe(saved => {
      if (saved) this.load();
    });
  }

  edit(profile: AccessProfile): void {
    this.dialog.open<boolean>(AccessProfileDialog, { data: this.dialogData(profile) }).closed.subscribe(saved => {
      if (saved) this.load();
    });
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
      confirmLabel: 'Delete',
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
}
