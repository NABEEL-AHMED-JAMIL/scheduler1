import { Component, ElementRef, ViewEncapsulation, LOCALE_ID, computed, effect, inject, input, model, signal, untracked, viewChild } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../shared/ui/icon';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { ToastService } from '../../../shared/ui/toast.service';
import { copyText } from '../../../shared/ui/clipboard.util';
import { StorageService } from '../../objects/storage.service';
import { RunTimelineStore } from '../run-steps/run-timeline.store';
import { LogSegment, logSegments, pathParts } from './log-segments';
import {
  AuditEntry, LOG_LEVELS, RUN_LOG_STYLES, LogLevel, LogLine, auditLines, filterLines, levelClass, levelCounts, logText, mergeLines, nextError, stepLines,
} from './run-log.model';

/** Lines drawn at once when they wrap (a wrapped line has no fixed height to window by); Show earlier adds as many. */
export const WRAP_WINDOW = 2000;
/** One unwrapped line's height in pixels: the virtual list windows by it. */
export const LINE_PX = 20;
/** Lines drawn beyond the view on either side, so a quick scroll does not show a gap. */
const MARGIN = 30;

const LEVEL_WORDS: Record<LogLevel, string> = { ERROR: 'Errors', WARN: 'Warnings', INFO: 'Info', DEBUG: 'Debug' };

/**
 * The run page's Log tab (UX review 2026-10-12, run page fix): the run's entries, and a step's own lines when a step is
 * chosen (the old Console), as one monospaced stream -- each line's time on the 24-hour clock (instantOf, through
 * serverTime), its level in its colour, its step. Search, a filter by level and by step, wrap, copy and download; the
 * errors one press away. Unwrapped, the list is virtual (a fixed line height), so a run of a hundred thousand lines
 * draws only what is on screen; wrapped, the newest {@link WRAP_WINDOW} are drawn and earlier ones on request.
 */
