import { Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Icon } from '../../shared/ui/icon';
import { ReportStudioApi, studioError } from '../report-studio/report-studio.api';
import { AssetDetail } from '../report-studio/assets.model';
import { ReportReviewCard as ReportCard, TemplateReviewCard } from '../report-studio/report-studio.model';
import { RsTimePipe } from '../report-studio/rs-time.pipe';
import { AppLoading } from '../../shared/ui/loading';
import { LoadError } from '../../shared/ui/load-error';

/** What a Report Studio review task is about, read from its subject id ("report-version:{id}:v{n}"). */
export interface StudioSubject { kind: 'report' | 'template' | 'asset'; id: string; version: number; }

/** The subject types whose tasks Report Studio decides (workflow-service's ServiceDecided). */
export const STUDIO_SUBJECT_TYPES = ['report_version', 'report_template', 'report_asset'];

/** "report-version:01K..:v3" -> {kind: report, id, version: 3}; anything else -> null. */
export function studioSubject(subjectId: string | null | undefined): StudioSubject | null {
  const m = /^report-(version|template|asset):([0-9A-HJKMNP-TV-Z]{26}):v(\d+)$/.exec(subjectId ?? '');
  if (!m) return null;
  return { kind: m[1] === 'version' ? 'report' : (m[1] as 'template' | 'asset'), id: m[2], version: Number(m[3]) };
}

/** The pages the card shows: the first one large, then the next few small (more open in the report). */
export const CARD_PAGES = 4;

/**
 * Report Studio phase 7 (ADR-028 section 17): a Report Studio review in the Task inbox -- a generated report waiting for
 * approval, a template's publish request, a signature or stamp waiting for approval -- shown with what is reviewed (the
 * report's first page and the next ones, the draft's first page, the picture) and decided here, through Report Studio:
 * "Approve and sign" certifies the report's PDF in the reader's name; Reject needs a reason. Report Studio holds the rules
 * (never the person who generated it, only the current version, never one's own request) and says why a reader may not
 * decide; the task is then recorded as decided, or closed, by Report Studio.
 */
