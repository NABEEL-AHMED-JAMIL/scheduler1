import { Component, input, output } from '@angular/core';
import { CdkDrag, CdkDragMove, CdkDropList } from '@angular/cdk/drag-drop';
import { Icon } from '../../../shared/ui/icon';
import { PaletteEntry, typeIcon } from './designer-model';

/** Names longer than this take a whole row of the palette. */
export const WIDE_LABEL = 18;

export interface PaletteGroup { group: string; entries: PaletteEntry[]; }

/**
 * The designer's groups (Reports redesign): the components a signed clinical document needs first, then text, data,
 * layout, and pictures with the page's facts. A type the server adds later keeps the server's own group, after these.
 */
export const PALETTE_GROUPS: { group: string; types: string[] }[] = [
  { group: 'Clinical & compliance', types: ['approverSignature', 'signature', 'barcode', 'contents', 'qrCode', 'confidentiality', 'stamp'] },
  { group: 'Text', types: ['heading', 'text', 'labelValue', 'list'] },
  { group: 'Data', types: ['table', 'chart', 'metric', 'rangeBar'] },
  { group: 'Layout', types: ['section', 'row', 'conditional', 'repeat', 'divider', 'spacer'] },
  { group: 'Images and page facts', types: ['image', 'imageGrid', 'pageNumber', 'dateTime', 'reportId', 'templateVersion', 'sourceLabel', 'generatedBy'] },
];

/**
 * The palette's entries in the designer's groups, matching a search on the name or the description. The page parts
 * (header, footer, page break: the server's "Page" group) and a row's column are added elsewhere, so they are left out.
 */
export function groupPalette(entries: PaletteEntry[], query: string): PaletteGroup[] {
  const q = query.trim().toLowerCase();
  const shown = entries.filter(e => e.group !== 'Page' && e.type !== 'column'
    && (!q || e.label.toLowerCase().includes(q) || e.description.toLowerCase().includes(q)));
  const out: PaletteGroup[] = PALETTE_GROUPS.map(g => ({
    group: g.group,
    entries: g.types.flatMap(t => shown.filter(e => e.type === t)),
  }));
  const known = new Set(PALETTE_GROUPS.flatMap(g => g.types));
  for (const e of shown.filter(x => !known.has(x.type))) {
    const g = out.find(x => x.group === e.group) ?? out[out.push({ group: e.group, entries: [] }) - 1];
    g.entries.push(e);
  }
  return out.filter(g => g.entries.length);
}

/**
 * The Components tab's palette: compact one-line tiles (icon and name), two to a row where the pane is wide enough and
 * one where it is not, in the designer's groups. A tile is dragged onto a page, or clicked to add it after the selection.
 */
@Component({
  selector: 'app-rs-palette',
  imports: [Icon, CdkDrag, CdkDropList],
  template: `
    @for (g of groups(); track g.group) {
      <h3 class="rsd-eyebrow">{{ g.group }}</h3>
      <div class="rsd-palette" cdkDropList cdkDropListSortingDisabled [cdkDropListConnectedTo]="dropTargets()" [cdkDropListDisabled]="!editable()">
        @for (e of g.entries; track e.label) {
          <button type="button" class="rsdp-tile" [class.rsdp-wide]="e.label.length > WIDE" cdkDrag [cdkDragData]="{ add: e }" [cdkDragDisabled]="!editable()" [title]="e.description"
                  [disabled]="!editable()" (cdkDragStarted)="dragStarted.emit(e)" (cdkDragMoved)="dragMoved.emit($event)" (cdkDragEnded)="dragEnded.emit()"
                  (click)="added.emit(e)">
            <app-icon [name]="typeIcon(e.type)" class="rsdp-icon" />
            <span class="rsdp-name">{{ e.label }}</span>
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host { display: block; }
    .rsd-palette { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.75rem, 1fr)); gap: 0.25rem; }
    .rsdp-tile { display: flex; align-items: center; gap: 0.4375rem; min-width: 0; min-height: 2rem; padding: 0.3125rem 0.5rem; text-align: left;
      font-size: 0.8125rem; line-height: 1.2; color: var(--text-primary); background: var(--surface-raised);
      border: 1px solid var(--border-subtle); border-radius: var(--radius-md); cursor: grab; }
    .rsdp-tile:hover:not(:disabled) { border-color: var(--focus-ring); background: var(--surface-sunken); }
    .rsdp-tile:disabled { cursor: default; opacity: 0.6; }
    .rsdp-tile.cdk-drag-preview { box-shadow: 0 8px 24px color-mix(in oklab, var(--text-primary) 18%, transparent); }
    .rsdp-wide { grid-column: 1 / -1; }
    .rsdp-icon { flex: none; color: var(--text-muted); }
    .rsdp-name { min-width: 0; overflow-wrap: break-word; }
  `,
})
export class Palette {
  readonly groups = input<PaletteGroup[]>([]);
  readonly editable = input(false);
  /** The page lists (and Layers) a tile may be dropped on. */
  readonly dropTargets = input<string[]>([]);
  readonly added = output<PaletteEntry>();
  readonly dragStarted = output<PaletteEntry>();
  readonly dragMoved = output<CdkDragMove>();
  readonly dragEnded = output<void>();
  readonly typeIcon = typeIcon;
  /** A name longer than this takes the whole row, so it reads on one line ("Signature (fixed person)"). */
  readonly WIDE = WIDE_LABEL;
}
