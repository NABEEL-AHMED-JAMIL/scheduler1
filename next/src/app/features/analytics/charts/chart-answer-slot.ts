import { Component, ComponentRef, DestroyRef, ViewContainerRef, effect, inject, input, signal } from '@angular/core';
import type { ChartAnswer } from './chart-answer';
import type { ChartAnswerCard } from './chart-answer-card';

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
  template: `@if (!ready()) { <p class="text-xs text-[color:var(--text-muted)]" data-test="chart-loading">Drawing the chart…</p> }`,
})
export class ChartAnswerSlot {
  private readonly host = inject(ViewContainerRef);

  readonly answer = input.required<ChartAnswer>();
  readonly canPin = input(true);
  readonly height = input(320);
  readonly showCaption = input(true);
  readonly ready = signal(false);

  private card: ComponentRef<ChartAnswerCard> | null = null;
  private gone = false;

  constructor() {
    inject(DestroyRef).onDestroy(() => { this.gone = true; this.card?.destroy(); });
    void import('./chart-answer-card').then(({ ChartAnswerCard }) => {
      if (this.gone) return;
      this.card = this.host.createComponent(ChartAnswerCard);
      this.pass();
      this.ready.set(true);
    });
    effect(() => {
      // Read every input here, so a new answer (or a change of rights) reaches the card.
      this.answer(); this.canPin(); this.height(); this.showCaption();
      this.pass();
    });
  }

  private pass(): void {
    if (!this.card) return;
    this.card.setInput('answer', this.answer());
    this.card.setInput('canPin', this.canPin());
    this.card.setInput('height', this.height());
    this.card.setInput('showCaption', this.showCaption());
  }
}