@Component({
  selector: 'app-report-review-card',
  imports: [Icon, RouterLink, FormsModule, NgTemplateOutlet, RsTimePipe, AppLoading, LoadError],
  styles: `
    .rvc { display: grid; grid-template-columns: minmax(0, 22rem) minmax(0, 1fr); gap: 1.25rem; align-items: start; }
    @media (max-width: 70rem) { .rvc { grid-template-columns: minmax(0, 1fr); } }
    .rvc-page { border: 1px solid var(--border-subtle); border-radius: var(--radius-lg); background: var(--surface-inset); overflow: hidden;
                min-height: 14rem; display: flex; align-items: center; justify-content: center; }
    .rvc-page img { display: block; width: 100%; height: auto; }
    .rvc-strip { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 0.5rem; margin-top: 0.5rem; }
    .rvc-strip button { border: 1px solid var(--border-subtle); border-radius: var(--radius-md); background: var(--surface-inset); padding: 0;
                        overflow: hidden; cursor: pointer; aspect-ratio: 210 / 297; display: flex; align-items: center; justify-content: center; }
    .rvc-strip button.is-shown { outline: 2px solid var(--color-accent); outline-offset: 1px; }
    .rvc-strip img { display: block; width: 100%; height: auto; }
    .rvc-facts { display: grid; grid-template-columns: repeat(auto-fill, minmax(10rem, 1fr)); gap: 0.5rem 1rem; margin: 0; }
    .rvc-facts dt { font-size: 0.6875rem; letter-spacing: 0.04em; text-transform: uppercase; color: var(--text-muted); font-weight: 600; }
    .rvc-facts dd { margin: 0; font-size: 0.875rem; overflow-wrap: anywhere; }
    .rvc-decide { display: flex; flex-direction: column; gap: 0.5rem; border-top: 1px solid var(--border-subtle); padding-top: 0.75rem; }
    .rvc-why { font-size: 0.8125rem; color: var(--text-secondary); display: flex; gap: 0.4rem; align-items: flex-start; }
    .rvc-asset { max-height: 12rem; object-fit: contain; background: repeating-conic-gradient(var(--surface-sunken) 0 25%, transparent 0 50%) 50% / 16px 16px; }
  `,
  template: `
    <!-- Owner 2026-10-27: the shared loader, and Try again on a failed read (a task that names nothing cannot be retried). -->
    @if (loading()) {
      <app-loading shape="panel" data-test="report-review-loading" label="Reading what is reviewed…" />
    } @else if (error()) {
      <app-load-error role="alert" data-test="report-review-error" [message]="error()" [retryable]="!!subject()" (retry)="reload()" />
    } @else if (report(); as c) {
      <section aria-labelledby="rvc-title" data-test="report-review-card">
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <h3 class="section-title m-0" id="rvc-title">What to approve</h3>
          <span class="pill pill-info">{{ c.reportLabel }} · v{{ c.version }}</span>
          @if (c.approval?.signed) { <span class="pill pill-ok"><app-icon name="check" />Signed</span> }
          @else if (c.review?.state === 'OPEN') { <span class="pill pill-warn">{{ c.stage === 'FIRST' ? 'First of two approvals' : c.review.firstApproval ? 'Second approval' : 'Waiting for approval' }}</span> }
          <span class="flex-1"></span>
          <a class="btn btn-default btn-sm" [routerLink]="['/reports/library', c.reportId]" [queryParams]="{ version: c.version }"><app-icon name="external" />Open the report</a>
        </div>
        <div class="rvc">
          <div>
            <div class="rvc-page" data-test="review-page">
              @if (pageUrl(); as src) { <img [src]="src" [alt]="'Page ' + shownPage() + ' of ' + c.name + ' version ' + c.version" /> }
              @else if (pageError()) { <ng-container [ngTemplateOutlet]="pictureFailed" /> }
              @else { <app-loading shape="inline" [label]="'Drawing page ' + shownPage() + '…'" /> }
            </div>
            @if ((c.pages ?? 0) > 1) {
              <div class="rvc-strip" data-test="review-strip" aria-label="The next pages">
                @for (p of strip(); track p.page) {
                  <button type="button" [class.is-shown]="p.page === shownPage()" (click)="show(p.page)" [attr.aria-label]="'Show page ' + p.page">
                    @if (p.url) { <img [src]="p.url" alt="" /> } @else { <span class="text-xs">{{ p.page }}</span> }
                  </button>
                }
              </div>
              <p class="text-xs text-[color:var(--text-muted)] mt-1">Page {{ shownPage() }} of {{ c.pages }}@if ((c.pages ?? 0) > cardPages) { · the rest in the report }</p>
            }
          </div>
          <div class="flex flex-col gap-3 min-w-0">
            <div><b class="text-base">{{ c.name }}</b><br>
              <span class="text-sm text-[color:var(--text-muted)]">{{ c.templateName }} v{{ c.templateVersion }} · {{ c.pages ?? '?' }} page{{ c.pages === 1 ? '' : 's' }}</span></div>
            <dl class="rvc-facts" data-test="review-facts">
              <div><dt>Generated by</dt><dd>{{ c.generatedByName }}@if (c.pipeline?.name) { · {{ c.pipeline!.name }} }</dd></div>
              <div><dt>Generated</dt><dd>{{ c.createdAt | rsTime: 'dateTime' }}</dd></div>
              @if (c.review; as q) {
                <div><dt>Asked by</dt><dd>{{ q.requestedByName }} · {{ q.requestedAt | rsTime: 'recent' }}</dd></div>
                @if (q.note) { <div><dt>Their note</dt><dd>{{ q.note }}</dd></div> }
                @if (q.firstApproval; as f) { <div><dt>First approval</dt><dd>{{ f.byName }} · {{ f.at | rsTime: 'recent' }}</dd></div> }
                @if (q.state !== 'OPEN') { <div><dt>{{ q.state === 'APPROVED' ? 'Approved' : q.state === 'REJECTED' ? 'Rejected' : 'Closed' }}</dt>
                  <dd>{{ q.decidedByName || q.closeReason }}@if (q.decisionNote) { · “{{ q.decisionNote }}” }</dd></div> }
              }
              <div><dt>Warnings when made</dt><dd>{{ c.problems }}</dd></div>
              <div><dt>Signature</dt><dd>{{ c.signing.configured ? 'Signed in your name when you approve' : 'Recorded unsigned: no signing certificate' }}</dd></div>
              @if (c.yourSignature; as y) {
                <div data-test="review-your-signature"><dt>On the page</dt><dd>@if (y.own) { Your own signature “{{ y.name }}” (v{{ y.version }}), your name@if (y.title) {, {{ y.title }}} and the time }
                  @else { Your typed name and “Signed digitally”: you have no approved signature of your own }</dd></div>
              }
            </dl>
            @if (c.mayApprove && !done()) {
              <div class="rvc-decide" data-test="review-decide">
                <label class="label" for="rvc-note">Note (approving) or reason (rejecting)</label>
                <textarea id="rvc-note" class="input resize-y" rows="2" [ngModel]="note()" (ngModelChange)="note.set($event)"
                          placeholder="Optional to approve; required to reject: the person who asked reads it"></textarea>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="approve(c)" data-test="review-approve">
                    <app-icon name="shield" />{{ c.stage === 'FIRST' ? 'Give the first approval' : 'Approve and sign v' + c.version }}</button>
                  @if (c.mayReject) { <button type="button" class="btn btn-default" [disabled]="busy()" (click)="reject(c)" data-test="review-reject"><app-icon name="close" />Reject</button> }
                </div>
                <p class="rvc-why"><app-icon name="info" size="0.95em" class="mt-0.5 shrink-0" />
                  <span>@if (c.stage === 'FIRST') { A second person approves it after you; its PDF is signed then, naming both. }
                    @else { Its PDF is digitally signed in your name with the time; any later change breaks the signature. }</span></p>
              </div>
            } @else if (c.whyNot) {
              <p class="rvc-why" data-test="review-why-not"><app-icon name="info" size="0.95em" class="mt-0.5 shrink-0" /><span>{{ c.whyNot }}</span></p>
            }
            <!-- ZT-R23 / ZT-W2: the maker is told nobody else here can decide it; a managed session why it may. -->
            @if (c.waitingNote) {
              <p class="rvc-why" data-test="review-waiting-note"><app-icon name="clock" size="0.95em" class="mt-0.5 shrink-0" /><span>{{ c.waitingNote }}</span></p>
            }
            @if (c.managedNote) {
              <p class="rvc-why" data-test="review-managed-note"><app-icon name="shield" size="0.95em" class="mt-0.5 shrink-0" /><span>{{ c.managedNote }}</span></p>
            }
          </div>
        </div>
      </section>
    } @else if (template(); as t) {
      <section aria-labelledby="rvc-title" data-test="publish-review-card">
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <h3 class="section-title m-0" id="rvc-title">What to publish</h3>
          <span class="pill pill-info">Draft v{{ t.draft?.version ?? subject()?.version }}</span>
          @if (t.changedSinceAsked) { <span class="pill pill-warn" title="Its editor saved it again after asking">Changed since asked</span> }
          <span class="flex-1"></span>
          <a class="btn btn-default btn-sm" [routerLink]="['/reports/templates', t.templateId]"><app-icon name="external" />Open the template</a>
        </div>
        <div class="rvc">
          <div class="rvc-page" data-test="publish-page">
            @if (pageUrl(); as src) { <img [src]="src" [alt]="'First page of the draft of ' + t.name" /> }
            @else if (pageError()) { <ng-container [ngTemplateOutlet]="pictureFailed" /> }
            @else { <app-loading shape="inline" label="Drawing the first page…" /> }
          </div>
          <div class="flex flex-col gap-3 min-w-0">
            <div><b class="text-base">{{ t.name }}</b>@if (t.description) { <br><span class="text-sm text-[color:var(--text-muted)]">{{ t.description }}</span> }</div>
            <dl class="rvc-facts">
              @if (t.review; as q) {
                <div><dt>Asked by</dt><dd>{{ q.requestedByName }} · {{ q.requestedAt | rsTime: 'recent' }}</dd></div>
                @if (q.note) { <div><dt>Their note</dt><dd>{{ q.note }}</dd></div> }
              }
              <div><dt>Checks</dt><dd>{{ t.summary.errors }} error{{ t.summary.errors === 1 ? '' : 's' }}, {{ t.summary.warnings }} warning{{ t.summary.warnings === 1 ? '' : 's' }}</dd></div>
              <div><dt>Publishing</dt><dd>{{ t.publishNeedsSecondPerson ? 'By someone other than its editor' : 'By any publisher' }}</dd></div>
            </dl>
            @if (t.mayPublish && t.review?.state === 'OPEN' && !done()) {
              <div class="rvc-decide" data-test="publish-decide">
                <label class="label" for="rvc-note">Change summary (publishing) or reason (sending back)</label>
                <textarea id="rvc-note" class="input resize-y" rows="2" [ngModel]="note()" (ngModelChange)="note.set($event)"></textarea>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="publish(t)" data-test="publish-approve"><app-icon name="check" />Publish v{{ t.draft?.version }}</button>
                  <button type="button" class="btn btn-default" [disabled]="busy()" (click)="sendBack(t)" data-test="publish-reject"><app-icon name="close" />Send back</button>
                </div>
                <p class="rvc-why"><app-icon name="info" size="0.95em" class="mt-0.5 shrink-0" /><span>Publishing freezes the draft as version {{ t.draft?.version }}; reports made from it pin it.</span></p>
              </div>
            } @else if (t.whyNot) {
              <p class="rvc-why"><app-icon name="info" size="0.95em" class="mt-0.5 shrink-0" /><span>{{ t.whyNot }}</span></p>
            }
          </div>
        </div>
      </section>
    } @else if (asset(); as a) {
      <section aria-labelledby="rvc-title" data-test="asset-review-card">
        <div class="flex flex-wrap items-center gap-2 mb-3">
          <h3 class="section-title m-0" id="rvc-title">What to approve</h3>
          <span class="pill pill-info">{{ a.kind === 'STAMP' ? 'Stamp' : 'Signature' }} · v{{ subject()?.version }}</span>
          <span class="flex-1"></span>
          <a class="btn btn-default btn-sm" [routerLink]="['/reports/assets', a.assetId]"><app-icon name="external" />Open the asset</a>
        </div>
        <div class="rvc">
          <div class="rvc-page">@if (pageUrl(); as src) { <img class="rvc-asset" [src]="src" [alt]="a.name" /> } @else if (pageError()) { <ng-container [ngTemplateOutlet]="pictureFailed" /> } @else { <app-loading shape="inline" label="Loading the picture…" /> }</div>
          <div class="flex flex-col gap-3 min-w-0">
            <div><b class="text-base">{{ a.name }}</b>@if (a.ownerName) { <br><span class="text-sm text-[color:var(--text-muted)]">{{ a.ownerName }}@if (a.ownerTitle) { · {{ a.ownerTitle }} }</span> }</div>
            @if (!done()) {
              <div class="rvc-decide">
                <label class="label" for="rvc-note">Note</label>
                <textarea id="rvc-note" class="input resize-y" rows="2" [ngModel]="note()" (ngModelChange)="note.set($event)"></textarea>
                <div class="flex flex-wrap gap-2">
                  <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="reviewAsset(a, true)"><app-icon name="check" />Approve</button>
                  <button type="button" class="btn btn-default" [disabled]="busy()" (click)="reviewAsset(a, false)"><app-icon name="close" />Reject</button>
                </div>
                <p class="rvc-why"><app-icon name="info" size="0.95em" class="mt-0.5 shrink-0" /><span>Its uploader may not approve it. Approved, it is the version reports place from now on.</span></p>
              </div>
            }
          </div>
        </div>
      </section>
    }

    <!-- A page or picture that could not be drawn: why, and Try again (it said so with no way to ask again). -->
    <ng-template #pictureFailed>
      <span class="flex flex-col items-center gap-2 text-xs text-crit-500" role="alert" data-test="review-page-error">
        {{ pageError() }}
        <button type="button" class="btn btn-default btn-sm" (click)="retryPicture()"><app-icon name="refresh" />Try again</button>
      </span>
    </ng-template>
  `,
})
export class ReportReviewCard {
  private readonly api = inject(ReportStudioApi);
  readonly subjectId = input.required<string>();
  /** The inbox task, passed to Report Studio so it records the decision on it. */
  readonly taskId = input<number | null>(null);
  /** Told once the decision is made (the inbox moves on). */
  readonly decided = output<string>();
  /** Told when a decision is refused (its sentence). */
  readonly refused = output<string>();

