import {
  Component, DestroyRef, ElementRef, afterNextRender, effect, inject, input, output, signal,
} from '@angular/core';
import { Compartment, Prec } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { PostgreSQL, SQLNamespace, sql } from '@codemirror/lang-sql';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';

/**
 * The editor's colours, taken from the app's tokens rather than from a CodeMirror theme.
 *
 * Every CodeMirror theme that ships with the library commits to being light or dark, and this app
 * does not: it swaps token values under `html.dark` and lets every screen follow. A `var(--...)`
 * inside a generated theme rule resolves in the browser at paint time, so the editor changes with
 * the rest of the page and there is no second theme to keep in step with the first -- and no
 * `dark: true` flag to get wrong, because nothing here hard-codes a colour to be wrong about.
 *
 * Defined once at module scope. EditorView.theme() generates class names and injects a stylesheet
 * per call, so building this per instance would put one copy in the document per editor mounted.
 */
const TOKEN_THEME = EditorView.theme({
  '&': {
    color: 'var(--text-primary)',
    backgroundColor: 'var(--surface-raised)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '0.375rem',
    fontSize: '12px',
    // Tall enough for a real query, short enough that the Run button never leaves the screen.
    maxHeight: '22rem',
  },
  // The app draws focus as a ring on every other control; inset so the border does not double it.
  '&.cm-focused': { outline: '2px solid var(--focus-ring)', outlineOffset: '-1px' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.6', overflow: 'auto' },
  '.cm-content': { caretColor: 'var(--text-primary)', minHeight: '7rem', padding: '0.5rem 0' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--text-primary)' },
  // Both selectors are needed: CodeMirror draws its own selection layer when the editor has
  // focus and falls back to the native one when it does not.
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'color-mix(in oklab, var(--accent-text) 28%, transparent)',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--surface-sunken)',
    color: 'var(--text-muted)',
    borderRight: '1px solid var(--border-subtle)',
  },
  '.cm-activeLine': { backgroundColor: 'color-mix(in oklab, var(--text-primary) 4%, transparent)' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--text-secondary)' },
  '.cm-placeholder': { color: 'var(--text-muted)' },
  '.cm-matchingBracket, &.cm-focused .cm-matchingBracket': {
    backgroundColor: 'color-mix(in oklab, var(--accent-text) 22%, transparent)',
    outline: 'none',
  },
  // The completion popup is the payoff for using a real editor, so it gets the same treatment as
  // the app's own menus rather than CodeMirror's white-on-white default.
  '.cm-tooltip': {
    backgroundColor: 'var(--surface-raised)',
    border: '1px solid var(--border-subtle)',
    borderRadius: '0.375rem',
    color: 'var(--text-primary)',
  },
  '.cm-tooltip.cm-tooltip-autocomplete > ul': { fontFamily: 'var(--font-mono)', maxHeight: '14rem' },
  '.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
    backgroundColor: 'var(--surface-sunken)',
    color: 'var(--text-primary)',
  },
  '.cm-completionDetail': { color: 'var(--text-muted)', fontStyle: 'normal' },
});

/**
 * Syntax colours, from the chart tokens.
 *
 * The chart palette is the only set of colours in this app that is contrast-checked against BOTH
 * surfaces -- styles.css records the ratio beside each one -- which is exactly the property syntax
 * highlighting needs and the property CodeMirror's `defaultHighlightStyle` does not have: its
 * keyword purple is #708, which is unreadable on the dark theme's near-black editor.
 *
 * basicSetup registers that default as a FALLBACK, so this one replaces it simply by existing.
 */
