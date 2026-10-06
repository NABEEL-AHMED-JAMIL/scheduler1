import { Component, input, model } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { PairRow } from './api-collections.model';

/**
 * Key/value rows for a request's query parameters or headers (and a test's own variables): each can be switched
 * off without being deleted, as Postman and Bruno allow, so an import's disabled header survives an edit.
 */
@Component({
  selector: 'app-pairs-editor',
  imports: [Icon],
  template: `
    <div class="flex flex-col gap-1.5" role="group" [attr.aria-label]="label()">
      @for (row of rows(); track $index; let i = $index) {
        <div class="flex items-center gap-1.5">
          @if (toggles()) {
            <input type="checkbox" class="checkbox shrink-0" [checked]="row.enabled" [disabled]="readonly()"
                   [attr.aria-label]="'Send ' + (row.key || 'this row')" (change)="set(i, 'enabled', $any($event.target).checked)" />
          }
          <input class="input input-sm mono min-w-0 flex-1" [value]="row.key" [readOnly]="readonly()" [placeholder]="keyPlaceholder()"
                 [attr.aria-label]="label() + ' name ' + (i + 1)" (input)="set(i, 'key', $any($event.target).value)" />
          <input class="input input-sm mono min-w-0 flex-[2]" [value]="row.value" [readOnly]="readonly()" [placeholder]="valuePlaceholder()"
                 autocomplete="off" [attr.aria-label]="label() + ' value ' + (i + 1)" (input)="set(i, 'value', $any($event.target).value)" />
          @if (!readonly()) {
            <button type="button" class="btn btn-ghost btn-icon btn-sm shrink-0" [attr.aria-label]="'Remove ' + (row.key || 'row ' + (i + 1))" (click)="remove(i)">
              <app-icon name="close" size="0.85em" />
            </button>
          }
        </div>
      } @empty {
        <p class="text-xs text-[color:var(--text-muted)]">{{ emptyText() }}</p>
      }
      @if (!readonly()) {
        <div><button type="button" class="btn btn-ghost btn-sm" (click)="add()"><app-icon name="plus" size="0.85em" />{{ addLabel() }}</button></div>
      }
    </div>
  `,
})
export class PairsEditor {
  readonly rows = model<PairRow[]>([]);
  readonly label = input('Rows');
  readonly addLabel = input('Add');
  readonly emptyText = input('None.');
  readonly keyPlaceholder = input('name');
  readonly valuePlaceholder = input('value');
  readonly readonly = input(false);
  /** Whether each row has its own on/off box. */
  readonly toggles = input(true);

  set(i: number, key: keyof PairRow, value: string | boolean): void {
    this.rows.update(list => list.map((r, k) => k === i ? { ...r, [key]: value } : r));
  }
  add(): void { this.rows.update(list => [...list, { key: '', value: '', enabled: true }]); }
  remove(i: number): void { this.rows.update(list => list.filter((_, k) => k !== i)); }
}
