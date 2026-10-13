import { Component, OnDestroy, OnInit, computed, input, signal } from '@angular/core';
import { CUSTOMER_API_BASE } from '../../core/api/api.config';
import { formatSize } from '../../shared/ui/format-size';
import { Icon } from '../../shared/ui/icon';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import { StatusPill } from '../../shared/ui/status-pill';

/** One step of the run, as the customer API's Step. */
export interface EmbedStep {
  key: string;
  name: string | null;
  task: string | null;
  status: string;
  rowsIn: number | null;
  rowsOut: number | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMs: number | null;
  message: string | null;
}

/** A file the run made, with its download (a signed file link that ends no later than the view). */
export interface EmbedFile {
  id: string;
  name: string;
  role: string;
  contentType: string | null;
  bytes: number;
  expired: boolean;
  download: { url: string; expiresAt: string } | null;
}

export interface EmbedDecision { party: string; decision: string; reason: string | null; comment: string | null; decidedAt: string | null }

export interface EmbedReview {
  status: 'not_required' | 'pending' | 'approved' | 'rejected' | string;
  required: string[] | null;
  decidedAt: string | null;
  decisions: EmbedDecision[];
}

/** GET /v1/embed/runs/{token}: one run, read-only. Times are UTC instants (Z). */
export interface EmbedRunView {
  id: string;
  pipelineId: string;
  pipelineName: string | null;
  status: string;
  reference: string | null;
  createdAt: string | null;
  startedAt: string | null;
  endedAt: string | null;
  message: string | null;
  attempt: number;
  steps: EmbedStep[];
  files: EmbedFile[];
  review: EmbedReview;
  viewExpiresAt: string;
  refreshSeconds: number | null;
}

/** Why the view shows nothing, as the visitor reads it. */
export type EmbedRefusal = { title: string; text: string; retry: boolean };

/** The customer API's run and step words in the console's: the status chip already knows these. */
const STATUS_WORD: Record<string, string> = {
  queued: 'Queue', running: 'Running', completed: 'Completed', failed: 'Failed', skipped: 'Skip', interrupted: 'Interrupt',
  pending: 'Pending', approved: 'Approved', rejected: 'Rejected',
};

export function statusLabel(word: string | null | undefined): string {
  return STATUS_WORD[(word ?? '').toLowerCase()] ?? (word || '—');
}

/** "0b6bcb", "#0B6BCB" or "0bc" as a CSS colour; null for anything else (nothing but a hex colour reaches a style). */
export function accentOf(text: string | null | undefined): string | null {
  const hex = (text ?? '').trim().replace(/^#/, '');
  return /^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex) ? `#${hex.toLowerCase()}` : null;
}

/** The page's theme: ?theme=dark or light; otherwise the visitor's own preference. */
export function themeOf(text: string | null | undefined, prefersDark: boolean): 'light' | 'dark' {
  const t = (text ?? '').trim().toLowerCase();
  return t === 'dark' || t === 'light' ? t : prefersDark ? 'dark' : 'light';
}

/** What a refusal of the view means to the visitor; the API's own words are never shown. */
export function refusalOf(status: number, type?: string | null): EmbedRefusal {
  if (status === 410 && type === '/problems/link-expired') {
    return { title: 'This view has expired', text: 'Views open for a short time. Reload the page you came from for a new one.', retry: false };
  }
  if (status === 410) {
    return { title: 'This view no longer works', text: 'The link was withdrawn. Reload the page you came from.', retry: false };
  }
  if (status === 404 || status === 400) {
    return { title: 'This link is not valid', text: 'Check that the whole link was copied, or ask for a new one.', retry: false };
  }
  return { title: 'The run cannot be shown right now', text: 'Try again in a moment.', retry: true };
}

