import { Component, Injector, OnDestroy, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Dialog } from '@angular/cdk/dialog';
import { API_SUCCESS } from '../../../core/api/api.config';
import { AuthService } from '../../../core/auth/auth.service';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { StatTile } from '../../../shared/ui/stat-tile';
import { Section } from '../../../shared/ui/section';
import { ToastService } from '../../../shared/ui/toast.service';
import { confirmWith } from '../../../shared/ui/confirm';
import { askReason } from '../../../shared/ui/reason';
import { sidePanelConfig } from '../../../shared/ui/side-panel';
import { formatSize } from '../../../shared/ui/format-size';
import { refusal } from '../../../shared/ui/bulk/bulk.model';
import { RetentionApi } from './retention.api';
import { AppLoading, InlineStatus } from '../../../shared/ui/loading';
import { LoadError } from '../../../shared/ui/load-error';
import {
  ClassResult, RetentionClass, RetentionHold, RetentionPreview, RetentionView, holdTarget, keepText, previewLine, readable, stateOf,
} from './retention.model';
import { RetentionEditPanel, RetentionEditPanelData } from './retention-edit-panel';
import { RetentionHoldPanel, RetentionHoldPanelData } from './retention-hold-panel';
import { RetentionHistoryPanel, RetentionHistoryPanelData } from './retention-history-panel';
import { RetentionPlatformPanel } from './retention-platform-panel';

/**
 * Administration › Data policies › Retention (MIG-354): how long each class of the workspace's data is kept, the legal
 * holds that stop removal, what a pass would remove now, and what the last one did. A workspace administrator (or a
 * platform administrator, for the workspace picked above) sees and changes it; nobody else -- the service refuses them,
 * and the section is not shown. Edits open on the right (the Batch A side panel); nothing is removed by saving: the
 * daily pass after 02:00 Chicago time does, or "Run now".
 *
 * The API is looked up when used, as the review policy card's is: a page shown without a workspace never reads it.
 */
