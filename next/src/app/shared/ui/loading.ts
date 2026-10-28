import { HttpErrorResponse } from '@angular/common/http';
import { Component, DestroyRef, Signal, computed, inject, input, output, signal } from '@angular/core';
import { Icon } from './icon';

/** How long a load may take before anything is drawn for it: a fast answer then never flickers a skeleton. */
export const LOADING_DELAY_MS = 150;
/** After this long the indicator says "Still loading…", so a slow answer does not read as a stuck page. */
export const LOADING_SLOW_MS = 10_000;

/**
 * A timer pair shared by every loading indicator: `shown` turns true LOADING_DELAY_MS after creation and `slow`
 * LOADING_SLOW_MS after it. Both are cleared when the owner goes away. Created in an injection context.
 */
export function loadingClock(delay = LOADING_DELAY_MS, slowAfter = LOADING_SLOW_MS): { shown: Signal<boolean>; slow: Signal<boolean> } {
  const shown = signal(delay <= 0);
  const slow = signal(false);
  const timers = [
    delay > 0 ? setTimeout(() => shown.set(true), delay) : undefined,
    setTimeout(() => slow.set(true), slowAfter),
  ];
  inject(DestroyRef).onDestroy(() => timers.forEach(t => t !== undefined && clearTimeout(t)));
  return { shown: shown.asReadonly(), slow: slow.asReadonly() };
}

export type LoadingShape = 'rows' | 'cards' | 'panel' | 'tiles' | 'list' | 'spinner' | 'inline';

/**
 * What a screen shows while its data is on the way (owner 2026-10-27: "data load show blank page some place so i need
 * a loader on each component like it's loading").
 *
 * A skeleton in the shape of what is coming -- table rows, cards, a panel's lines, a row of KPI tiles, a list -- or a
 * small spinner where there is no room for one. Nothing is drawn for the first LOADING_DELAY_MS, so a fast answer does
 * not flicker; after LOADING_SLOW_MS it says "Still loading…". The host is aria-busy throughout and a polite status
 * line names what is loading for a screen reader ("Loading runs…").
 *
 * Put it where the content will be, inside an @if on the first load only. A reload with data already on screen keeps
 * the data (app-blur-loader, or a table-shell's [loading]) instead of coming back here.
 */
@Component({
  selector: 'app-loading',
  host: { 'aria-busy': 'true', class: 'app-loading', '[class.is-inline]': "shape() === 'inline'" },
  styles: `
    :host { display: block; }
    :host(.is-inline) { display: inline-flex; }
    .ld-wrap { padding: 1rem; }
    .ld-line, .ld-block {
      display: block; border-radius: var(--radius-sm); background: var(--surface-sunken);
      animation: ld-pulse 1.4s ease-in-out infinite;
    }
    .ld-line { height: 0.75rem; }
    .ld-title { width: 40%; height: 1rem; }
    .ld-rows { display: grid; gap: 0.9rem; padding: 0.9rem 1rem; }
    .ld-row { display: grid; grid-template-columns: 2fr 1fr 1fr 1.2fr; gap: 1.25rem; align-items: center; }
    .ld-cards { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fill, minmax(16rem, 1fr)); padding: 1rem; }
    .ld-card { height: 6.5rem; border-radius: var(--radius-card); }
    .ld-tiles { display: grid; gap: 0.75rem; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); }
    .ld-tile { height: 4rem; border-radius: var(--radius-card); }
    .ld-panel { display: grid; gap: 0.7rem; padding: 1rem; }
    .ld-list { display: grid; gap: 0.6rem; padding: 0.75rem 1rem; }
    .ld-item { display: flex; gap: 0.75rem; align-items: center; }
    .ld-dot { width: 1.75rem; height: 1.75rem; border-radius: 999px; flex: none; }
    .ld-text { display: inline-flex; align-items: center; gap: 0.5rem; color: var(--text-muted); font-size: 0.8125rem; }
    .ld-spin { display: flex; flex-direction: column; align-items: center; gap: 0.75rem; padding: 3rem 1.5rem; }
    .ld-spin .spinner { --spinner-size: 1.5rem; }
    .ld-text .spinner { --spinner-size: 0.95rem; border-width: 2px; }
    .ld-slow { margin-top: 0.5rem; text-align: center; }
    @keyframes ld-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
    @media (prefers-reduced-motion: reduce) { .ld-line, .ld-block { animation: none; } }
  `,
  template: `
    @if (clock.shown()) {
      <span class="sr-only" role="status">{{ said() }}</span>
      @switch (shape()) {
        @case ('rows') {
          <div class="ld-rows" aria-hidden="true">
            @for (r of lines(); track r) {
              <div class="ld-row">
                @for (c of [0, 1, 2, 3]; track c) { <span class="ld-line" [style.width.%]="55 + ((r * 7 + c * 13) % 40)"></span> }
              </div>
            }
          </div>
        }
        @case ('cards') {
          <div class="ld-cards" aria-hidden="true">@for (r of lines(); track r) { <span class="ld-block ld-card"></span> }</div>
        }
        @case ('tiles') {
          <div class="ld-tiles" aria-hidden="true">@for (r of lines(); track r) { <span class="ld-block ld-tile"></span> }</div>
        }
        @case ('list') {
          <div class="ld-list" aria-hidden="true">
            @for (r of lines(); track r) {
              <div class="ld-item"><span class="ld-block ld-dot"></span><span class="ld-line" [style.width.%]="45 + ((r * 17) % 45)"></span></div>
            }
          </div>
        }
        @case ('panel') {
          <div class="ld-panel" aria-hidden="true">
            <span class="ld-line ld-title"></span>
            @for (r of lines(); track r) { <span class="ld-line" [style.width.%]="60 + ((r * 23) % 38)"></span> }
          </div>
        }
        @case ('inline') {
          <span class="ld-text" aria-hidden="true"><span class="spinner"></span>{{ said() }}</span>
        }
        @default {
          <div class="ld-spin" aria-hidden="true">
            <span class="spinner"></span><span class="ld-text">{{ said() }}</span>
          </div>
        }
      }
      @if (clock.slow() && shape() !== 'inline' && shape() !== 'spinner') {
        <p class="ld-slow ld-text w-full justify-center" aria-hidden="true">Still loading…</p>
      }
    }
  `,
})
export class AppLoading {
  /** What is loading, as the reader would say it: "Loading runs…". */
  readonly label = input('Loading…');
  readonly shape = input<LoadingShape>('spinner');
  /** How many skeleton rows, cards, tiles or lines. */
  readonly count = input(4);

