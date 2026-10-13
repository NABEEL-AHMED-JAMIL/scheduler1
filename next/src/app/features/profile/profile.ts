import { CROP_SESSION } from '../../shared/ui/avatar-crop-session';
import { Component, OnInit, computed, inject, signal, viewChild } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Dialog } from '@angular/cdk/dialog';
import { confirmWith } from '../../shared/ui/confirm';

import { RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { AuthService } from '../../core/auth/auth.service';
import { UnreadCountService } from '../../core/notifications/unread-count.service';
import { roleLabel as labelOf } from '../../core/auth/auth.models';
import { BillingBrief } from '../billing/billing-brief';
import { ToastService } from '../../shared/ui/toast.service';
import { copyText } from '../../shared/ui/clipboard.util';
import { PhoneInput } from '../../shared/ui/phone-input';
import { Icon } from '../../shared/ui/icon';
import { CopyButton } from '../../shared/ui/copy-button';
import { StatusPill } from '../../shared/ui/status-pill';
import { Avatar, AvatarCache } from '../../shared/ui/avatar';
import { pictureProblem } from './picture-check';
import { Donut } from '../../shared/charts/donut';
import { statusColor } from '../../shared/charts/status-color';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { formatDuration } from '../../shared/ui/time-format';
import { instantMs } from '../../core/instant';
import { Field } from '../../shared/ui/field';
import { StatTile } from '../../shared/ui/stat-tile';
import { AccountSecurityApi, PasswordRules } from '../account/account-security.api';
import { PasswordRulesHint, newPasswordPlaceholder } from '../account/password-rules';
import { PageHeader } from '../../shared/ui/page-header';

/** One run of one of the caller's jobs, as /sourceJob.json/myActivity reports it. */
export interface ActivityRun {
  jobQueueId: number;
  jobId: number;
  jobName: string;
  jobStatus: string;
  startTime?: string;
  endTime?: string;
  /** Only present on a failure -- a completed run has nothing to explain. */
  jobStatusMessage?: string;
}

export interface UserActivity {
  jobsAssigned: number;
  activeJobs: number;
  recentRuns: number;
  recentFailures: number;
  windowDays: number;
  runs: ActivityRun[];
  outcomes: { name: string; value: number }[];
}

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
  /** The version of their profile picture; null or absent when they have none. */
  avatarVersion?: string | null;
  position?: string | null;
  /** E.164, exactly as the admin screen and the server hold it. */
  phoneNumber?: string | null;
}

