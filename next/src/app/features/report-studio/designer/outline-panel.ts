import { Component, input, output } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { Block, roleOf, walk } from './designer-model';

/**
 * Where each block prints (reports redesign, feature 6; designer.html's Outline): "every page" for the header and the footer
 * and what is in them, "hidden" for a hidden block, else the page it starts on as the PDF lays out (`pages`, from
 * reportPreview.json/outline), "not shown" for one the test data leaves out (a condition, an empty repeat). Null before the
 * pages are counted: the rows then say what each block is.
 */
export function pageLabels(blocks: Block[], pages: Record<string, number> | null): Record<string, string> | null {
  if (pages === null) return null;
  const out: Record<string, string> = {};
  const margin = new Set<string>();
  const hidden = new Set<string>();
  walk(blocks, (b, parent) => {
    const inMargin = (parent ? margin.has(parent.id) : false) || (!parent && b.type === 'section' && roleOf(b) !== 'body');
    const isHidden = (parent ? hidden.has(parent.id) : false) || b['hidden'] === true;
    if (inMargin) margin.add(b.id);
    if (isHidden) hidden.add(b.id);
    const at = pages[b.id];
    out[b.id] = inMargin ? 'every page' : isHidden ? 'hidden' : at ? `p. ${at}` : 'not shown';
  });
  return out;
}

/**
 * The head of the designer's Outline tab (feature 6): what its pages mean, how many the PDF has, and Count pages. The pages
 * are counted by the server with the test data (a preview: tables at most 200 rows) on opening and after a change.
 */
@Component({
  selector: 'app-rs-outline-head',
  imports: [Icon],
  template: `
    <div class="rso-head">
      <p class="text-xs rso-muted">Pages as the PDF lays out with the test data. Headings feed Contents and the PDF's bookmarks.</p>
      <button type="button" class="btn btn-default btn-sm rso-count" [disabled]="busy()" (click)="refresh.emit()">
        <app-icon name="refresh" />{{ busy() ? 'Counting…' : 'Count pages' }}</button>
    </div>
    @if (error()) {
      <p class="text-xs rso-crit" role="alert">{{ error() }}</p>
    } @else if (total() !== null) {
      <p class="text-xs rso-muted" data-outline-total>{{ total() }} page{{ total() === 1 ? '' : 's' }} in the PDF{{ stale() ? ' · changed since, counting again' : '' }}</p>
    }
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.375rem; margin-bottom: 0.5rem; }
    .rso-head { display: flex; flex-direction: column; align-items: flex-start; gap: 0.375rem; }
    .rso-count { white-space: nowrap; }
    .rso-muted { color: var(--text-muted); }
    .rso-crit { color: var(--crit-text); }
  `,
})
export class OutlineHead {
  readonly total = input<number | null>(null);
  readonly busy = input(false);
  readonly error = input('');
  /** True when the template changed since the pages were counted. */
  readonly stale = input(false);
  readonly refresh = output<void>();
}
