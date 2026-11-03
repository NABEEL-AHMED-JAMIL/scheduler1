import { Component, computed, input } from '@angular/core';
import { ReportState, STATE_WORDS } from './report-library.api';

/** One day's bar: its day, its parts by state, its total. */
export interface DayBar { day: string; parts: { state: ReportState; n: number }[]; total: number; }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A day as the axis writes it: "21 Oct". */
export function dayWords(day: string): string {
  const d = new Date(day + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? day : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** About five evenly spaced days for the axis (first and last always), each with its place in percent. */
export function axisDays(days: string[], want = 5): { day: string; at: number }[] {
  const n = days.length;
  if (!n) return [];
  if (n === 1) return [{ day: days[0], at: 50 }];
  const step = Math.max(1, Math.round((n - 1) / (want - 1)));
  const picks = new Set<number>([0, n - 1]);
  for (let i = step; i < n - 1; i += step) if (n - 1 - i >= step / 2) picks.add(i);
  return [...picks].sort((a, b) => a - b).map(i => ({ day: days[i], at: ((i + 0.5) / n) * 100 }));
}

/**
 * The library's "Reports a day, by status" (owner review 2026-11-03): stacked bars a day with a baseline for empty days, a few
 * dates under them, the tallest day's count on its bar and every day's on hover, and a legend of the states shown. When the
 * range's reports all fall on one day a lone bar says nothing, so it says so in words: "All 433 on 21 Oct".
 */
@Component({
  selector: 'app-library-histogram',
  styleUrl: './library-histogram.css',
  template: `
    @if (oneDay(); as d) {
      <p class="lx-oneday" data-test="hist-one-day"><b>All {{ d.total }} on {{ dayWords(d.day) }}</b>
        @for (p of d.parts; track p.state) { <span class="lx-leg"><i [class]="'s-' + p.state"></i>{{ p.n }} {{ word(p.state).toLowerCase() }}</span> }</p>
    } @else if (bars().length) {
      <div class="lx-bars" role="img" [attr.aria-label]="words()">
        @for (b of bars(); track b.day) {
          <div class="lx-col" [class.is-empty]="!b.total" [title]="title(b)">
            @if (b.total === max() && b.total) { <span class="lx-top">{{ b.total }}</span> }
            @for (p of b.parts; track p.state) { <i [class]="'s-' + p.state" [style.height.%]="(p.n / max()) * 88"></i> }
          </div>
        }
      </div>
      <div class="lx-axis" aria-hidden="true">@for (t of axis(); track t.day) { <span [style.left.%]="t.at">{{ dayWords(t.day) }}</span> }</div>
      <div class="lx-legend">@for (s of legend(); track s) { <span class="lx-leg"><i [class]="'s-' + s"></i>{{ word(s) }}</span> }</div>
    }
  `,
})
export class LibraryHistogram {
  readonly bars = input<DayBar[]>([]);
  readonly dayWords = dayWords;
  readonly max = computed(() => Math.max(1, ...this.bars().map(b => b.total)));
  readonly oneDay = computed(() => {
    const busy = this.bars().filter(b => b.total > 0);
    return busy.length === 1 && this.bars().length > 1 ? busy[0] : null;
  });
  readonly axis = computed(() => axisDays(this.bars().map(b => b.day)));
  readonly legend = computed(() => {
    const seen = new Set(this.bars().flatMap(b => b.parts.map(p => p.state)));
    return (['APPROVED', 'WAITING', 'READY', 'PENDING', 'FAILED', 'VOID'] as ReportState[]).filter(s => seen.has(s));
  });
  readonly words = computed(() => {
    const b = this.bars();
    const total = b.reduce((n, x) => n + x.total, 0);
    return b.length ? `${total} report${total === 1 ? '' : 's'} from ${dayWords(b[0].day)} to ${dayWords(b[b.length - 1].day)}, at most ${this.max()} a day` : '';
  });

  word(s: ReportState): string { return STATE_WORDS[s] ?? s; }

  title(b: DayBar): string {
    return `${dayWords(b.day)}: ${b.total} report${b.total === 1 ? '' : 's'}` + (b.parts.length ? ' (' + b.parts.map(p => `${p.n} ${this.word(p.state).toLowerCase()}`).join(', ') + ')' : '');
  }
}
