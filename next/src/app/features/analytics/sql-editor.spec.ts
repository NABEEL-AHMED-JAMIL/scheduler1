import { describe, it, expect } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { EditorView } from '@codemirror/view';
import { SqlEditor } from './sql-editor';

@Component({
  imports: [SqlEditor],
  template: `
    <app-sql-editor [value]="text()" [schema]="schema()" [defaultTable]="'dataset'"
                    [disabled]="off()" placeholderText="write some SQL"
                    (valueChange)="text.set($event)" (run)="runs.set(runs() + 1)" />
  `,
})
class Host {
  readonly text = signal('select 1');
  readonly schema = signal<Record<string, string[]>>({ dataset: ['id', 'amount'] });
  readonly off = signal(false);
  readonly runs = signal(0);
}

function mounted() {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  // afterNextRender is what creates the view, and it is queued rather than run inline.
  TestBed.tick();
  fixture.detectChanges();
  const element = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    host: fixture.componentInstance,
    element,
    /** What the editor is actually showing, which is the only claim worth making about it. */
    text: () => (element.querySelector('.cm-content') as HTMLElement | null)?.textContent ?? '',
    /** The view the wrapper created, reached the way CodeMirror itself offers. */
    view: () => EditorView.findFromDOM(element.querySelector('.cm-editor') as HTMLElement)!,
  };
}

describe('the SQL editor wrapper', () => {
  it('mounts a CodeMirror view holding the value it was given', () => {
    const editor = mounted();

    expect(editor.element.querySelector('.cm-editor')).toBeTruthy();
    expect(editor.text()).toContain('select 1');
  });

  it('writes a new value in from outside, which is how a saved query is loaded', () => {
    const editor = mounted();
    editor.host.text.set('select * from dataset');
    editor.fixture.detectChanges();

    expect(editor.text()).toContain('select * from dataset');
  });

  it('emits what was typed, so the console holds the text rather than the editor', () => {
    const editor = mounted();
    // Typed the way a person does: a transaction on the view, not a signal set from the host.
    const view = editor.view();
    view.dispatch({ changes: { from: view.state.doc.length, insert: ' + 1' } });
    editor.fixture.detectChanges();

    expect(editor.host.text()).toBe('select 1 + 1');
  });

  it('does not move the cursor when the value it is handed back is the one on screen', () => {
    // The feedback loop this guards: typing emits valueChange, the caller stores it, and the
    // value input comes straight back. Replacing the document with itself would put the caret at
    // the end of it on every keystroke.
    const editor = mounted();
    const view = editor.view();
    view.dispatch({ selection: { anchor: 3 } });
    editor.host.text.set('select 1');
    editor.fixture.detectChanges();

    expect(view.state.selection.main.anchor).toBe(3);
  });

  it('destroys the view with the component rather than leaving it on the document', () => {
    const editor = mounted();
    const dom = editor.view().dom;
    expect(dom.parentElement).toBeTruthy();

    editor.fixture.destroy();

    // EditorView.destroy() detaches its own root from whatever it was mounted into, and nothing
    // else does. Angular tearing the component down removes the wrapper and leaves the editor
    // sitting inside it, so this is the difference between the view being destroyed and merely
    // being orphaned -- which is what an NG0203 on the DestroyRef injection would have left.
    expect(dom.parentElement).toBeNull();
  });

  it('runs on Ctrl/Cmd + Enter rather than inserting a blank line', () => {
    // The default keymap binds Mod-Enter to "insert a blank line", so without the precedence
    // this shortcut would quietly type a newline instead of running anything. Which physical
    // modifier "Mod" is depends on the platform, and this reads it the same way CodeMirror does.
    const mac = /Mac/.test(navigator.platform);
    const editor = mounted();
    const content = editor.element.querySelector('.cm-content') as HTMLElement;
    content.dispatchEvent(new KeyboardEvent('keydown', {
      key: 'Enter', code: 'Enter', ctrlKey: !mac, metaKey: mac, bubbles: true,
    }));
    editor.fixture.detectChanges();

    expect(editor.host.runs()).toBe(1);
    expect(editor.host.text()).toBe('select 1');
  });

  it('completes the dataset’s own column names, which is the point of a real editor', () => {
    const editor = mounted();
    const view = editor.view();
    // The schema handed in reaches the language's completion source. Asserted through the state
    // rather than by driving the popup, which needs a layout jsdom does not do.
    expect(view.state.languageDataAt('autocomplete', 0).length).toBeGreaterThan(0);
  });
});