@Component({
  selector: 'app-profile',
  imports: [PageHeader, PhoneInput, Icon, Avatar, CopyButton, ServerTimePipe, RouterLink, StatusPill, Donut, BillingBrief, Field, StatTile, PasswordRulesHint],
  templateUrl: './profile.html',
})
export class Profile implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly dialog = inject(Dialog);
  private readonly toast = inject(ToastService);
  private readonly pictures = inject(AvatarCache);
  readonly auth = inject(AuthService);
  private readonly security = inject(AccountSecurityApi);

  readonly profile = signal<UserProfile | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');

  readonly name = signal('');
  readonly savingName = signal(false);
  readonly uploading = signal(false);
  readonly activity = signal<UserActivity | null>(null);
  readonly activityLoading = signal(true);
  /**
   * Whether the activity call came back at all.
   *
   * A failed request and a person with no jobs both leave `activity` null, and the card read the
   * pair as the same thing -- so a 500 on this endpoint told everybody they had no jobs assigned,
   * which for someone who runs a dozen is a plainly wrong statement rather than an empty card.
   */
  readonly activityFailed = signal(false);
  /** The header badge's count, so marking notifications read elsewhere moves this tile too. */
  private readonly notifications = inject(UnreadCountService);
  readonly unread = this.notifications.count;

  /** A picture is being dragged over the portrait: it says it will take it. */
  readonly dragging = signal(false);

  /** Owned by the phone component, which validates against the same metadata the server uses. */
  readonly phone = signal<string>('');
  private readonly phoneInput = viewChild(PhoneInput);

  /**
   * Whether the phone box may show its error yet.
   *
   * False while typing -- half a number is invalid by definition, and flagging it on every
   * keystroke is noise. Flipped on the first save attempt, which is this card's equivalent of
   * submitting a form.
   */
  readonly phoneSubmitted = signal(false);
  readonly position = signal<string>('');

  /**
   * Whether Save has anything to do.
   *
   * Covers every editable field, not just the name. It was name-only, so a corrected phone
   * number left the button disabled and the change silently unsaveable.
   *
   * A blank phone or title is a legitimate edit that clears the field. A blank name is a change
   * too, and one the server refuses; it used to count as "nothing changed", which hid Save and
   * Cancel without a word. nameMissing blocks it instead, and the field says why.
   */
  readonly detailsChanged = computed(() => {
    const p = this.profile();
    return this.name().trim() !== (p?.fullName ?? '').trim()
        || this.phone().trim() !== (p?.phoneNumber ?? '').trim()
        || this.position().trim() !== (p?.position ?? '').trim();
  });

  /**
   * The server serves this person's activity whatever their access profile, but the Jobs page
   * may be one it withholds. The figures stay; they just stop linking to the unauthorized page.
   */
  readonly canOpenJobs = computed(() => this.auth.canOpen('jobs'));

  readonly nameMissing = computed(() => !this.name().trim());
  readonly nameError = computed(() => (this.nameMissing() && this.detailsChanged() ? 'Display name is required.' : ''));

  /**
   * Where a picture is written. MinIO first: it is the store this platform actually runs,
   * and taking whatever connection happened to be listed first sent a picture at an S3
   * profile that quietly kept nothing. Falls back to any connection only when no MinIO one
   * exists, and sticks with the bucket already in use so a replacement lands beside the
   * original rather than orphaning it.
   */
  /** Briefly true after a copy, so the button can confirm it worked. */
  readonly emailCopied = signal(false);

  /**
   * How many jobs are in this person's name.
   *
   * From the server now. It used to fetch every job in the tenant and keep the ones whose
   * assignedUsername matched -- so showing somebody their own three jobs cost the whole
   * workspace's job list, and it matched on a display name rather than on an id.
   */
  readonly jobsAssigned = computed(() => this.activity()?.jobsAssigned ?? 0);
  readonly activeJobs = computed(() => this.activity()?.activeJobs ?? 0);
  readonly recentRuns = computed(() => this.activity()?.recentRuns ?? 0);
  readonly recentFailures = computed(() => this.activity()?.recentFailures ?? 0);
  readonly windowDays = computed(() => this.activity()?.windowDays ?? 7);
  readonly runs = computed<ActivityRun[]>(() => this.activity()?.runs ?? []);

  /** How the jobs in their name last ran -- counted in the database, not over a full job list. */
  readonly myOutcomes = computed(() => this.activity()?.outcomes ?? []);

  readonly outcomeColor = (name: string) => statusColor(name);

  /** Whole days since the account was made, for the one line that gives the page a sense of
      time without inventing a metric. */
  readonly memberDays = computed(() => {
    const created = this.profile()?.dateCreated;
    if (!created) return 0;
    const days = (Date.now() - new Date(created).getTime()) / 86400000;
    return Math.max(0, Math.floor(days));
  });

  /**
   * How long a run took, or how long it has been going.
   *
   * Written out in words rather than as a clock, because these are read at a glance and "1h 4m"
   * is the answer to "did that take longer than usual", which a reader can only get from
   * "01:04:12" by doing the subtraction themselves. In formatDuration's words, so a run reads the
   * same here as on Jobs and Queue (MIG-295).
   *
   * Both ends through instantMs: a run still going is measured against Date.now(), a real instant,
   * and new Date() read the server's wall-clock start as the reader's own, hours off outside Chicago.
   */
  runDuration(run: ActivityRun): string {
    const started = instantMs(run.startTime);
    if (started === null) return '';
    const finished = run.endTime ? instantMs(run.endTime) : Date.now();
    if (finished === null) return '';
    return formatDuration(Math.max(0, (finished - started) / 1000));
  }

  /** True while a run has started and not finished, so the duration reads as "so far". */
  stillRunning(run: ActivityRun): boolean {
    return !!run.startTime && !run.endTime;
  }

  ngOnInit(): void {
    this.load();
    if (!this.auth.isManagedSession()) {
      this.security.myRules().subscribe({
        next: r => { if (r.status === API_SUCCESS && r.data) this.rules.set(r.data); },
        error: () => { /* the server still holds the rules */ },
      });
    }
    this.http.get<ApiResponse<UserActivity>>(`${API_BASE}/sourceJob.json/myActivity`).subscribe({
      next: r => {
        this.activityLoading.set(false);
        if (r.status === API_SUCCESS) this.activity.set(r.data ?? null);
        else this.activityFailed.set(true);
      },
      // Supplementary: a profile that cannot render because the activity call failed would be a
      // worse page than one whose activity card says it could not be read.
      error: () => { this.activityLoading.set(false); this.activityFailed.set(true); },
    });
    this.notifications.refresh();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.http.get<ApiResponse<UserProfile>>(`${API_BASE}/appUser.json/me`).subscribe({
      next: response => {
        this.loading.set(false);
        if (response.status === API_SUCCESS && response.data) {
          this.profile.set(response.data);
          // Every editable field, not just the name: a field left unset would render empty and
          // then read as "cleared" the next time anything was saved.
          this.resetDetails();
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
  /** MIG-353: the workspace's password rules, beside the new password. */
  readonly rules = signal<PasswordRules | null>(null);
  readonly newPasswordHint = computed(() => newPasswordPlaceholder(this.rules()));

  canChangePassword(): boolean {
    return !!this.currentPassword() && this.newPassword().length >= (this.rules()?.passwordMinLength ?? 8);
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
          // Against a server that hands back no new pair the change has signed this session out
          // (the interceptor did it, before this ran): there is no profile left to re-read.
          if (!this.auth.isLoggedIn()) return;
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

  /** Puts every editable field back to what the server last returned. */
  resetDetails(): void {
    const p = this.profile();
    this.name.set(p?.fullName ?? '');
    this.position.set(p?.position ?? '');
    this.phone.set(p?.phoneNumber ?? '');
  }

  saveName(): void {
    if (!this.detailsChanged() || this.nameMissing()) return;
    // The component empties `value` on an invalid number, so without this a bad entry looks
    // like a deliberate clearing: Save lights up and the stored number is wiped while the
    // person believes they corrected it.
    this.phoneSubmitted.set(true);
    if (this.phoneInput()?.error()) {
      this.toast.error('Check the phone number before saving.');
      return;
    }
    this.savingName.set(true);
    // Empty clears rather than omits: sending undefined would leave a stale value in place, so
    // a person could never remove a number once they had set one.
    this.http.put<ApiResponse<UserProfile>>(`${API_BASE}/appUser.json/updateOwnProfile`,
      { fullName: this.name().trim(),
        position: this.position().trim() || null,
        phoneNumber: this.phone().trim() || null }).subscribe({
      next: response => {
        this.savingName.set(false);
        if (response.status === API_SUCCESS && response.data) {
          this.profile.set(response.data);
          // Re-read from the response: the server normalises a phone number to E.164, so what
          // it kept is not always the digits that were typed.
          this.resetDetails();
          this.syncHeader(response.data);
          this.toast.success('Profile updated.');
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

  /** A picture chosen with the button. */
  async onPicture(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (file) await this.pick(file);
  }

  /** A picture dropped on the portrait. */
  async onDrop(event: DragEvent): Promise<void> {
    event.preventDefault();
    this.dragging.set(false);
    const file = event.dataTransfer?.files?.[0];
    if (file && !this.uploading()) await this.pick(file);
  }

  onDragOver(event: DragEvent): void {
    if (!event.dataTransfer?.types?.includes('Files')) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    this.dragging.set(true);
  }

  /**
   * Checked by its bytes (PNG, JPEG or WebP, at most 5 MB, never SVG), then cropped to a square in the dialog -- loaded
   * only now, so Profile does not carry it -- and sent. The server checks it again, strips its metadata and keeps the
   * 256 and 64 px copies.
   */
  async pick(file: File): Promise<void> {
    const problem = await pictureProblem(file);
    if (problem) {
      this.toast.error(problem);
      return;
    }
    const { AvatarCropDialog } = await import('../../shared/ui/avatar-crop-dialog');
    this.dialog.open<Blob>(AvatarCropDialog, {
      hasBackdrop: true,
      ariaLabel: 'Position your picture',
      providers: ref => [{ provide: CROP_SESSION, useValue: { file, close: (square?: Blob) => ref.close(square) } }],
    }).closed.subscribe(cropped => {
      if (cropped) this.upload(cropped);
    });
  }

  private upload(picture: Blob): void {
    const form = new FormData();
    form.append('file', picture, 'avatar.png');
    this.uploading.set(true);
    this.http.post<ApiResponse<{ avatarVersion: string | null }>>(`${API_BASE}/appUser.json/avatar`, form).subscribe({
      next: response => this.pictureChanged(response, 'Picture updated.'),
      error: err => {
        this.uploading.set(false);
        this.toast.error(err?.error?.message || 'The upload failed.');
      },
    });
  }

  removePicture(): void {
    // Asked first, in the app's own dialog: the picture is gone from every screen at once.
    confirmWith(this.dialog, { title: 'Remove your profile picture?', body: 'Your initials are shown instead, everywhere your name appears. You can upload a new one any time.', confirmLabel: 'Remove picture', danger: true })
      .then(ok => {
        if (!ok) return;
        this.uploading.set(true);
        this.http.delete<ApiResponse<{ avatarVersion: string | null }>>(`${API_BASE}/appUser.json/avatar`).subscribe({
          next: response => this.pictureChanged(response, 'Picture removed.'),
          error: err => {
            this.uploading.set(false);
            this.toast.error(err?.error?.message || 'Could not remove the picture.');
          },
        });
      });
  }

  /** The new version everywhere at once: this page, the top bar, and every avatar of this person already on screen. */
  private pictureChanged(response: ApiResponse<{ avatarVersion: string | null }>, done: string): void {
    this.uploading.set(false);
    if (response.status !== API_SUCCESS) {
      this.toast.error(response.message);
      return;
    }
    const avatarVersion = response.data?.avatarVersion ?? null;
    const me = this.profile();
    if (me) {
      this.pictures.forget(me.appUserId);
      this.profile.set({ ...me, avatarVersion });
    }
    this.auth.patchUser({ avatarVersion });
    this.toast.success(done);
  }

  /** Keeps the header avatar and name in step without a reload. */
  private syncHeader(p: UserProfile): void {
    this.auth.patchUser({
      fullName: p.fullName,
      avatarVersion: p.avatarVersion ?? null,
    });
  }

  roleLabel(role?: string | null): string {
    return labelOf(role);
  }

  /**
   * Copies the address and says so.
   *
   * The confirmation matters more than usual here: a copy leaves no trace on the page, so
   * without it there is no way to tell a successful copy from a click that missed.
   */
  copyEmail(): void {
    const address = this.profile()?.username;
    if (!address) {
      return;
    }
    copyText(address).then(ok => {
      if (!ok) {
        this.toast.error('Could not copy the address.');
        return;
      }
      this.emailCopied.set(true);
      setTimeout(() => this.emailCopied.set(false), 1500);
    });
  }
}
