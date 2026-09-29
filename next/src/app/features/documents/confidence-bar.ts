import { Component, computed, input } from '@angular/core';
import { percent } from './documents.model';

/**
 * How sure the model was of a value, as the prototype draws it: a short bar and the percent beside it, green when it
 * clears the line and amber when a reviewer should look. Nothing measured is a dash.
 */
@Component({
  selector: 'app-confidence-bar',
  template: `
    <span class="conf" [class.conf-low]="low()" [attr.aria-label]="label()">
      <span class="conf-track" aria-hidden="true"><span class="conf-fill" [style.width.%]="pct() ?? 0"></span></span>
      <span class="conf-text">{{ pct() === null ? '—' : pct() + '%' }}</span>
    </span>
  `,
  styles: [`
    :host { display: inline-flex; }
    .conf { display: inline-flex; align-items: center; gap: 0.375rem; font-size: 0.6875rem; color: var(--text-secondary);
      white-space: nowrap; font-variant-numeric: tabular-nums; }
    .conf-track { display: block; width: 2rem; height: 5px; border-radius: 3px; background: var(--border-subtle); overflow: hidden; }
    .conf-fill { display: block; height: 100%; background: var(--color-ok-500); }
    .conf-low .conf-fill { background: var(--color-warn-500); }
    .conf-low .conf-text { color: var(--warn-text); }
  `],
})
export class ConfidenceBar {
  readonly value = input<number | null | undefined>(null);
  readonly low = input(false);
  readonly pct = computed(() => percent(this.value()));
  readonly label = computed(() => this.pct() === null ? 'Confidence not measured'
    : `Confidence ${this.pct()}%${this.low() ? ', needs review' : ''}`);
}