@Component({
  selector: 'app-retention-card',
  imports: [Icon, ServerTimePipe, StatTile, Section, AppLoading, InlineStatus, LoadError],
  styles: `
    .retention-table { table-layout: fixed; min-width: 52rem; }
    .retention-table .retention-class-col { width: 34%; }
    .retention-table th, .retention-table td { text-align: left; vertical-align: top; }
    .retention-table tbody th { text-transform: none; letter-spacing: normal; font-weight: 400; padding: 0.625rem 1rem;
      border-bottom: 1px solid var(--border-subtle); white-space: normal; }
    .retention-table tbody td { vertical-align: top; }
    .retention-table tbody tr:last-child th { border-bottom: 0; }
    .retention-holds-head { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; padding-top: 0.75rem;
      border-top: 1px solid var(--border-subtle); }
  `,
  template: `
    @if (visible()) {
      <!-- Owner #4 (2026-10-19): the shared section head -- title and state, one line saying what it is, the actions on the
           title's line with the primary rightmost -- and the table's row headers padded and ruled as its cells. -->
      <app-section [card]="true" id="retention" title="Retention" data-retention
                   sub="How long each kind of data is kept. Once a day, after 02:00 (Chicago time), a pass removes what is older than its days, in small batches, and records what it removed. Set the days your record-keeping policy requires.">
        <div section-actions class="flex flex-wrap items-center justify-end gap-2">
          @if (view(); as v) {
            <span class="pill" [class.pill-ok]="v.enabled" [class.pill-neutral]="!v.enabled" data-retention-state>{{ v.enabled ? 'On' : 'Off' }}</span>
            <button type="button" class="btn btn-default btn-sm" (click)="openHistory()" data-retention-history><app-icon name="list" />History</button>
            @if (isPlatformAdmin()) {
              <button type="button" class="btn btn-default btn-sm" (click)="openPlatform()" data-retention-platform><app-icon name="settings" />Platform minimums</button>
            }
            <button type="button" class="btn btn-default btn-sm" [disabled]="previewing()" (click)="runPreview()" data-retention-preview>
              <app-icon name="eye" [busy]="previewing()" />Preview
            </button>
            <button type="button" class="btn btn-default btn-sm" [disabled]="!v.enabled || v.running || starting()" (click)="runNow()"
                    [attr.title]="v.enabled ? null : 'Turn retention on first'" data-retention-run>
              <app-icon name="play" [busy]="starting()" />Run now
            </button>
            <button type="button" class="btn btn-primary btn-sm" (click)="openEdit()" data-retention-edit><app-icon name="edit" />Edit retention</button>
          }
        </div>
        <div class="flex flex-col gap-3">

        <!-- Owner 2026-10-27: a failed first read says why with Try again; a failed re-read (a pass being followed) keeps
             the table and says so in a line above it, instead of replacing the section. -->
        @if (error() && !view()) {
          <app-load-error data-retention-error [message]="error()" (retry)="load()" />
        } @else if (view(); as v) {
          @if (error()) {
            <app-inline-status data-retention-error [error]="error()" (retry)="load()" />
          }
          @if (previewError()) {
            <app-inline-status data-retention-preview-error [error]="previewError()" (retry)="runPreview()" />
          }
          <div class="grid grid-cols-2 sm:grid-cols-4 stat-strip stat-row is-md is-start" role="list" data-retention-stats>
            <app-stat-tile label="Kept for a limited time" [value]="limitedCount() + ' of ' + configurableCount()" icon="clock"
                           [foot]="v.enabled ? 'removed by the daily pass' : 'retention is off: nothing is removed'" [tone]="v.enabled ? 'info' : 'muted'" />
            <app-stat-tile label="Legal holds" [value]="activeHolds().length" icon="lock"
                           [foot]="workspaceHold() ? 'the whole workspace is held' : activeHolds().length ? 'nothing in their scope is removed' : 'none active'"
                           [tone]="activeHolds().length ? 'warn' : 'muted'" />
            <app-stat-tile label="Last pass" [value]="lastPassLabel()" icon="history" [foot]="lastPassFoot()" [tone]="lastPassTone()" />
            <app-stat-tile label="Needs confirmation" [value]="paused().length" icon="alert"
                           [foot]="paused().length ? 'a class would lose more than ' + v.platform.maxSharePct + '% in one pass' : 'nothing waiting'"
                           [tone]="paused().length ? 'warn' : 'muted'" />
          </div>

          @if (v.running) {
            <p class="text-sm text-[color:var(--text-secondary)] flex items-center gap-2" role="status" data-retention-running>
              <span class="spinner"></span>A pass is running. This section refreshes when it ends.
            </p>
          }

          <div class="overflow-x-auto">
            <table class="table-modern retention-table" aria-label="Retention by kind of data" data-retention-table>
              <thead>
                <tr>
                  <th scope="col" class="retention-class-col">Data</th>
                  <th scope="col">Keep for</th>
                  <th scope="col">Last pass</th>
                  <th scope="col">{{ preview() ? 'Would remove now' : 'Holds reach' }}</th>
                </tr>
              </thead>
              <tbody>
                @for (c of v.classes; track c.dataClass) {
                  <tr [attr.data-class]="c.dataClass">
                    <th scope="row" class="align-top">
                      <span class="block text-sm font-medium">{{ c.label }}</span>
                      <span class="block text-xs font-normal text-[color:var(--text-muted)]">{{ readable(c.covers) }}</span>
                    </th>
                    <td class="align-top text-sm" data-keep>
                      {{ keepText(c) }}
                      @if (c.minDays != null) { <span class="block text-xs text-[color:var(--text-muted)]">At least {{ c.minDays.toLocaleString('en-US') }} days</span> }
                    </td>
                    <td class="align-top text-sm" data-last>
                      @if (c.last; as l) {
                        <span class="pill" [class]="'pill pill-' + stateOf(l.state).tone">{{ stateOf(l.state).label }}</span>
                        @if (l.deleted) { <span class="block text-xs text-[color:var(--text-muted)] mt-1">Removed {{ l.deleted.toLocaleString('en-US') }}{{ l.bytes ? ', ' + formatSize(l.bytes) : '' }}</span> }
                        @if (l.state === 'PAUSED' || l.state === 'FAILED') { <span class="block text-xs text-[color:var(--text-muted)] mt-1">{{ readable(l.note) }}</span> }
                        @if (l.state === 'PAUSED') {
                          <button type="button" class="btn btn-default btn-intent-crit btn-sm mt-1" (click)="confirmClass(c)" data-retention-confirm>
                            <app-icon name="checkCircle" />Confirm {{ l.eligible.toLocaleString('en-US') }} of {{ l.total.toLocaleString('en-US') }}
                          </button>
                        }
                      } @else if (c.configurable) {
                        <span class="text-[color:var(--text-muted)]">Not run yet</span>
                      } @else {
                        <span class="text-[color:var(--text-muted)]">—</span>
                      }
                    </td>
                    <td class="align-top text-sm" data-now>
                      @if (preview(); as p) {
                        @if (previewOf(c.dataClass); as r) {
                          {{ previewLine(r) }}
                          @if (r.eligible && r.oldest) { <span class="block text-xs text-[color:var(--text-muted)]">Oldest {{ r.oldest | serverTime:'date' }}</span> }
                          @if (r.state === 'NEEDS_CONFIRMATION' || r.state === 'HELD') {
                            <span class="pill mt-1" [class]="'pill pill-' + stateOf(r.state).tone">{{ stateOf(r.state).label }}</span>
                          }
                        } @else { <span class="text-[color:var(--text-muted)]">—</span> }
                      } @else {
                        <span class="text-[color:var(--text-secondary)]">{{ c.configurable ? holdsText(c.holds) : '—' }}</span>
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          @if (preview(); as p) {
            <p class="text-xs text-[color:var(--text-muted)]" data-retention-preview-summary aria-live="polite">
              If a pass ran now it would remove {{ p.items.toLocaleString('en-US') }} item(s){{ p.bytes ? ' (' + formatSize(p.bytes) + ')' : '' }}.
              Counted {{ p.at | serverTime:'recentSec' }}{{ p.enabled ? '' : '; retention is off, so nothing will be removed until it is turned on' }}.
            </p>
          }

          <div class="flex flex-col gap-2" data-retention-holds>
            <div class="retention-holds-head">
              <div class="min-w-0 flex-1">
                <h3 class="font-semibold text-sm m-0">Legal holds</h3>
                <p class="text-xs text-[color:var(--text-muted)] m-0 mt-0.5">While a hold is on, nothing in its scope is removed. Placing and releasing one is recorded.</p>
              </div>
              <button type="button" class="btn btn-default btn-sm" (click)="openHold()" data-retention-place-hold><app-icon name="lock" />Place a hold</button>
            </div>
            @if (activeHolds().length) {
              <ul class="flex flex-col gap-1.5">
                @for (h of activeHolds(); track h.id) {
                  <li class="flex flex-wrap items-start gap-2 text-sm" [attr.data-hold]="h.id">
                    <span class="pill pill-warn">{{ holdTarget(h) }}</span>
                    <span class="min-w-0 flex-1">{{ h.reason }}
                      <span class="block text-xs text-[color:var(--text-muted)]">Placed {{ h.placedAt | serverTime:'recent' }}{{ h.placedBy ? ' by user ' + h.placedBy : '' }}</span>
                    </span>
                    <button type="button" class="btn btn-default btn-sm" (click)="release(h)" data-retention-release>Release</button>
                  </li>
                }
              </ul>
            } @else {
              <p class="text-sm text-[color:var(--text-muted)]" data-retention-no-holds>No legal hold is active.</p>
            }
          </div>
          <p class="text-xs text-[color:var(--text-muted)] m-0">
            Issued invoices and billing records are never removed by retention. Files a pipeline delivered to your own buckets are yours and
            stay; their record in the run is marked expired.
          </p>
        } @else {
          <app-loading shape="panel" [count]="5" label="Loading the retention policy…" />
        }
        </div>
      </app-section>
    }
  `,
})
export class RetentionCard implements OnDestroy {
  /** The workspace a platform administrator picked; a workspace administrator's own is the session's. */
  readonly tenantId = input<number | null>(null);