  readonly cardPages = CARD_PAGES;
  readonly subject = computed(() => studioSubject(this.subjectId()));
  readonly loading = signal(true);
  readonly error = signal('');
  readonly report = signal<ReportCard | null>(null);
  readonly template = signal<TemplateReviewCard | null>(null);
  readonly asset = signal<AssetDetail | null>(null);
  readonly note = signal('');
  readonly busy = signal(false);
  readonly done = signal(false);
  readonly shownPage = signal(1);
  readonly pageUrl = signal<string | null>(null);
  readonly pageError = signal('');
  readonly strip = signal<{ page: number; url: string | null }[]>([]);
  private readonly urls: string[] = [];

  constructor() {
    inject(DestroyRef).onDestroy(() => this.urls.forEach(u => URL.revokeObjectURL(u)));
    effect(() => {
      const s = this.subject();
      untracked(() => this.load(s));
    });
  }

  private keep(blob: Blob): string {
    const url = URL.createObjectURL(blob);
    this.urls.push(url);
    return url;
  }

  private load(s: StudioSubject | null): void {
    this.report.set(null);
    this.template.set(null);
    this.asset.set(null);
    this.pageUrl.set(null);
    this.strip.set([]);
    this.done.set(false);
    this.error.set('');
    // QA 2026-10-20: after a decision the inbox opens the next task in this same card -- the note written for the last
    // report must not stay in the box for the next one (nor its busy state or its page).
    this.note.set('');
    this.busy.set(false);
    this.pageError.set('');
    this.shownPage.set(1);
    if (!s) { this.loading.set(false); this.error.set('This task does not name what it is about.'); return; }
    this.loading.set(true);
    if (s.kind === 'report') {
      this.api.reviewCard(s.id, s.version).subscribe({
        next: c => {
          if (this.subject() !== s) return;     // another task opened meanwhile
          this.report.set(c);
          this.loading.set(false);
          this.show(1);
          const pages = Math.min(c.pages ?? 1, CARD_PAGES);
          const strip = Array.from({ length: Math.max(0, pages) }, (_, i) => ({ page: i + 1, url: null as string | null }));
          this.strip.set(strip);
          strip.forEach(p => this.api.reviewPage(s.id, s.version, p.page, false).subscribe({
            next: res => { if (res.body && this.subject() === s) this.strip.update(list => list.map(x => x.page === p.page ? { ...x, url: this.keep(res.body!) } : x)); },
            error: () => undefined,
          }));
        },
        error: e => { if (this.subject() !== s) return; this.loading.set(false); this.error.set(studioError(e, 'The report could not be read.').message); },
      });
    } else if (s.kind === 'template') {
      this.api.publishCard(s.id).subscribe({
        next: t => {
          // A late answer for a task no longer open must not fill the next task's card (owner 2026-10-27).
          if (this.subject() !== s) return;
          this.template.set(t);
          this.loading.set(false);
          this.loadPicture(s);
        },
        error: e => { if (this.subject() !== s) return; this.loading.set(false); this.error.set(studioError(e, 'The template could not be read.').message); },
      });
    } else {
      this.api.asset(s.id).subscribe({
        next: a => {
          if (this.subject() !== s) return;
          this.asset.set(a);
          this.loading.set(false);
          this.loadPicture(s);
        },
        error: e => { if (this.subject() !== s) return; this.loading.set(false); this.error.set(studioError(e, 'The asset could not be read.').message); },
      });
    }
  }

