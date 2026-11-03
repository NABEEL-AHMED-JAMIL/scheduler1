import { Component, computed, input, output } from '@angular/core';
import { Icon } from '../../../shared/ui/icon';
import { Block, blockLabel, roleOf, typeIcon } from './designer-model';

/** One row of the Outline: a block, how deep it sits, and where it prints. */
export interface OutlineRow { id: string; type: string; label: string; depth: number; page: string; heading: boolean; hidden: boolean; }

/** The blocks the Outline lists: what a reader finds in the report, not the layout around it (columns are passed through). */
const SHOWN = new Set(['section', 'heading', 'table', 'chart', 'metric', 'rangeBar', 'imageGrid', 'image', 'repeat', 'conditional', 'contents',
  'approverSignature', 'signature', 'stamp', 'qrCode', 'barcode', 'text', 'list', 'labelValue']);

/**
 * The Outline's rows (reports redesign, feature 6): the header and footer ("every page"), then the body's blocks in reading
 * order down to three levels, each with the page it starts on as the PDF lays out (`pages`, from reportPreview.json/outline;
 * "—" until counted, "hidden" for a hidden block, "not shown" for one the test data leaves out). Rows and columns are not
 * listed themselves: their blocks are, one level in.
 */
export function outlineRows(blocks: Block[], pages: Record<string, number> | null): OutlineRow[] {
  const rows: OutlineRow[] = [];
  const visit = (list: Block[], depth: number, margin: boolean, hidden: boolean) => {
    for (const b of list) {
      const isMargin = margin || (depth === 0 && b.type === 'section' && roleOf(b) !== 'body');
      const isHidden = hidden || b['hidden'] === true;
      const passThrough = b.type === 'row' || b.type === 'column';
      if (!passThrough && SHOWN.has(b.type) && depth < 3) {
        const at = pages?.[b.id];
        rows.push({ id: b.id, type: b.type, label: blockLabel(b), depth, heading: b.type === 'heading', hidden: isHidden,
          page: isMargin ? 'every page' : isHidden ? 'hidden' : pages === null ? '—' : at ? String(at) : 'not shown' });
      }
      if (Array.isArray(b.children)) visit(b.children, passThrough ? depth : depth + 1, isMargin, isHidden);
    }
  };
  visit(blocks, 0, false, false);
  return rows;
}

/**
 * The designer's Outline tab (reports redesign, feature 6; designer.html's Outline): the report's structure with the page
 * each block starts on in the PDF. Its headings are the Contents block's entries and the PDF's bookmarks. The pages are
 * counted by the server with the test data (a preview: tables at most 200 rows), on opening and after a change.
 */
@Component({
  selector: 'app-rs-outline',
  imports: [Icon],
  template: `
    <div class="rso-head">
      <p class="text-xs rso-muted">Headings feed the Contents block and the PDF's bookmarks.</p>
      <button type="button" class="btn btn-default btn-sm" [disabled]="busy()" (click)="refresh.emit()">
        <app-icon name="refresh" />{{ busy() ? 'Counting…' : 'Count pages' }}</button>
    </div>
    @if (error()) {
      <p class="text-xs rso-crit" role="alert">{{ error() }}</p>
    } @else if (total() !== null) {
      <p class="text-xs rso-muted" data-outline-total>{{ total() }} page{{ total() === 1 ? '' : 's' }} in the PDF{{ stale() ? ' · changed since, counting again' : '' }}</p>
    }
    <ol class="rso-list" aria-label="Outline">
      @for (r of rows(); track r.id) {
        <li>
          <button type="button" [class]="'rso-row rso-d' + r.depth" [class.is-active]="selected() === r.id" [class.rso-heading]="r.heading"
                  [class.is-hidden]="r.hidden" (click)="selectedChange.emit(r.id)">
            <app-icon [name]="icon(r.type)" class="rso-muted shrink-0" />
            <span class="truncate flex-1 text-left">{{ r.label }}</span>
            <span class="rso-page text-xs tabular-nums" [attr.data-page-of]="r.id">{{ r.page }}</span>
          </button>
        </li>
      } @empty {
        <li class="text-xs rso-muted p-2">The page is empty: add a component.</li>
      }
    </ol>
  `,
  styles: `
    :host { display: flex; flex-direction: column; gap: 0.5rem; }
    .rso-head { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
    .rso-muted { color: var(--text-muted); }
    .rso-crit { color: var(--crit-text); }
    .rso-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.125rem; }
    .rso-row { display: flex; align-items: center; gap: 0.5rem; width: 100%; min-height: 2rem; padding: 0.25rem 0.5rem; border-radius: var(--radius-md);
      font-size: 0.8125rem; color: var(--text-primary); text-align: left; }
    .rso-row:hover { background: var(--surface-sunken); }
    .rso-row.is-active { background: var(--surface-sunken); box-shadow: inset 2px 0 0 var(--accent-mark-strong); }
    .rso-row.is-hidden { opacity: 0.6; }
    .rso-heading { font-weight: 600; }
    .rso-d1 { padding-left: 1.25rem; }
    .rso-d2 { padding-left: 2rem; }
    .rso-page { flex: none; color: var(--text-muted); }
  `,
})
export class OutlinePanel {
  readonly blocks = input<Block[]>([]);
  /** The page each component starts on (component id → 1-based page), or null before the pages are counted. */
  readonly pages = input<Record<string, number> | null>(null);
  readonly total = input<number | null>(null);
  readonly busy = input(false);
  readonly error = input('');
  /** True when the template changed since the pages were counted. */
  readonly stale = input(false);
  readonly selected = input<string | null>(null);
  readonly selectedChange = output<string>();
  readonly refresh = output<void>();

  readonly rows = computed(() => outlineRows(this.blocks(), this.pages()));
  readonly icon = typeIcon;
}
