import { Component, inject } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { RouterLink } from '@angular/router';
import { Icon } from '../../../shared/ui/icon';
import { SidePanel } from '../../../shared/ui/side-panel';
import { ServerTimePipe } from '../../../shared/ui/server-time.pipe';
import { StatusPill } from '../../../shared/ui/status-pill';
import { formatSize } from '../../../shared/ui/format-size';
import type { ConverterTask } from './converter';

/** What the reader chose in a conversion's panel; the page does it (it owns the viewer and the delete). */
export type ConversionAction = 'input' | 'output' | 'delete';

export interface ConversionPanelData {
  task: ConverterTask;
  /** The folder holding the output, for the "Open the folder" link. */
  folder: string;
}

/**
 * One past conversion, sliding over the right (owner #26, UX review A9): what went in and what came out, their sizes,
 * where both were kept, when, and the actions -- view either side, open the folder, delete the entry.
 */
@Component({
  selector: 'app-conversion-panel',
  imports: [SidePanel, Icon, RouterLink, ServerTimePipe, StatusPill],
  styles: `
    .facts { display: grid; grid-template-columns: 8rem minmax(0, 1fr); gap: 0.625rem 1rem; font-size: 0.875rem; margin: 0; }
    .facts dt { color: var(--text-muted); }
    .facts dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
  `,
  template: `
    <app-side-panel [heading]="task.taskName" [subtitle]="task.inputFormat.toUpperCase() + ' to ' + task.outputFormat.toUpperCase()">
      <dl class="facts" data-test="conversion-facts">
        <dt>Status</dt><dd><app-status [label]="task.status || 'Completed'" /></dd>
        <dt>Original</dt>
        <dd><span class="font-medium">{{ task.inputFileName }}</span>
          @if (task.inputFileSize != null) { <span class="text-[color:var(--text-muted)]"> · {{ size(task.inputFileSize) }}</span> }</dd>
        <dt>Converted</dt>
        <dd><span class="font-medium">{{ task.outputFileName }}</span>
          @if (task.outputFileSize != null) { <span class="text-[color:var(--text-muted)]"> · {{ size(task.outputFileSize) }}</span> }</dd>
        <dt>Bucket</dt><dd class="mono text-xs">{{ task.bucketName || '—' }}</dd>
        <dt>Folder</dt><dd class="mono text-xs">{{ data.folder || '/' }}</dd>
        <dt>Created</dt><dd>{{ task.dateCreated ? (task.dateCreated | serverTime: 'dateTime') : '—' }}</dd>
      </dl>
      <div class="flex flex-wrap gap-2 mt-5">
        <button type="button" class="btn btn-default btn-sm" [disabled]="!task.inputStorageKey" (click)="ref.close('input')">
          <app-icon name="file" />View the original
        </button>
        <button type="button" class="btn btn-default btn-sm" [disabled]="!task.outputStorageKey" (click)="ref.close('output')">
          <app-icon name="eye" />View the converted file
        </button>
        @if (task.bucketName) {
          <a class="btn btn-default btn-sm" routerLink="/data/files" [queryParams]="{ bucket: task.bucketName, prefix: data.folder }"
             (click)="ref.close()"><app-icon name="folder" />Open the folder</a>
        }
      </div>
      <p class="text-xs text-[color:var(--text-muted)] mt-4">Deleting takes the entry off the list; both files stay in the bucket.</p>
      <ng-container foot>
        <button type="button" class="btn btn-danger btn-sm mr-auto" (click)="ref.close('delete')"><app-icon name="trash" />Delete</button>
        <button type="button" class="btn btn-default btn-sm" (click)="ref.close()">Close</button>
      </ng-container>
    </app-side-panel>
  `,
})
export class ConversionPanel {
  readonly ref = inject<DialogRef<ConversionAction | undefined>>(DialogRef);
  readonly data = inject<ConversionPanelData>(DIALOG_DATA);
  readonly task = this.data.task;
  readonly size = formatSize;
}