  private readonly auth = inject(AuthService);
  private readonly injector = inject(Injector);
  private readonly toast = inject(ToastService);
  private get api(): RetentionApi { return this.injector.get(RetentionApi); }
  private get dialog(): Dialog { return this.injector.get(Dialog); }

  readonly isPlatformAdmin = computed(() => typeof this.auth.isPlatformAdmin === 'function' && this.auth.isPlatformAdmin());
  readonly ownWorkspace = computed(() => typeof this.auth.user === 'function' && !!this.auth.user()?.tenantId);
  readonly visible = computed(() => this.isPlatformAdmin() ? this.tenantId() != null
    : this.ownWorkspace() && typeof this.auth.isTenantAdmin === 'function' && this.auth.isTenantAdmin());

  readonly view = signal<RetentionView | null>(null);
  readonly preview = signal<RetentionPreview | null>(null);
  readonly error = signal('');
  readonly previewing = signal(false);
  /** Owner 2026-10-27: a preview that could not be made says so in the section, with Try again, not in a toast only. */
  readonly previewError = signal('');
  /** Each read's number: an answer for the workspace picked before (or an older poll) is dropped. */
  private seq = 0;
  readonly starting = signal(false);
  private polling: ReturnType<typeof setTimeout> | null = null;

  readonly configurableCount = computed(() => (this.view()?.classes ?? []).filter(c => c.configurable).length);
  readonly limitedCount = computed(() => (this.view()?.classes ?? []).filter(c => c.configurable && c.keepDays != null).length);
  readonly activeHolds = computed(() => (this.view()?.holds ?? []).filter(h => h.active));
  readonly workspaceHold = computed(() => this.activeHolds().some(h => h.scope === 'WORKSPACE'));
  readonly paused = computed(() => (this.view()?.classes ?? []).filter(c => c.last?.state === 'PAUSED'));
  readonly lastPassLabel = computed(() => {
    const p = this.view()?.lastPass;
    return p ? stateOf(p.state).label : 'None yet';
  });
  readonly lastPassTone = computed(() => {
    const tone = stateOf(this.view()?.lastPass?.state).tone;
    return tone === 'neutral' ? 'muted' : tone;
  });
  readonly lastPassFoot = computed(() => {
    const p = this.view()?.lastPass;
    if (!p) return 'the first runs after 02:00';
    return `removed ${p.deleted.toLocaleString('en-US')}${p.bytes ? ', ' + formatSize(p.bytes) : ''}`;
  });

