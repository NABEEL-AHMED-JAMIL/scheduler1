import { Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { API_SUCCESS } from '../../../core/api/api.config';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { copyText } from '../../../shared/ui/clipboard.util';
import { ToastService } from '../../../shared/ui/toast.service';
import { formatDuration } from '../../../shared/ui/time-format';
import { ImageApi } from './image.api';
import { messageOf } from './image-actions';
import { AskRow, PhotoDetail, isMeasuredPhoto } from './image.model';

/** The rows GET /photos/{id}/asks answers, as a list or as {rows}. */
export function askRows(data: AskRow[] | { rows: AskRow[] } | null | undefined): AskRow[] {
  return Array.isArray(data) ? data : data?.rows ?? [];
}

/** How an answer is labelled (design types-ask): a draft, or not answered with a fixed reply and no model asked. */
export function askState(row: AskRow): { pill: string; tone: 'warn' | 'crit' | 'neutral'; meta: string; refused: boolean } {
  if (row.status === 'refused') return { pill: 'Not answered', tone: 'warn', meta: 'fixed reply · no model was asked', refused: true };
  if (row.status === 'ok') {
    const prompt = row.promptName ? `${row.promptName}${row.promptVersion != null ? ' v' + row.promptVersion : ''}` : '';
    const took = row.tookMs != null ? formatDuration(row.tookMs / 1000) : '';
    return { pill: 'Draft · not a diagnosis', tone: 'warn', meta: [prompt, row.model, took].filter(Boolean).join(' · '), refused: false };
  }
  if (row.status === 'held') return { pill: 'Held', tone: 'neutral', meta: 'the answer did not keep to the rules, so it is not shown', refused: false };
  return { pill: 'Not answered', tone: 'crit', meta: row.status === 'off' ? 'Ask is off in this workspace' : 'the model did not answer', refused: false };
}

/**
 * Ask about this image (design types-ask): the thread, then the question box at its foot. A draft answer names the prompt, its version,
 * the model and how long it took, with Copy and Add to the visit note; a question that asks for a diagnosis, a fracture, a
 * stage, a depth, findings or a treatment is not answered -- the fixed reply comes back from the API and no model is asked.
 * Questions and answers are kept with the image and shown in its Details.
 */
@Component({
  selector: 'app-ask-thread',
  imports: [Icon, ServerTimePipe],
  host: { class: 'card at', '[attr.data-test]': "'ask'" },
  styles: `
    :host { display: block; padding: 0; min-width: 0; }
    .at-h { display: flex; flex-wrap: wrap; align-items: baseline; gap: 0.25rem 0.75rem; padding: 0.875rem 1rem; border-bottom: 1px solid var(--border-subtle); }
    .at-h h2 { margin: 0; font-size: 0.9375rem; font-weight: 600; }
    .at-box { display: flex; gap: 0.5rem; padding: 0.75rem 1rem; border-top: 1px solid var(--border-subtle); background: var(--surface-inset); }
    .at-box .search-field { flex: 1 1 auto; min-width: 0; }
    .at-q { display: grid; grid-template-columns: 2rem minmax(0, 1fr); gap: 0.75rem; padding: 0.875rem 1rem; border-bottom: 1px solid var(--border-subtle); }
    .at-av { width: 2rem; height: 2rem; border-radius: var(--radius-full); display: grid; place-items: center; font-size: 0.6875rem; font-weight: 600;
      background: var(--color-brand-600); color: var(--on-solid); }
    .at-av.ai { background: var(--surface-sunken); color: var(--text-secondary); }
    .at-meta { font-size: 0.75rem; color: var(--text-muted); }
    .at-ans { margin-top: 0.5rem; padding: 0.625rem 0.75rem; border-radius: var(--radius-lg); font-size: 0.875rem; line-height: 1.55;
      border: 1px solid var(--border-subtle); background: var(--surface-raised); white-space: pre-wrap; overflow-wrap: anywhere; }
    .at-ans.refused { border-color: color-mix(in oklab, var(--warn-text) 30%, transparent); background: var(--pill-warn-bg); }
    .at-acts { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem; margin-top: 0.5rem; }
    .at-foot { padding: 0.5rem 1rem 0.875rem; font-size: 0.75rem; color: var(--text-muted); }
    .at-empty { padding: 1rem; font-size: 0.8125rem; color: var(--text-muted); }
  `,
  template: `
    @if (!compact()) {
      <div class="at-h"><h2>Ask about this image</h2><span class="at-meta">Answers describe what is visible. They are drafts and never a diagnosis.</span></div>
    }
    @for (r of rows(); track r.askId) {
      @let s = state(r);
      <div class="at-q" [attr.data-ask]="r.askId">
        <div class="at-av">{{ initials(r) }}</div>
        <div class="min-w-0"><div class="text-sm font-medium" data-test="ask-question">{{ r.question }}</div>
          <div class="at-meta">{{ r.askedByName || 'You' }}@if (r.askedAt) { · {{ r.askedAt | serverTime: 'recent' }} }</div></div>
      </div>
      <div class="at-q" [attr.data-answer]="r.askId" [attr.data-status]="r.status">
        <div class="at-av ai"><app-icon [name]="s.refused ? 'shield' : 'sparkle'" size="0.95em" /></div>
        <div class="min-w-0">
          <div class="flex flex-wrap items-center gap-2"><span [class]="'pill pill-' + s.tone" data-test="ask-pill">@if (s.refused) { <app-icon name="lock" size="0.85em" /> }{{ s.pill }}</span>
            <span class="at-meta" data-test="ask-meta">{{ s.meta }}</span></div>
          @if (r.answer && r.status !== 'held') {
            <div class="at-ans" [class.refused]="s.refused" data-test="ask-answer">{{ r.answer }}</div>
          } @else if (r.message) {
            <p class="text-sm mt-2 mb-0 text-[color:var(--text-secondary)]">{{ r.message }}</p>
          }
          @if (r.status === 'ok' && r.answer) {
            <div class="at-acts">
              <button type="button" class="btn btn-default btn-xs" (click)="copy(r)" data-test="ask-copy"><app-icon name="copy" />Copy</button>
              @if (!compact()) {
                <button type="button" class="btn btn-default btn-xs" (click)="toNote.emit(r)" data-test="ask-to-note"><app-icon name="inbox" />Add to the visit note</button>
              }
              @if (measured()) { <span class="at-meta">The size is from the ruler, not from this answer.</span> }
            </div>
          } @else if (s.refused && !compact()) {
            <div class="at-acts"><button type="button" class="btn btn-default btn-xs" (click)="referral.emit()" data-test="ask-referral"><app-icon name="layers" />Start a referral pipeline…</button></div>
          }
        </div>
      </div>
    } @empty {
      @if (askOn()) { <p class="at-empty m-0">No question asked about this image yet.</p> }
    }
    @if (askOn()) {
      <form class="at-box" (submit)="$event.preventDefault(); send()">
        <div class="search-field">
          <app-icon name="chat" size="0.95em" />
          <input class="input" [placeholder]="compact() ? 'Ask about what is visible…' : 'Ask about what is visible: colours, edges, image quality…'"
                 [value]="question()" (input)="question.set($any($event.target).value)" [disabled]="busy()" maxlength="500"
                 aria-label="A question about this image" data-test="ask-input" />
        </div>
        <button type="submit" class="btn btn-primary btn-sm" [disabled]="busy() || !question().trim()" data-test="ask-send">
          @if (busy()) { <app-icon name="refresh" [busy]="true" /> } @else { <app-icon name="send" /> }Ask</button>
      </form>
    } @else {
      <p class="at-empty m-0" data-test="ask-off">Ask is off in this workspace. An administrator switches it on in AI settings.</p>
    }
    <div class="at-foot" data-test="ask-foot">Questions about a diagnosis, fracture, stage, depth, findings or treatment get a fixed reply, and no model is asked. Questions and answers are kept with the image and in its Details.</div>
  `,
})
export class AskThread {
  private readonly api = inject(ImageApi);
  private readonly toast = inject(ToastService);

  readonly photo = input.required<PhotoDetail>();
  readonly askOn = input(true);
  /** The side panel's: no heading, no Add to the visit note. */
  readonly compact = input(false);
  /** The thread, when the page already read it (it counts the tab). */
  readonly initial = input<AskRow[] | null>(null);
  readonly toNote = output<AskRow>();
  readonly referral = output<void>();
  /** The thread changed (a question was asked): the page's count follows. */
  readonly asked = output<AskRow[]>();

  readonly rows = signal<AskRow[]>([]);
  readonly question = signal('');
  readonly busy = signal(false);
  readonly measured = computed(() => isMeasuredPhoto(this.photo()) && this.photo().areaCm2 != null);
  readonly state = askState;

  constructor() {
    effect(() => {
      const id = this.photo().photoId;
      const given = this.initial();
      untracked(() => {
        if (given) { this.rows.set(given); return; }
        this.api.asks(id).subscribe({ next: r => { if (r.status === API_SUCCESS) this.rows.set(askRows(r.data)); }, error: () => undefined });
      });
    });
  }

  initials(r: AskRow): string {
    const n = (r.askedByName ?? '').trim();
    if (!n) return 'You';
    return n.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() ?? '').join('');
  }

  async send(): Promise<void> {
    const q = this.question().trim();
    if (!q || this.busy()) return;
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.ask(this.photo().photoId, q));
      if (r.status !== API_SUCCESS || !r.data) { this.toast.error(r.message || 'The question could not be asked.'); return; }
      this.rows.update(list => [...list, r.data!]);
      this.question.set('');
      this.asked.emit(this.rows());
    } catch (err) {
      this.toast.error(messageOf(err) || 'The question could not be asked.');
    } finally {
      this.busy.set(false);
    }
  }

  async copy(r: AskRow): Promise<void> {
    if (await copyText(r.answer ?? '')) this.toast.success('Answer copied.');
  }
}