  /** Reads what is reviewed again, after a failure. */
  reload(): void { this.load(this.subject()); }

  /** The draft's first page (a template) or the picture (an asset). */
  private loadPicture(s: StudioSubject): void {
    this.pageUrl.set(null);
    this.pageError.set('');
    if (s.kind === 'template') {
      this.api.publishDraftPage(s.id).subscribe({
        next: res => { if (res.body && this.subject() === s) this.pageUrl.set(this.keep(res.body)); },
        error: e => { if (this.subject() === s) this.pageError.set(studioError(e, 'The first page could not be drawn.').message); },
      });
    } else if (s.kind === 'asset') {
      this.api.assetFile(s.id, s.version).subscribe({
        next: blob => { if (this.subject() === s) this.pageUrl.set(this.keep(blob)); },
        error: () => { if (this.subject() === s) this.pageError.set('The picture could not be read.'); },
      });
    }
  }

  /** Try again on the page or picture that could not be drawn. */
  retryPicture(): void {
    const s = this.subject();
    if (!s) return;
    if (s.kind === 'report') this.show(this.shownPage()); else this.loadPicture(s);
  }

  /** Shows page {@code page} large (the first by default). */
  show(page: number): void {
    const s = this.subject();
    if (!s || s.kind !== 'report') return;
    this.shownPage.set(page);
    this.pageUrl.set(null);
    this.pageError.set('');
    this.api.reviewPage(s.id, s.version, page, true).subscribe({
      next: res => { if (res.body && this.shownPage() === page && this.subject() === s) this.pageUrl.set(this.keep(res.body)); },
      error: e => { if (this.shownPage() === page && this.subject() === s) this.pageError.set(studioError(e, 'The page could not be drawn.').message); },
    });
  }