  readonly keepText = keepText;
  readonly stateOf = stateOf;
  readonly previewLine = previewLine;
  readonly holdTarget = holdTarget;
  readonly readable = readable;
  readonly formatSize = formatSize;

  constructor() {
    // Read when shown, and again for each workspace a platform administrator picks.
    effect(() => {
      this.tenantId();
      const shown = this.visible();
      untracked(() => {
        this.preview.set(null);
        this.previewError.set('');
        this.view.set(null);
        this.error.set('');
        if (shown) this.load();
      });
    });
  }

  ngOnDestroy(): void {
    if (this.polling) clearTimeout(this.polling);
  }

  private scope(): number | null {
    return this.isPlatformAdmin() ? this.tenantId() : null;
  }

  holdsText(holds: string): string {
    return holds === 'workspace' ? 'Workspace holds' : 'Workspace, pipeline and run holds';
  }

  previewOf(dataClass: string): ClassResult | null {
    return this.preview()?.classes.find(c => c.dataClass === dataClass) ?? null;
  }

  load(): void {
    const seq = ++this.seq;
    this.api.view(this.scope()).subscribe({
      next: r => {
        if (seq !== this.seq) return;
        if (r?.status !== API_SUCCESS || !r.data) { this.error.set(r?.message || 'The retention policy could not be read.'); return; }
        this.error.set('');
        this.view.set(r.data);
        this.follow(r.data.running);
      },
      error: err => { if (seq === this.seq) this.error.set(refusal(err, 'The retention policy could not be read.')); },
    });
  }

  /** While a pass runs, read again every five seconds until it ends. */
  private follow(running: boolean): void {
    if (this.polling) { clearTimeout(this.polling); this.polling = null; }
    if (running) this.polling = setTimeout(() => this.load(), 5000);
  }

  runPreview(): void {
    if (this.previewing()) return;
    this.previewing.set(true);
    this.previewError.set('');
    this.api.preview(this.scope()).subscribe({
      next: r => {
        this.previewing.set(false);
        if (r?.status !== API_SUCCESS || !r.data) { this.previewError.set(r?.message || 'The preview could not be made.'); return; }
        this.preview.set(r.data);
      },
      error: err => { this.previewing.set(false); this.previewError.set(refusal(err, 'The preview could not be made.')); },
    });
  }

