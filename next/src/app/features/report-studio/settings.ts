import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { PageHeader } from '../../shared/ui/page-header';
import { RefreshButton } from '../../shared/ui/refresh-button';
import { Icon } from '../../shared/ui/icon';
import { LoadError } from '../../shared/ui/load-error';
import { EmptyState } from '../../shared/ui/empty-state';
import { AuthService } from '../../core/auth/auth.service';
import { ToastService } from '../../shared/ui/toast.service';
import { AccessProfile, AccessProfilesService } from '../admin/access-profiles/access-profiles.service';
import { ReportStudioApi, studioError } from './report-studio.api';
import { Assignee, RetentionPreview, StudioSettings, size } from './report-studio.model';
import { RsTimePipe } from './rs-time.pipe';

/** The settings' "who": automatic (worked out from the page gate), an access profile, the administrators, or everyone. */
type WhoChoice = 'auto' | 'admins' | 'members' | `group:${number}`;

export function choiceOf(a: Assignee | null | undefined): WhoChoice {
  if (!a) return 'auto';
  if (a.kind === 'group') return `group:${Number(a.value)}`;
  if (a.kind === 'role') return a.value === 'TENANT_USER' ? 'members' : 'admins';
  return 'auto';
}

export function assigneeOf(c: WhoChoice): Assignee | null {
  if (c === 'auto') return null;
  if (c === 'admins') return { kind: 'role', value: 'TENANT_ADMIN' };
  if (c === 'members') return { kind: 'role', value: 'TENANT_USER' };
  return { kind: 'group', value: c.slice('group:'.length) };
}

/**
 * Report Studio › Settings (phase 7; workspace administrators): who approves reports and signatures and who publishes
 * templates -- the reviews' tasks go to their Task inbox --, whether every new version asks for approval by itself, a second
 * approver (RS-Q2, off by default) and publishing by a second person (off by default); and what the retention class
 * Reports would remove at so many days, with what it always keeps. Everything here is the workspace's own.
 */
@Component({
  selector: 'app-report-settings',
  imports: [PageHeader, RefreshButton, Icon, LoadError, EmptyState, FormsModule, RouterLink, RsTimePipe],
  templateUrl: './settings.html',
  styles: `
    .rss-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(28rem, 1fr)); gap: 1rem; align-items: start; }
    @media (max-width: 40rem) { .rss-grid { grid-template-columns: minmax(0, 1fr); } }
    .rss-row { display: flex; gap: 0.75rem; align-items: flex-start; padding: 0.75rem 0; border-top: 1px solid var(--border-subtle); }
    .rss-row:first-of-type { border-top: 0; }
    .rss-row > div { min-width: 0; flex: 1 1 auto; }
    .rss-why { font-size: 0.8125rem; color: var(--text-muted); }
    .rss-table td, .rss-table th { padding: 0.4rem 0.6rem; }
  `,
})
export class ReportSettings implements OnInit {
  private readonly api = inject(ReportStudioApi);
  private readonly profilesApi = inject(AccessProfilesService);
  private readonly toast = inject(ToastService);
  private readonly auth = inject(AuthService);
  /** ZT-R17: the settings are a workspace's own; a platform administrator is told so, not shown a refusal in red. */
  readonly workspaceOnly = computed(() => this.auth.isPlatformAdmin());

  readonly loading = signal(true);
  readonly error = signal('');
  readonly settings = signal<StudioSettings | null>(null);
  readonly profiles = signal<AccessProfile[]>([]);
  readonly reviewers = signal<WhoChoice>('auto');
  readonly publishers = signal<WhoChoice>('auto');
  readonly everyVersion = signal(false);
  readonly secondApprover = signal(false);
  readonly secondPerson = signal(false);
  readonly saving = signal(false);
  readonly days = signal(365);
  readonly preview = signal<RetentionPreview | null>(null);
  readonly previewing = signal(false);
  readonly previewError = signal('');
  readonly size = size;

  readonly dirty = computed(() => {
    const s = this.settings();
    return !!s && (choiceOf(s.approvals.reviewers) !== this.reviewers() || choiceOf(s.publishing.publishers) !== this.publishers()
      || s.approvals.everyVersion !== this.everyVersion() || s.approvals.secondApprover !== this.secondApprover()
      || s.publishing.secondPerson !== this.secondPerson());
  });

  /** The profiles that hold the page the decision needs, first; the others after, marked. */
  readonly approverProfiles = computed(() => this.sorted('report-approve'));
  readonly publisherProfiles = computed(() => this.sorted('report-publish'));

  ngOnInit(): void {
    this.load();
  }

  private sorted(key: string): (AccessProfile & { holds: boolean })[] {
    return this.profiles().map(p => ({ ...p, holds: (p.pageKeys as string[]).includes(key) }))
      .sort((a, b) => Number(b.holds) - Number(a.holds) || a.profileName.localeCompare(b.profileName));
  }

  load(): void {
    this.error.set('');
    if (this.workspaceOnly()) {
      this.loading.set(false);
      return;
    }
    this.loading.set(true);
    this.api.settings().subscribe({
      next: s => { this.apply(s); this.loading.set(false); },
      error: e => { this.loading.set(false); this.error.set(studioError(e, 'The settings could not be read.').message); },
    });
    this.profilesApi.list().subscribe({ next: r => this.profiles.set(r?.data ?? []), error: () => this.profiles.set([]) });
  }

  private apply(s: StudioSettings): void {
    this.settings.set(s);
    this.reviewers.set(choiceOf(s.approvals.reviewers));
    this.publishers.set(choiceOf(s.publishing.publishers));
    this.everyVersion.set(s.approvals.everyVersion);
    this.secondApprover.set(s.approvals.secondApprover);
    this.secondPerson.set(s.publishing.secondPerson);
  }

  /** The resolved "who" in words, from what the service worked out. */
  whoWords(resolved: { assignee: Assignee; automatic: boolean; why: string } | undefined): string {
    if (!resolved) return '';
    const a = resolved.assignee;
    const who = a.kind === 'group' ? `the access profile ${this.profiles().find(p => String(p.pageAccessProfileId) === a.value)?.profileName ?? '#' + a.value}`
      : a.kind === 'role' ? (a.value === 'TENANT_ADMIN' ? 'the workspace administrators' : 'every member') : `user #${a.value}`;
    return `Now: ${who}. ${resolved.why}`;
  }

  save(): void {
    const s = this.settings();
    if (!s) return;
    this.saving.set(true);
    this.api.saveSettings({
      approvals: { reviewers: assigneeOf(this.reviewers()), everyVersion: this.everyVersion(), secondApprover: this.secondApprover() },
      publishing: { publishers: assigneeOf(this.publishers()), secondPerson: this.secondPerson() },
      rowVersion: s.rowVersion,
    }).subscribe({
      next: () => { this.saving.set(false); this.toast.success('Report Studio\'s settings saved. New reviews follow them.'); this.load(); },
      error: e => { this.saving.set(false); this.toast.error(studioError(e).message); },
    });
  }

  runPreview(): void {
    const d = Math.round(Number(this.days()));
    if (!(d >= 1 && d <= 36500)) { this.previewError.set('Days are 1 to 36,500.'); return; }
    this.previewing.set(true);
    this.previewError.set('');
    this.api.retentionPreview(d).subscribe({
      next: p => { this.previewing.set(false); this.preview.set(p); },
      error: e => { this.previewing.set(false); this.previewError.set(studioError(e).message); },
    });
  }
}