@Component({
  selector: 'app-run-log',
  imports: [Icon, ServerTimePipe, RouterLink, NgTemplateOutlet],
  // The log's look is shared with the step log panel (RUN_LOG_STYLES); it is written for the console's dark ground.
  encapsulation: ViewEncapsulation.None,
  styles: RUN_LOG_STYLES,
  template: `
    <section class="card overflow-clip" aria-labelledby="run-log-heading" data-test="run-log">
      <div class="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-subtle">
        <h2 id="run-log-heading" class="sr-only">Log</h2>
        <div class="search-field w-56">
          <app-icon name="search" size="0.95em" />
          <input class="input" placeholder="Search the log" aria-label="Search log entries" data-test="log-search"
                 [value]="term()" (input)="term.set($any($event.target).value)" />
        </div>
        <div class="flex items-center gap-1" role="group" aria-label="Levels">
          @for (l of levelOptions(); track l.level) {
            <button type="button" class="btn btn-default btn-xs" [attr.aria-pressed]="levels().has(l.level)" [attr.data-level]="l.level"
                    [class.run-log-level-on]="levels().has(l.level)" (click)="toggleLevel(l.level)">
              <span class="run-log-dot" [class]="levelClass(l.level)"></span>{{ l.word }} <span class="tabular text-[color:var(--text-muted)]">{{ l.count }}</span>
            </button>
          }
        </div>
        <select class="input w-auto max-w-72 text-xs" aria-label="Step" data-test="log-step" (change)="step.set($any($event.target).value || null)">
          <option value="" [selected]="!step()">Every step</option>
          @for (s of store.timeline()?.steps ?? []; track s.index) {
            <option [value]="s.key" [selected]="s.key === step()">{{ s.index + 1 }} · {{ s.name || s.key }}</option>
          }
        </select>
        <ng-content select="[toolbar]" />
        <div class="ml-auto flex items-center gap-1">
          @if (errorCount()) {
            <span class="text-xs text-crit-500 tabular mr-1" data-test="log-errors">{{ errorCount() }} {{ errorCount() === 1 ? 'error' : 'errors' }}</span>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Previous error" title="Previous error" (click)="jump(-1)"><app-icon name="chevronUp" /></button>
            <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Next error" title="Next error" data-test="next-error" (click)="jump(1)"><app-icon name="chevronDown" /></button>
          }
          <button type="button" class="btn btn-ghost btn-icon btn-sm" [attr.aria-pressed]="wrap()" aria-label="Wrap long lines" title="Wrap long lines"
                  data-test="log-wrap" (click)="wrap.set(!wrap())"><app-icon name="wrapText" /></button>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Copy the shown lines" title="Copy the shown lines" (click)="copy()"><app-icon name="copy" /></button>
          <button type="button" class="btn btn-ghost btn-icon btn-sm" aria-label="Download the shown lines" title="Download the shown lines (.log)" (click)="download()"><app-icon name="download" /></button>
        </div>
      </div>
      <ng-content select="[above]" />

      @if (loading() && !entries().length) {
        <p class="px-4 py-3 text-xs text-[color:var(--text-muted)]">Reading the log…</p>
      } @else if (error()) {
        <div class="px-4 py-3 text-sm text-crit-500" role="alert">{{ error() }} </div>
      } @else if (!shown().length) {
        <p class="px-4 py-3 text-xs text-[color:var(--text-muted)]" data-test="log-empty">
          {{ lines().length ? 'No lines match the filters.' : stepPending() ? 'Reading the step\\'s lines…' : 'This run reported no log entries.' }}</p>
      } @else {
        <p class="px-4 py-1 text-[11px] text-[color:var(--text-muted)] border-b border-subtle tabular" data-test="log-count">
          {{ shown().length === lines().length ? count(lines().length) : shown().length.toLocaleString('en-GB') + ' of ' + count(lines().length) }}</p>
        @if (wrap()) {
          @if (hiddenEarlier() > 0) {
            <div class="flex items-center gap-2 px-4 py-1.5 text-xs text-[color:var(--text-muted)]" data-earlier>
              {{ hiddenEarlier() }} earlier {{ hiddenEarlier() === 1 ? 'line is' : 'lines are' }} not shown.
              <button type="button" class="btn btn-default btn-xs" (click)="windowSize.set(windowSize() + wrapWindow)">Show earlier</button>
            </div>
          }
          <div class="run-log-lines is-wrap run-log-scroll" #wrapBox data-test="log-lines" (scroll)="onScroll($event)">
            @for (line of windowed(); track line.id; let i = $index) {
              <ng-container *ngTemplateOutlet="row; context: { $implicit: line, i: i + hiddenEarlier() }" />
            }
          </div>
        } @else {
          <!-- Virtual: only the lines in view (and a margin) are in the page, positioned by a fixed line height. -->
          <div class="run-log-lines run-log-scroll" #listBox [style.height.px]="viewportHeight()" data-test="log-lines" (scroll)="onScroll($event)">
            <div class="run-log-spacer" [style.height.px]="shown().length * linePx">
              <div [style.transform]="'translateY(' + range().first * linePx + 'px)'">
                @for (line of slice(); track line.id; let i = $index) {
                  <ng-container *ngTemplateOutlet="row; context: { $implicit: line, i: i + range().first }" />
                }
              </div>
            </div>
          </div>
        }
      }
    </section>

    <ng-template #row let-line let-i="i">
      <div class="run-log-line" [attr.data-level]="line.level" [attr.data-i]="i" [class.is-current]="i === current()">
        <span class="run-log-time" [title]="line.at ? (line.at | serverTime:'dateTimeSec') : ''">{{ line.at ? (line.at | serverTime:'timeSec') : '—' }}</span>
        <span class="run-log-level" [class]="levelClass(line.level)">{{ line.level }}</span>
        <span class="run-log-step" [title]="line.step ? 'Step ' + line.step : ''">{{ line.step }}</span>
        <span class="run-log-msg">@for (seg of segmentsOf(line); track $index) {@if (seg.path; as p) {@if (p.bucket) {<a class="log-path" routerLink="/data/files" [queryParams]="{ bucket: p.bucket, prefix: p.prefix }" [title]="'Open ' + (p.prefix || '/') + ' in ' + p.bucket">@for (part of pathParts(seg.text); track $index) {{{ part }}@if (part.endsWith('/')) {<wbr>}}</a>} @else {<span class="log-path">{{ seg.text }}</span>}} @else {{{ seg.text }}}}</span>
      </div>
    </ng-template>
  `,
})
export class RunLog {
  readonly store = inject(RunTimelineStore);
  private readonly toast = inject(ToastService);
  private readonly clock = new ServerTimePipe(inject(LOCALE_ID));
  private readonly host = inject(ElementRef).nativeElement as HTMLElement;

