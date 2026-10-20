import { Component, computed, input } from '@angular/core';
import { Icon } from '../../shared/ui/icon';
import { Problem } from './report-studio.model';

/**
 * What validation found (spec section 22), blocking errors first: each with its code, the component or path it is about,
 * and the sentence -- never a value from the data. Errors stop a report from being made; warnings do not.
 */
@Component({
  selector: 'app-report-problems',
  imports: [Icon],
  template: `
    @if (summary()) {
    <div class="flex flex-wrap items-center gap-1.5 text-xs">
      <span class="pill" [class.pill-crit]="errors().length" [class.pill-neutral]="!errors().length">
        {{ errors().length }} blocking
      </span>
      <span class="pill" [class.pill-warn]="warnings().length" [class.pill-neutral]="!warnings().length">
        {{ warnings().length }} warning{{ warnings().length === 1 ? '' : 's' }}
      </span>
      @if (!problems().length) { <span class="text-[color:var(--ok-text)] inline-flex items-center gap-1"><app-icon name="checkCircle" />Every check passed</span> }
    </div>
    }
    @if (problems().length) {
      <ul class="rs-problems">
        @for (p of ordered(); track $index) {
          <li [class.rs-problem-error]="p.severity === 'ERROR'">
            <app-icon [name]="p.severity === 'ERROR' ? 'alert' : 'info'" [class]="p.severity === 'ERROR' ? 'icon-crit' : 'icon-warn'" />
            <div class="min-w-0">
              <div class="text-sm">{{ p.message }}</div>
              <div class="text-xs text-[color:var(--text-muted)] mono">
                {{ p.code }}@if (p.componentId) { · {{ p.componentId }} }@if (p.path) { · {{ p.path }} }
              </div>
            </div>
          </li>
        }
      </ul>
    }
  `,
  styles: `
    .rs-problems { list-style: none; margin: 0.5rem 0 0; padding: 0; display: flex; flex-direction: column; gap: 0.375rem; }
    .rs-problems li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 0.5rem; padding: 0.5rem 0.625rem;
                      border: 1px solid var(--border-subtle); border-radius: var(--radius-md); }
    .rs-problems li.rs-problem-error { border-color: var(--crit-text); }
  `,
})
export class ProblemList {
  readonly problems = input<Problem[]>([]);
  /** The counts above the list; off where the page shows its own (Create report's checks). */
  readonly summary = input(true);
  readonly errors = computed(() => this.problems().filter(p => p.severity === 'ERROR'));
  readonly warnings = computed(() => this.problems().filter(p => p.severity !== 'ERROR'));
  readonly ordered = computed(() => [...this.errors(), ...this.warnings()]);
}
