import { Component, ComponentRef, DestroyRef, ViewContainerRef, effect, inject, input, output, signal } from '@angular/core';
import type { PinnedChart } from '../analytics.service';
import type { ChartAnswer } from './chart-answer';
import type { ChartAnswerCard } from './chart-answer-card';
import { AppLoading, InlineStatus } from '../../../shared/ui/loading';

/**
 * MIG-357: where a chart answer is drawn on a screen that may never show one (Ask your data, the AI Assistant). The card
 * -- and the dashboards' chart engine behind it -- is imported when the first answer arrives, not with the screen; and by
 * a dynamic import rather than @defer, which would put Angular's defer runtime in the initial bundle (shell.html says
 * the same). The inputs follow the slot's.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-chart-answer-slot',
  imports: [AppLoading, InlineStatus],
  // Owner 2026-10-27: a chunk that fails to load (a deploy since the page opened, a dropped connection) said "Drawing
  // the chart…" for ever; it now says so, with Try again.
  template: `
    @if (failed()) {
      <app-inline-status error="The chart could not be drawn: part of the page did not load. Try again, or reload the page." (retry)="load()" />
    } @else if (!ready()) {
      <p class="text-xs" data-test="chart-loading"><app-loading shape="inline" label="Drawing the chart…" /></p>
    }
  `,
})
export class ChartAnswerSlot {
  private readonly host = inject(ViewContainerRef);

  readonly answer = input.required<ChartAnswer>();
  readonly canPin = input(true);
  readonly height = input(320);
  readonly showCaption = input(true);
  readonly ready = signal(false);
  readonly failed = signal(false);
  /** The card's answer was pinned to a dashboard (UX final AD1: Ask your data lists what its viewer pinned). */
  readonly pinnedTo = output<PinnedChart>();

  private card: ComponentRef<ChartAnswerCard> | null = null;
  private gone = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.gone = true; this.card?.destroy(); });
    this.load();
    effect(() => {
      // Read every input here, so a new answer (or a change of rights) reaches the card.
      this.answer(); this.canPin(); this.height(); this.showCaption();
      this.pass();
    });
  }

  load(): void {
    this.failed.set(false);
    import('./chart-answer-card').then(({ ChartAnswerCard }) => {
      if (this.gone || this.card) return;
      this.card = this.host.createComponent(ChartAnswerCard);
      this.card.instance.pinnedTo.subscribe(p => this.pinnedTo.emit(p));
      this.pass();
      this.ready.set(true);
    }).catch(() => { if (!this.gone) this.failed.set(true); });
  }

  private pass(): void {
    if (!this.card) return;
    this.card.setInput('answer', this.answer());
    this.card.setInput('canPin', this.canPin());
    this.card.setInput('height', this.height());
    this.card.setInput('showCaption', this.showCaption());
  }
}
