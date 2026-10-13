import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { Icon } from '../../shared/ui/icon';
import { SidePanel } from '../../shared/ui/side-panel';
import { ServerTimePipe } from '../../shared/ui/server-time.pipe';
import type { TaskDetail } from '../workflows/workflows.api';
import { ExtractedField, ReviewDetail, isLow, lowLine, percent } from '../documents/documents.model';
import { labelOf } from '../workflows/value-kind';
import { ReviewItem, ageOf } from './review-sources';
import { KIND_LABEL, linkOf } from './review-home.model';

export interface ReviewItemPanelData {
  item: ReviewItem;
  /** The item's file name, when the page knows it (a document). */
  name?: string;
}

/** What the panel closes with: nothing, or the decision to make on this one item (the page opens the bulk panel). */
export type ReviewItemPanelResult = { act: 'approve' | 'reject' } | undefined;

interface RunReview { reviewStatus?: string; required?: string[]; decisions?: { party: string; decision?: string; decidedBy?: number | null }[] }

/**
 * Review's side panel (UX review DR2): one waiting item over the right of the list, read from its own service -- an
 * approval's request and its fields, a run's review status and who has decided, a document's least sure values -- with the
 * way to its own page and, when the reader may decide it in bulk, Approve and Reject (the shared bulk panel, for this one
 * item: what will happen first, then the decision).
 */
@Component({
  selector: 'app-review-item-panel',
  imports: [SidePanel, Icon, RouterLink, ServerTimePipe],
  template: `
    <app-side-panel [heading]="heading()" [subtitle]="kindLabel() + (item.from ? ' · ' + item.from : '')" data-test="review-panel">
      <dl class="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-2 text-sm m-0">
        <dt class="text-[color:var(--text-muted)]">Waiting since</dt>
        <dd class="m-0">@if (item.since) { {{ item.since | serverTime:'recent' }} <span class="text-[color:var(--text-muted)]">({{ age() }})</span> } @else { — }</dd>
        <dt class="text-[color:var(--text-muted)]">Waits on</dt>
        <dd class="m-0" data-test="panel-waits-on">{{ item.waitsOn }}</dd>
        @if (item.due) {
          <dt class="text-[color:var(--text-muted)]">Due</dt>
          <dd class="m-0" [class.text-crit-500]="item.overdue">{{ item.overdue ? 'Overdue · was due ' : '' }}{{ item.due | serverTime:'recent' }}</dd>
        }
        @if (item.individual) {
          <dt class="text-[color:var(--text-muted)]">Review</dt>
          <dd class="m-0">Individual: its pipeline is never decided in bulk</dd>
        }
      </dl>

      @if (loading()) {
        <p class="text-sm text-[color:var(--text-secondary)] flex items-center gap-2 mt-5"><span class="spinner"></span>Reading the details…</p>
      } @else if (error()) {
        <p class="text-sm text-[color:var(--text-secondary)] mt-5" role="status">{{ error() }}</p>
      }

      @if (task(); as t) {
        <section class="mt-5" data-test="panel-task">
          <h3 class="text-sm font-semibold mb-1">{{ t.name }}</h3>
          <p class="text-sm m-0 text-[color:var(--text-secondary)]">{{ t.requestTitle }}@if (t.workflowName) { <span> · {{ t.workflowName }}</span> }</p>
          @if (fields().length) {
            <dl class="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm mt-3 mb-0">
              @for (f of fields(); track f.label) {
                <dt class="text-[color:var(--text-muted)] truncate" [title]="f.label">{{ f.label }}</dt>
                <dd class="m-0 [overflow-wrap:anywhere]">{{ f.value }}</dd>
              }
            </dl>
          }
        </section>
      }

      @if (run(); as r) {
        <section class="mt-5" data-test="panel-run">
          <h3 class="text-sm font-semibold mb-1">Review</h3>
          <p class="text-sm m-0">{{ runLine(r) }}</p>
          @for (d of r.decisions ?? []; track $index) {
            <p class="text-xs m-0 mt-1 text-[color:var(--text-secondary)]">{{ partyOf(d.party) }}: {{ (d.decision || 'decided').toLowerCase() }}</p>
          }
        </section>
      }

      @if (doc(); as d) {
        <section class="mt-5" data-test="panel-document">
          <h3 class="text-sm font-semibold mb-1">To check</h3>
          <p class="text-sm m-0">{{ d.reviewCount ?? lowFields().length }} of {{ d.fieldCount ?? d.fields.length }} values
            @if (d.minConfidence != null) { <span class="text-[color:var(--text-secondary)]"> · least sure {{ pct(d.minConfidence) }}%</span> }</p>
          @if (lowFields().length) {
            <ul class="mt-2 mb-0 p-0 list-none flex flex-col gap-1 text-sm">
              @for (f of lowFields(); track f.fieldId) {
                <li class="flex items-baseline gap-2 min-w-0">
                  <span class="text-[color:var(--text-muted)] w-32 shrink-0 truncate" [title]="f.label || f.fieldKey">{{ f.label || f.fieldKey }}</span>
                  <span class="min-w-0 truncate" [title]="f.value || ''">{{ f.value || '—' }}</span>
                  @if (f.confidence != null) { <span class="ml-auto text-xs text-[color:var(--text-muted)] tabular-nums">{{ pct(f.confidence) }}%</span> }
                </li>
              }
            </ul>
          }
        </section>
      }

      <div foot class="flex flex-wrap items-center gap-2 w-full">
        @if (item.pickable) {
          <button type="button" class="btn btn-default btn-sm btn-intent-crit" (click)="ref.close({ act: 'reject' })" data-test="panel-reject">
            <app-icon name="close" />Reject…</button>
          <button type="button" class="btn btn-default btn-sm" (click)="ref.close({ act: 'approve' })" data-test="panel-approve">
            <app-icon name="check" />Approve…</button>
        } @else if (item.whyNot) {
          <span class="text-xs text-[color:var(--text-muted)] min-w-0">{{ item.whyNot }}</span>
        }
        <a class="btn btn-primary btn-sm ml-auto" [routerLink]="link.path" [queryParams]="link.query ?? null" (click)="ref.close()"
           data-test="panel-open"><app-icon name="external" />{{ openLabel() }}</a>
      </div>
    </app-side-panel>
  `,
})
export class ReviewItemPanel implements OnInit {
  readonly ref = inject<DialogRef<ReviewItemPanelResult>>(DialogRef);
  readonly data = inject<ReviewItemPanelData>(DIALOG_DATA);
  private readonly http = inject(HttpClient);

