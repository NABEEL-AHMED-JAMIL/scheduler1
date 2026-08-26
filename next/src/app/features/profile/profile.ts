import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DatePipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { Icon } from '../../shared/ui/icon';
import { StatusPill } from '../../shared/ui/status-pill';
import { BucketSummary, StorageService } from '../objects/storage.service';
import { Donut } from '../../shared/charts/donut';
import { statusColor } from '../../shared/charts/status-color';

interface UserProfile {
  mustChangePassword?: boolean;
  appUserId: number;
  username: string;
  fullName: string;
  userRole: string;
  status: string;
  tenantId?: number | null;
  tenantName?: string;
  dateCreated?: string;
  lastLoginAt?: string;
  avatarBucket?: string | null;
  avatarKey?: string | null;
}

/** Anything the browser will actually render inline as a picture. */
const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;

@Component({
  selector: 'app-profile',
  imports: [Icon, DatePipe, RouterLink, StatusPill, Donut],
  templateUrl: './profile.html',
})
export class Profile implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly toast = inject(ToastService);
  private readonly storage = inject(StorageService);
  readonly auth = inject(AuthService);

  readonly profile = signal<UserProfile | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly name = signal('');
  readonly savingName = signal(false);
  readonly uploading = signal(false);

  readonly buckets = signal<BucketSummary[]>([]);
  readonly jobs = signal<any[]>([]);
  readonly unread = signal(0);

  /** Where a new picture goes. Avatars are small and personal, so they sit under one prefix
      in whichever bucket is available rather than being scattered per tenant. */
  /**
   * Where a picture lives: <appUserId>/profile/avatar.<ext>.
   *
   * A folder per person rather than one flat prefix, so everything belonging to a user sits
   * together and can be removed with them. The "profile" folder inside leaves room for whatever
   * else a user might own later without it landing beside the picture.
   *
   * The filename is fixed rather than the uploaded one, so replacing a picture overwrites
   * instead of leaving the previous file behind. Changing format (png to jpg) still strands the
   * old object, but inside that user's own folder rather than mixed in with everyone else's.
   */
  private static folderFor(appUserId: number | null | undefined): string {
    return `${appUserId}/profile/`;
  }

  /** Same blob URL the header uses -- fetched once, through the interceptor, so the token
      travels with it. */
  readonly avatarUrl = this.auth.avatarUrl;

  readonly nameChanged = computed(() =>
    this.name().trim() !== (this.profile()?.fullName ?? '').trim() && !!this.name().trim());

  /**
   * Where a picture is written. MinIO first: it is the store this platform actually runs,
   * and taking whatever connection happened to be listed first sent a picture at an S3
   * profile that quietly kept nothing. Falls back to any connection only when no MinIO one
   * exists, and sticks with the bucket already in use so a replacement lands beside the
   * original rather than orphaning it.
   */
  readonly targetBucket = computed(() => {
    const inUse = this.profile()?.avatarBucket;
    if (inUse) return inUse;
    const all = this.buckets();
    const minio = all.find(b => (b.provider ?? '').toUpperCase() === 'MINIO');
    return minio?.bucket || all[0]?.bucket || '';
  });

  readonly myJobs = computed(() => {
    const me = this.profile()?.username;
    if (!me) return [];
    return this.jobs().filter(j => j.assignedUsername === me);
  });

  /** How the jobs in their name are currently sitting -- the one picture worth having here,
      since a profile is about the person rather than the platform. */
  readonly myOutcomes = computed(() => {
    const counts = new Map<string, number>();
    for (const job of this.myJobs()) {
      const status = job.jobRunningStatus || 'Not run';
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  });

  readonly outcomeColor = (name: string) => statusColor(name);

  /** Whole days since the account was made, for the one line that gives the page a sense of
      time without inventing a metric. */
  readonly memberDays = computed(() => {
    const created = this.profile()?.dateCreated;
    if (!created) return 0;
    const days = (Date.now() - new Date(created).getTime()) / 86400000;
    return Math.max(0, Math.floor(days));
  });

  readonly runsToday = computed(() =>
    this.myJobs().filter(j => j.jobRunningStatus && j.jobRunningStatus !== 'Missed').length);

  ngOnInit(): void {
    this.load();
    this.storage.buckets().subscribe({
      next: r => { if (r.status === API_SUCCESS) this.buckets.set(r.data ?? []); },
      error: () => { /* the page still works; uploading just has nowhere to go */ },
    });
    this.http.get<ApiResponse<any[]>>(`${API_BASE}/sourceJob.json/listSourceJob`).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.jobs.set(r.data ?? []); },
      error: () => { /* activity is supplementary */ },
    });
    this.http.get<ApiResponse<number>>(`${API_BASE}/notification.json/unreadCount`).subscribe({
      next: r => { if (r.status === API_SUCCESS) this.unread.set(Number(r.data ?? 0)); },
      error: () => { /* leave at zero */ },
    });
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<UserProfile>>(`${API_BASE}/appUser.json/me`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status === API_SUCCESS && response.data) {
          this.profile.set(response.data);
          this.name.set(response.data.fullName ?? '');
          this.syncHeader(response.data);
        } else {
          this.error.set(response.message);
        }
      },
      error: err => {
        this.loading.set(false);
        this.error.set(err?.error?.message || 'Could not load your profile.');
      },
    });
  }

  // ---- password ------------------------------------------------------------------------
  readonly currentPassword = signal('');
  readonly newPassword = signal('');
  readonly savingPassword = signal(false);
  readonly passwordError = signal('');

  canChangePassword(): boolean {
    return !!this.currentPassword() && this.newPassword().length >= 8;
  }

  /**
   * Changing a password is its own call rather than part of updateOwnProfile, which changes
   * what someone is called rather than how they prove who they are. Both values are cleared
   * whatever the outcome, so neither sits in a component after the request.
   */
  changePassword(): void {
    if (!this.canChangePassword() || this.savingPassword()) return;
    this.passwordError.set('');
    this.savingPassword.set(true);
    this.http.put<ApiResponse>(`${API_BASE}/appUser.json/changeOwnPassword`, {
      currentPassword: this.currentPassword(),
      newPassword: this.newPassword(),
    }).subscribe({
      next: response => {
        this.savingPassword.set(false);
        this.currentPassword.set('');
        this.newPassword.set('');
        if (response.status === API_SUCCESS) {
          this.toast.success(response.message);
          // The notice at the top is driven by the profile, so it is re-read rather than guessed.
          this.load();
        } else {
          this.passwordError.set(response.message);
        }
      },
      error: err => {
        this.savingPassword.set(false);
        this.currentPassword.set('');
        this.newPassword.set('');
        this.passwordError.set(err?.error?.message || 'Your password could not be changed.');
      },
    });
  }

  saveName(): void {
    if (!this.nameChanged()) return;
    this.savingName.set(true);
    this.http.put<ApiResponse<UserProfile>>(`${API_BASE}/appUser.json/updateOwnProfile`,
      { fullName: this.name().trim() }).subscribe({
      next: response => {
        this.savingName.set(false);
        if (response.status === API_SUCCESS && response.data) {
          this.profile.set(response.data);
          this.syncHeader(response.data);
          this.toast.success('Name updated.');
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.savingName.set(false);
        this.toast.error(err?.error?.message || 'Could not save your name.');
      },
    });
  }

  async onPicture(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    if (!IMAGE_TYPES.includes(file.type)) {
      this.toast.error('Pick a PNG, JPEG, WebP or GIF.');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      this.toast.error('That picture is over 2 MB — pick a smaller one.');
      return;
    }
    const bucket = this.targetBucket();
    if (!bucket) {
      this.toast.error('There is no storage connection to keep a picture in.');
      return;
    }

    const extension = file.name.slice(file.name.lastIndexOf('.') + 1).toLowerCase() || 'png';
    const folder = Profile.folderFor(this.profile()?.appUserId);
    const key = `${folder}avatar.${extension}`;

    this.uploading.set(true);
    this.storage.upload(bucket, folder, new File([file], `avatar.${extension}`))
      .subscribe({
        next: response => {
          if (response.status !== API_SUCCESS) {
            this.uploading.set(false);
            this.toast.error(response.message);
            return;
          }
          this.saveAvatar(bucket, key);
        },
        error: err => {
          this.uploading.set(false);
          this.toast.error(err?.error?.message || 'The upload failed.');
        },
      });
  }

  removePicture(): void {
    this.saveAvatar('', '');
  }

  private saveAvatar(bucket: string, key: string): void {
    this.http.put<ApiResponse<UserProfile>>(`${API_BASE}/appUser.json/updateOwnAvatar`,
      { avatarBucket: bucket, avatarKey: key }).subscribe({
      next: response => {
        this.uploading.set(false);
        if (response.status === API_SUCCESS && response.data) {
          this.profile.set(response.data);
          this.syncHeader(response.data);
          this.toast.success(key ? 'Picture updated.' : 'Picture removed.');
        } else {
          this.toast.error(response.message);
        }
      },
      error: err => {
        this.uploading.set(false);
        this.toast.error(err?.error?.message || 'Could not save the picture.');
      },
    });
  }

  /** Keeps the header avatar and name in step without a reload. */
  private syncHeader(p: UserProfile): void {
    this.auth.patchUser({
      fullName: p.fullName,
      avatarBucket: p.avatarBucket ?? null,
      avatarKey: p.avatarKey ?? null,
    });
  }

  roleLabel(role?: string): string {
    return (role ?? '').replace(/_/g, ' ').toLowerCase();
  }
}
