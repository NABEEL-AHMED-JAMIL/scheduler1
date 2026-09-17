import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { forkJoin } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { PageCatalogueEntry } from '../../../core/auth/page-keys';
import { Icon } from '../../../shared/ui/icon';
import { StatTile } from '../../../shared/ui/stat-tile';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { AccessProfile, AccessProfilesService } from './access-profiles.service';
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
  imports: [Icon, StatTile, RouterLink],
  templateUrl: './access-profiles.html',
})
export class AccessProfiles implements OnInit {
  private readonly api = inject(AccessProfilesService);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);

  readonly profiles = signal<AccessProfile[]>([]);
  readonly pages = signal<PageCatalogueEntry[]>([]);
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
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    forkJoin({ pages: this.api.pages(), profiles: this.api.list() }).subscribe({
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

  /** The page labels a profile opens, in catalogue order, for the card. */
  labelsFor(profile: AccessProfile): string[] {
    return this.pages().filter(p => profile.pageKeys.includes(p.key)).map(p => p.label);
  }

  /** And the ones it does not, so the card also says what is missing. */
  missingFor(profile: AccessProfile): string[] {
    return this.pages().filter(p => !profile.pageKeys.includes(p.key)).map(p => p.label);
  }

  private dialogData(profile?: AccessProfile): AccessProfileDialogData {
    return { profile, pages: this.pages(), first: this.profiles().length === 0 };
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