/** "1.2 s", "3 min 4 s": a step's time, short. */
export function durationLabel(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || ms < 0) return '';
  if (ms < 1000) return `${ms} ms`;
  const seconds = Math.round(ms / 100) / 10;
  if (seconds < 60) return `${seconds} s`;
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)} min ${whole % 60} s`;
}

/**
 * The embeddable run view (MIG-335), at /embed/runs/:token: one run of a workspace, read-only, for a customer's portal to
 * show in an iframe or open on its own. Outside the console's shell and sign-in: no navigation, no session, no cookies --
 * the link's token is the only key, and the data comes from the customer API's signed read (GET /v1/embed/runs/{token})
 * with credentials omitted, so a console session in the same browser is never sent.
 *
 * It shows the run's status and times, its steps in order, the files it made with a download each, and its review
 * (read-only: deciding stays with the API). A run still moving is read again every few seconds until it settles or the
 * view expires. ?theme=light|dark and ?accent=<hex> fit it to the portal; the console's own tokens do the rest. Times are
 * the viewer's local time, from the API's UTC instants. Where it may be framed is the console's server's to say
 * (Content-Security-Policy frame-ancestors from the API client's allow-list), not this page's.
 */
@Component({
  selector: 'app-embed-run-view',
  imports: [Icon, ServerTimePipe, StatusPill],
  host: { class: 'block min-h-screen bg-page', '[style.--embed-accent]': 'accentColor() ?? null' },
  template: `
    <main class="embed mx-auto w-full max-w-6xl px-4 sm:px-6 py-5" [attr.aria-busy]="loading()">
      @if (loading() && !view()) {
        <div class="card p-8 text-center text-sm text-[color:var(--text-muted)]" role="status">Opening the run…</div>
      } @else if (refusal(); as r) {
        <section class="card p-8 flex flex-col items-center gap-3 text-center" data-refused>
          <span class="stat-glyph"><app-icon [name]="r.retry ? 'alert' : 'lock'" class="icon-warn" /></span>
          <h1 class="text-lg font-semibold">{{ r.title }}</h1>
          <p class="text-sm text-[color:var(--text-secondary)] max-w-md">{{ r.text }}</p>
          @if (r.retry) {
            <button type="button" class="btn btn-secondary btn-sm mt-1" (click)="load()"><app-icon name="refresh" />Try again</button>
          }
        </section>
      } @else if (view(); as v) {
        <header class="embed-head card p-4 flex flex-wrap items-start gap-x-6 gap-y-3" data-run>
          <div class="min-w-0 flex-1">
            <p class="text-xs uppercase tracking-wide text-[color:var(--text-muted)]">Run {{ v.id }}@if (v.attempt > 1) { · attempt {{ v.attempt }} }</p>
            <h1 class="text-xl font-semibold tracking-tight truncate" [title]="v.pipelineName || ''">{{ v.pipelineName || 'Pipeline ' + v.pipelineId }}</h1>
            @if (v.reference) { <p class="text-sm text-[color:var(--text-secondary)] mt-0.5">Reference <span class="mono">{{ v.reference }}</span></p> }
          </div>
          <div class="flex flex-col items-end gap-1.5">
            <app-status [label]="label(v.status)" data-run-status />
            @if (moving()) { <span class="text-xs text-[color:var(--text-muted)]" role="status">Updating as it runs</span> }
          </div>
          <dl class="embed-times w-full grid gap-x-6 gap-y-1 text-sm">
            <div><dt>Created</dt><dd>{{ v.createdAt | serverTime:'dateTime' }}</dd></div>
            <div><dt>Started</dt><dd>{{ (v.startedAt | serverTime:'dateTime') || '—' }}</dd></div>
            <div><dt>Ended</dt><dd>{{ (v.endedAt | serverTime:'dateTime') || '—' }}</dd></div>
          </dl>
          @if (v.message && v.status === 'failed') {
            <p class="w-full text-sm text-[color:var(--color-crit-500)]" role="alert">{{ v.message }}</p>
          }
        </header>

        <div class="embed-body mt-4 grid gap-4">
          <section class="card p-4" aria-labelledby="embed-steps" data-steps>
            <h2 id="embed-steps" class="text-sm font-semibold mb-3">Steps</h2>
            <ol class="embed-steps flex flex-col">
              @for (s of v.steps; track s.key; let i = $index) {
                <li class="embed-step" [attr.data-step]="s.key" [attr.data-status]="s.status">
                  <span class="embed-step-mark" [class]="'embed-step-mark mark-' + s.status" aria-hidden="true">{{ i + 1 }}</span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span class="font-medium">{{ s.name || s.task || s.key }}</span>
                      <app-status [label]="label(s.status)" />
                    </div>
                    <p class="text-xs text-[color:var(--text-muted)] mt-0.5">
                      @if (s.startedAt) { {{ s.startedAt | serverTime:'time' }} }
                      @if (durationLabel(s.durationMs); as d) { · {{ d }} }
                      @if (s.rowsOut !== null && s.rowsOut !== undefined) { · {{ s.rowsOut.toLocaleString() }} {{ s.rowsOut === 1 ? 'row' : 'rows' }} }
                    </p>
                    @if (s.message && s.status === 'failed') { <p class="text-xs text-[color:var(--color-crit-500)] mt-1">{{ s.message }}</p> }
                  </div>
                </li>
              }
            </ol>
          </section>

          <div class="flex flex-col gap-4">
            <section class="card p-4" aria-labelledby="embed-files" data-files>
              <h2 id="embed-files" class="text-sm font-semibold mb-3">Results</h2>
              @if (!v.files.length) {
                <p class="text-sm text-[color:var(--text-muted)]">{{ moving() ? 'Results appear here when the run makes them.' : 'This run made no files.' }}</p>
              } @else {
                <ul class="flex flex-col gap-2">
                  @for (f of v.files; track f.id) {
                    <li class="embed-file" [attr.data-file]="f.id">
                      <app-icon name="file" class="text-[color:var(--text-muted)]" />
                      <div class="min-w-0 flex-1">
                        <div class="truncate font-medium" [title]="f.name">{{ f.name }}</div>
                        <div class="text-xs text-[color:var(--text-muted)]">{{ size(f.bytes) }}@if (f.role === 'report') { · report }</div>
                      </div>
                      @if (f.download) {
                        <a class="btn btn-secondary btn-sm embed-download" [href]="href(f)" rel="noopener" (click)="download($event, f)"
                           [attr.aria-label]="'Download ' + f.name">
                          <app-icon name="download" />Download
                        </a>
                      } @else {
                        <span class="text-xs text-[color:var(--text-muted)]">{{ f.expired ? 'No longer kept' : 'Not available' }}</span>
                      }
                    </li>
                  }
                </ul>
              }
            </section>

            @if (v.review.status !== 'not_required') {
              <section class="card p-4" aria-labelledby="embed-review" data-review>
                <div class="flex items-center gap-3 mb-2">
                  <h2 id="embed-review" class="text-sm font-semibold">Review</h2>
                  <app-status [label]="label(v.review.status)" />
                </div>
                @for (d of v.review.decisions; track $index) {
                  <p class="text-sm">
                    <span class="font-medium">{{ partyLabel(d.party) }}</span> {{ d.decision }}
                    @if (d.decidedAt) { <span class="text-[color:var(--text-muted)]">· {{ d.decidedAt | serverTime:'dateTime' }}</span> }
                    @if (d.reason) { <span class="block text-[color:var(--text-secondary)]">{{ d.reason }}</span> }
                  </p>
                } @empty {
                  <p class="text-sm text-[color:var(--text-muted)]">Waiting for a decision.</p>
                }
              </section>
            }
          </div>
        </div>

        <p class="mt-4 text-xs text-[color:var(--text-muted)]" data-expires>This view closes at {{ v.viewExpiresAt | serverTime:'time' }}.</p>
      }
    </main>
  `,
  styles: [`
    .embed-head { border-top: 3px solid var(--embed-accent, var(--border-strong)); }
    .embed-times { grid-template-columns: repeat(auto-fit, minmax(11rem, 1fr)); }
    .embed-times dt { font-size: 0.75rem; color: var(--text-muted); }
    .embed-times dd { margin: 0; }
    @media (min-width: 1024px) { .embed-body { grid-template-columns: minmax(0, 3fr) minmax(0, 2fr); align-items: start; } }
    .embed-step { display: flex; gap: 0.75rem; padding: 0.5rem 0; }
    .embed-step + .embed-step { border-top: 1px solid var(--border-subtle); }
    .embed-step-mark { flex: none; width: 1.5rem; height: 1.5rem; border-radius: 9999px; display: grid; place-items: center;
      font-size: 0.75rem; font-weight: 600; border: 1px solid var(--border-strong); color: var(--text-secondary); }
    .mark-completed { background: var(--embed-accent, var(--color-ok-500)); border-color: transparent; color: var(--on-solid); }
    .mark-running { border-color: var(--embed-accent, var(--text-primary)); color: var(--text-primary); }
    .mark-failed { background: var(--color-crit-500); border-color: transparent; color: var(--on-solid); }
    .embed-file { display: flex; align-items: center; gap: 0.75rem; padding: 0.5rem 0.75rem; border: 1px solid var(--border-subtle);
      border-radius: var(--radius-lg); }
    .embed-download:focus-visible { outline: 2px solid var(--embed-accent, var(--text-primary)); outline-offset: 2px; }
  `],
})
export class EmbedRunViewPage implements OnInit, OnDestroy {
  /** The route's :token, and the query's theme and accent. */
  readonly token = input<string>('');
  readonly theme = input<string | undefined>(undefined);
  readonly accentParam = input<string | undefined>(undefined, { alias: 'accent' });
  readonly accentColor = computed(() => accentOf(this.accentParam()));

  readonly loading = signal(true);
  readonly view = signal<EmbedRunView | null>(null);
  readonly refusal = signal<EmbedRefusal | null>(null);
  readonly moving = computed(() => !!this.view()?.refreshSeconds);

  readonly durationLabel = durationLabel;
  readonly label = statusLabel;
  readonly size = formatSize;

  private timer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  ngOnInit(): void {
    const dark = typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
    // The portal's choice for this page only: never written to the console's own preference.
    document.documentElement.classList.toggle('dark', themeOf(this.theme(), dark) === 'dark');
    this.load();
  }

  ngOnDestroy(): void {
    this.closed = true;
    this.stop();
  }

  /** The view's data, by the link's token alone: no credentials, no console session, never cached. */
  async load(): Promise<EmbedRunView | null> {
    this.stop();
    this.loading.set(true);
    let answer: Response;
    try {
      answer = await fetch(`${CUSTOMER_API_BASE}/embed/runs/${encodeURIComponent(this.token())}`, {
        credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', headers: { Accept: 'application/json' },
      });
    } catch {
      this.loading.set(false);
      if (!this.view()) this.refusal.set(refusalOf(0));
      else this.later(30);
      return null;
    }
    let body: unknown = null;
    try { body = await answer.json(); } catch { body = null; }
    this.loading.set(false);
    if (this.closed) return null;
    if (!answer.ok) {
      const type = (body as { type?: string } | null)?.type ?? null;
      // A run that cannot be read just now keeps what it showed; a link that is refused shows nothing more.
      if (answer.status >= 500 && this.view()) { this.later(30); return null; }
      this.view.set(null);
      this.refusal.set(refusalOf(answer.status, type));
      return null;
    }
    const view = body as EmbedRunView;
    this.refusal.set(null);
    this.view.set(view);
    if (view.refreshSeconds) this.later(view.refreshSeconds);
    else this.closeAt(view.viewExpiresAt);
    return view;
  }

  /** The download's address on the API: a signed file link, which needs no token. */
  href(file: EmbedFile): string {
    return file.download ? `${CUSTOMER_API_BASE.replace(/\/v1$/, '')}${file.download.url}` : '';
  }

  /** A file link lives a few minutes: past it, the view is read again for a fresh one before the download starts. */
  async download(event: Event, file: EmbedFile): Promise<void> {
    if (!file.download || Date.parse(file.download.expiresAt) - Date.now() > 5000) return;
    event.preventDefault();
    const fresh = await this.load();
    const again = fresh?.files.find(f => f.id === file.id);
    if (again?.download) window.location.assign(this.href(again));
  }

  partyLabel(party: string): string {
    return party === 'customer' ? 'Customer' : party === 'internal' ? 'Internal review' : party;
  }

  private later(seconds: number): void {
    const view = this.view();
    if (view && Date.parse(view.viewExpiresAt) <= Date.now()) { this.expire(); return; }
    this.timer = setTimeout(() => { void this.load(); }, Math.max(3, seconds) * 1000);
  }

  /** When the view expires the page says so, and reads nothing more. */
  private closeAt(expiresAt: string): void {
    const left = Date.parse(expiresAt) - Date.now();
    if (!Number.isFinite(left)) return;
    if (left <= 0) { this.expire(); return; }
    this.timer = setTimeout(() => this.expire(), Math.min(left, 2_147_000_000));
  }

  private expire(): void {
    this.stop();
    this.view.set(null);
    this.refusal.set(refusalOf(410, '/problems/link-expired'));
  }

  private stop(): void {
    if (this.timer !== null) { clearTimeout(this.timer); this.timer = null; }
  }
}
