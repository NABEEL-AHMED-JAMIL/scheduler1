import { DateField } from '../../shared/ui/date-field';
import { Component, computed, input, output } from '@angular/core';
import { Field } from '../../shared/ui/field';
import { Icon } from '../../shared/ui/icon';
import { AnswerValue, Answers, FormField, TableRow, UploadRef, requiredNow, visibleFields } from './forms.model';
import { SignaturePad } from './signature-pad';

/** One answer changed: the field's key and what it holds now (text as typed, a yes/no as a boolean, rows, uploads). */
export interface AnswerChange {
  key: string;
  value: AnswerValue;
}

/** Files chosen for a file field, or a signature drawn: the page uploads them. */
export interface UploadWanted {
  key: string;
  files: File[];
}

/**
 * A form's fields as controls (Wave 5 Forms lite; MIG-277): text, long text, number, date, a choice, yes/no, e-mail, a
 * table of rows, files, a signature and a lookup -- each with its label, help text, required mark and problem, in the
 * form's order, and only those its rules show now. It holds nothing itself: the answers and the problems are the page's,
 * every change is handed back, and chosen files and drawn signatures are handed to the page to upload. The fill-in page
 * and the builder's preview both draw it.
 */
@Component({
  selector: 'app-form-renderer',
  imports: [DateField, Field, Icon, SignaturePad],
  template: `
    <div class="flex flex-col gap-4 min-w-0">
      @for (f of shown(); track f.key; let i = $index) {
        <app-field [label]="f.label" [for]="idPrefix() + '-' + f.key" [required]="isRequired(f)" [hint]="f.help || ''"
                   [error]="problems()[f.key] || ''">
          @switch (f.type) {
            @case ('table') {
              <div class="form-table" [id]="idPrefix() + '-' + f.key" [attr.data-field]="f.key" role="group" [attr.aria-label]="f.label">
                <table class="table-modern">
                  <thead><tr>
                    @for (c of f.columns ?? []; track c.key) { <th>{{ c.label }}@if (c.required) { <span class="text-crit-500"> *</span> }</th> }
                    <th class="w-10"><span class="sr-only">Remove</span></th>
                  </tr></thead>
                  <tbody>
                    @for (row of rows(f.key); track $index; let r = $index) {
                      <tr [attr.data-row]="r">
                        @for (c of f.columns ?? []; track c.key) {
                          <td>
                            @switch (c.type) {
                              @case ('choice') {
                                <select class="input input-sm" [disabled]="disabled()" [attr.aria-label]="c.label + ', row ' + (r + 1)"
                                        (change)="setCell(f.key, r, c.key, $any($event.target).value)">
                                  <option value="" [selected]="!row[c.key]">—</option>
                                  @for (o of c.options ?? []; track o) { <option [value]="o" [selected]="row[c.key] === o">{{ o }}</option> }
                                </select>
                              }
                              @case ('yesNo') {
                                <select class="input input-sm" [disabled]="disabled()" [attr.aria-label]="c.label + ', row ' + (r + 1)"
                                        (change)="setCell(f.key, r, c.key, $any($event.target).value === '' ? null : $any($event.target).value === 'true')">
                                  <option value="" [selected]="row[c.key] == null">—</option>
                                  <option value="true" [selected]="row[c.key] === true">Yes</option>
                                  <option value="false" [selected]="row[c.key] === false">No</option>
                                </select>
                              }
                              @default {
                                <input class="input input-sm" [type]="c.type === 'date' ? 'date' : c.type === 'email' ? 'email' : 'text'"
                                       [attr.inputmode]="c.type === 'number' ? 'decimal' : null" [disabled]="disabled()"
                                       [value]="cellText(row, c.key)" [attr.aria-label]="c.label + ', row ' + (r + 1)"
                                       (input)="setCell(f.key, r, c.key, $any($event.target).value)" />
                              }
                            }
                          </td>
                        }
                        <td class="text-right">
                          <button type="button" class="btn btn-ghost btn-xs" [disabled]="disabled()" (click)="removeRow(f.key, r)"
                                  [attr.aria-label]="'Remove row ' + (r + 1)"><app-icon name="trash" /></button>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
                <div class="flex items-center gap-2 mt-2">
                  <button type="button" class="btn btn-default btn-sm" [disabled]="disabled() || rows(f.key).length >= (f.maxRows ?? 20)"
                          (click)="addRow(f)" data-add-row><app-icon name="plus" />Add row</button>
                  <span class="text-xs text-[color:var(--text-muted)]">{{ rows(f.key).length }} of at most {{ f.maxRows ?? 20 }} rows</span>
                </div>
              </div>
            }
            @case ('file') {
              <div class="flex flex-col gap-2" [attr.data-field]="f.key">
                @for (u of files(f.key); track u.uploadId) {
                  <div class="flex items-center gap-2 text-sm" [attr.data-upload]="u.uploadId">
                    <app-icon name="file" class="icon-muted" /><span class="truncate">{{ u.name }}</span>
                    @if (u.size) { <span class="text-xs text-[color:var(--text-muted)]">{{ sizeText(u.size) }}</span> }
                    <button type="button" class="btn btn-ghost btn-xs" [disabled]="disabled()" (click)="removeFile(f.key, u.uploadId)"
                            [attr.aria-label]="'Remove ' + u.name"><app-icon name="close" /></button>
                  </div>
                }
                @if (files(f.key).length < (f.maxFiles ?? 1)) {
                  <input class="input" type="file" [id]="idPrefix() + '-' + f.key" [disabled]="disabled() || uploading()[f.key]"
                         [attr.accept]="acceptOf(f)" [multiple]="(f.maxFiles ?? 1) > 1"
                         (change)="choose(f.key, $any($event.target))" />
                }
                <span class="text-xs text-[color:var(--text-muted)]">
                  @if (uploading()[f.key]) { Uploading… } @else {
                    {{ (f.accept ?? []).join(', ') }} · up to {{ f.maxSizeMb ?? 10 }} MB@if ((f.maxFiles ?? 1) > 1) { · at most {{ f.maxFiles }} files }
                  }
                </span>
              </div>
            }
            @case ('signature') {
              <div [attr.data-field]="f.key" [id]="idPrefix() + '-' + f.key">
                @if (signature(f.key); as sig) {
                  <div class="flex items-center gap-2 text-sm" data-signed>
                    <app-icon name="checkCircle" class="icon-ok" />Signed
                    <button type="button" class="btn btn-ghost btn-xs" [disabled]="disabled()" (click)="set(f.key, null)">Sign again</button>
                  </div>
                } @else if (uploading()[f.key]) {
                  <p class="text-sm text-[color:var(--text-muted)]">Keeping your signature…</p>
                } @else {
                  <app-signature-pad [label]="f.label" [disabled]="disabled()" (signed)="sign(f.key, $event)" />
                }
              </div>
            }
            @case ('lookup') {
              @if (valuesOf(f.key).length > 30) {
                <input class="input" [id]="idPrefix() + '-' + f.key" [attr.list]="idPrefix() + '-' + f.key + '-values'" [value]="text(f.key)"
                       [disabled]="disabled()" [attr.data-field]="f.key" placeholder="Type to find…"
                       (input)="set(f.key, $any($event.target).value)" />
                <datalist [id]="idPrefix() + '-' + f.key + '-values'">
                  @for (v of valuesOf(f.key); track v) { <option [value]="v"></option> }
                </datalist>
              } @else {
                <select class="input" [id]="idPrefix() + '-' + f.key" [disabled]="disabled()" [attr.data-field]="f.key"
                        (change)="set(f.key, $any($event.target).value)">
                  <option value="" [selected]="!text(f.key)">{{ valuesOf(f.key).length ? 'Choose…' : 'Nothing to choose from yet' }}</option>
                  @for (v of valuesOf(f.key); track v) { <option [value]="v" [selected]="text(f.key) === v">{{ v }}</option> }
                </select>
              }
            }
            @case ('longText') {
              <textarea class="input" rows="4" [id]="idPrefix() + '-' + f.key" [value]="text(f.key)" [disabled]="disabled()"
                        [attr.data-field]="f.key" (input)="set(f.key, $any($event.target).value)"></textarea>
            }
            @case ('choice') {
              <select class="input" [id]="idPrefix() + '-' + f.key" [disabled]="disabled()" [attr.data-field]="f.key"
                      (change)="set(f.key, $any($event.target).value)">
                <option value="" [selected]="!text(f.key)">Choose…</option>
                @for (o of f.options ?? []; track o) {
                  <option [value]="o" [selected]="text(f.key) === o">{{ o }}</option>
                }
              </select>
            }
            @case ('yesNo') {
              <div class="flex items-center gap-4 text-sm" role="radiogroup" [id]="idPrefix() + '-' + f.key" [attr.aria-label]="f.label"
                   [attr.data-field]="f.key">
                <label class="flex items-center gap-1.5">
                  <input type="radio" [name]="idPrefix() + '-' + f.key" [checked]="answers()[f.key] === true" [disabled]="disabled()"
                         (change)="set(f.key, true)" />Yes
                </label>
                <label class="flex items-center gap-1.5">
                  <input type="radio" [name]="idPrefix() + '-' + f.key" [checked]="answers()[f.key] === false" [disabled]="disabled()"
                         (change)="set(f.key, false)" />No
                </label>
              </div>
            }
            @case ('date') {
              <app-date-field [inputId]="idPrefix() + '-' + f.key" [label]="f.label" [value]="text(f.key)" [inactive]="disabled()"
                              [clearable]="!f.required" [attr.data-field]="f.key" (valueChange)="set(f.key, $event)" />
            }
            @case ('number') {
              <input class="input" type="text" inputmode="decimal" [id]="idPrefix() + '-' + f.key" [value]="text(f.key)"
                     [disabled]="disabled()" [attr.data-field]="f.key" (input)="set(f.key, $any($event.target).value)" />
            }
            @case ('email') {
              <input class="input" type="email" autocomplete="off" [id]="idPrefix() + '-' + f.key" [value]="text(f.key)"
                     [disabled]="disabled()" [attr.data-field]="f.key" (input)="set(f.key, $any($event.target).value)" />
            }
            @default {
              <input class="input" type="text" [id]="idPrefix() + '-' + f.key" [value]="text(f.key)" [disabled]="disabled()"
                     [attr.data-field]="f.key" (input)="set(f.key, $any($event.target).value)" />
            }
          }
        </app-field>
      } @empty {
        <p class="text-sm text-[color:var(--text-muted)]">This form has no fields yet.</p>
      }
    </div>
  `,
})
export class FormRenderer {
  readonly fields = input.required<FormField[]>();
  readonly answers = input<Answers>({});
  readonly problems = input<Record<string, string>>({});
  readonly disabled = input(false);
  /** Keeps two renderers on one page (the builder's preview and a fill-in) from sharing control ids. */
  readonly idPrefix = input('form-field');
  /** A lookup field's values, by key. */
  readonly lookupValues = input<Record<string, string[]>>({});
  /** Fields whose upload is on its way. */
  readonly uploading = input<Record<string, boolean>>({});
  readonly answerChange = output<AnswerChange>();
  readonly uploadWanted = output<UploadWanted>();
  readonly signatureDrawn = output<{ key: string; png: Blob }>();