  /** The run's own entries (findSourceJobAuditLog), as the page reads and polls them. */
  readonly entries = input<AuditEntry[]>([]);
  readonly loading = input(false);
  readonly error = input('');
  /** The bucket a path in an entry is relative to, so it links to its folder. */
  readonly bucket = input<string | null>(null);
  /** The run is still writing lines: the view follows the newest while the reader is at the bottom. */
  readonly follow = input(false);
  /** The download's name ("run-8134"). */
  readonly fileName = input('run');

  readonly term = signal('');
  readonly levels = signal<ReadonlySet<LogLevel>>(new Set());
  /** One step's lines (its key), or null for the whole run. Set by the page when "Open in Log" names a step. */
  readonly step = model<string | null>(null);
  readonly wrap = signal(false);
  readonly current = signal(-1);
  readonly windowSize = signal(WRAP_WINDOW);
  readonly wrapWindow = WRAP_WINDOW;
  readonly linePx = LINE_PX;
  readonly levelClass = levelClass;
  readonly pathParts = pathParts;

  private readonly listBox = viewChild<ElementRef<HTMLElement>>('listBox');
  /** The virtual list's scroll position, which picks the lines drawn. */
  readonly scrollTop = signal(0);
  private readonly wrapBox = viewChild<ElementRef<HTMLElement>>('wrapBox');

  private readonly runLines = computed(() => auditLines(this.entries()));
  private readonly chosenStep = computed(() => {
    const key = this.step();
    return key ? (this.store.timeline()?.steps ?? []).find(s => s.key === key) ?? null : null;
  });
  readonly stepPending = computed(() => {
    const s = this.chosenStep();
    return !!s && s.stepExecutionId !== null && !this.store.lines().has(s.stepExecutionId);
  });

  /** Every line the filters choose from: the run's entries, and the chosen step's own lines merged in by time. */
  readonly lines = computed<LogLine[]>(() => {
    const s = this.chosenStep();
    const own = s?.stepExecutionId != null ? this.store.lines().get(s.stepExecutionId) : undefined;
    return Array.isArray(own) ? mergeLines(this.runLines(), stepLines(s!.key, own)) : this.runLines();
  });
  readonly shown = computed(() => filterLines(this.lines(), { term: this.term(), levels: this.levels(), step: this.step() }));
  readonly counts = computed(() => levelCounts(this.lines().filter(l => !this.step() || l.step === this.step())));
  readonly errorCount = computed(() => this.shown().filter(l => l.level === 'ERROR').length);
  readonly levelOptions = computed(() => LOG_LEVELS
    .filter(level => level !== 'DEBUG' || this.counts().DEBUG > 0)
    .map(level => ({ level, word: LEVEL_WORDS[level], count: this.counts()[level] })));

