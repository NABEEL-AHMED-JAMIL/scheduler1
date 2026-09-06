import { describe, it, expect } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { FileDropzone } from './file-dropzone';

function dropzone() {
  TestBed.resetTestingModule();
  return TestBed.runInInjectionContext(() => new FileDropzone());
}

/** A drag event carrying only what onDragOver/onDragLeave/onDrop actually read. */
function dragEvent(opts: { relatedTarget?: Node | null; currentTarget?: Node } = {}): DragEvent {
  return {
    preventDefault: () => {},
    relatedTarget: opts.relatedTarget ?? null,
    currentTarget: opts.currentTarget ?? document.createElement('div'),
  } as unknown as DragEvent;
}

describe('FileDropzone drag state', () => {
  it('turns on dragging on dragover', () => {
    const zone = dropzone();
    zone.onDragOver(dragEvent());
    expect(zone.dragging()).toBe(true);
  });

  it('turns off dragging when the pointer leaves for somewhere outside the zone', () => {
    const zone = dropzone();
    const outer = document.createElement('div');
    zone.onDragOver(dragEvent());
    expect(zone.dragging()).toBe(true);

    // relatedTarget is null when the pointer leaves the window/document entirely.
    zone.onDragLeave(dragEvent({ currentTarget: outer, relatedTarget: null }));
    expect(zone.dragging()).toBe(false);
  });

  it('does not turn off dragging when the pointer moves onto a child element', () => {
    // Regression test: dragenter/dragleave bubble and fire on the outgoing/incoming element pair
    // whenever the pointer crosses from parent to child. Every child of the dropzone div (the
    // icon, the text, the "Choose a file" label) used to fire a spurious dragleave on the zone
    // itself, flickering .dropzone-active off and back on mid-drag.
    const zone = dropzone();
    const outer = document.createElement('div');
    const child = document.createElement('span');
    outer.appendChild(child);

    zone.onDragOver(dragEvent({ currentTarget: outer }));
    expect(zone.dragging()).toBe(true);

    zone.onDragLeave(dragEvent({ currentTarget: outer, relatedTarget: child }));
    expect(zone.dragging()).toBe(true);
  });

  it('drop turns off dragging and sets the file', () => {
    const zone = dropzone();
    const file = new File(['x'], 'a.csv', { type: 'text/csv' });
    zone.onDragOver(dragEvent());
    zone.onDrop({
      preventDefault: () => {},
      dataTransfer: { files: [file] },
    } as unknown as DragEvent);
    expect(zone.dragging()).toBe(false);
    expect(zone.file()).toBe(file);
  });

  it('picking a file through the native input sets it and clears the input for a repeat pick', () => {
    const zone = dropzone();
    const file = new File(['x'], 'a.csv', { type: 'text/csv' });
    const input = document.createElement('input');
    input.type = 'file';
    Object.defineProperty(input, 'files', { value: [file] });
    zone.onPick({ target: input } as unknown as Event);
    expect(zone.file()).toBe(file);
    expect(input.value).toBe('');
  });
});