const TOKEN_HIGHLIGHT = HighlightStyle.define([
  { tag: tags.keyword, color: 'var(--chart-5)' },
  { tag: [tags.string, tags.special(tags.string)], color: 'var(--chart-2)' },
  { tag: [tags.number, tags.bool, tags.null], color: 'var(--chart-1)' },
  { tag: [tags.function(tags.variableName), tags.standard(tags.name)], color: 'var(--chart-1)' },
  { tag: [tags.typeName, tags.className], color: 'var(--chart-3)' },
  { tag: tags.operator, color: 'var(--text-secondary)' },
  { tag: tags.comment, color: 'var(--text-muted)', fontStyle: 'italic' },
  { tag: tags.invalid, color: 'var(--chart-4)' },
]);

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

  /**
   * DestroyRef is captured as a FIELD, not injected where it is used.
   *
   * The view is created inside an afterNextRender callback, which runs OUTSIDE Angular's
   * injection context: calling inject() there throws NG0203. The same shape has already cost this
   * codebase a silently dead ResizeObserver in report-chart.ts, where the failure was invisible
   * because the thing that did not get set up was a listener. Here it would be an editor that is
   * never destroyed. Field initialisers run during construction, where injection is legal.
   */
  private readonly destroyRef = inject(DestroyRef);

  /**
   * The live view, as a signal so the effects below re-run the moment it exists.
   *
   * afterNextRender lands after the first change detection, so every effect has already run once
   * against nothing by then. A plain field would leave those effects holding a null they are not
   * watching, and the editor would ignore its inputs until the next unrelated change.
   */
  private readonly view = signal<EditorView | null>(null);

  private readonly language = new Compartment();
  private readonly editable = new Compartment();

  constructor() {
    afterNextRender(() => this.mount());

    effect(() => {
      const text = this.value();
      const view = this.view();
      if (!view || view.state.doc.toString() === text) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    });

    effect(() => {
      const config = this.sqlSupport();
      const view = this.view();
      if (!view) return;
      view.dispatch({ effects: this.language.reconfigure(config) });
    });

    effect(() => {
      const off = this.disabled();
      const view = this.view();
      if (!view) return;
      view.dispatch({ effects: this.editable.reconfigure(EditorView.editable.of(!off)) });
    });
  }

  private mount(): void {
    const parent = (this.host.nativeElement as HTMLElement)
      .querySelector('[data-sql-editor]') as HTMLElement;
    const view = new EditorView({
      doc: this.value(),
      parent,
      extensions: [
        // Highest, not merely first: defaultKeymap binds Mod-Enter to "insert a blank line", and
        // an editor whose run shortcut silently inserts a newline is worse than one with none.
        Prec.highest(keymap.of([{
          key: 'Mod-Enter',
          preventDefault: true,
          run: () => { this.run.emit(); return true; },
        }])),
        basicSetup,
        this.language.of(this.sqlSupport()),
        this.editable.of(EditorView.editable.of(!this.disabled())),
        TOKEN_THEME,
        syntaxHighlighting(TOKEN_HIGHLIGHT),
        EditorView.lineWrapping,
        EditorView.contentAttributes.of({ 'aria-label': this.ariaLabel() }),
        placeholder(this.placeholderText()),
        EditorView.updateListener.of(update => {
          if (update.docChanged) this.valueChange.emit(update.state.doc.toString());
        }),
      ],
    });
    this.destroyRef.onDestroy(() => view.destroy());
    this.view.set(view);
  }

  /** The language support, rebuilt whenever the columns it completes from change. */
  private sqlSupport() {
    const schema = this.schema();
    const namespace: SQLNamespace = {};
    for (const table of Object.keys(schema)) namespace[table] = schema[table] ?? [];
    const defaultTable = this.defaultTable();
    return sql({
      // DuckDB's grammar is PostgreSQL's for everything a person writes in this box, and the
      // Postgres dialect is the closest one shipped. It decides which words are keywords, not
      // what the engine will accept -- that is StatementGate's answer, on the server.
      dialect: PostgreSQL,
      schema: namespace,
      defaultTable: defaultTable && namespace[defaultTable] ? defaultTable : undefined,
      upperCaseKeywords: true,
    });
  }
}
