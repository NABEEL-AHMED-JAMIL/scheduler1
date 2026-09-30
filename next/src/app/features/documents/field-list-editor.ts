import { Component, input, output } from '@angular/core';
import { Icon } from '../../shared/ui/icon';
import { FIELD_TYPES, TypeField, blankField, listText, textList } from './documents.model';

/**
 * A document type's fields -- or one table's columns -- in the type editor (MIG-272): a key, a label, a type, whether
 * it is required, the other words it goes by on a page, and a choice's options. Every edit emits a new list; the
 * editor never writes into the one it was given. Read-only, it is the same rows without the controls.
 */
@Component({
  selector: 'app-field-list-editor',
  imports: [Icon],
  template: `
    <div class="flex flex-col gap-2">
      @for (f of fields(); track $index; let i = $index) {
        <div class="field-row" [attr.aria-label]="noun() + ' ' + (i + 1)" role="group">
          <input class="input mono text-xs" [value]="f.key" placeholder="key_in_snake_case" [readOnly]="readonly()"
                 [attr.aria-label]="noun() + ' ' + (i + 1) + ' key'" (input)="patch(i, { key: $any($event.target).value })" />
          <input class="input text-xs" [value]="f.label" placeholder="Label" [readOnly]="readonly()"
                 [attr.aria-label]="noun() + ' ' + (i + 1) + ' label'" (input)="patch(i, { label: $any($event.target).value })" />
          <select class="input text-xs" [disabled]="readonly()" [attr.aria-label]="noun() + ' ' + (i + 1) + ' type'" (change)="patch(i, { type: $any($event.target).value })">
            @for (t of types; track t) { <option [value]="t" [selected]="t === f.type">{{ t }}</option> }
          </select>
          <label class="flex items-center gap-1 text-xs whitespace-nowrap">
            <input type="checkbox" class="checkbox" [disabled]="readonly()" [checked]="!!f.required" (change)="patch(i, { required: $any($event.target).checked })" />Required
          </label>
          @if (!readonly()) {
            <div class="flex items-center gap-0.5 justify-end">
              <button type="button" class="btn btn-ghost btn-icon btn-xs" [attr.aria-label]="'Move ' + noun().toLowerCase() + ' ' + (i + 1) + ' up'" [disabled]="i === 0" (click)="move(i, -1)"><app-icon name="arrowUp" /></button>
              <button type="button" class="btn btn-ghost btn-icon btn-xs" [attr.aria-label]="'Move ' + noun().toLowerCase() + ' ' + (i + 1) + ' down'" [disabled]="i === fields().length - 1" (click)="move(i, 1)"><app-icon name="arrowDown" /></button>
              <button type="button" class="btn btn-ghost btn-icon btn-xs" [attr.aria-label]="'Remove ' + noun().toLowerCase() + ' ' + (i + 1)" (click)="remove(i)"><app-icon name="trash" class="icon-crit" /></button>
            </div>
          }
          <input class="input text-xs field-row-wide" [value]="aliases(f)" placeholder="Also written as (comma-separated): Invoice No., Invoice #" [readOnly]="readonly()"
                 [attr.aria-label]="noun() + ' ' + (i + 1) + ' also written as'" (change)="patch(i, { aliases: split($any($event.target).value) })" />
          @if (f.type === 'choice') {
            <input class="input text-xs field-row-wide" [value]="options(f)" placeholder="Options (comma-separated)" [readOnly]="readonly()"
                   [attr.aria-label]="noun() + ' ' + (i + 1) + ' options'" (change)="patch(i, { options: split($any($event.target).value) })" />
          }
        </div>
      } @empty {
        <p class="text-xs text-[color:var(--text-muted)]">None.</p>
      }
      @if (!readonly()) {
        <button type="button" class="btn btn-ghost btn-sm self-start" (click)="add()"><app-icon name="plus" />Add {{ noun().toLowerCase() }}</button>
      }
    </div>
  `,
  styles: [`
    .field-row { display: grid; gap: 0.375rem; align-items: center; padding: 0.5rem; border: 1px solid var(--border-subtle); border-radius: var(--radius-lg);
      grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr) 6.5rem auto auto; }
    .field-row-wide { grid-column: 1 / -1; }
    @media (max-width: 640px) { .field-row { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); } }
  `],
})
export class FieldListEditor {
  readonly fields = input.required<TypeField[]>();
  readonly readonly = input(false);
  /** "Field" or "Column": how a row is named to a screen reader and on Add. */
  readonly noun = input('Field');
  readonly changed = output<TypeField[]>();
  readonly types = FIELD_TYPES;

  aliases(f: TypeField): string { return listText(f.aliases); }
  options(f: TypeField): string { return listText(f.options); }
  split(text: string): string[] { return textList(text); }

  patch(index: number, patch: Partial<TypeField>): void {
    this.changed.emit(this.fields().map((f, i) => i === index ? { ...f, ...patch } : f));
  }

  add(): void { this.changed.emit([...this.fields(), blankField()]); }
  remove(index: number): void { this.changed.emit(this.fields().filter((_, i) => i !== index)); }

  move(index: number, by: 1 | -1): void {
    const list = [...this.fields()];
    const to = index + by;
    if (to < 0 || to >= list.length) return;
    [list[index], list[to]] = [list[to], list[index]];
    this.changed.emit(list);
  }
}