  readonly windowed = computed(() => {
    const all = this.shown();
    return all.length > this.windowSize() ? all.slice(all.length - this.windowSize()) : all;
  });
  readonly hiddenEarlier = computed(() => this.shown().length - this.windowed().length);
  /** The list's height: its lines up to 40rem of them, so a short log is not a tall empty box. */
  readonly viewportHeight = computed(() => Math.min(Math.max(this.shown().length, 1) * LINE_PX, 640));
  /** The lines drawn: those in view and {@link MARGIN} either side. */
  readonly range = computed(() => {
    const n = this.shown().length;
    const first = Math.min(Math.max(0, Math.floor(this.scrollTop() / LINE_PX) - MARGIN), Math.max(0, n - 1));
    return { first, last: Math.min(n, first + Math.ceil(this.viewportHeight() / LINE_PX) + 2 * MARGIN) };
  });
  readonly slice = computed(() => this.shown().slice(this.range().first, this.range().last));

  private readonly segmentCache = new WeakMap<LogLine, LogSegment[]>();
  segmentsOf(line: LogLine): LogSegment[] {
    let segments = this.segmentCache.get(line);
    if (!segments) {
      segments = line.source === 'run' ? logSegments(line.message, this.bucket()) : [{ text: line.message }];
      this.segmentCache.set(line, segments);
    }
    return segments;
  }

  constructor() {
    // A chosen step's own lines are read when it is chosen, once.
    effect(() => {
      const s = this.chosenStep();
      if (s?.stepExecutionId != null && s.log === 'step') untracked(() => this.store.readLines(s.stepExecutionId));
    });
    // A new list (wrapped or not) starts at its top.
    effect(() => { this.wrap(); untracked(() => this.scrollTop.set(0)); });
    // Filters change what "the next error" means: start over.
    effect(() => { this.shown(); untracked(() => this.current.set(-1)); });
    // A running run's newest lines stay in view while the reader is at the bottom (scrolling up stops following).
    effect(() => {
      this.shown();
      if (!untracked(() => this.follow()) || !this.pinned) return;
      queueMicrotask(() => {
        const el = this.scroller();
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        if (!this.wrap()) this.scrollTop.set(el.scrollTop);
      });
    });
  }
  /** The reader is at the bottom of the list (or has not scrolled it). */
  private pinned = true;

  onScroll(event: Event): void {
    const el = event.target as HTMLElement;
    if (!this.wrap()) this.scrollTop.set(el.scrollTop);
    this.pinned = el.scrollHeight - el.scrollTop - el.clientHeight < LINE_PX * 3;
  }

  private scroller(): HTMLElement | null {
    return this.listBox()?.nativeElement ?? this.wrapBox()?.nativeElement ?? null;
  }

  count(n: number): string { return `${n.toLocaleString('en-GB')} ${n === 1 ? 'line' : 'lines'}`; }

  toggleLevel(level: LogLevel): void {
    this.levels.update(set => {
      const next = new Set(set);
      if (next.has(level)) next.delete(level); else next.add(level);
      return next;
    });
  }

  /** The previous or next error, scrolled into view and marked. */
  jump(direction: 1 | -1): void {
    const lines = this.shown();
    const at = nextError(lines, this.current() < 0 && direction === -1 ? lines.length : this.current(), direction);
    if (at < 0) return;
    this.current.set(at);
    const list = this.listBox()?.nativeElement;
    if (list) {
      list.scrollTop = Math.max(0, at - 3) * LINE_PX;
      this.scrollTop.set(list.scrollTop);
      return;
    }
    if (at < this.hiddenEarlier()) this.windowSize.set(lines.length - at + 10);
    queueMicrotask(() => this.host.querySelector(`.run-log-line[data-i="${at}"]`)?.scrollIntoView({ block: 'center' }));
  }

  private text(): string {
    return logText(this.shown(), at => (at ? this.clock.transform(at, 'dateTimeSec') ?? '' : '—'));
  }

  async copy(): Promise<void> {
    const ok = await copyText(this.text());
    if (ok) this.toast.success(`Copied ${this.count(this.shown().length)}.`);
    else this.toast.error('The lines could not be copied.');
  }

  download(): void {
    StorageService.saveBlob(new Blob([this.text()], { type: 'text/plain;charset=utf-8' }), `${this.fileName()}${this.step() ? '-' + this.step() : ''}.log`);
  }
}