  readonly item = this.data.item;
  readonly link = linkOf(this.item);
  readonly kindLabel = computed(() => KIND_LABEL[this.item.kind]);
  readonly heading = computed(() => this.data.name || this.item.title);
  readonly age = computed(() => ageOf(this.item.since, Date.now()));

  readonly loading = signal(true);
  readonly error = signal('');
  readonly task = signal<TaskDetail | null>(null);
  readonly run = signal<RunReview | null>(null);
  readonly doc = signal<ReviewDetail | null>(null);

  readonly fields = computed(() => Object.entries(this.task()?.subject ?? {})
    .filter(([k, v]) => v !== null && v !== undefined && v !== '' && k !== 'link')
    .slice(0, 12)
    .map(([k, v]) => ({ label: labelOf(k), value: typeof v === 'object' ? JSON.stringify(v) : String(v) })));

  /** The values the reviewer should look at, least sure first (at most eight; the review page has them all). */
  readonly lowFields = computed<ExtractedField[]>(() => {
    const d = this.doc();
    if (!d) return [];
    const line = lowLine(d.autoApproveThreshold);
    return (d.fields ?? [])
      .filter(f => isLow(f, line))
      .sort((a, b) => (a.confidence ?? 0) - (b.confidence ?? 0))
      .slice(0, 8);
  });

  readonly openLabel = computed(() => ({ approval: 'Open in Approvals', run: 'Open the run', document: 'Open the document' })[this.item.kind]);

  ngOnInit(): void {
    const i = this.item;
    const settle = (message: string) => ({
      error: () => { this.loading.set(false); this.error.set(message); },
    });
    if (i.via === 'task') {
      this.http.get<ApiResponse<TaskDetail>>(`${API_BASE}/taskInbox.json/task`, { params: { id: i.id } }).subscribe({
        next: r => { this.loading.set(false); if (r.status === API_SUCCESS && r.data) this.task.set(r.data); else this.error.set(r.message || 'The request could not be read.'); },
        ...settle('The request could not be read.'),
      });
    }
    if (i.runId != null && (i.via === 'core' || i.kind === 'run')) {
      this.http.get<ApiResponse<RunReview>>(`${API_BASE}/sourceJob.json/review`, { params: { jobQueueId: i.runId } }).subscribe({
        next: r => { this.loading.set(false); if (r.status === API_SUCCESS && r.data) this.run.set(r.data); },
        // A reviewer may not read Core's review of a run their task is about: the task says enough.
        error: () => this.loading.set(false),
      });
    }
    if (i.via === 'document') {
      this.http.get<ApiResponse<ReviewDetail>>(`${API_BASE}/documentReview.json/fetchById`, { params: { extractionId: i.id } }).subscribe({
        next: r => { this.loading.set(false); if (r.status === API_SUCCESS && r.data) this.doc.set(r.data); else this.error.set(r.message || 'The document could not be read.'); },
        ...settle('The document could not be read.'),
      });
    }
  }

  runLine(r: RunReview): string {
    const decided = new Set((r.decisions ?? []).map(d => (d.party ?? '').toLowerCase()));
    const waiting = (r.required ?? []).filter(p => !decided.has(p.toLowerCase()));
    if (r.reviewStatus && r.reviewStatus !== 'PENDING') return `Decided: ${r.reviewStatus.toLowerCase()}.`;
    return waiting.length ? `Waiting for the ${waiting.map(p => this.partyOf(p).toLowerCase()).join(' and ')} review.` : 'Waiting for a review.';
  }

  partyOf(party: string): string {
    return party ? party.charAt(0).toUpperCase() + party.slice(1).toLowerCase() : 'Review';
  }

  pct(c: number): number | null {
    return percent(c);
  }
}
