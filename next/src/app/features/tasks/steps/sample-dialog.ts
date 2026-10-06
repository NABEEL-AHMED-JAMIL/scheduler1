import { Component, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { Field } from '../../../shared/ui/field';
import { parseSampleRows } from './steps.model';

export interface SampleDialogData {
  /** The rows the first sample step already holds, to start from. */
  rows: Record<string, unknown>[];
}

const STARTER = [{ id: 1, name: 'Ada' }, { id: 2, name: 'Bo' }];

/**
 * Test with sample (MIG-249): rows to run the steps on, as a JSON list of objects. They go into the first step when
 * it is a sample, or a sample step goes in front (MIG-230's `sample` task); Run now then runs the steps on them.
 */
@Component({
  selector: 'app-sample-dialog',
  imports: [FormDialog, Field],
  template: `
    <app-form-dialog heading="Test with sample" subtitle="Rows the steps run on, in place of the pipeline's source."
                     confirmLabel="Use these rows" [confirmDisabled]="!!error()" (confirmed)="use()" (cancelled)="ref.close()">
      <app-field label="Sample rows" for="sampleRows" [required]="true" [error]="error()"
                 hint="A JSON list of rows, each an object of column: value (text, a number, true/false or null). At most 1000.">
        <textarea id="sampleRows" class="input mono text-xs resize-y min-h-48" spellcheck="false" [value]="text()"
                  (input)="type($any($event.target).value)"></textarea>
      </app-field>
      <p class="text-xs text-[color:var(--text-muted)] mt-3">
        The rows become the first step of the draft. Save &amp; run now then runs every step on them and shows each step's result.
      </p>
    </app-form-dialog>
  `,
})
export class SampleDialog {
  readonly ref = inject<DialogRef<Record<string, unknown>[]>>(DialogRef);
  private readonly data = inject<SampleDialogData>(DIALOG_DATA);

  readonly text = signal(JSON.stringify(this.data.rows?.length ? this.data.rows : STARTER, null, 2));
  readonly error = signal('');

  type(text: string): void {
    this.text.set(text);
    this.error.set(parseSampleRows(text).error ?? '');
  }

  use(): void {
    const parsed = parseSampleRows(this.text());
    if (parsed.error) { this.error.set(parsed.error); return; }
    this.ref.close(parsed.rows);
  }
}
