import { Component, input, model, signal } from '@angular/core';
import { Icon } from './icon';
import { formatSize } from './format-size';

/**
 * Drag-and-drop-or-click single-file picker, using the same `.dropzone` styling
 * `bulk-transfer.html` already established -- extracted so every "pick one file" screen looks
 * like the same control instead of some using this polished dropzone and others falling back to
 * the browser's own bare `<input type="file">` ("Choose File" / "No file chosen"), which reads
 * as unfinished next to the rest of the app's styled controls.
 *
 * Owns only the picking -- drag/drop, the hidden native input, the chosen-file preview, and
 * removing it. What happens once a file is picked (a convert button, a checkbox, a format
 * select) stays entirely the caller's, the same way bulk-transfer's own Upload button sits
 * outside its dropzone today.
 */
@Component({
  selector: 'app-file-dropzone',
  imports: [Icon],
  template: `
    <div class="dropzone" [class.dropzone-active]="dragging()"
         (dragover)="onDragOver($event)" (dragleave)="onDragLeave()" (drop)="onDrop($event)">
      @if (file(); as picked) {
        <app-icon name="file" size="1.75rem" class="icon-info" />
        <p class="mt-2 text-sm font-medium break-all">{{ picked.name }}</p>
        <p class="text-xs text-[color:var(--text-muted)] mt-0.5">{{ formatSize(picked.size) }}</p>
        <button type="button" class="btn btn-ghost btn-sm mt-3" (click)="file.set(null)">
          <app-icon name="close" />Remove
        </button>
      } @else {
        <app-icon name="upload" size="1.75rem" class="icon-muted" />
        <p class="mt-2 text-sm">{{ prompt() }}</p>
        @if (hint()) {
          <p class="text-xs text-[color:var(--text-muted)] mt-0.5">{{ hint() }}</p>
        }
        <label class="btn btn-default btn-sm mt-3 cursor-pointer">
          <app-icon name="folder" />Choose a file
          <input type="file" class="sr-only" [attr.accept]="accept() || null" (change)="onPick($event)" />
        </label>
      }
    </div>
  `,
})
export class FileDropzone {
  readonly file = model<File | null>(null);
  /** Native `accept` filter, e.g. ".mp3,.m4a" -- empty means any file. */
  readonly accept = input('');
  readonly prompt = input('Drop a file here');
  readonly hint = input('');

  readonly dragging = signal(false);
  readonly formatSize = formatSize;

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  onDragLeave(): void {
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) this.file.set(dropped);
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    if (picked) this.file.set(picked);
    // Cleared so picking the same file twice in a row (after Remove) still fires (change).
    input.value = '';
  }
}
