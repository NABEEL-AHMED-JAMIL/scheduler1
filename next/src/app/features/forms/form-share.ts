import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { API_SUCCESS } from '../../core/api/api.config';
import { copyText } from '../../shared/ui/clipboard.util';
import { Icon } from '../../shared/ui/icon';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { ToastService } from '../../shared/ui/toast.service';
import { ShareLink, ShareLinks, shareUrl } from './forms.model';
import { FormsApi } from './forms.service';

/** How long a new link lasts, in days. */
const DAY_CHOICES = [1, 7, 14, 30, 90];

/**
 * Form builder › Settings › Share by link (MIG-278; a workspace administrator's). Off until an administrator turns it on
 * for the workspace. A link opens one Active form for anyone who holds it, until it expires, is used up or is revoked;
 * its address is shown once, when it is made -- only a hash of it is kept, so nobody can read it again.
 */
@Component({
  selector: 'app-form-share',
  imports: [Icon, ServerTimePipe],
  template: `
    <section class="card p-4 flex flex-col gap-4 max-w-4xl" data-share aria-labelledby="share-heading">
      <div class="flex flex-wrap items-start gap-3">
        <div class="min-w-0 flex-1">
          <h2 id="share-heading" class="text-base font-semibold flex items-center gap-2"><app-icon name="link" />Share by link</h2>
          <p class="text-sm text-[color:var(--text-secondary)]">
            People outside the workspace fill this form in through a link: they see the form and nothing else.
          </p>
        </div>
        @if (state(); as s) {
          <label class="flex items-center gap-2 text-sm" [class.opacity-60]="locked() || busy()">
            <input type="checkbox" class="checkbox" data-share-policy [checked]="s.enabled" [disabled]="locked() || busy()"
                   (change)="setPolicy($any($event.target).checked)" />
            Sharing by link is {{ s.enabled ? 'on' : 'off' }} for this workspace
          </label>
        }
      </div>

      @if (loading()) {
        <p class="text-sm text-[color:var(--text-muted)]" role="status">Loading links…</p>
      } @else if (error()) {
        <p class="text-sm text-crit-500" role="alert">{{ error() }}
          <button type="button" class="btn btn-ghost btn-xs" (click)="load()">Try again</button></p>
      } @else if (state(); as s) {
        @if (!s.enabled) {
          <p class="text-sm text-[color:var(--text-muted)]" role="note">
            Off: no link of this workspace opens anything. Turn it on to make links; turning it off again stops them all at once.
          </p>
        } @else if (!s.shareable) {
          <p class="text-sm text-[color:var(--text-secondary)]" role="note">{{ s.whyNot }}</p>
        } @else {
          <form class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4 items-end" (submit)="$event.preventDefault(); create()" data-share-new>
            <div class="field sm:col-span-2 xl:col-span-1">
              <label class="label" for="shareLabel">Label</label>
              <input id="shareLabel" class="input" maxlength="200" placeholder="Front desk tablet" [value]="label()"
                     [disabled]="locked()" (input)="label.set($any($event.target).value)" />
            </div>
            <div class="field">
              <label class="label" for="shareDays">Works for</label>
              <select id="shareDays" class="input" [disabled]="locked()" (change)="days.set(+$any($event.target).value)">
                @for (d of dayChoices; track d) { <option [value]="d" [selected]="days() === d">{{ d === 1 ? '1 day' : d + ' days' }}</option> }
              </select>
            </div>
            <div class="field">
              <label class="label" for="shareMax">Submissions</label>
              <select id="shareMax" class="input" [disabled]="locked()" (change)="maxSubmissions.set(+$any($event.target).value || null)">
                <option value="" [selected]="maxSubmissions() === null">No cap</option>
                <option value="1" [selected]="maxSubmissions() === 1">One (single use)</option>
                <option value="10" [selected]="maxSubmissions() === 10">10</option>
                <option value="100" [selected]="maxSubmissions() === 100">100</option>
              </select>
            </div>
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 text-sm">
                <input type="checkbox" class="checkbox" [checked]="requireSignIn()" [disabled]="locked()"
                       (change)="requireSignIn.set($any($event.target).checked)" />Only signed-in members
              </label>
              <button type="submit" class="btn btn-primary btn-sm" [disabled]="locked() || busy()">
                <app-icon name="plus" />{{ busy() ? 'Making…' : 'Make link' }}
              </button>
            </div>
          </form>
        }

        @if (made(); as m) {
          <div class="rounded-md border border-subtle p-3 flex flex-col gap-2 bg-[color:var(--surface-inset)]" role="status" data-share-made>
            <p class="text-sm font-medium">Copy this link now: it is not shown again.</p>
            <div class="flex items-center gap-2 min-w-0">
              <input class="input mono text-xs flex-1 min-w-0" readonly [value]="m" aria-label="The new link"
                     (focus)="$any($event.target).select()" />
              <button type="button" class="btn btn-default btn-sm" (click)="copy(m)">
                <app-icon [name]="copied() ? 'check' : 'copy'" />{{ copied() ? 'Copied' : 'Copy' }}
              </button>
            </div>
          </div>
        }

        @if (s.links.length) {
          <div class="overflow-x-auto">
            <table class="table-modern" data-share-links>
              <thead>
                <tr><th>Link</th><th>Status</th><th class="text-right">Used</th><th>Expires</th><th class="hidden lg:table-cell">Last used</th><th></th></tr>
              </thead>
              <tbody>
                @for (l of s.links; track l.linkId) {
                  <tr>
                    <td class="min-w-0">
                      <span class="font-medium">{{ l.label || 'Link #' + l.linkId }}</span>
                      @if (l.requireSignIn) { <span class="pill pill-neutral ml-1">Members only</span> }
                    </td>
                    <td><span class="pill" [class.pill-ok]="l.status === 'Active'" [class.pill-neutral]="l.status !== 'Active'">{{ l.status }}</span></td>
                    <td class="text-right tabular-nums">{{ l.usedCount }}{{ l.maxSubmissions ? ' / ' + l.maxSubmissions : '' }}</td>
                    <td class="whitespace-nowrap">{{ l.expiresAt | serverTime:'dateTime' }}</td>
                    <td class="hidden lg:table-cell whitespace-nowrap">{{ l.lastUsedAt ? (l.lastUsedAt | serverTime:'dateTime') : '—' }}</td>
                    <td class="text-right">
                      @if (l.status === 'Active') {
                        <button type="button" class="btn btn-ghost btn-xs" [disabled]="locked() || busy()"
                                [attr.aria-label]="'Revoke ' + (l.label || 'link ' + l.linkId)" (click)="revoke(l)">Revoke</button>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        } @else if (s.enabled && s.shareable) {
          <p class="text-sm text-[color:var(--text-muted)]">No links yet.</p>
        }
      }
    </section>
  `,
})
export class FormShare implements OnInit {
  private readonly api = inject(FormsApi);
  private readonly toast = inject(ToastService);

