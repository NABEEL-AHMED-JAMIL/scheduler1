import { Compartment, Prec } from '@codemirror/state';
import { EditorView, keymap, placeholder } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { PostgreSQL, SQLNamespace, sql } from '@codemirror/lang-sql';
import { tags } from '@lezer/highlight';
import { basicSetup } from 'codemirror';

// CodeMirror (~450 kB) and everything SqlEditor builds with it. SqlEditor imports this file dynamically, so the
// editor's code is fetched when a SQL box first draws, not with the Analytics route (code review 2026-10-07).

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

/** What the editor is made with; the callbacks are SqlEditor's outputs. */
export interface SqlEditorOptions {
  doc: string;
  schema: Record<string, string[]>;
  defaultTable: string;
  disabled: boolean;
  placeholderText: string;
  ariaLabel: string;
  onRun: () => void;
  onChange: (text: string) => void;
}

/** A mounted editor, changed from outside through these and nothing else. */
export interface SqlEditorHandle {
  readonly view: EditorView;
  setDoc(text: string): void;
  setSchema(schema: Record<string, string[]>, defaultTable: string): void;
  setDisabled(off: boolean): void;
  destroy(): void;
}

export function createSqlEditor(parent: HTMLElement, options: SqlEditorOptions): SqlEditorHandle {
  const language = new Compartment();
  const editable = new Compartment();
  const view = new EditorView({
    doc: options.doc,
    parent,
    extensions: [
      // Highest, not merely first: defaultKeymap binds Mod-Enter to "insert a blank line", and
      // an editor whose run shortcut silently inserts a newline is worse than one with none.
      Prec.highest(keymap.of([{
        key: 'Mod-Enter',
        preventDefault: true,
        run: () => { options.onRun(); return true; },
      }])),
      basicSetup,
      language.of(sqlSupport(options.schema, options.defaultTable)),
      editable.of(EditorView.editable.of(!options.disabled)),
      TOKEN_THEME,
      syntaxHighlighting(TOKEN_HIGHLIGHT),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': options.ariaLabel }),
      placeholder(options.placeholderText),
      EditorView.updateListener.of(update => {
        if (update.docChanged) options.onChange(update.state.doc.toString());
      }),
    ],
  });
  return {
    view,
    setDoc: text => {
      if (view.state.doc.toString() === text) return;
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } });
    },
    setSchema: (schema, defaultTable) => view.dispatch({ effects: language.reconfigure(sqlSupport(schema, defaultTable)) }),
    setDisabled: off => view.dispatch({ effects: editable.reconfigure(EditorView.editable.of(!off)) }),
    destroy: () => view.destroy(),
  };
}

function sqlSupport(schema: Record<string, string[]>, defaultTable: string) {
  const namespace: SQLNamespace = {};
  for (const table of Object.keys(schema)) namespace[table] = schema[table] ?? [];
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