  async runNow(): Promise<void> {
    const v = this.view();
    if (!v || !v.enabled || v.running) return;
    const p = this.preview();
    const ok = await confirmWith(this.dialog, {
      title: 'Run a retention pass now?',
      body: (p ? `By the last preview it removes ${p.items.toLocaleString('en-US')} item(s). ` : '')
        + 'It removes what is older than each class\'s days, outside every legal hold. A class that would lose more than '
        + `${v.platform.maxSharePct}% stops and asks for confirmation instead. This cannot be undone.`,
      confirmLabel: 'Run the pass',
      danger: true,
    });
    if (!ok) return;
    this.starting.set(true);
    this.api.run(this.scope()).subscribe({
      next: r => {
        this.starting.set(false);
        if (r?.status !== API_SUCCESS) { this.toast.error(r?.message || 'The pass could not be started.'); return; }
        this.toast.info(`Retention pass ${r.data?.passId ?? ''} started.`);
        this.preview.set(null);
        this.load();
      },
      error: err => { this.starting.set(false); this.toast.error(refusal(err, 'The pass could not be started.')); },
    });
  }

  async confirmClass(c: RetentionClass): Promise<void> {
    const l = c.last;
    if (!l) return;
    const ok = await confirmWith(this.dialog, {
      title: `Confirm removing ${c.label.toLowerCase()}?`,
      body: `${l.eligible.toLocaleString('en-US')} of ${l.total.toLocaleString('en-US')} item(s) are older than ${keepText(c).toLowerCase()} and would `
        + 'be removed by the next pass (or Run now). This cannot be undone. If that is more than you expect, change the days instead.',
      confirmLabel: 'Confirm removal',
      danger: true,
    });
    if (!ok) return;
    this.api.confirm(this.scope(), c.dataClass, l.eligible).subscribe({
      next: r => {
        if (r?.status !== API_SUCCESS) { this.toast.error(r?.message || 'The confirmation was not saved.'); return; }
        this.toast.success(readable(r.data?.message) || 'Confirmed.');
        this.load();
      },
      error: err => this.toast.error(refusal(err, 'The confirmation was not saved.')),
    });
  }

  openEdit(): void {
    const v = this.view();
    if (!v) return;
    const data: RetentionEditPanelData = { view: v, tenantId: this.scope() };
    this.dialog.open<RetentionView, RetentionEditPanelData, RetentionEditPanel>(RetentionEditPanel, sidePanelConfig(data, 'wide', 'right'))
      .closed.subscribe(saved => {
        if (!saved) return;
        this.view.set(saved);
        this.preview.set(null);
        const changes = saved.changes ?? [];
        this.toast.success(changes.length ? 'Retention saved.' : 'Nothing changed.');
      });
  }

  openHold(): void {
    const data: RetentionHoldPanelData = { tenantId: this.scope() };
    this.dialog.open<RetentionHold, RetentionHoldPanelData, RetentionHoldPanel>(RetentionHoldPanel, sidePanelConfig(data, 'narrow', 'right'))
      .closed.subscribe(placed => {
        if (!placed) return;
        this.toast.success(`Legal hold placed on ${holdTarget(placed).toLowerCase()}.`);
        this.load();
      });
  }

  async release(h: RetentionHold): Promise<void> {
    const reason = await askReason(this.dialog, {
      title: 'Release this legal hold?',
      subtitle: `${holdTarget(h)}: ${h.reason}`,
      hint: 'Once released, the next pass may remove what the hold kept. The release and its reason are recorded.',
      confirmLabel: 'Release the hold',
      required: true,
      danger: true,
    });
    if (!reason) return;
    this.api.releaseHold(this.scope(), h.id, reason).subscribe({
      next: r => {
        if (r?.status !== API_SUCCESS) { this.toast.error(r?.message || 'The hold was not released.'); return; }
        this.toast.success('Legal hold released.');
        this.load();
      },
      error: err => this.toast.error(refusal(err, 'The hold was not released.')),
    });
  }

  openHistory(): void {
    const data: RetentionHistoryPanelData = { tenantId: this.scope() };
    this.dialog.open<void, RetentionHistoryPanelData, RetentionHistoryPanel>(RetentionHistoryPanel, sidePanelConfig(data, 'wide', 'right'));
  }

  openPlatform(): void {
    this.dialog.open<boolean, unknown, RetentionPlatformPanel>(RetentionPlatformPanel, sidePanelConfig({}, 'narrow', 'right'))
      .closed.subscribe(saved => { if (saved) this.load(); });
  }
}
