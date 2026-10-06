import { Component, computed, input, output } from '@angular/core';

/**
 * A palette's colours in the order a chart's series take them, re-orderable by clicking: the
 * clicked colour moves to the front, so "make the first series teal" is one click.
 *
 * The order is indices into the theme's palette, which is what is stored (ChartSettings.colors),
 * so it survives a switch between light and dark, where the colours themselves change.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-palette-order',
  template: `
    <div class="flex flex-wrap items-center gap-2">
      <span class="flex gap-1" role="list" aria-label="Series colours, first to last">
        @for (slot of slots(); track slot.index; let at = $index) {
          <button type="button" role="listitem" class="palette-slot" [style.background]="slot.colour"
                  [title]="at === 0 ? 'Colour of the first series' : 'Make this the first series colour'"
                  [attr.aria-label]="'Colour ' + (slot.index + 1) + ', position ' + (at + 1)"
                  (click)="toFront(slot.index)"></button>
        }
      </span>
      <button type="button" class="btn btn-ghost btn-xs" (click)="reverse()">Reverse</button>
      @if (order()?.length) { <button type="button" class="btn btn-ghost btn-xs" (click)="orderChange.emit(undefined)">Theme order</button> }
    </div>
  `,
  styles: [`
    .palette-slot { width: 1.5rem; height: 1.5rem; border-radius: var(--radius-sm); border: 1px solid var(--border-subtle); }
    .palette-slot:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 1px; }
  `],
})
export class PaletteOrder {
  /** The theme's colours in the theme's own order. */
  readonly colors = input.required<string[]>();
  readonly order = input<number[] | undefined>(undefined);
  readonly orderChange = output<number[] | undefined>();

  private readonly current = computed(() => {
    const all = this.colors().map((_, i) => i);
    const picked = (this.order() ?? []).filter(i => i < all.length);
    return [...picked, ...all.filter(i => !picked.includes(i))];
  });

  readonly slots = computed(() => this.current().map(index => ({ index, colour: this.colors()[index] })));

  toFront(index: number): void {
    this.orderChange.emit([index, ...this.current().filter(i => i !== index)]);
  }

  reverse(): void {
    this.orderChange.emit([...this.current()].reverse());
  }
}