  /** The fields asked now: those whose rules show them. */
  readonly shown = computed(() => visibleFields(this.fields(), this.answers()));

  isRequired(f: FormField): boolean {
    return requiredNow(f, this.answers());
  }

  text(key: string): string {
    const value = this.answers()[key];
    return typeof value === 'string' ? value : '';
  }

  set(key: string, value: AnswerValue): void {
    this.answerChange.emit({ key, value });
  }

  // ---- tables ------------------------------------------------------------------------------------------------

  rows(key: string): TableRow[] {
    const value = this.answers()[key];
    return Array.isArray(value) ? value as TableRow[] : [];
  }

  cellText(row: TableRow, column: string): string {
    const value = row[column];
    return typeof value === 'string' ? value : value == null ? '' : String(value);
  }

  addRow(f: FormField): void {
    this.set(f.key, [...this.rows(f.key), {}]);
  }

  removeRow(key: string, index: number): void {
    this.set(key, this.rows(key).filter((_, i) => i !== index));
  }

  setCell(key: string, index: number, column: string, value: string | boolean | null): void {
    this.set(key, this.rows(key).map((row, i) => i === index ? { ...row, [column]: value } : row));
  }

  // ---- files and signatures ------------------------------------------------------------------------------------

  files(key: string): UploadRef[] {
    const value = this.answers()[key];
    return Array.isArray(value) ? value as UploadRef[] : [];
  }

  signature(key: string): UploadRef | null {
    const value = this.answers()[key];
    return value && typeof value === 'object' && !Array.isArray(value) ? value as UploadRef : null;
  }

  acceptOf(f: FormField): string {
    return (f.accept ?? []).map(a => '.' + a).join(',');
  }

  choose(key: string, input: HTMLInputElement): void {
    const files = Array.from(input.files ?? []);
    input.value = '';
    if (files.length) this.uploadWanted.emit({ key, files });
  }

  removeFile(key: string, uploadId: number): void {
    this.set(key, this.files(key).filter(u => u.uploadId !== uploadId));
  }

  sign(key: string, png: Blob): void {
    this.signatureDrawn.emit({ key, png });
  }

  sizeText(bytes: number): string {
    return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
  }

  valuesOf(key: string): string[] {
    return this.lookupValues()[key] ?? [];
  }
}