  protected readonly clock = loadingClock();
  protected readonly said = computed(() => (this.clock.slow() ? 'Still loading…' : this.label()));
  protected readonly lines = computed(() => Array.from({ length: Math.max(1, this.count()) }, (_, i) => i));
}

/**
 * The words for a read that failed, plain enough to show (owner: never a raw error). The service's own message when it
 * wrote one for people (the console's APIs answer `{ message }`), a sentence about the connection when nothing came
 * back at all, and the caller's fallback otherwise -- never "Http failure response for …" or a stack trace.
 */
export function loadErrorText(err: unknown, fallback: string): string {
  if (err instanceof HttpErrorResponse || (!!err && typeof err === 'object' && typeof (err as { status?: unknown }).status === 'number')) {
    const e = err as { status?: number; error?: unknown };
    if (e.status === 0) return 'The service could not be reached. Check your connection, then try again.';
    const said = e.error && typeof e.error === 'object' ? (e.error as { message?: unknown }).message : null;
    if (typeof said === 'string' && isPlain(said)) return said;
    if (e.status === 403) return 'You do not have access to this.';
    return fallback;
  }
  if (typeof err === 'string' && isPlain(err)) return err;
  if (err && typeof err === 'object' && typeof (err as { message?: unknown }).message === 'string') {
    const said = (err as { message: string }).message;
    // An API answer object ({ status: 'ERROR', message }) carries words meant for people; a JS Error does not.
    if (!(err instanceof Error) && isPlain(said)) return said;
  }
  return fallback;
}

function isPlain(text: string): boolean {
  const t = text.trim();
  return !!t && t.length <= 400 && !/Http failure|Exception|\bat [\w.$]+\(|^\s*[{[]|<html|undefined|null pointer|SQLSTATE/i.test(t);
}

/**
 * The three states of one read, so a screen cannot forget one of them (the audit found 169 failures that read as
 * "none" and 14 spinners that never stopped): `start()` before the request, `done()` in next, `fail(err, words)` in
 * error. `pending` is true until the first answer -- loading, not empty -- so an empty state never shows before the
 * data could have arrived; `loading` stays true through a reload, when the screen keeps what it has.
 */
export interface LoadState {
  readonly loading: Signal<boolean>;
  readonly error: Signal<string>;
  readonly loaded: Signal<boolean>;
  /** No answer yet and no failure: the first load. */
  readonly pending: Signal<boolean>;
  start(): void;
  done(): void;
  fail(err: unknown, fallback: string): void;
  /** The scope changed (another workspace, month or record): back to the first load, so nothing old reads as current. */
  reset(): void;
}

export function createLoadState(startLoading = true): LoadState {
  const loading = signal(startLoading);
  const error = signal('');
  const loaded = signal(false);
  return {
    loading: loading.asReadonly(),
    error: error.asReadonly(),
    loaded: loaded.asReadonly(),
    pending: computed(() => !loaded() && !error()),
    start: () => { loading.set(true); error.set(''); },
    done: () => { loading.set(false); loaded.set(true); error.set(''); },
    fail: (err, fallback) => { loading.set(false); error.set(loadErrorText(err, fallback)); },
    reset: () => { loading.set(true); loaded.set(false); error.set(''); },
  };
}

/**
 * The state line under a field whose choices are read from the server (82 such lists had no loading, empty or error
 * state): "Loading schedules…" with a small spinner while they come, the field's own "No … yet" line (and its next
 * step, projected) when there are none, and the reason with Try again when the read failed.
 */
@Component({
  selector: 'app-inline-status',
  imports: [Icon, AppLoading],
  host: { class: 'block text-xs mt-1' },
  template: `
    @if (error()) {
      <p class="flex flex-wrap items-center gap-x-2 text-crit-500" role="alert">
        <app-icon name="alert" size="0.95em" />{{ error() }}
        @if (retryable()) {
          <button type="button" class="btn btn-default btn-xs" (click)="retry.emit()"><app-icon name="refresh" />Try again</button>
        }
      </p>
    } @else if (loading()) {
      <app-loading shape="inline" [label]="label()" />
    } @else if (empty()) {
      <p class="text-[color:var(--text-muted)]">{{ emptyText() }} <ng-content /></p>
    }
  `,
})
export class InlineStatus {
  readonly loading = input(false);
  readonly error = input('');
  readonly empty = input(false);
  readonly label = input('Loading…');
  readonly emptyText = input('Nothing here yet.');
  readonly retryable = input(true);
  readonly retry = output<void>();
}