  approve(c: ReportCard): void {
    this.busy.set(true);
    this.api.approve(c.reportId, c.version, this.note().trim(), this.taskId()).subscribe({
      next: a => {
        this.busy.set(false);
        this.done.set(true);
        this.decided.emit(a.stage === 'FIRST' ? `First approval of ${c.reportLabel} v${c.version} recorded; a second person approves it next.`
          : a.signed ? `${c.reportLabel} v${c.version} approved and its PDF signed.` : `${c.reportLabel} v${c.version} approved. ${a.notSignedReason ?? ''}`);
      },
      error: e => { this.busy.set(false); this.refused.emit(studioError(e).message); },
    });
  }

  reject(c: ReportCard): void {
    const why = this.note().trim();
    if (!why) { this.refused.emit('Say why you are rejecting it: the person who asked reads it.'); return; }
    this.busy.set(true);
    this.api.rejectVersion(c.reportId, c.version, why, this.taskId()).subscribe({
      next: () => { this.busy.set(false); this.done.set(true); this.decided.emit(`${c.reportLabel} v${c.version} rejected; the person who asked is told why.`); },
      error: e => { this.busy.set(false); this.refused.emit(studioError(e).message); },
    });
  }

  publish(t: TemplateReviewCard): void {
    if (!t.draft) return;
    this.busy.set(true);
    this.api.publish(t.templateId, t.draft.revision, this.note().trim()).subscribe({
      next: () => { this.busy.set(false); this.done.set(true); this.decided.emit(`${t.name} published as version ${t.draft!.version}.`); },
      error: e => { this.busy.set(false); this.refused.emit(studioError(e).message); },
    });
  }

  sendBack(t: TemplateReviewCard): void {
    const why = this.note().trim();
    if (!why) { this.refused.emit('Say why it is not published: the person who asked reads it.'); return; }
    this.busy.set(true);
    this.api.rejectPublish(t.templateId, why).subscribe({
      next: () => { this.busy.set(false); this.done.set(true); this.decided.emit(`${t.name} sent back; the person who asked is told why.`); },
      error: e => { this.busy.set(false); this.refused.emit(studioError(e).message); },
    });
  }

  reviewAsset(a: AssetDetail, approve: boolean): void {
    const s = this.subject();
    if (!s) return;
    this.busy.set(true);
    this.api.reviewAsset(a.assetId, s.version, approve, this.note().trim()).subscribe({
      next: () => { this.busy.set(false); this.done.set(true); this.decided.emit(`${a.name} ${approve ? 'approved' : 'rejected'}.`); },
      error: e => { this.busy.set(false); this.refused.emit(studioError(e).message); },
    });
  }
}
