import { Component, ViewEncapsulation } from '@angular/core';

/**
 * UX review 2026-10-12 (A4): one row of a form on a 12-column grid, labels above the fields. Related fields share a
 * row ("Tries · Seconds between · Timeout"); each field says how wide it is with a span class -- `fr-3` and `fr-4`
 * for short values (numbers, selects), `fr-6` for a name, `fr-12` for long text -- and every field takes the whole
 * row on a narrow screen. Help text goes under its field (app-field's hint).
 *
 * A plain grid with media queries, never a size container: a container inside the managed lock's <fieldset>
 * sometimes lays out nothing in Chromium (see .form-lock).
 */
@Component({
  selector: 'app-form-row',
  host: { class: 'form-row' },
  // Global on purpose: the rules order and space the content a page projects into it.
  encapsulation: ViewEncapsulation.None,
  styles: `
    /* Twelve columns; every field the whole row below 48rem. */
    .form-row { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); column-gap: 1.25rem; row-gap: 1.25rem; }
    .form-row > * { grid-column: span 12; min-width: 0; }
    .form-row + .form-row { margin-top: 1.25rem; }
    @media (min-width: 48rem) {
      .form-row > .fr-2 { grid-column: span 2; }
      .form-row > .fr-3 { grid-column: span 3; }
      .form-row > .fr-4 { grid-column: span 4; }
      .form-row > .fr-5 { grid-column: span 5; }
      .form-row > .fr-6 { grid-column: span 6; }
      .form-row > .fr-8 { grid-column: span 8; }
      .form-row > .fr-9 { grid-column: span 9; }
    }
  `,
  template: `<ng-content />`,
})
export class FormRow {}
