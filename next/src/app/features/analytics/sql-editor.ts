import {
  Component, DestroyRef, ElementRef, PendingTasks, afterNextRender, effect, inject, input, output, signal,
} from '@angular/core';
import type { SqlEditorHandle } from './sql-editor-codemirror';

/**
 * A SQL editor, and the only place in this feature that knows CodeMirror exists.
 *
 * The console around it deals in a string and a schema; everything else -- the view, the
 * compartments, the transactions -- stops at this file. That boundary is why the editor could be
 * replaced without the console being touched, and it is the reason this is a component rather
 * than a few lines inside analytics.ts.
 *
 * WHAT THE SCHEMA INPUT IS FOR. The console already holds the dataset's columns; handing them
 * here turns CodeMirror's completion from a keyword list into one that knows this file. The keys
 * are the table names the SQL will use -- "dataset" and "dataset2", which is what the server
 * exposes the two resolved datasets as -- so completing a column after "dataset2." asks the
 * second file, and a bare column name at the top level completes from the first.
 *
 * @author Nabeel Ahmed
 */
@Component({
  selector: 'app-sql-editor',
  template: '<div class="min-w-0" data-sql-editor></div>',
})
export class SqlEditor {

  /**
   * The SQL, in both directions.
   *
   * Written back into the document only when it actually differs from what is on screen. A person
   * typing produces valueChange -> the caller's signal -> value() -> this effect, and replacing
   * the document with the text it already holds would move their cursor to the end of it on every
   * keystroke.
   */
  readonly value = input<string>('');
  readonly valueChange = output<string>();

  /** Table name -> its column names. See the class comment: these are "dataset" and "dataset2". */
  readonly schema = input<Record<string, string[]>>({});

  /**
   * The table a bare column name completes from.
   *
   * "dataset" for a single-dataset query, which is nearly all of them: without it a reader has to
   * type the table name before the editor will offer them a column that has only one place to
   * come from.
   */
  readonly defaultTable = input<string>('');

  readonly placeholderText = input<string>('');
  readonly ariaLabel = input<string>('SQL query');

  /** Editing is off while a query is in flight -- the text that ran is what the result is of. */
  readonly disabled = input<boolean>(false);

  /** Ctrl/Cmd + Enter. Bound here because only this file has a keymap to bind it in. */
  readonly run = output<void>();

  private readonly host = inject(ElementRef<HTMLElement>);

  private readonly destroyRef = inject(DestroyRef);

  private readonly pending = inject(PendingTasks);

  /** The mounted editor; null until CodeMirror's chunk has arrived (sql-editor-codemirror.ts, imported on first draw). */
  private readonly editor = signal<SqlEditorHandle | null>(null);

  constructor() {
    afterNextRender(() => { void this.pending.run(() => this.mount()); });

    effect(() => {
      const text = this.value();
      this.editor()?.setDoc(text);
    });

    effect(() => {
      const schema = this.schema();
      const table = this.defaultTable();
      this.editor()?.setSchema(schema, table);
    });

    effect(() => {
      const off = this.disabled();
      this.editor()?.setDisabled(off);
    });
  }

  private async mount(): Promise<void> {
    let destroyed = false;
    const stop = this.destroyRef.onDestroy(() => { destroyed = true; });
    const { createSqlEditor } = await import('./sql-editor-codemirror');
    if (destroyed) return;
    stop();
    const parent = (this.host.nativeElement as HTMLElement)
      .querySelector('[data-sql-editor]') as HTMLElement | null;
    if (!parent) return;
    const editor = createSqlEditor(parent, {
      doc: this.value(),
      schema: this.schema(),
      defaultTable: this.defaultTable(),
      disabled: this.disabled(),
      placeholderText: this.placeholderText(),
      ariaLabel: this.ariaLabel(),
      onRun: () => this.run.emit(),
      onChange: text => this.valueChange.emit(text),
    });
    this.destroyRef.onDestroy(() => editor.destroy());
    this.editor.set(editor);
  }
}
