import { Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormDialog } from '../../../shared/ui/form-dialog';
import { DataText } from '../../../shared/ui/data-text';
import { UsageRow } from './api-collections.model';

export interface InUseData { heading: string; message: string; users: UsageRow[]; }

const KINDS: Record<string, string> = { PIPELINE: 'Pipeline', SOURCE: 'Source', AI_TOOL: 'AI tool' };

/**
 * A delete the service refused because something still uses what was deleted (MIG-227: the refusal names every
 * pipeline, source and AI tool in its data). Read-only: the list is what to go and change first.
 */
@Component({
  selector: 'app-in-use-dialog',
  imports: [FormDialog, DataText],
  template: `
    <app-form-dialog [heading]="data.heading" [subtitle]="data.message" [showConfirm]="false" cancelLabel="Close" size="wide"
                     (cancelled)="ref.close()">
      <div class="overflow-x-auto">
      <table class="table-modern min-w-[32rem]">
        <thead><tr><th>Used by</th><th>Name</th><th>API</th><th class="text-right">Pinned version</th></tr></thead>
        <tbody>
          @for (u of data.users; track $index) {
            <tr>
              <td class="whitespace-nowrap">{{ kind(u.userType) }}</td>
              <td class="max-w-64"><app-data-text [value]="u.userName || u.userRef" label="Used by" /></td>
              <td class="max-w-56"><app-data-text [value]="u.requestName || '—'" label="API" /></td>
              <td class="text-right tabular whitespace-nowrap">
                v{{ u.pinnedVersion ?? '—' }}@if (u.behind) {<span class="text-xs text-[color:var(--text-muted)]"> · now v{{ u.currentVersion }}</span>}
              </td>
            </tr>
          }
        </tbody>
      </table></div>
    </app-form-dialog>
  `,
})
export class InUseDialog {
  readonly ref = inject<DialogRef<void>>(DialogRef);
  readonly data = inject<InUseData>(DIALOG_DATA);

  kind(type: string): string { return KINDS[type] ?? type; }
}