  readonly formId = input.required<number>();
  /** Read-only, as the rest of the builder (a MANAGED workspace's customer). */
  readonly locked = input(false);

  readonly dayChoices = DAY_CHOICES;
  readonly loading = signal(true);
  readonly error = signal('');
  readonly busy = signal(false);
  readonly state = signal<ShareLinks | null>(null);
  readonly label = signal('');
  readonly days = signal(14);
  readonly maxSubmissions = signal<number | null>(null);
  readonly requireSignIn = signal(false);
  readonly made = signal('');
  readonly copied = signal(false);
  readonly activeCount = computed(() => (this.state()?.links ?? []).filter(l => l.status === 'Active').length);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.error.set('');
    this.api.shareLinks(this.formId()).subscribe({
      next: r => {
        this.loading.set(false);
        if (r.status !== API_SUCCESS || !r.data) { this.error.set(r.message || 'The links could not be read.'); return; }
        this.state.set(r.data);
      },
      error: err => { this.loading.set(false); this.error.set(err?.error?.message || 'The links could not be read.'); },
    });
  }

  setPolicy(enabled: boolean): void {
    if (this.locked() || this.busy()) return;
    this.busy.set(true);
    this.api.setSharePolicy(enabled).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status !== API_SUCCESS) { this.toast.error(r.message || 'The setting was not changed.'); this.load(); return; }
        this.toast.success(enabled ? 'Sharing by link is on for this workspace.' : 'Sharing by link is off: no link opens anything now.');
        if (!enabled) this.made.set('');
        this.load();
      },
      error: err => { this.busy.set(false); this.toast.error(err?.error?.message || 'The setting was not changed.'); this.load(); },
    });
  }

  create(): void {
    if (this.locked() || this.busy()) return;
    this.busy.set(true);
    this.made.set('');
    this.copied.set(false);
    this.api.createShareLink({ formId: this.formId(), label: this.label().trim(), days: this.days(),
      maxSubmissions: this.maxSubmissions(), requireSignIn: this.requireSignIn() }).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status !== API_SUCCESS || !r.data?.token) { this.toast.error(r.message || 'The link was not made.'); return; }
        this.made.set(shareUrl(location.origin, r.data.token));
        this.label.set('');
        this.load();
      },
      error: err => { this.busy.set(false); this.toast.error(err?.error?.message || 'The link was not made.'); },
    });
  }

  revoke(link: ShareLink): void {
    if (this.locked() || this.busy()) return;
    this.busy.set(true);
    this.api.revokeShareLink(link.linkId).subscribe({
      next: r => {
        this.busy.set(false);
        if (r.status !== API_SUCCESS) { this.toast.error(r.message || 'The link was not revoked.'); return; }
        this.toast.success(r.message || 'Link revoked.');
        this.load();
      },
      error: err => { this.busy.set(false); this.toast.error(err?.error?.message || 'The link was not revoked.'); },
    });
  }

  async copy(value: string): Promise<void> {
    this.copied.set(await copyText(value));
    if (!this.copied()) this.toast.error('Copy did not work here: select the link and copy it by hand.');
  }
}
