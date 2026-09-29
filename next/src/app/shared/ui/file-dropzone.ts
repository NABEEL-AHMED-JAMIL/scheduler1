import { Component, input, model, output, signal } from '@angular/core';
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
 * select) stays entirely the caller's.
 */
@Component({
  selector: 'app-file-dropzone',
  imports: [Icon],
  template: `
    <div class="dropzone" [class.dropzone-active]="dragging()" [class.opacity-60]="disabled()" [attr.aria-disabled]="disabled() || null"
         (dragover)="onDragOver($event)" (dragleave)="onDragLeave($event)" (drop)="onDrop($event)">
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
          <app-icon name="folder" />{{ multiple() ? 'Choose files' : 'Choose a file' }}
          <input type="file" class="sr-only" [attr.accept]="accept() || null" [multiple]="multiple()" [disabled]="disabled()"
                 (change)="onPick($event)" />
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
  /**
   * Several files at once (the inbox): each drop or pick is handed over through `picked` and the zone stays ready
   * for more, so `file` is never set and the chosen-file preview never shows -- the caller lists what it took.
   */
  readonly multiple = input(false);
  readonly disabled = input(false);
  readonly picked = output<File[]>();

  readonly dragging = signal(false);
  readonly formatSize = formatSize;

  onDragOver(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(true);
  }

  /**
   * dragenter/dragleave bubble and fire on the outgoing/incoming element pair whenever the
   * pointer crosses from parent to child, and every child of this div (the icon, the text, the
   * "Choose a file" label) sits inside it. Without this check, dragging across any of them fired
   * a dragleave on the dropzone itself, flickering `.dropzone-active` off and back on mid-drag.
   * `relatedTarget` is where the pointer is headed; if that's still inside the zone, it moved to
   * a child, not out of it.
   */
  onDragLeave(event: DragEvent): void {
    const related = event.relatedTarget as Node | null;
    const zone = event.currentTarget as Node;
    if (related && zone.contains(related)) return;
    this.dragging.set(false);
  }

  onDrop(event: DragEvent): void {
    event.preventDefault();
    this.dragging.set(false);
    if (this.disabled()) return;
    if (this.multiple()) { this.hand(event.dataTransfer?.files); return; }
    const dropped = event.dataTransfer?.files?.[0];
    if (dropped) this.file.set(dropped);
  }

  onPick(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (this.multiple()) this.hand(input.files);
    else {
      const picked = input.files?.[0];
      if (picked) this.file.set(picked);
    }
    // Cleared so picking the same file twice in a row (after Remove) still fires (change).
    input.value = '';
  }

  private hand(files: FileList | File[] | null | undefined): void {
    const all = Array.from(files ?? []);
    if (all.length) this.picked.emit(all);
  }
}
