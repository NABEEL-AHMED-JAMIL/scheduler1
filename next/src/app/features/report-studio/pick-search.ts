import { Component, DestroyRef, inject, input, output, signal } from '@angular/core';
import { Icon } from '../../shared/ui/icon';

/**
 * A picker's search on the server (owner 2026-10-20: "a picker should search on the server"): a select offers the first
 * page of what may be picked; when there are more than it holds (or a search is typed), this box asks the service for
 * the words and the page's owner replaces the select's options. Debounced, as the lists' searches are.
 */
@Component({
  selector: 'app-rs-pick-search',
  imports: [Icon],
  host: { class: 'contents' },
  template: `
    @if (total() > shown() || query()) {
      <div class="search-field">
        <app-icon name="search" size="0.9em" />
        <input class="input text-xs" [placeholder]="placeholder()" [attr.aria-label]="label()" [value]="query()"
               [disabled]="disabled()" (input)="type($any($event.target).value)" />
      </div>
      <span class="text-xs text-[color:var(--text-muted)]">
        {{ shown() }} of {{ total() }} shown@if (total() > shown()) {: type to find the others}
      </span>
    }
  `,
})
export class RsPickSearch {
  /** How many choices the select holds, and how many match in all. */
  readonly shown = input(0);
  readonly total = input(0);
  readonly label = input('Find');
  readonly placeholder = input('Type to search');
  readonly disabled = input(false);
  readonly search = output<string>();

  readonly query = signal('');
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => { if (this.timer) clearTimeout(this.timer); });
  }

  type(value: string): void {
    this.query.set(value);
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; this.search.emit(value.trim()); }, 300);
  }
}
